import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../../core/theme/kt_colors.dart';
import '../../core/theme/kt_text_styles.dart';
import '../../core/widgets/kt_loading_shimmer.dart';
import '../../core/widgets/kt_error_state.dart';
import '../../core/services/fcm_service.dart'; // unreadNotificationCountProvider
import '../../providers/fleet_dashboard_provider.dart'; // apiServiceProvider
import '../../services/api_service.dart'; // ApiService.baseUrl

final _notificationsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/my-notifications', queryParameters: {'limit': 50});
  if (response is Map && response['data'] is List) return response['data'] as List<dynamic>;
  if (response is List) return response;
  return [];
});

/// Derive WebSocket notifications URL from ApiService.baseUrl
/// e.g. https://api.kavyatransports.com/api/v1 → wss://api.kavyatransports.com/ws/notifications
String get _wsBaseUrl {
  final apiBase = ApiService.baseUrl; // e.g. https://api.kavyatransports.com/api/v1
  final uri = Uri.parse(apiBase);
  final wsScheme = uri.scheme == 'https' ? 'wss' : 'ws';
  return '$wsScheme://${uri.host}${uri.port != 80 && uri.port != 443 ? ":${uri.port}" : ""}/ws/notifications';
}

class PANotificationsScreen extends ConsumerStatefulWidget {
  const PANotificationsScreen({super.key});

  @override
  ConsumerState<PANotificationsScreen> createState() => _PANotificationsScreenState();
}

class _PANotificationsScreenState extends ConsumerState<PANotificationsScreen> {
  static const _storage = FlutterSecureStorage();
  WebSocketChannel? _channel;

  @override
  void initState() {
    super.initState();
    _connectWebSocket();
    // Reset badge count when screen opens
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(unreadNotificationCountProvider.notifier).state = 0;
    });
  }

  Future<void> _connectWebSocket() async {
    final token = await _storage.read(key: 'access_token');
    if (token == null) return;

    try {
      _channel = WebSocketChannel.connect(
        Uri.parse('$_wsBaseUrl?token=$token'),
      );
      _channel!.stream.listen(
        (data) {
          if (!mounted) return;
          // Re-load notifications when a new one arrives
          ref.invalidate(_notificationsProvider);
        },
        onError: (_) {},
        onDone: () {},
      );
    } catch (_) {}
  }

  @override
  void dispose() {
    _channel?.sink.close();
    super.dispose();
  }

  Future<void> _markAllRead() async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.patch('/my-notifications/read-all');
      ref.invalidate(_notificationsProvider);
    } catch (_) {}
  }

  Future<void> _markRead(int id) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.patch('/my-notifications/$id/read');
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final notifAsync = ref.watch(_notificationsProvider);

    return Scaffold(
      backgroundColor: KTColors.lightBg,
      appBar: AppBar(
        backgroundColor: KTColors.surface,
        title: Text('Notifications',
            style: KTTextStyles.h2.copyWith(color: KTColors.textHeading)),
        leading: const BackButton(color: KTColors.textHeading),
        actions: [
          TextButton(
            onPressed: _markAllRead,
            child: Text('Mark all read',
                style: KTTextStyles.bodySmall.copyWith(color: KTColors.paAccent)),
          ),
        ],
      ),
      body: notifAsync.when(
        loading: () => const KTLoadingShimmer(type: ShimmerType.list),
        error: (e, _) => KTErrorState(
          message: e.toString(),
          onRetry: () => ref.invalidate(_notificationsProvider),
        ),
        data: (notifications) {
          if (notifications.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.notifications_none, size: 54, color: KTColors.textMuted),
                  const SizedBox(height: 12),
                  Text('No notifications yet',
                      style: KTTextStyles.body.copyWith(color: KTColors.textMuted)),
                ],
              ),
            );
          }
          return RefreshIndicator(
            color: KTColors.paAccent,
            backgroundColor: KTColors.surface,
            onRefresh: () async => ref.invalidate(_notificationsProvider),
            child: ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: notifications.length,
              itemBuilder: (context, i) {
                final notif = Map<String, dynamic>.from(notifications[i] as Map);
                return _NotificationTile(
                  notif: notif,
                  onMarkRead: () {
                    final id = notif['id'];
                    if (id != null) _markRead(id as int);
                    ref.invalidate(_notificationsProvider);
                  },
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final Map<String, dynamic> notif;
  final VoidCallback onMarkRead;

  const _NotificationTile({required this.notif, required this.onMarkRead});

  IconData _icon(String? eventType) {
    if (eventType == null) return Icons.notifications;
    if (eventType.contains('JOB')) return Icons.work_outline;
    if (eventType.contains('LR')) return Icons.receipt_long;
    if (eventType.contains('EWB')) return Icons.timer_outlined;
    if (eventType.contains('TRIP')) return Icons.local_shipping_outlined;
    if (eventType.contains('BANKING')) return Icons.account_balance;
    if (eventType.contains('INVOICE')) return Icons.monetization_on;
    return Icons.notifications;
  }

  @override
  Widget build(BuildContext context) {
    final isRead = notif['is_read'] as bool? ?? false;
    final urgency = notif['urgency'] as String? ?? 'normal';
    final isUrgent = urgency == 'urgent';

    return Dismissible(
      key: Key('notif_${notif['id']}'),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => onMarkRead(),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 16),
        color: KTColors.success,
        child: const Icon(Icons.check, color: Colors.white),
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isRead ? KTColors.surface : KTColors.lightBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isUrgent ? KTColors.danger.withOpacity(0.5) : KTColors.borderColor,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: (isUrgent ? KTColors.danger : KTColors.paAccent).withOpacity(0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(
                _icon(notif['event_type'] as String?),
                color: isUrgent ? KTColors.danger : KTColors.paAccent,
                size: 18,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          notif['title'] ?? '',
                          style: KTTextStyles.body.copyWith(
                            color: KTColors.textHeading,
                            fontWeight: isRead ? FontWeight.normal : FontWeight.w600,
                          ),
                        ),
                      ),
                      if (!isRead)
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: KTColors.paAccent,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    notif['body'] ?? '',
                    style: KTTextStyles.bodySmall.copyWith(color: KTColors.textMuted),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

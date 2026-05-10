import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/fleet_dashboard_provider.dart'; // re-exports apiServiceProvider
export '../../core/services/fcm_service.dart' show unreadNotificationCountProvider;

// ─── PA Dashboard ──────────────────────────────────────────────────────────

final paDashboardStatsProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/pa/dashboard/stats');
  if (response is Map<String, dynamic> && response['data'] != null) {
    return Map<String, dynamic>.from(response['data'] as Map);
  }
  return {};
});

final paPriorityActionsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/pa/dashboard/priority-actions');
  if (response is Map && response['data'] is List) {
    return response['data'] as List<dynamic>;
  }
  if (response is List) return response;
  return [];
});

// ─── Job List with filter ───────────────────────────────────────────────────

class PAJobFilter {
  final String? status;
  final int page;
  const PAJobFilter({this.status, this.page = 1});

  PAJobFilter copyWith({String? status, int? page}) =>
      PAJobFilter(status: status ?? this.status, page: page ?? this.page);
}

final paJobFilterProvider = StateProvider<PAJobFilter>((ref) => const PAJobFilter());

final paJobListProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final filter = ref.watch(paJobFilterProvider);
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/jobs', queryParameters: {
    if (filter.status != null) 'status': filter.status,
    'page': filter.page,
    'limit': 20,
  });
  if (response is Map && response['data'] is List) return response['data'] as List<dynamic>;
  if (response is Map && response['items'] is List) return response['items'] as List<dynamic>;
  if (response is List) return response;
  return [];
});

// ─── EWB list ──────────────────────────────────────────────────────────────

// 'active' | 'expired'  (null = active by default)
final paEWBFilterProvider = StateProvider<String?>((ref) => 'active');

final paEWBListProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final filter = ref.watch(paEWBFilterProvider);
  final api = ref.read(apiServiceProvider);

  final response = await api.get(
    '/lrs/with-ewb',
    queryParameters: {if (filter != null) 'filter': filter},
  );
  if (response is Map && response['data'] is List) return response['data'] as List<dynamic>;
  if (response is List) return response;
  return [];
});

// ─── Active trips ───────────────────────────────────────────────────────────

final paActiveTripsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/trips', queryParameters: {'status': 'IN_TRANSIT'});
  if (response is Map && response['data'] is List) return response['data'] as List<dynamic>;
  if (response is List) return response;
  return [];
});

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../models/trip.dart';

enum WebSocketStatus { disconnected, connecting, connected, failed }

class WebSocketMessage {
  final String type; // 'trip_update', 'notification', 'sync_status', vehicle_location', etc.
  final Map<String, dynamic> data;
  final DateTime timestamp;

  WebSocketMessage({
    required this.type,
    required this.data,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  factory WebSocketMessage.fromJson(Map<String, dynamic> json) {
    return WebSocketMessage(
      type: json['type'] as String,
      data: json['data'] as Map<String, dynamic>? ?? {},
      timestamp: json['timestamp'] != null 
          ? DateTime.tryParse(json['timestamp'] as String) 
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'type': type,
    'data': data,
    'timestamp': timestamp.toIso8601String(),
  };
}

typedef TripStatusCallback = void Function(Trip updatedTrip);
typedef ConnectionCallback = void Function(bool connected);

class WebSocketService {
  late StreamController<Trip> _tripUpdatesController;
  late StreamController<bool> _connectionController;
  late StreamController<WebSocketMessage> _messageController;
  late StreamController<WebSocketStatus> _statusController;
  late StreamController<Map<String, dynamic>> _vehicleTrackingController;
  late StreamController<Map<String, dynamic>> _alertController;
  late StreamController<Map<String, dynamic>> _geofenceBreachController;
  late StreamController<Map<String, dynamic>> _complianceAlertController;
  
  WebSocketStatus _status = WebSocketStatus.disconnected;
  bool _connected = false;
  Timer? _reconnectTimer;
  Timer? _heartbeatTimer;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 5;
  static const Duration _reconnectDelay = Duration(seconds: 3);
  
  // Production mode: mock mode DISABLED by default
  bool _mockMode = false;
  String? _wsUrl;
  WebSocketChannel? _channel;
  
  Stream<Trip> get tripUpdates => _tripUpdatesController.stream;
  Stream<bool> get connectionStatus => _connectionController.stream;
  Stream<WebSocketMessage> get messages => _messageController.stream;
  Stream<WebSocketStatus> get statusStream => _statusController.stream;
  Stream<Map<String, dynamic>> get vehicleTrackingStream => _vehicleTrackingController.stream;
  Stream<Map<String, dynamic>> get alertStream => _alertController.stream;
  Stream<Map<String, dynamic>> get geofenceBreachStream => _geofenceBreachController.stream;
  Stream<Map<String, dynamic>> get complianceAlertStream => _complianceAlertController.stream;
  
  bool get isConnected => _connected;
  WebSocketStatus get status => _status;

  /// Create WebSocket service
  /// [wsUrl] - WebSocket URL (e.g., ws://localhost:8000/ws)
  /// [mockMode] - Only enable for development testing. MUST be false in production.
  WebSocketService({String? wsUrl, bool mockMode = false}) {
    _mockMode = mockMode;
    _wsUrl = wsUrl ?? _getDefaultWsUrl();
    _tripUpdatesController = StreamController<Trip>.broadcast();
    _connectionController = StreamController<bool>.broadcast();
    _messageController = StreamController<WebSocketMessage>.broadcast();
    _statusController = StreamController<WebSocketStatus>.broadcast();
    _vehicleTrackingController = StreamController<Map<String, dynamic>>.broadcast();
    _alertController = StreamController<Map<String, dynamic>>.broadcast();
    _geofenceBreachController = StreamController<Map<String, dynamic>>.broadcast();
    _complianceAlertController = StreamController<Map<String, dynamic>>.broadcast();
  }

  /// Derive WebSocket URL from API base URL
  String _getDefaultWsUrl() {
    const apiBase = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'https://api.kavyatransports.com/api/v1',
    );
    
    // Convert http://host/path -> ws://host/ws
    // Convert https://host/path -> wss://host/ws
    final uri = Uri.parse(apiBase);
    final protocol = uri.scheme == 'https' ? 'wss' : 'ws';
    return '$protocol://${uri.host}:${uri.port}/ws';
  }

  Future<void> connect() async {
    if (_status == WebSocketStatus.connected || 
        _status == WebSocketStatus.connecting) {
      return;
    }

    _updateStatus(WebSocketStatus.connecting);

    try {
      if (_mockMode) {
        // DEVELOPMENT ONLY: Mock mode for offline testing
        debugPrint('[WebSocket] ⚠️  MOCK MODE ENABLED - Using fake data');
        _connected = true;
        _reconnectAttempts = 0;
        _updateStatus(WebSocketStatus.connected);
        
        // Simulate receiving updates every 10 seconds
        _reconnectTimer = Timer.periodic(const Duration(seconds: 10), (_) {
          if (_connected && _mockMode) {
            _simulateUpdate();
          }
        });
        
        debugPrint('[WebSocket] Connected (MOCK MODE - For Development Only)');
      } else {
        // PRODUCTION: Real WebSocket connection to backend
        if (_wsUrl == null) {
          throw Exception('WebSocket URL not provided');
        }
        
        debugPrint('[WebSocket] Connecting to real backend: $_wsUrl');
        _channel = WebSocketChannel.connect(Uri.parse(_wsUrl!));
        
        _connected = true;
        _reconnectAttempts = 0;
        _updateStatus(WebSocketStatus.connected);
        _startHeartbeat();
        
        // Listen to incoming WebSocket messages
        _channel!.stream.listen(
          (message) {
            try {
              final decoded = jsonDecode(message);
              final wsMessage = WebSocketMessage.fromJson(decoded);
              _messageController.add(wsMessage);
              
              switch (wsMessage.type) {
                case 'trip_update':
                  debugPrint('[WebSocket] Received trip update: ${wsMessage.data}');
                case 'vehicle_tracking':
                  _vehicleTrackingController.add(wsMessage.data);
                case 'alert':
                  _alertController.add(wsMessage.data);
                case 'geofence_breach':
                  _geofenceBreachController.add(wsMessage.data);
                case 'compliance_alert':
                  _complianceAlertController.add(wsMessage.data);
                default:
                  break;
              }
            } catch (e) {
              debugPrint('[WebSocket] Failed to parse message: $e');
            }
          },
          onError: (error) {
            debugPrint('[WebSocket] Stream error: $error');
            _connected = false;
            _updateStatus(WebSocketStatus.failed);
            _scheduleReconnect();
          },
          onDone: () {
            debugPrint('[WebSocket] Server closed connection');
            _connected = false;
            _updateStatus(WebSocketStatus.disconnected);
          },
        );
        
        debugPrint('[WebSocket] Connected to $_wsUrl (PRODUCTION)');
      }
    } catch (e) {
      _connected = false;
      debugPrint('[WebSocket] Connection error: $e');
      _updateStatus(WebSocketStatus.failed);
      _scheduleReconnect();
    }
  }

  void _simulateUpdate() {
    // Simulate trip status changes for demo
    final statuses = ['pending', 'in_transit', 'completed'];
    final randomStatus = statuses[(DateTime.now().millisecond % statuses.length)];
    
    final mockTrip = Trip(
      id: 1,
      tripNumber: 'T001',
      status: randomStatus,
      origin: 'Mumbai',
      destination: 'Delhi',
      vehicleNumber: 'MH-01-AB-1234',
      driverId: 1,
      startDate: DateTime.now().toString(),
    );
    
    _tripUpdatesController.add(mockTrip);
    
    final message = WebSocketMessage(
      type: 'trip_update',
      data: {
        'trip_id': 1,
        'status': randomStatus,
        'timestamp': DateTime.now().toIso8601String(),
      },
    );
    _messageController.add(message);
  }

  void _scheduleReconnect() {
    if (_reconnectAttempts >= _maxReconnectAttempts) {
      debugPrint('[WebSocket] Max reconnect attempts reached');
      return;
    }

    _reconnectAttempts++;
    debugPrint('[WebSocket] Scheduling reconnect attempt $_reconnectAttempts');
    
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(_reconnectDelay, () {
      connect();
    });
  }

  void _updateStatus(WebSocketStatus newStatus) {
    if (_status != newStatus) {
      _status = newStatus;
      _statusController.add(_status);
      
      if (newStatus == WebSocketStatus.connected) {
        _connected = true;
        _connectionController.add(true);
      } else if (newStatus == WebSocketStatus.disconnected || 
                 newStatus == WebSocketStatus.failed) {
        _connected = false;
        _connectionController.add(false);
      }
    }
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_connected) {
        sendMessage(WebSocketMessage(type: 'heartbeat', data: {}));
      }
    });
  }

  void sendMessage(WebSocketMessage message) {
    if (!_connected) {
      debugPrint('[WebSocket] Not connected, cannot send message');
      return;
    }
    
    if (_mockMode) {
      debugPrint('[WebSocket Mock] Sent: ${message.type}');
    } else {
      // Send via real WebSocket
      try {
        _channel?.sink.add(jsonEncode(message.toJson()));
        debugPrint('[WebSocket] Sent: ${message.type}');
      } catch (e) {
        debugPrint('[WebSocket] Failed to send message: $e');
      }
    }
  }

  void send(String type, Map<String, dynamic> data) {
    sendMessage(WebSocketMessage(type: type, data: data));
  }

  /// Subscribe to real-time updates for specific vehicles and trips.
  /// Call this after [connect()] completes successfully.
  void subscribeToEntities(List<int> vehicleIds, List<int> tripIds) {
    send('subscribe_vehicle', {'vehicle_ids': vehicleIds});
    send('subscribe_trip', {'trip_ids': tripIds});
  }

  StreamSubscription<WebSocketMessage> onMessage(
    String type,
    Function(Map<String, dynamic> data) callback,
  ) {
    return messages
        .where((msg) => msg.type == type)
        .listen((msg) => callback(msg.data));
  }

  void onTripStatusChanged(Trip trip) {
    _tripUpdatesController.add(trip);
  }

  Future<void> disconnect() async {
    _connected = false;
    _reconnectTimer?.cancel();
    _heartbeatTimer?.cancel();
    await _channel?.sink.close();
    _updateStatus(WebSocketStatus.disconnected);
  }

  Future<void> dispose() async {
    await disconnect();
    await _tripUpdatesController.close();
    await _connectionController.close();
    await _messageController.close();
    await _statusController.close();
    await _vehicleTrackingController.close();
    await _alertController.close();
    await _geofenceBreachController.close();
    await _complianceAlertController.close();
  }
}

// Mock stream wrapper (for real app, use web socket)
class WebSocketStream<T> {
  final Stream<T> _stream;
  
  WebSocketStream(this._stream);
  
  Stream<T> get stream => _stream;
}

// Riverpod provider for WebSocket service
final webSocketProvider = FutureProvider<WebSocketService>((ref) async {
  final service = WebSocketService();
  await service.connect();
  
  // Cleanup on app close
  ref.onDispose(() {
    service.dispose();
  });
  
  return service;
});

// Provider for trip updates stream
final tripUpdatesStreamProvider = StreamProvider<Trip>((ref) async* {
  final wsService = await ref.read(webSocketProvider.future);
  yield* wsService.tripUpdates;
});

// Provider for WebSocket connection status
final wsConnectionStatusProvider = StreamProvider<bool>((ref) async* {
  final wsService = await ref.read(webSocketProvider.future);
  yield wsService.isConnected;
  yield* wsService.connectionStatus;
});

// Provider for vehicle tracking events (vehicle_id, latitude, longitude, speed, heading, timestamp)
final vehicleTrackingStreamProvider = StreamProvider<Map<String, dynamic>>((ref) async* {
  final wsService = await ref.read(webSocketProvider.future);
  yield* wsService.vehicleTrackingStream;
});

// Provider for alert events (alert_type, message, trip_id?)
final alertStreamProvider = StreamProvider<Map<String, dynamic>>((ref) async* {
  final wsService = await ref.read(webSocketProvider.future);
  yield* wsService.alertStream;
});

// Provider for geofence breach events (vehicle_id, geofence_id, breach_type)
final geofenceBreachStreamProvider = StreamProvider<Map<String, dynamic>>((ref) async* {
  final wsService = await ref.read(webSocketProvider.future);
  yield* wsService.geofenceBreachStream;
});

// Provider for compliance alert events (vehicle_id, compliance_type, expiry_date)
final complianceAlertStreamProvider = StreamProvider<Map<String, dynamic>>((ref) async* {
  final wsService = await ref.read(webSocketProvider.future);
  yield* wsService.complianceAlertStream;
});

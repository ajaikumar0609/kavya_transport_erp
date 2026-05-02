import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:dio/dio.dart';
import '../models/user.dart';
import '../services/auth_service.dart';
import '../services/api_service.dart';

class AuthState {
  final User? user;
  final bool isLoading;
  final String? error;
  // OTP login step-2 state
  final bool otpRequired;
  final String? sessionId;
  final String? phoneMasked;

  AuthState({
    this.user,
    this.isLoading = false,
    this.error,
    this.otpRequired = false,
    this.sessionId,
    this.phoneMasked,
  });

  AuthState copyWith({
    User? user,
    bool? isLoading,
    String? error,
    bool? otpRequired,
    String? sessionId,
    String? phoneMasked,
  }) {
    return AuthState(
      user: user ?? this.user,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      otpRequired: otpRequired ?? this.otpRequired,
      sessionId: sessionId ?? this.sessionId,
      phoneMasked: phoneMasked ?? this.phoneMasked,
    );
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.read(authServiceProvider));
});

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthService _authService;
  static const _storage = FlutterSecureStorage();

  AuthNotifier(this._authService) : super(AuthState()) {
    // Load persisted user on every app start (handles app-restart case)
    Future.microtask(_loadUserFromStorage);
  }

  Future<void> _loadUserFromStorage() async {
    final token = await _storage.read(key: 'access_token');
    if (token == null) return; // Not logged in
    if (state.user != null) return; // Already set (e.g. fresh login)

    // Validate stored token by attempting a silent refresh before restoring session.
    // This prevents the app from restoring a stale/expired session silently.
    try {
      final refreshToken = await _storage.read(key: 'refresh_token');
      if (refreshToken == null) {
        await _storage.deleteAll();
        return;
      }
      final refreshDio = Dio();
      final baseUrl = ApiService.baseUrl;
      final refreshResp = await refreshDio.post(
        '$baseUrl/auth/refresh',
        data: {'refresh_token': refreshToken},
      );
      final newAccessToken = refreshResp.data?['data']?['access_token'] ??
          refreshResp.data?['access_token'];
      if (newAccessToken != null) {
        await _storage.write(key: 'access_token', value: newAccessToken as String);
      }
    } catch (_) {
      // Refresh failed — token is invalid. Clear storage so router redirects to login.
      await _storage.deleteAll();
      return;
    }

    final id = await _storage.read(key: 'user_id') ?? '';
    final name = await _storage.read(key: 'user_name') ?? '';
    final email = await _storage.read(key: 'user_email') ?? '';
    final phone = await _storage.read(key: 'user_phone');
    final role = await _storage.read(key: 'primary_role') ?? 'unknown';
    final isActive = (await _storage.read(key: 'user_is_active')) != 'false';
    final avatarUrl = await _storage.read(key: 'user_avatar_url');

    if (!mounted) return;
    state = state.copyWith(
      user: User(
        id: id,
        name: name.isNotEmpty ? name : email,
        email: email,
        roles: [role],
        phone: phone?.isNotEmpty == true ? phone : null,
        isActive: isActive,
        avatarUrl: avatarUrl?.isNotEmpty == true ? avatarUrl : null,
      ),
    );
  }

  Future<void> login(String email, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final result = await _authService.loginStep1(email, password);
      if (result['otp_required'] == true) {
        // Step-1 done — wait for OTP
        state = AuthState(
          isLoading: false,
          otpRequired: true,
          sessionId: result['session_id'] as String?,
          phoneMasked: result['phone_masked'] as String?,
        );
      } else {
        // Direct login (admin or no-OTP path)
        state = state.copyWith(isLoading: false);
      }
    } on DioException catch (e) {
      String message = 'Login failed. Please try again.';
      final responseData = e.response?.data;
      if (responseData is Map<String, dynamic>) {
        message = responseData['detail']?.toString() ??
            responseData['message']?.toString() ??
            message;
      } else if (e.response?.statusCode == 401) {
        message = 'Invalid email or password';
      }
      state = state.copyWith(isLoading: false, error: message);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: 'Login failed. Please try again.');
    }
  }

  /// Step-2: submit the 6-digit OTP received via SMS.
  Future<void> confirmOtp(String otp) async {
    if (state.sessionId == null) return;
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _authService.confirmOtp(state.sessionId!, otp);
      state = state.copyWith(isLoading: false, otpRequired: false);
    } on DioException catch (e) {
      String message = 'OTP verification failed.';
      final responseData = e.response?.data;
      if (responseData is Map<String, dynamic>) {
        message = responseData['detail']?.toString() ??
            responseData['message']?.toString() ??
            message;
      } else if (e.response?.statusCode == 401) {
        message = 'Invalid or expired OTP — request a new one';
      } else if (e.response?.statusCode == 429) {
        message = 'Too many attempts. Please wait before trying again.';
      }
      state = state.copyWith(isLoading: false, error: message);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: 'Verification failed. Please try again.');
    }
  }

  /// Resend OTP — calls send-otp again with the same credentials.
  /// The caller must hold phone + password from the first step.
  Future<Map<String, dynamic>?> resendOtp(String phone, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final result = await _authService.loginStep1(phone, password);
      state = AuthState(
        isLoading: false,
        otpRequired: true,
        sessionId: result['session_id'] as String?,
        phoneMasked: result['phone_masked'] as String?,
      );
      return result;
    } on DioException catch (e) {
      String message = 'Failed to resend OTP.';
      final responseData = e.response?.data;
      if (responseData is Map<String, dynamic>) {
        message = responseData['detail']?.toString() ??
            responseData['message']?.toString() ??
            message;
      } else if (e.response?.statusCode == 429) {
        message = 'Too many OTP requests. You can request up to 3 OTPs per 10 minutes.';
      }
      state = state.copyWith(isLoading: false, error: message);
      return null;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: 'Failed to resend OTP. Please try again.');
      return null;
    }
  }

  /// Go back to the login form (cancel OTP step).
  void resetOtp() {
    state = AuthState();
  }

  Future<void> loginMarketDriver({
    required String sessionId,
    required String accessToken,
    required String otpCode,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _authService.loginMarketDriver(
        sessionId: sessionId,
        accessToken: accessToken,
        otpCode: otpCode,
      );
      state = state.copyWith(isLoading: false);
    } on DioException catch (e) {
      String message = 'OTP verification failed.';
      final responseData = e.response?.data;
      if (responseData is Map<String, dynamic>) {
        message = responseData['detail']?.toString() ??
            responseData['message']?.toString() ??
            message;
      } else if (e.response?.statusCode == 401) {
        message = 'Invalid or expired OTP';
      }
      state = state.copyWith(isLoading: false, error: message);
      rethrow;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: 'Verification failed. Please try again.');
      rethrow;
    }
  }

  Future<void> logout() async {
    state = AuthState();
    await _authService.logout();
  }

  void setUser(User user) {
    state = state.copyWith(user: user);
  }
}
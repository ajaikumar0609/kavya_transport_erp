import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import '../core/router/app_router.dart';

class ApiService {
  static const _envBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  // Production API. Emulator dev override via --dart-define=API_BASE_URL=http://10.0.2.2:8000/api/v1
  static String get baseUrl {
    if (_envBaseUrl.isNotEmpty) return _envBaseUrl;
    return 'https://api.kavyatransports.com/api/v1';
  }

  final Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  ApiService() : _dio = Dio(BaseOptions(
    baseUrl: baseUrl,
    sendTimeout: const Duration(seconds: 60),
    receiveTimeout: const Duration(seconds: 60),
    connectTimeout: const Duration(seconds: 15),
  )) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        // Request interceptor: adds Authorization header [cite: 32]
        onRequest: (options, handler) async {
          final token = await _storage.read(key: 'access_token');
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        // Response interceptor: on 401 -> calls refresh token endpoint [cite: 32]
        onError: (DioException e, handler) async {
          final status = e.response?.statusCode;
          if (status == 401) {
            // Don't intercept auth errors on the login endpoint itself — let them propagate
            final isLoginRequest = e.requestOptions.path.contains('/auth/login');
            if (isLoginRequest) {
              return handler.next(e);
            }

            final refreshToken = await _storage.read(key: 'refresh_token');
            if (refreshToken != null) {
              try {
                // Retry refresh [cite: 32]
                final refreshResponse = await Dio().post(
                  '$baseUrl/auth/refresh',
                  data: {'refresh_token': refreshToken},
                );
                final newAccessToken = refreshResponse.data['data']?['access_token']
                    ?? refreshResponse.data['access_token'];
                await _storage.write(key: 'access_token', value: newAccessToken);
                
                // Retry original request [cite: 32]
                e.requestOptions.headers['Authorization'] = 'Bearer $newAccessToken';
                final retryResponse = await Dio().fetch(e.requestOptions);
                return handler.resolve(retryResponse);
              } catch (refreshError) {
                // If refresh fails -> clear storage and force re-login
                await _storage.deleteAll();
                final ctx = appNavigatorKey.currentContext;
                if (ctx != null && ctx.mounted) {
                  ctx.go('/login');
                }
                return handler.reject(e);
              }
            } else {
              await _storage.deleteAll();
              final ctx = appNavigatorKey.currentContext;
              if (ctx != null && ctx.mounted) {
                ctx.go('/login');
              }
              return handler.reject(e);
            }
          }
          return handler.next(e);
        },
      ),
    );
  }

  // --- Auth & Profile ---

  // --- Generic HTTP methods (used by providers) ---
  Future<dynamic> get(String path, {Map<String, dynamic>? queryParameters}) async {
    final response = await _dio.get(path, queryParameters: queryParameters);
    return response.data;
  }

  Future<dynamic> post(String path, {dynamic data}) async {
    final response = await _dio.post(path, data: data);
    return response.data;
  }

  /// Sends a multipart/form-data POST request (e.g. file uploads).
  Future<dynamic> postMultipart(String path, FormData formData) async {
    final response = await _dio.post(
      path,
      data: formData,
      options: Options(
        headers: {'Content-Type': 'multipart/form-data'},
      ),
    );
    return response.data;
  }

  Future<dynamic> patch(String path, {dynamic data}) async {
    final response = await _dio.patch(path, data: data);
    return response.data;
  }

  Future<dynamic> put(String path, {dynamic data}) async {
    final response = await _dio.put(path, data: data);
    return response.data;
  }

  Future<dynamic> delete(String path) async {
    final response = await _dio.delete(path);
    return response.data;
  }

  /// Downloads binary data (PDF / CSV) with auth headers attached.
  Future<List<int>> downloadBytes(String path, {Map<String, dynamic>? queryParameters}) async {
    final response = await _dio.get<List<int>>(
      path,
      queryParameters: queryParameters,
      options: Options(responseType: ResponseType.bytes),
    );
    return response.data ?? [];
  }

  // --- Named Auth & Profile ---
  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await _dio.post('/auth/login',
        data: {'identifier': email, 'password': password});
    return response.data;
  }

  /// Step-1 of OTP login — sends OTP to the user's registered phone via 2Factor.
  /// Accepts phone (10-digit) + password. Returns session_id + phone_masked.
  Future<Map<String, dynamic>> sendOtp(String phone, String password) async {
    final response = await _dio.post('/auth/send-otp', data: {
      'phone': phone,
      'password': password,
      'channel': 'sms',
    });
    return response.data;
  }

  /// Step-2 of OTP login — verifies the OTP and returns tokens + user.
  Future<Map<String, dynamic>> verifyOtp(String sessionId, String otp) async {
    final response = await _dio.post('/auth/verify-otp', data: {
      'session_id': sessionId,
      'otp': otp,
    });
    return response.data;
  }

  Future<Map<String, dynamic>> getMe() async { // [cite: 33]
    final response = await _dio.get('/auth/me');
    return response.data;
  }

  Future<Map<String, dynamic>> refreshToken(String token) async { // [cite: 33]
    final response = await _dio.post('/auth/refresh', data: {'refresh_token': token});
    return response.data;
  }

  // --- Dashboards ---
  Future<Map<String, dynamic>> getDashboardAdmin() async {
    final response = await _dio.get('/dashboard');
    return response.data;
  }

  Future<Map<String, dynamic>> getFleetStats() async {
    final response = await _dio.get('/dashboard/fleet-stats');
    return response.data;
  }

  Future<Map<String, dynamic>> getTripStats() async {
    final response = await _dio.get('/dashboard/trip-stats');
    return response.data;
  }

  Future<Map<String, dynamic>> getFinanceStats() async {
    final response = await _dio.get('/dashboard/finance-stats');
    return response.data;
  }

  Future<List<dynamic>> getNotifications() async {
    final response = await _dio.get('/dashboard/notifications');
    return response.data is List ? response.data : [];
  }

  Future<Map<String, dynamic>> getRevenueTrend({String period = 'monthly'}) async {
    final response = await _dio.get('/dashboard/charts/revenue-trend', queryParameters: {'period': period});
    return response.data;
  }

  Future<Map<String, dynamic>> getDashboardFleet() async {
    final response = await _dio.get('/fleet/dashboard');
    final body = response.data;
    if (body is Map<String, dynamic> && body['data'] != null) {
      return body['data'] as Map<String, dynamic>;
    }
    return body;
  }

  Future<Map<String, dynamic>> getDashboardAccountant() async {
    final response = await _dio.get('/accountant/dashboard');
    return response.data;
  }

  // --- Accountant module ---
  Future<dynamic> createInvoice(Map<String, dynamic> data) async {
    final response = await _dio.post('/accountant/invoices', data: data);
    return response.data;
  }

  Future<dynamic> updateInvoice(int id, Map<String, dynamic> data) async {
    final response = await _dio.put('/accountant/invoices/$id', data: data);
    return response.data;
  }

  Future<dynamic> deleteInvoice(int id) async {
    final response = await _dio.delete('/accountant/invoices/$id');
    return response.data;
  }

  Future<dynamic> recordAccountantPayment(Map<String, dynamic> data) async {
    final response = await _dio.post('/accountant/payments', data: data);
    return response.data;
  }

  Future<dynamic> getAccountantPayables() async {
    final response = await _dio.get('/accountant/payables');
    return response.data;
  }

  Future<dynamic> getAccountantGST({String? financialYear}) async {
    final response = await _dio.get('/accountant/gst',
        queryParameters: {if (financialYear != null) 'financial_year': financialYear});
    return response.data;
  }

  Future<dynamic> createLedgerEntry(Map<String, dynamic> data) async {
    final response = await _dio.post('/accountant/ledger', data: data);
    return response.data;
  }

  Future<dynamic> getAccountantVouchers({String? voucherType}) async {
    final response = await _dio.get('/accountant/vouchers',
        queryParameters: {if (voucherType != null) 'voucher_type': voucherType});
    return response.data;
  }

  Future<dynamic> createVoucher(Map<String, dynamic> data) async {
    final response = await _dio.post('/accountant/vouchers', data: data);
    return response.data;
  }

  Future<dynamic> getAccountantStatements({String period = 'monthly'}) async {
    final response = await _dio.get('/accountant/statements',
        queryParameters: {'period': period});
    return response.data;
  }

  Future<Map<String, dynamic>> getDashboardAssociate() async {
    final response = await _dio.get('/dashboard/pa/kpis');
    return response.data;
  }

  Future<Map<String, dynamic>> getPAKpis() async {
    final response = await _dio.get('/dashboard/pa/kpis');
    return response.data;
  }

  Future<Map<String, dynamic>> getPAActionCenter() async {
    final response = await _dio.get('/dashboard/pa/action-center');
    return response.data;
  }

  Future<Map<String, dynamic>> getPAJobPipeline() async {
    final response = await _dio.get('/dashboard/pa/job-pipeline');
    return response.data;
  }

  Future<List<dynamic>> getPARecentActivity({int limit = 10}) async {
    final response = await _dio.get('/dashboard/pa/recent-activity', queryParameters: {'limit': limit});
    return response.data is List ? response.data : [];
  }

  // --- Jobs & Documents ---
  Future<List<dynamic>> getJobs({String? status, bool? noLr}) async { // [cite: 33]
    final response = await _dio.get('/jobs', queryParameters: {
      if (status != null) 'status': status,
      if (noLr != null) 'noLr': noLr,
    });
    return response.data;
  }

  Future<Map<String, dynamic>> createLR(Map<String, dynamic> data) async { // [cite: 33]
    final response = await _dio.post('/lr', data: data);
    return response.data;
  }

  Future<List<dynamic>> getLRs({bool? noEwb}) async { // [cite: 33]
    final response = await _dio.get('/lr', queryParameters: {
      if (noEwb != null) 'noEwb': noEwb,
    });
    return response.data;
  }

  Future<Map<String, dynamic>> generateEWB(Map<String, dynamic> data) async { // [cite: 33]
    final response = await _dio.post('/eway-bills/api/generate', data: data);
    return response.data;
  }

  Future<Map<String, dynamic>> extendEWB(String ewbId) async { // [cite: 33]
    final response = await _dio.post('/eway-bills/$ewbId/extend');
    return response.data;
  }

  /// Run OCR on an uploaded file (RC, Driving License, etc.).
  /// [docType]: 'rc', 'driving_license', 'insurance', 'auto'
  /// Returns extracted [fields] map: { registration_number, owner_name, chassis_number, ... }
  Future<Map<String, dynamic>> ocrDocument(File file, String docType) async {
    final fileName = file.path.split('/').last;
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path, filename: fileName),
    });
    final response = await _dio.post(
      '/documents/ocr',
      data: formData,
      queryParameters: {'doc_type': docType, 'lang': 'eng+hin'},
    );
    final resp = response.data;
    if (resp is Map && resp['data'] != null) return Map<String, dynamic>.from(resp['data'] as Map);
    return {};
  }

  /// Upload a document (rc_book, insurance, pollution_certificate, fitness_certificate)
  /// directly to the vehicle_documents table via POST /vehicles/{id}/documents.
  Future<Map<String, dynamic>> uploadVehicleDocument(
    int vehicleId,
    File file,
    String documentType, {
    String? documentNumber,
    String? expiryDate,
    String? issueDate,
  }) async {
    final fileName = file.path.split('/').last;
    final map = <String, dynamic>{
      'file': await MultipartFile.fromFile(file.path, filename: fileName),
      'document_type': documentType,
    };
    if (documentNumber != null && documentNumber.isNotEmpty) map['document_number'] = documentNumber;
    if (expiryDate != null && expiryDate.isNotEmpty) map['expiry_date'] = expiryDate;
    if (issueDate != null && issueDate.isNotEmpty) map['issue_date'] = issueDate;
    final formData = FormData.fromMap(map);
    final response = await _dio.post('/vehicles/$vehicleId/documents', data: formData);
    return Map<String, dynamic>.from(response.data as Map);
  }

  /// Fetch all documents stored for a vehicle.
  Future<List<dynamic>> getVehicleDocuments(int vehicleId) async {
    final response = await _dio.get('/vehicles/$vehicleId/documents');
    final data = response.data;
    if (data is Map && data['data'] is List) return data['data'] as List<dynamic>;
    return [];
  }

  Future<Map<String, dynamic>> uploadDocument(File file, String type, String linkedId) async {
    String fileName = file.path.split('/').last;
    FormData formData = FormData.fromMap({
      "file": await MultipartFile.fromFile(file.path, filename: fileName),
      "type": type,
      "linked_id": linkedId,
    });
    final response = await _dio.post('/documents/upload', data: formData);
    return response.data;
  }

  // --- Driver Documents (self-service) ---

  /// Fetch the current driver's allocated vehicle + documents for active trip.
  Future<Map<String, dynamic>?> getMyVehicle() async {
    final response = await _dio.get('/drivers/me/vehicle');
    final data = response.data;
    if (data is Map && data['data'] is Map) {
      return Map<String, dynamic>.from(data['data'] as Map);
    }
    return null;
  }

  /// Fetch the current driver's personal documents.
  Future<List<dynamic>> getMyDocuments() async {
    final response = await _dio.get('/drivers/me/documents');
    final data = response.data;
    if (data is Map && data['data'] is Map && data['data']['items'] is List) {
      return data['data']['items'] as List<dynamic>;
    }
    return [];
  }

  /// Upload a new driver document (driving_license, aadhaar_card, driver_badge, medical_fitness).
  Future<Map<String, dynamic>> uploadDriverDocument(File file, String documentType, {String? documentNumber}) async {
    String fileName = file.path.split('/').last;
    final map = <String, dynamic>{
      "file": await MultipartFile.fromFile(file.path, filename: fileName),
      "document_type": documentType,
    };
    if (documentNumber != null && documentNumber.isNotEmpty) {
      map["document_number"] = documentNumber;
    }
    FormData formData = FormData.fromMap(map);
    final response = await _dio.post('/drivers/me/documents/upload', data: formData);
    return Map<String, dynamic>.from(response.data as Map);
  }

  /// Fleet manager uploads a document for a specific driver (upsert).
  /// document_type: driving_license | pan_card | aadhaar_card | bank_passbook | driver_photo | driver_fingerprint
  Future<Map<String, dynamic>> uploadDriverDocumentForFleet(
    int driverId,
    File file,
    String documentType, {
    String? documentNumber,
  }) async {
    final fileName = file.path.split('/').last;
    final map = <String, dynamic>{
      'file': await MultipartFile.fromFile(file.path, filename: fileName),
      'document_type': documentType,
    };
    if (documentNumber != null && documentNumber.isNotEmpty) map['document_number'] = documentNumber;
    final formData = FormData.fromMap(map);
    final response = await _dio.post('/drivers/$driverId/documents', data: formData);
    return Map<String, dynamic>.from(response.data as Map);
  }

  /// Update (re-upload) an existing driver document.
  Future<Map<String, dynamic>> updateDriverDocument(int docId, File file, {String? documentNumber}) async {
    String fileName = file.path.split('/').last;
    final map = <String, dynamic>{
      "file": await MultipartFile.fromFile(file.path, filename: fileName),
    };
    if (documentNumber != null && documentNumber.isNotEmpty) {
      map["document_number"] = documentNumber;
    }
    FormData formData = FormData.fromMap(map);
    final response = await _dio.put('/drivers/me/documents/$docId', data: formData);
    return Map<String, dynamic>.from(response.data as Map);
  }

  // --- Driver Trip Workflow ---

  /// Submit LR and E-way bill files (PDF/JPG/PNG) + numbers to start a trip.
  Future<Map<String, dynamic>> submitTripLRAndEway(
    int tripId, {
    File? lrFile,
    File? ewayFile,
  }) async {
    final map = <String, dynamic>{};
    if (lrFile != null) {
      map['lr_file'] = await MultipartFile.fromFile(lrFile.path, filename: lrFile.path.split('/').last);
    }
    if (ewayFile != null) {
      map['eway_file'] = await MultipartFile.fromFile(ewayFile.path, filename: ewayFile.path.split('/').last);
    }
    final formData = FormData.fromMap(map);
    final response = await _dio.post('/drivers/me/trips/$tripId/submit-lr-eway', data: formData);
    return Map<String, dynamic>.from(response.data as Map);
  }

  /// Driver marks truck as loaded with a required photo.
  Future<Map<String, dynamic>> markTripLoaded(int tripId, File photo, {double? startOdometer}) async {
    final fileName = photo.path.split('/').last;
    final formData = FormData.fromMap({
      'photo': await MultipartFile.fromFile(photo.path, filename: fileName),
      if (startOdometer != null) 'start_odometer': startOdometer.toString(),
    });
    final response = await _dio.post('/drivers/me/trips/$tripId/mark-loaded', data: formData);
    return Map<String, dynamic>.from(response.data as Map);
  }

  /// Driver marks truck as reached destination with a required photo.
  Future<Map<String, dynamic>> markTripReached(int tripId, File photo, {double? endOdometer}) async {
    final fileName = photo.path.split('/').last;
    final map = <String, dynamic>{
      'photo': await MultipartFile.fromFile(photo.path, filename: fileName),
      if (endOdometer != null) 'end_odometer': endOdometer.toString(),
    };
    final formData = FormData.fromMap(map);
    final response = await _dio.post('/drivers/me/trips/$tripId/mark-reached', data: formData);
    return Map<String, dynamic>.from(response.data as Map);
  }

  /// Driver marks truck as unloaded (completing the trip) with a required photo.
  Future<Map<String, dynamic>> markTripUnloaded(int tripId, File photo) async {
    final fileName = photo.path.split('/').last;
    final formData = FormData.fromMap({
      'photo': await MultipartFile.fromFile(photo.path, filename: fileName),
    });
    final response = await _dio.post('/drivers/me/trips/$tripId/mark-unloaded', data: formData);
    return Map<String, dynamic>.from(response.data as Map);
  }

  /// Driver uploads Proof of Delivery photo to complete the trip.
  Future<Map<String, dynamic>> markTripPOD(int tripId, File photo) async {
    final fileName = photo.path.split('/').last;
    final formData = FormData.fromMap({
      'photo': await MultipartFile.fromFile(photo.path, filename: fileName),
    });
    final response = await _dio.post('/drivers/me/trips/$tripId/mark-pod', data: formData);
    return Map<String, dynamic>.from(response.data as Map);
  }

  /// Upload POD (proof of delivery) image or PDF for a specific LR.
  Future<Map<String, dynamic>> uploadLRPOD(int lrId, File file) async {
    final fileName = file.path.split('/').last;
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path, filename: fileName),
    });
    final response = await _dio.post('/lr/$lrId/pod', data: formData);
    return Map<String, dynamic>.from(response.data is Map ? response.data as Map : {'success': true});
  }

  // --- Expenses & Finance ---

  /// Verify the driver's 6-digit security PIN against the backend.
  /// Returns true if PIN is correct, throws on error.
  Future<bool> verifySecurityPin(String pin) async {
    try {
      await _dio.post('/drivers/verify-pin', data: {'pin': pin});
      return true;
    } on DioException catch (e) {
      if (e.response?.statusCode == 403) return false; // Incorrect PIN
      final detail = (e.response?.data is Map)
          ? e.response!.data['detail'] as String?
          : null;
      throw Exception(detail ?? 'PIN verification failed');
    }
  }

  /// Upload a receipt image and run OCR to extract amount/vendor/category.
  Future<Map<String, dynamic>> ocrReceipt(File file) async {
    String fileName = file.path.split('/').last;
    FormData formData = FormData.fromMap({
      "file": await MultipartFile.fromFile(file.path, filename: fileName),
    });
    final response = await _dio.post('/trips/expenses/ocr', data: formData);
    return Map<String, dynamic>.from(response.data as Map);
  }

  /// Upload a receipt image as a document and return the server URL.
  Future<String?> uploadReceiptImage(File file) async {
    String fileName = file.path.split('/').last;
    FormData formData = FormData.fromMap({
      "file": await MultipartFile.fromFile(file.path, filename: fileName),
      "entity_type": "expense",
      "entity_id": 0,
      "document_type": "other",
      "title": "Expense Receipt",
    });
    final response = await _dio.post('/documents/upload', data: formData);
    final data = response.data;
    if (data is Map && data['data'] is Map) {
      return data['data']['url'] as String?;
    }
    return null;
  }

  Future<List<dynamic>> getExpensesPending() async {
    final response = await _dio.get('/accountant/expenses', queryParameters: {'status': 'pending'});
    final data = response.data;
    if (data is Map && data['data'] is List) return data['data'] as List;
    if (data is List) return data;
    return [];
  }

  Future<Map<String, dynamic>> getAccountantExpenses({String? status, int page = 1, int limit = 50}) async {
    final params = <String, dynamic>{'page': page, 'limit': limit};
    if (status != null) params['status'] = status;
    final response = await _dio.get('/accountant/expenses', queryParameters: params);
    final data = response.data;
    if (data is Map) return data as Map<String, dynamic>;
    return {'data': data};
  }

  Future<void> approveExpense(String id) async {
    await _dio.put('/accountant/expenses/$id/approve');
  }

  Future<void> rejectExpense(String id, String reason) async {
    await _dio.put('/accountant/expenses/$id/reject');
  }

  Future<void> markExpensePaid(String id) async {
    await _dio.put('/accountant/expenses/$id/mark-paid');
  }

  Future<void> addTripExpense(int tripId, {
    required String category,
    required double amount,
    String? subCategory,
    String? description,
  }) async {
    await _dio.post('/trips/$tripId/expenses', data: {
      'category': category,
      'amount': amount,
      if (subCategory != null) 'sub_category': subCategory,
      if (description != null) 'description': description,
      'expense_date': DateTime.now().toUtc().toIso8601String(),
    });
  }

  Future<void> addTripFuel(int tripId, {required double litres, required double totalAmount}) async {
    await _dio.post('/trips/$tripId/fuel', data: {
      'fuel_date': DateTime.now().toIso8601String(),
      'fuel_type': 'diesel',
      'quantity_litres': litres,
      'rate_per_litre': litres > 0 ? totalAmount / litres : 0,
      'total_amount': totalAmount,
      'payment_mode': 'cash',
    });
  }

  Future<List<dynamic>> getTripExpenses(int tripId) async {
    final response = await _dio.get('/trips/$tripId/expenses');
    final raw = response.data;
    if (raw is Map) {
      final data = raw['data'];
      if (data is List) return data;
    }
    return [];
  }

  Future<List<dynamic>> getTripFuelEntries(int tripId) async {
    final response = await _dio.get('/trips/$tripId/fuel');
    final raw = response.data;
    if (raw is Map) {
      final data = raw['data'];
      if (data is List) return data;
    }
    return [];
  }

  /// Fetch the submitted checklist for a trip. Returns null if not submitted yet.
  Future<Map<String, dynamic>?> getTripChecklist(int tripId) async {
    try {
      final response = await _dio.get('/trips/$tripId/checklist', queryParameters: {'type': 'checklist'});
      final raw = response.data;
      if (raw is Map) return Map<String, dynamic>.from(raw['data'] as Map? ?? {});
    } catch (_) {}
    return null;
  }

  /// Fetch LR and E-way document photo URLs for a trip.
  Future<List<dynamic>> getTripDocumentPhotos(int tripId) async {
    try {
      final response = await _dio.get('/trips/$tripId/trip-documents');
      final raw = response.data;
      if (raw is Map) {
        final data = raw['data'];
        if (data is List) return data;
      }
    } catch (_) {}
    return [];
  }

  Future<List<dynamic>> getInvoices() async { // [cite: 34]
    final response = await _dio.get('/accountant/invoices');
    final raw = response.data;
    if (raw is List) return raw;
    if (raw is Map) return (raw['data'] as List?) ?? [];
    return [];
  }

  Future<Map<String, dynamic>> getInvoiceDetail(String id) async { // [cite: 34]
    final response = await _dio.get('/finance/invoices/$id');
    return response.data;
  }

  Future<dynamic> getAccountantDriverPayments({String? statusFilter}) async {
    final response = await _dio.get('/accountant/driver-payments',
        queryParameters: {if (statusFilter != null) 'status_filter': statusFilter});
    return response.data;
  }

  Future<dynamic> markDriverPaymentPaid(int paymentId, Map<String, dynamic> data) async {
    final response =
        await _dio.post('/accountant/driver-payments/$paymentId/mark-paid', data: data);
    return response.data;
  }

  Future<dynamic> getAdminPendingTripCompletions() async {
    final response = await _dio.get('/admin/trips/pending-completion');
    return response.data;
  }

  Future<dynamic> adminApproveTripCompletion(int tripId) async {
    final response = await _dio.post('/admin/trips/$tripId/approve-completion', data: {});
    return response.data;
  }

  Future<void> recordPayment(String invoiceId, Map<String, dynamic> data) async { // [cite: 34]
    await _dio.post('/finance/payments', data: data);
  }

  Future<List<dynamic>> getReceivables() async { // [cite: 34]
    final response = await _dio.get('/accountant/receivables');
    final raw = response.data;
    if (raw is List) return raw;
    if (raw is Map) return (raw['data'] as List?) ?? [];
    return [];
  }

  // --- Vehicles & Trips ---
  Future<List<dynamic>> getVehicles() async { // [cite: 33]
    final response = await _dio.get('/vehicles');
    final payload = response.data;
    if (payload is Map && payload['data'] is List) return payload['data'] as List;
    if (payload is List) return payload;
    return [];
  }

  Future<Map<String, dynamic>> getVehicleDetail(String id) async { // [cite: 33]
    final response = await _dio.get('/vehicles/$id');
    return response.data;
  }

  Future<void> logService(Map<String, dynamic> data) async { // [cite: 33]
    await _dio.post('/service', data: data);
  }

  Future<void> recordTyreEvent(Map<String, dynamic> data) async { // [cite: 33]
    final tyreId = data['tyre_id'];
    await _dio.post('/tyre/$tyreId/event', data: data);
  }

  /// Fetch the real integer PK for a tyre at a given vehicle+position.
  Future<int?> getTyreId({required String vehicleId, required String position}) async {
    final response = await _dio.get('/tyre', queryParameters: {
      'vehicle_id': vehicleId,
      'position': position,
      'limit': 1,
    });
    final raw = response.data;
    final list = raw is Map ? (raw['data'] as List?) : (raw as List?);
    if (list != null && list.isNotEmpty) {
      return (list.first as Map)['id'] as int?;
    }
    return null;
  }

  Future<List<dynamic>> getTrips({String? status}) async { // [cite: 34]
    final response = await _dio.get('/trips', queryParameters: {
      if (status != null) 'status': status,
    });
    return response.data;
  }

  Future<Map<String, dynamic>> getTripDetail(String id) async { // [cite: 34]
    final response = await _dio.get('/trips/$id');
    return response.data;
  }

  Future<void> closeTrip(String id) async { // [cite: 34]
    await _dio.put('/trips/$id/close');
  }

  Future<void> startTrip(int tripId, {double? startOdometer}) async {
    await _dio.put('/trips/$tripId/start', data: {
      if (startOdometer != null) 'start_odometer': startOdometer,
    });
  }

  Future<void> reachTrip(int tripId) async {
    await _dio.put('/trips/$tripId/reach');
  }

  /// Trigger SOS alert for a trip. Returns response data including emergency contact.
  Future<Map<String, dynamic>> triggerSOS(int tripId, {double? latitude, double? longitude, String? locationName}) async {
    final response = await _dio.post('/trips/$tripId/sos', data: {
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
      if (locationName != null) 'location_name': locationName,
    });
    return response.data;
  }

  // --- Intelligence Layer ---
  Future<Map<String, dynamic>> getDriverScore(int driverId) async {
    final response = await _dio.get('/intelligence/driver-scores/$driverId');
    return response.data['data'] ?? response.data;
  }

  Future<Map<String, dynamic>> getDriverLeaderboard() async {
    final response = await _dio.get('/intelligence/driver-leaderboard');
    return response.data['data'] ?? response.data;
  }

  Future<Map<String, dynamic>> getVehicleRisk(int vehicleId) async {
    final response = await _dio.get('/intelligence/vehicle-risk/$vehicleId');
    return response.data['data'] ?? response.data;
  }

  Future<Map<String, dynamic>> getFleetMaintenanceSummary() async {
    final response = await _dio.get('/intelligence/fleet-maintenance');
    return response.data['data'] ?? response.data;
  }

  Future<List<dynamic>> getTripAlerts(int tripId, {bool unacknowledgedOnly = false}) async {
    final response = await _dio.get('/intelligence/trip-alerts/$tripId', queryParameters: {
      'unacknowledged_only': unacknowledgedOnly,
    });
    final data = response.data['data'];
    return data is List ? data : [];
  }

  Future<List<dynamic>> getDailyInsights({int limit = 7}) async {
    final response = await _dio.get('/intelligence/insights', queryParameters: {'limit': limit});
    final data = response.data['data'];
    return data is List ? data : [];
  }

  Future<List<dynamic>> getRecentEvents({int limit = 20}) async {
    final response = await _dio.get('/intelligence/events', queryParameters: {'limit': limit});
    final data = response.data['data'];
    return data is List ? data : [];
  }

  // --- Event Priority & Grouped Events ---

  Future<List<dynamic>> getGroupedEvents({String? priority, int limit = 50}) async {
    final params = <String, dynamic>{'limit': limit};
    if (priority != null) params['priority'] = priority;
    final response = await _dio.get('/intelligence/events/grouped', queryParameters: params);
    final data = response.data['data'];
    return data is List ? data : [];
  }

  Future<List<dynamic>> getEventHistory(String entityId, {bool includeSuppressed = true, int limit = 100}) async {
    final response = await _dio.get('/intelligence/events/history', queryParameters: {
      'entity_id': entityId,
      'include_suppressed': includeSuppressed,
      'limit': limit,
    });
    final data = response.data['data'];
    return data is List ? data : [];
  }

  Future<Map<String, dynamic>> acknowledgeEvent(int eventId, {String? note}) async {
    final params = <String, dynamic>{};
    if (note != null) params['note'] = note;
    final response = await _dio.post('/intelligence/events/$eventId/acknowledge', queryParameters: params);
    return response.data['data'] as Map<String, dynamic>? ?? {};
  }

  Future<Map<String, dynamic>> acknowledgeEventsBulk(List<int> eventIds, {String? note}) async {
    final params = <String, dynamic>{'event_ids': eventIds};
    if (note != null) params['note'] = note;
    final response = await _dio.post('/intelligence/events/acknowledge-bulk', queryParameters: params);
    return response.data['data'] as Map<String, dynamic>? ?? {};
  }

  // --- Offline Batch Sync ---

  /// Sends a batch of queued offline actions to the server.
  /// Returns a map containing 'accepted' count and list of 'results'.
  Future<Map<String, dynamic>> syncBatch({
    required String deviceId,
    required List<Map<String, dynamic>> actions,
  }) async {
    final response = await _dio.post('/sync/batch', data: {
      'device_id': deviceId,
      'actions': actions,
    });
    return response.data;
  }

  // --- GPS Tracking ---

  Future<void> sendGpsPing({
    required double latitude,
    required double longitude,
    double speed = 0,
    double heading = 0,
    int? tripId,
  }) async {
    await _dio.post('/tracking/gps/ping', data: {
      'latitude': latitude,
      'longitude': longitude,
      'speed': speed,
      'heading': heading,
      if (tripId != null) 'trip_id': tripId,
    });
  }

  Future<void> updateTripStatus(int tripId, String status) async {
    // Route to dedicated endpoints for statuses that have extra automation
    switch (status) {
      case 'started':
        await _dio.put('/trips/$tripId/start');
        break;
      case 'unloading':
      case 'reached':
        await _dio.put('/trips/$tripId/reach');
        break;
      case 'completed':
        await _dio.put('/trips/$tripId/close');
        break;
      default:
        await _dio.patch('/trips/$tripId/status', data: {'status': status});
    }
  }
}
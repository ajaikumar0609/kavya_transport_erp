import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/kt_colors.dart';
import '../../core/theme/kt_text_styles.dart';
import '../../providers/fleet_dashboard_provider.dart';

class FleetCreateLRScreen extends ConsumerStatefulWidget {
  const FleetCreateLRScreen({super.key});

  @override
  ConsumerState<FleetCreateLRScreen> createState() =>
      _FleetCreateLRScreenState();
}

class _FleetCreateLRScreenState extends ConsumerState<FleetCreateLRScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _saving = false;
  bool _loading = true;
  int _currentStep = 0;

  // ── Consignor defaults ──
  static const _defaultConsignorName    = 'Kavya Transports';
  static const _defaultConsignorAddress = 'Kavya Transports Depot, Chennai';
  static const _defaultConsignorGstin   = '33AABCK1234M1ZP';
  static const _defaultConsignorPhone   = '9876543210';

  // ── Consignor / Consignee ──
  final _consignorNameCtrl    = TextEditingController(text: _defaultConsignorName);
  final _consignorGstinCtrl   = TextEditingController(text: _defaultConsignorGstin);
  final _consignorAddressCtrl = TextEditingController(text: _defaultConsignorAddress);
  final _consignorPhoneCtrl   = TextEditingController(text: _defaultConsignorPhone);
  final _consigneeNameCtrl    = TextEditingController();
  final _consigneeGstinCtrl   = TextEditingController();
  final _consigneeAddressCtrl = TextEditingController();
  final _consigneePhoneCtrl   = TextEditingController();

  // ── Clients for consignee dropdown ──
  List<Map<String, dynamic>> _clients = [];
  int? _selectedClientId;

  // ── Cargo suggestions (from previous LR for selected client) ──
  List<Map<String, dynamic>> _suggestedCargoItems = [];

  // ── Route ──
  final _originCityCtrl    = TextEditingController();
  final _originStateCtrl   = TextEditingController();
  final _originAddressCtrl = TextEditingController();
  final _destCityCtrl      = TextEditingController();
  final _destStateCtrl     = TextEditingController();
  final _destAddressCtrl   = TextEditingController();

  // ── Cargo items ──
  final List<_CargoItem> _items = [_CargoItem()];

  // ── Charges ──
  String _paymentMode = 'to_be_billed';
  String _gstRate = '0';
  final _freightCtrl = TextEditingController();
  final _loadingChargesCtrl = TextEditingController();
  final _unloadingChargesCtrl = TextEditingController();
  final _detentionChargesCtrl = TextEditingController();
  final _otherChargesCtrl = TextEditingController();
  final _declaredValueCtrl = TextEditingController();

  // ── Vehicle & Driver assignment ──
  List<Map<String, dynamic>> _vehicles = [];
  List<Map<String, dynamic>> _drivers = [];
  int? _selectedVehicleId;
  int? _selectedDriverId;

  // ── Driver documents (loaded when a driver is selected) ──
  List<Map<String, dynamic>> _driverDocs = [];
  bool _loadingDriverDocs = false;

  // ── Optional ──
  final _insuranceCompanyCtrl = TextEditingController();
  final _insurancePolicyCtrl = TextEditingController();
  final _insuranceAmountCtrl = TextEditingController();
  final _remarksCtrl = TextEditingController();
  final _specialInstructionsCtrl = TextEditingController();
  bool _autoCreateTrip = true;

  // ── Market Trip mode ──
  bool _isMarketTrip = false;
  bool _mktRcLoading = false;
  bool _mktDlLoading = false;
  String _mktRcFileUrl = '';
  String _mktDlFileUrl = '';
  // Vehicle fields
  final _mktRegNoCtrl = TextEditingController();
  final _mktOwnerNameCtrl = TextEditingController();
  final _mktDateRegnCtrl = TextEditingController();
  final _mktRegnValidityCtrl = TextEditingController();
  final _mktChassisNoCtrl = TextEditingController();
  final _mktEngineNoCtrl = TextEditingController();
  String _mktVehicleType = '';
  String _mktFuelType = '';
  final _mktMakeCtrl = TextEditingController();
  final _mktModelCtrl = TextEditingController();
  final _mktYearCtrl = TextEditingController();
  final _mktOwnerPhoneCtrl = TextEditingController();
  // Driver fields
  final _mktDlNoCtrl = TextEditingController();
  final _mktDlIssueDateCtrl = TextEditingController();
  final _mktDlValidUntilCtrl = TextEditingController();
  final _mktDriverNameCtrl = TextEditingController();
  final _mktDriverPhoneCtrl = TextEditingController();
  final _mktDriverAltPhoneCtrl = TextEditingController();
  final _mktDriverAddressCtrl = TextEditingController();

  // ── E-way Bill ──
  String? _ewayBillNumber;
  DateTime? _ewayBillDate;
  DateTime? _ewayValidUntil;

  DateTime _lrDate = DateTime.now();

  static const _paymentModes = ['to_pay', 'paid', 'to_be_billed', 'fod'];
  static const _gstRates = ['0', '5', '12', '18', '28'];

  static final _gstinRegex =
      RegExp(r'^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$');

  @override
  void initState() {
    super.initState();
    _loadLookups();
  }

  Future<void> _loadLookups() async {
    try {
      final api = ref.read(apiServiceProvider);
      final results = await Future.wait([
        api.get('/vehicles', queryParameters: {'status': 'available', 'limit': 100}),
        api.get('/fleet/drivers', queryParameters: {'status': 'available', 'limit': 100}),
        api.get('/clients', queryParameters: {'limit': 200}),
        api.get('/lr/next-eway-bill-number'),
      ]);

      final vPayload =
          (results[0] is Map && results[0]['data'] != null) ? results[0]['data'] : results[0];
      final dPayload =
          (results[1] is Map && results[1]['data'] != null) ? results[1]['data'] : results[1];
      final cRaw = results[2];
      final cPayload = (cRaw is Map) ? (cRaw['data'] ?? cRaw) : cRaw;
      final ewbRaw = results[3];
      final nextEwb = (ewbRaw is Map)
          ? (ewbRaw['data']?['next_eway_bill_number'] ?? ewbRaw['next_eway_bill_number'])
          : null;

      if (mounted) {
        setState(() {
          _vehicles = (vPayload is List)
              ? List<Map<String, dynamic>>.from(vPayload)
              : [];
          _drivers = (dPayload is List)
              ? List<Map<String, dynamic>>.from(dPayload)
              : [];
          _clients = (cPayload is List)
              ? List<Map<String, dynamic>>.from(cPayload)
              : [];
          _ewayBillNumber = nextEwb?.toString() ?? '254733886084';
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not load form data: $e')),
        );
      }
    }
  }

  Future<void> _loadDriverDocs(int driverId) async {
    if (!mounted) return;
    setState(() { _loadingDriverDocs = true; _driverDocs = []; });
    try {
      final api = ref.read(apiServiceProvider);
      final resp = await api.get('/drivers/$driverId/documents');
      final raw = (resp is Map && resp['data'] != null) ? resp['data'] : resp;
      final items = raw is Map ? (raw['items'] as List<dynamic>? ?? []) : (raw as List<dynamic>? ?? []);
      if (mounted) {
        setState(() {
          _driverDocs = List<Map<String, dynamic>>.from(items);
          _loadingDriverDocs = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() { _loadingDriverDocs = false; _driverDocs = []; });
    }
  }

  // ── OCR & Smart Re-fill ────────────────────────────────────────────────────

  /// Show bottom sheet to pick file source (camera or gallery/files).
  Future<File?> _pickDocument() async {
    File? picked;
    await showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Take Photo'),
              onTap: () async {
                Navigator.pop(context);
                final xFile = await ImagePicker().pickImage(
                  source: ImageSource.camera,
                  imageQuality: 90,
                );
                if (xFile != null) {
                  picked = File(xFile.path);
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from Gallery / Files'),
              onTap: () async {
                Navigator.pop(context);
                final result = await FilePicker.platform.pickFiles(
                  type: FileType.custom,
                  allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf', 'webp', 'heic'],
                );
                if (result?.files.single.path != null) {
                  picked = File(result!.files.single.path!);
                }
              },
            ),
          ],
        ),
      ),
    );
    return picked;
  }

  /// Run OCR on an RC and populate vehicle fields. Also does smart re-fill.
  Future<void> _pickAndOcrRc() async {
    final file = await _pickDocument();
    if (file == null) return;
    if (!mounted) return;
    setState(() => _mktRcLoading = true);
    try {
      final api = ref.read(apiServiceProvider);
      final ocrData = await api.ocrDocument(file, 'rc');
      final fields = (ocrData['fields'] as Map?)?.cast<String, dynamic>() ?? {};

      String fv(String key) =>
          (fields[key] is Map ? (fields[key] as Map)['value'] : null)?.toString().trim() ?? '';

      final regNo = fv('registration_number');
      final ownerName = fv('owner_name');
      final chassis = fv('chassis_number');
      final engine = fv('engine_number');
      final fuelType = fv('fuel_type');
      final validUpto = fv('valid_upto');

      if (mounted) {
        setState(() {
          if (regNo.isNotEmpty) _mktRegNoCtrl.text = regNo;
          if (ownerName.isNotEmpty) _mktOwnerNameCtrl.text = ownerName;
          if (chassis.isNotEmpty) _mktChassisNoCtrl.text = chassis;
          if (engine.isNotEmpty) _mktEngineNoCtrl.text = engine;
          if (validUpto.isNotEmpty) _mktRegnValidityCtrl.text = _formatOcrDate(validUpto);
          if (fuelType.isNotEmpty) _mktFuelType = _normaliseFuelType(fuelType);
          _mktRcFileUrl = 'uploaded';
        });
      }

      // Smart re-fill: look up previous market trips by registration number
      if (regNo.isNotEmpty) {
        await _smartRefillVehicleByReg(regNo);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(regNo.isNotEmpty
                ? 'RC scanned — $regNo extracted'
                : 'RC scanned — fill manually if needed'),
            backgroundColor: KTColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('OCR failed: $e\nPlease fill manually'), backgroundColor: KTColors.warning),
        );
      }
    } finally {
      if (mounted) setState(() => _mktRcLoading = false);
    }
  }

  /// Run OCR on a Driving License and populate driver fields. Also does smart re-fill.
  Future<void> _pickAndOcrDl() async {
    final file = await _pickDocument();
    if (file == null) return;
    if (!mounted) return;
    setState(() => _mktDlLoading = true);
    try {
      final api = ref.read(apiServiceProvider);
      final ocrData = await api.ocrDocument(file, 'driving_license');
      final fields = (ocrData['fields'] as Map?)?.cast<String, dynamic>() ?? {};

      String fv(String key) =>
          (fields[key] is Map ? (fields[key] as Map)['value'] : null)?.toString().trim() ?? '';

      final dlNo = fv('dl_number');
      final holderName = fv('holder_name');
      final validUpto = fv('valid_upto');
      final dob = fv('dob');

      if (mounted) {
        setState(() {
          if (dlNo.isNotEmpty) _mktDlNoCtrl.text = dlNo;
          if (holderName.isNotEmpty && _mktDriverNameCtrl.text.isEmpty) {
            _mktDriverNameCtrl.text = holderName;
          }
          if (validUpto.isNotEmpty) _mktDlValidUntilCtrl.text = _formatOcrDate(validUpto);
          if (dob.isNotEmpty) _mktDlIssueDateCtrl.text = _formatOcrDate(dob);
          _mktDlFileUrl = 'uploaded';
        });
      }

      // Smart re-fill: look up previous market trips by DL number
      if (dlNo.isNotEmpty) {
        await _smartRefillDriverByDl(dlNo);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(dlNo.isNotEmpty
                ? 'DL scanned — $dlNo extracted'
                : 'DL scanned — fill manually if needed'),
            backgroundColor: KTColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('OCR failed: $e\nPlease fill manually'), backgroundColor: KTColors.warning),
        );
      }
    } finally {
      if (mounted) setState(() => _mktDlLoading = false);
    }
  }

  /// Smart re-fill vehicle fields from a previous market trip record.
  Future<void> _smartRefillVehicleByReg(String regNo) async {
    try {
      final api = ref.read(apiServiceProvider);
      final resp = await api.get('/market-trips', queryParameters: {
        'search': regNo, 'limit': 1,
      });
      final items = _extractListFromResp(resp);
      if (items.isEmpty) return;
      final prev = items.first as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        if ((prev['vehicle_type'] ?? '').toString().isNotEmpty) _mktVehicleType = prev['vehicle_type'].toString();
        if ((prev['fuel_type'] ?? '').toString().isNotEmpty) _mktFuelType = _normaliseFuelType(prev['fuel_type'].toString());
        if ((prev['vehicle_make'] ?? '').toString().isNotEmpty) _mktMakeCtrl.text = prev['vehicle_make'].toString();
        if ((prev['vehicle_model'] ?? '').toString().isNotEmpty) _mktModelCtrl.text = prev['vehicle_model'].toString();
        if ((prev['year_of_manufacture'] ?? '').toString().isNotEmpty) _mktYearCtrl.text = prev['year_of_manufacture'].toString();
        if ((prev['chassis_number'] ?? '').toString().isNotEmpty) _mktChassisNoCtrl.text = prev['chassis_number'].toString();
        if ((prev['engine_number'] ?? '').toString().isNotEmpty) _mktEngineNoCtrl.text = prev['engine_number'].toString();
        if ((prev['owner_name'] ?? '').toString().isNotEmpty) _mktOwnerNameCtrl.text = prev['owner_name'].toString();
        if ((prev['owner_phone'] ?? prev['rc_file_url'] ?? '').toString().isNotEmpty) {
          // owner_phone not stored but keep whatever we have
        }
        if ((prev['rc_validity_date'] ?? '').toString().isNotEmpty) _mktRegnValidityCtrl.text = prev['rc_validity_date'].toString();
        if ((prev['rc_issue_date'] ?? '').toString().isNotEmpty) _mktDateRegnCtrl.text = prev['rc_issue_date'].toString();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vehicle details auto-filled from previous trip'),
          backgroundColor: KTColors.info,
        ),
      );
    } catch (_) {} // silent
  }

  /// Smart re-fill driver fields from a previous market trip record.
  Future<void> _smartRefillDriverByDl(String dlNo) async {
    try {
      final api = ref.read(apiServiceProvider);
      final resp = await api.get('/market-trips', queryParameters: {
        'search': dlNo, 'limit': 1,
      });
      final items = _extractListFromResp(resp);
      if (items.isEmpty) return;
      final prev = items.first as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        if ((prev['driver_name'] ?? '').toString().isNotEmpty) _mktDriverNameCtrl.text = prev['driver_name'].toString();
        if ((prev['driver_phone'] ?? '').toString().isNotEmpty) _mktDriverPhoneCtrl.text = prev['driver_phone'].toString();
        if ((prev['driver_alt_phone'] ?? '').toString().isNotEmpty) _mktDriverAltPhoneCtrl.text = prev['driver_alt_phone'].toString();
        if ((prev['driver_address'] ?? '').toString().isNotEmpty) _mktDriverAddressCtrl.text = prev['driver_address'].toString();
        if ((prev['driver_license_issue'] ?? '').toString().isNotEmpty) _mktDlIssueDateCtrl.text = prev['driver_license_issue'].toString();
        if ((prev['driver_license_valid'] ?? '').toString().isNotEmpty) _mktDlValidUntilCtrl.text = prev['driver_license_valid'].toString();
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Driver details auto-filled from previous trip'),
          backgroundColor: KTColors.info,
        ),
      );
    } catch (_) {} // silent
  }

  List _extractListFromResp(dynamic resp) {
    if (resp is List) return resp;
    if (resp is Map) {
      final d = resp['data'];
      if (d is List) return d;
      if (d is Map) {
        final items = d['items'];
        if (items is List) return items;
      }
    }
    return [];
  }

  String _formatOcrDate(String raw) {
    // OCR returns YYYY-MM-DD; convert to DD/MM/YYYY for display
    final parts = raw.split('-');
    if (parts.length == 3 && parts[0].length == 4) {
      return '${parts[2]}/${parts[1]}/${parts[0]}';
    }
    return raw;
  }

  String _normaliseFuelType(String raw) {
    const map = {
      'diesel': 'Diesel',
      'petrol': 'Petrol',
      'cng': 'CNG',
      'electric': 'Electric',
      'lpg': 'LPG',
    };
    return map[raw.trim().toLowerCase()] ?? raw;
  }

  @override
  void dispose() {
    for (final c in [
      _consignorNameCtrl, _consignorGstinCtrl, _consignorAddressCtrl,
      _consignorPhoneCtrl, _consigneeNameCtrl, _consigneeGstinCtrl,
      _consigneeAddressCtrl, _consigneePhoneCtrl,
      _originCityCtrl, _originStateCtrl, _originAddressCtrl,
      _destCityCtrl, _destStateCtrl, _destAddressCtrl,
      _freightCtrl, _loadingChargesCtrl,
      _unloadingChargesCtrl, _detentionChargesCtrl, _otherChargesCtrl,
      _declaredValueCtrl, _insuranceCompanyCtrl, _insurancePolicyCtrl,
      _insuranceAmountCtrl, _remarksCtrl, _specialInstructionsCtrl,
      // Market trip vehicle
      _mktRegNoCtrl, _mktOwnerNameCtrl, _mktDateRegnCtrl, _mktRegnValidityCtrl,
      _mktChassisNoCtrl, _mktEngineNoCtrl, _mktMakeCtrl, _mktModelCtrl,
      _mktYearCtrl, _mktOwnerPhoneCtrl,
      // Market trip driver
      _mktDlNoCtrl, _mktDlIssueDateCtrl, _mktDlValidUntilCtrl,
      _mktDriverNameCtrl, _mktDriverPhoneCtrl, _mktDriverAltPhoneCtrl, _mktDriverAddressCtrl,
    ]) {
      c.dispose();
    }
    for (final item in _items) {
      item.dispose();
    }
    super.dispose();
  }

  double get _subtotal {
    final freight = double.tryParse(_freightCtrl.text) ?? 0;
    final loading = double.tryParse(_loadingChargesCtrl.text) ?? 0;
    final unloading = double.tryParse(_unloadingChargesCtrl.text) ?? 0;
    final detention = double.tryParse(_detentionChargesCtrl.text) ?? 0;
    final other = double.tryParse(_otherChargesCtrl.text) ?? 0;
    return freight + loading + unloading + detention + other;
  }

  double get _gstAmount {
    final rate = double.tryParse(_gstRate) ?? 0;
    return _subtotal * rate / 100;
  }

  double get _grandTotal => _subtotal + _gstAmount;

  String? _validateGstin(String? v) {
    if (v == null || v.trim().isEmpty) return null; // optional
    if (!_gstinRegex.hasMatch(v.trim().toUpperCase())) return 'Invalid GSTIN';
    return null;
  }

  Future<void> _fetchCargoSuggestions(int clientId) async {
    try {
      final api = ref.read(apiServiceProvider);
      final resp = await api.get('/lr/client/$clientId/last-cargo-items');
      final raw = (resp is Map) ? (resp['data'] ?? resp) : resp;
      if (mounted && raw is List && raw.isNotEmpty) {
        setState(() {
          _suggestedCargoItems = List<Map<String, dynamic>>.from(raw);
        });
      }
    } catch (_) {
      // Suggestions are best-effort; silently ignore errors
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    // Fleet vehicle mode: validate selection
    if (!_isMarketTrip && _autoCreateTrip &&
        (_selectedVehicleId == null || _selectedDriverId == null)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select vehicle and driver for trip creation')),
      );
      return;
    }

    // Market trip mode: driver name is required
    if (_isMarketTrip && _mktDriverNameCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Driver name is required for Market Trip')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final api = ref.read(apiServiceProvider);

      // Build LR items
      final lrItems = _items
          .where((item) => item.descriptionCtrl.text.trim().isNotEmpty)
          .map((item) => {
                'description': item.descriptionCtrl.text.trim(),
                'hsn_code': item.hsnCtrl.text.trim(),
                'packages': int.tryParse(item.packagesCtrl.text) ?? 0,
                'package_type': item.packageType,
                'quantity': double.tryParse(item.quantityCtrl.text) ?? 0,
                'unit': item.unit,
                'actual_weight': double.tryParse(item.actualWeightCtrl.text) ?? 0,
                'charged_weight': double.tryParse(item.chargedWeightCtrl.text) ?? 0,
                'rate': double.tryParse(item.rateCtrl.text) ?? 0,
              })
          .toList();

      // Create LR — vehicle_id / driver_id are null for market trips
      final lrData = {
        'lr_date': _lrDate.toIso8601String().split('T').first,
        'consignor_name': _consignorNameCtrl.text.trim(),
        'consignor_gstin': _consignorGstinCtrl.text.trim().toUpperCase(),
        'consignor_address': _consignorAddressCtrl.text.trim(),
        'consignor_phone': _consignorPhoneCtrl.text.trim(),
        'consignee_name': _consigneeNameCtrl.text.trim(),
        'consignee_gstin': _consigneeGstinCtrl.text.trim().toUpperCase(),
        'consignee_address': _consigneeAddressCtrl.text.trim(),
        'consignee_phone': _consigneePhoneCtrl.text.trim(),
        'origin': _originCityCtrl.text.trim(),
        'destination': _destCityCtrl.text.trim(),
        if (_selectedClientId != null) 'client_id': _selectedClientId,
        if (!_isMarketTrip) ...{
          'vehicle_id': _selectedVehicleId,
          'driver_id': _selectedDriverId,
        },
        'payment_mode': _paymentMode,
        'eway_bill_number': _ewayBillNumber,
        'eway_bill_date': _ewayBillDate?.toIso8601String().split('T').first,
        'eway_bill_valid_until': _ewayValidUntil?.toIso8601String(),
        'freight_amount': double.tryParse(_freightCtrl.text) ?? 0,
        'loading_charges': double.tryParse(_loadingChargesCtrl.text) ?? 0,
        'unloading_charges': double.tryParse(_unloadingChargesCtrl.text) ?? 0,
        'detention_charges': double.tryParse(_detentionChargesCtrl.text) ?? 0,
        'other_charges': double.tryParse(_otherChargesCtrl.text) ?? 0,
        'declared_value': double.tryParse(_declaredValueCtrl.text),
        'insurance_company': _insuranceCompanyCtrl.text.trim(),
        'insurance_policy_number': _insurancePolicyCtrl.text.trim(),
        'insurance_amount': double.tryParse(_insuranceAmountCtrl.text),
        'remarks': _remarksCtrl.text.trim(),
        'special_instructions': _specialInstructionsCtrl.text.trim(),
        'items': lrItems,
      };

      final lrResp = await api.post('/lr', data: lrData);
      final lrId = lrResp?['data']?['id'] ?? lrResp?['id'];

      if (_isMarketTrip) {
        // Create a Market Trip record with vehicle + driver details
        try {
          await api.post('/market-trips', data: {
            'vehicle_registration': _mktRegNoCtrl.text.trim(),
            'vehicle_type': _mktVehicleType.isNotEmpty ? _mktVehicleType : null,
            'fuel_type': _mktFuelType.isNotEmpty ? _mktFuelType : null,
            'vehicle_make': _mktMakeCtrl.text.trim().isNotEmpty ? _mktMakeCtrl.text.trim() : null,
            'vehicle_model': _mktModelCtrl.text.trim().isNotEmpty ? _mktModelCtrl.text.trim() : null,
            'year_of_manufacture': int.tryParse(_mktYearCtrl.text.trim()),
            'chassis_number': _mktChassisNoCtrl.text.trim().isNotEmpty ? _mktChassisNoCtrl.text.trim() : null,
            'engine_number': _mktEngineNoCtrl.text.trim().isNotEmpty ? _mktEngineNoCtrl.text.trim() : null,
            'owner_name': _mktOwnerNameCtrl.text.trim().isNotEmpty ? _mktOwnerNameCtrl.text.trim() : null,
            'rc_issue_date': _mktDateRegnCtrl.text.trim().isNotEmpty ? _mktDateRegnCtrl.text.trim() : null,
            'rc_validity_date': _mktRegnValidityCtrl.text.trim().isNotEmpty ? _mktRegnValidityCtrl.text.trim() : null,
            'driver_name': _mktDriverNameCtrl.text.trim(),
            'driver_phone': _mktDriverPhoneCtrl.text.trim().isNotEmpty ? _mktDriverPhoneCtrl.text.trim() : null,
            'driver_alt_phone': _mktDriverAltPhoneCtrl.text.trim().isNotEmpty ? _mktDriverAltPhoneCtrl.text.trim() : null,
            'driver_address': _mktDriverAddressCtrl.text.trim().isNotEmpty ? _mktDriverAddressCtrl.text.trim() : null,
            'driver_license': _mktDlNoCtrl.text.trim().isNotEmpty ? _mktDlNoCtrl.text.trim() : null,
            'driver_license_issue': _mktDlIssueDateCtrl.text.trim().isNotEmpty ? _mktDlIssueDateCtrl.text.trim() : null,
            'driver_license_valid': _mktDlValidUntilCtrl.text.trim().isNotEmpty ? _mktDlValidUntilCtrl.text.trim() : null,
            'client_rate': double.tryParse(_freightCtrl.text) ?? 0.0,
            'contractor_rate': 0.0,
          });
        } catch (_) {
          // Market trip creation is non-critical; LR is already saved
        }
      } else if (_autoCreateTrip && lrId != null && _selectedVehicleId != null && _selectedDriverId != null) {
        // Auto-create fleet trip linked to this LR
        await api.post('/trips', data: {
          'vehicle_id': _selectedVehicleId,
          'driver_id': _selectedDriverId,
          'origin': _originCityCtrl.text.trim(),
          'destination': _destCityCtrl.text.trim(),
          'trip_date': _lrDate.toIso8601String().split('T').first,
          'lr_ids': [lrId],
        });
      }

      if (mounted) {
        final lrNumber = lrResp?['data']?['lr_number'] ?? lrResp?['lr_number'] ?? 'LR';
        await _showLRCreatedDialog(lrId, lrNumber.toString());
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: KTColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _showLRCreatedDialog(dynamic lrId, String lrNumber) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        contentPadding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle_rounded, color: KTColors.success, size: 56),
            const SizedBox(height: 12),
            Text('LR Created!',
                style: KTTextStyles.h2.copyWith(color: KTColors.textHeading)),
            const SizedBox(height: 4),
            Text(lrNumber,
                style: KTTextStyles.body
                    .copyWith(color: KTColors.primary, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(_isMarketTrip
                ? 'LR created with market trip details.'
                : _autoCreateTrip
                    ? 'LR created and trip assigned to driver.'
                    : 'LR created successfully.',
                textAlign: TextAlign.center,
                style: KTTextStyles.bodySmall.copyWith(color: KTColors.textMuted)),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              context.pop(true);
            },
            child: const Text('Done'),
          ),
          if (lrId != null)
            FilledButton.icon(
              icon: const Icon(Icons.print_rounded, size: 16),
              label: const Text('Print LR'),
              style: FilledButton.styleFrom(backgroundColor: KTColors.primary),
              onPressed: () async {
                Navigator.of(ctx).pop();
                await _printLR(lrId);
                if (mounted) context.pop(true);
              },
            ),
        ],
      ),
    );
  }

  Future<void> _printLR(dynamic lrId) async {
    try {
      final api = ref.read(apiServiceProvider);
      final resp = await api.get('/lr/$lrId/pdf');
      final url = resp?['data']?['url'] ?? resp?['url'];
      if (url != null && url.toString().isNotEmpty) {
        final uri = Uri.parse(url.toString());
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
          return;
        }
      }
    } catch (_) {}
    // Fallback: open download endpoint with token
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open PDF. Try from the website.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: KTColors.lightBg,
      appBar: AppBar(
        backgroundColor: KTColors.surface,
        foregroundColor: KTColors.textHeading,
        elevation: 0,
        title: Text('Create LR',
            style: KTTextStyles.h2
                .copyWith(color: KTColors.textHeading, decoration: TextDecoration.none)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: Column(
                children: [
                  // ─── Step Indicator ──
                  _stepIndicator(),
                  // ─── Step Content ──
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: _buildCurrentStep(),
                    ),
                  ),
                  // ─── Navigation Buttons ──
                  _navigationButtons(),
                ],
              ),
            ),
    );
  }

  Widget _stepIndicator() {
    const steps = ['Parties', 'Route', 'Cargo', 'Charges', 'Assignment', 'Notes'];
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      color: KTColors.surface,
      child: Row(
        children: List.generate(steps.length, (i) {
          final active = i == _currentStep;
          final completed = i < _currentStep;
          return Expanded(
            child: GestureDetector(
              onTap: () {
                if (i < _currentStep) setState(() => _currentStep = i);
              },
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 14,
                    backgroundColor: completed
                        ? KTColors.success
                        : active
                            ? KTColors.fleetAccent
                            : KTColors.borderColor,
                    child: completed
                        ? const Icon(Icons.check, size: 14, color: Colors.white)
                        : Text('${i + 1}',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: active ? Colors.white : KTColors.textMuted,
                            )),
                  ),
                  const SizedBox(height: 4),
                  Text(steps[i],
                      style: KTTextStyles.labelSmall.copyWith(
                        color: active ? KTColors.fleetAccent : KTColors.textMuted,
                        fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                      ),
                      overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildCurrentStep() {
    switch (_currentStep) {
      case 0:
        return _stepParties();
      case 1:
        return _stepRoute();
      case 2:
        return _stepCargoItems();
      case 3:
        return _stepCharges();
      case 4:
        return _stepAssignment();
      case 5:
        return _stepNotes();
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _navigationButtons() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: KTColors.surface,
        border: Border(top: BorderSide(color: KTColors.borderColor)),
      ),
      child: Row(
        children: [
          if (_currentStep > 0)
            Expanded(
              child: OutlinedButton(
                onPressed: () => setState(() => _currentStep--),
                style: OutlinedButton.styleFrom(
                  foregroundColor: KTColors.fleetAccent,
                  side: const BorderSide(color: KTColors.fleetAccent),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('Back'),
              ),
            ),
          if (_currentStep > 0) const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: ElevatedButton(
              onPressed: _saving
                  ? null
                  : () {
                      if (_currentStep < 5) {
                        setState(() => _currentStep++);
                      } else {
                        _submit();
                      }
                    },
              style: ElevatedButton.styleFrom(
                backgroundColor: KTColors.fleetAccent,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(
                      _currentStep < 5 ? 'Next' : 'Create LR & Assign Trip',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Parties (Job, Consignor, Consignee)
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _stepParties() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // LR Date
        GestureDetector(
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: _lrDate,
              firstDate: DateTime.now().subtract(const Duration(days: 7)),
              lastDate: DateTime.now().add(const Duration(days: 30)),
            );
            if (picked != null) setState(() => _lrDate = picked);
          },
          child: _readonlyField(
            'LR Date',
            '${_lrDate.year}-${_lrDate.month.toString().padLeft(2, '0')}-${_lrDate.day.toString().padLeft(2, '0')}',
            Icons.calendar_today,
          ),
        ),
        const SizedBox(height: 16),

        _sectionLabel('Consignor (Sender)'),
        const SizedBox(height: 8),
        _textField('Consignor Name *', _consignorNameCtrl,
            validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null),
        _textField('GSTIN', _consignorGstinCtrl,
            hint: '22AAAAA0000A1Z5',
            capitalization: TextCapitalization.characters,
            validator: _validateGstin),
        _textField('Address', _consignorAddressCtrl),
        _textField('Phone', _consignorPhoneCtrl, keyboard: TextInputType.phone),
        const SizedBox(height: 16),

        _sectionLabel('Consignee (Receiver)'),
        const SizedBox(height: 8),
        // ── Select Client dropdown (auto-fills fields below) ──
        DropdownButtonFormField<int>(
          initialValue: _selectedClientId,
          dropdownColor: KTColors.surface,
          style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
          hint: Text('Select client to auto-fill',
              style: KTTextStyles.body.copyWith(color: KTColors.textMuted)),
          decoration: _dropDecor('Select Client'),
          isExpanded: true,
          items: [
            DropdownMenuItem<int>(
              value: null,
              child: Text('Select client to auto-fill',
                  style: KTTextStyles.body.copyWith(color: KTColors.textMuted)),
            ),
            ..._clients.map((c) {
              final city = c['city']?.toString() ?? '';
              return DropdownMenuItem<int>(
                value: c['id'] as int?,
                child: Text(
                    '${c['name']}${city.isNotEmpty ? ' | $city' : ''}',
                    style: const TextStyle(fontSize: 13)),
              );
            }),
          ],
          onChanged: (clientId) {
            if (clientId == null) {
              setState(() {
                _selectedClientId = null;
                _suggestedCargoItems = [];
              });
              return;
            }
            // Use toString() comparison to be safe against int/num type differences
            final c = _clients.firstWhere(
              (x) => x['id']?.toString() == clientId.toString(),
              orElse: () => {},
            );
            if (c.isEmpty) return;
            // All assignments inside setState so the rebuild sees updated values
            setState(() {
              _selectedClientId = clientId;
              _consigneeNameCtrl.text    = c['name']?.toString() ?? '';
              _consigneeGstinCtrl.text   = (c['gstin'] ?? c['gst_number'] ?? '').toString().toUpperCase();
              _consigneeAddressCtrl.text = (c['address_line1'] ?? c['billing_address'] ?? '').toString();
              _consigneePhoneCtrl.text   = c['phone']?.toString() ?? '';
              _destCityCtrl.text         = c['city']?.toString() ?? '';
              _destStateCtrl.text        = c['state']?.toString() ?? '';
              _destAddressCtrl.text      = (c['address_line1'] ?? c['billing_address'] ?? '').toString();
              _suggestedCargoItems = []; // clear stale suggestions immediately
            });
            // Fetch cargo suggestions in background (best-effort)
            _fetchCargoSuggestions(clientId);
          },
        ),
        const SizedBox(height: 8),
        _textField('Consignee Name *', _consigneeNameCtrl,
            validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null),
        _textField('GSTIN', _consigneeGstinCtrl,
            hint: '22AAAAA0000A1Z5',
            capitalization: TextCapitalization.characters,
            validator: _validateGstin),
        _textField('Address', _consigneeAddressCtrl),
        _textField('Phone', _consigneePhoneCtrl, keyboard: TextInputType.phone),
      ],
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Route — Origin & Destination
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _stepRoute() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Origin ──────────────────────────────────────────────────
        _sectionLabel('Origin'),
        const SizedBox(height: 8),
        _textField('City *', _originCityCtrl,
            validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null),
        Row(children: [
          Expanded(child: _textField('State', _originStateCtrl)),
        ]),
        _textField('Address / Pickup Point', _originAddressCtrl),
        const SizedBox(height: 20),

        // ── Destination ──────────────────────────────────────────────
        _sectionLabel('Destination'),
        const SizedBox(height: 8),

        // Client badge (auto-carried from Step 1)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: _consigneeNameCtrl.text.isNotEmpty
                  ? KTColors.fleetAccent.withValues(alpha: 0.07)
                  : KTColors.borderColor.withValues(alpha: 0.25),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: _consigneeNameCtrl.text.isNotEmpty
                    ? KTColors.fleetAccent.withValues(alpha: 0.4)
                    : KTColors.borderColor,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.business_outlined,
                  size: 18,
                  color: _consigneeNameCtrl.text.isNotEmpty
                      ? KTColors.fleetAccent
                      : KTColors.textMuted,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Client',
                        style: KTTextStyles.label.copyWith(
                          color: KTColors.textMuted, fontSize: 11),
                      ),
                      Text(
                        _consigneeNameCtrl.text.isNotEmpty
                            ? _consigneeNameCtrl.text
                            : 'No client selected — go back to Step 1',
                        style: KTTextStyles.body.copyWith(
                          color: _consigneeNameCtrl.text.isNotEmpty
                              ? KTColors.textHeading
                              : KTColors.textMuted,
                          fontWeight: _consigneeNameCtrl.text.isNotEmpty
                              ? FontWeight.w600
                              : FontWeight.normal,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),

        _textField('City *', _destCityCtrl,
            validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null),
        _textField('State', _destStateCtrl),
        _textField('Address / Delivery Point', _destAddressCtrl),
        const SizedBox(height: 24),

        // ── E-way Bill Details ────────────────────────────────────────
        _sectionLabel('E-way Bill Details'),
        const SizedBox(height: 8),

        // Auto-generated EWB number (read-only)
        _readonlyField(
          'E-way Bill Number',
          _ewayBillNumber ?? 'Loading...',
          Icons.receipt_long_outlined,
        ),

        // EWB Date — user picks
        GestureDetector(
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: _ewayBillDate ?? DateTime.now(),
              firstDate: DateTime.now().subtract(const Duration(days: 30)),
              lastDate: DateTime.now().add(const Duration(days: 90)),
            );
            if (picked != null) setState(() => _ewayBillDate = picked);
          },
          child: _readonlyField(
            'E-way Bill Date',
            _ewayBillDate != null
                ? '${_ewayBillDate!.year}-${_ewayBillDate!.month.toString().padLeft(2, '0')}-${_ewayBillDate!.day.toString().padLeft(2, '0')}'
                : 'Tap to select date',
            Icons.calendar_today_outlined,
          ),
        ),

        // Valid Until — user picks
        GestureDetector(
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: _ewayValidUntil ?? DateTime.now().add(const Duration(days: 3)),
              firstDate: DateTime.now(),
              lastDate: DateTime.now().add(const Duration(days: 365)),
            );
            if (picked != null) setState(() => _ewayValidUntil = picked);
          },
          child: _readonlyField(
            'Valid Until',
            _ewayValidUntil != null
                ? '${_ewayValidUntil!.year}-${_ewayValidUntil!.month.toString().padLeft(2, '0')}-${_ewayValidUntil!.day.toString().padLeft(2, '0')}'
                : 'Tap to select date',
            Icons.event_available_outlined,
          ),
        ),
      ],
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Cargo Items
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _stepCargoItems() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel('Cargo Items'),
        const SizedBox(height: 8),

        // ── Suggestion hint banner ──────────────────────────────────
        if (_suggestedCargoItems.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: KTColors.fleetAccent.withValues(alpha: 0.07),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: KTColors.fleetAccent.withValues(alpha: 0.3)),
            ),
            child: Row(
              children: [
                const Icon(Icons.lightbulb_outline, size: 16, color: KTColors.fleetAccent),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Previous order data available — press Space in any empty field to auto-fill',
                    style: KTTextStyles.labelSmall.copyWith(color: KTColors.fleetAccent),
                  ),
                ),
              ],
            ),
          ),

        ..._items.asMap().entries.map((entry) => _cargoItemCard(entry.key)),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () => setState(() => _items.add(_CargoItem())),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Add Item'),
          style: OutlinedButton.styleFrom(
            foregroundColor: KTColors.fleetAccent,
            side: const BorderSide(color: KTColors.fleetAccent),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
        ),
      ],
    );
  }

  Widget _cargoItemCard(int index) {
    final item = _items[index];
    final sugg = index < _suggestedCargoItems.length
        ? _suggestedCargoItems[index]
        : <String, dynamic>{};

    // Returns non-empty suggestion string for a key, or null
    String? s(String key) {
      final v = sugg[key]?.toString().trim();
      return (v != null && v.isNotEmpty) ? v : null;
    }

    // If user types a single space and there's a suggestion, auto-fill the controller
    void spaceToFill(TextEditingController ctrl, String? suggestion) {
      if (ctrl.text == ' ' && suggestion != null) {
        ctrl.text = suggestion;
        ctrl.selection =
            TextSelection.fromPosition(TextPosition(offset: suggestion.length));
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: KTColors.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Item ${index + 1}',
                  style: KTTextStyles.label.copyWith(
                      color: KTColors.fleetAccent, fontWeight: FontWeight.w600)),
              if (_items.length > 1)
                IconButton(
                  icon: const Icon(Icons.delete_outline, color: KTColors.danger, size: 20),
                  onPressed: () => setState(() {
                    _items[index].dispose();
                    _items.removeAt(index);
                  }),
                  constraints: const BoxConstraints(),
                  padding: EdgeInsets.zero,
                ),
            ],
          ),
          const SizedBox(height: 8),
          _textField('Description', item.descriptionCtrl,
              hint: s('description'),
              onChanged: (_) => spaceToFill(item.descriptionCtrl, s('description'))),
          Row(children: [
            Expanded(
              child: _textField('HSN Code', item.hsnCtrl,
                  hint: s('hsn_code'),
                  onChanged: (_) => spaceToFill(item.hsnCtrl, s('hsn_code'))),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _textField('No. of Packages', item.packagesCtrl,
                  keyboard: TextInputType.number,
                  hint: s('packages'),
                  onChanged: (_) => spaceToFill(item.packagesCtrl, s('packages'))),
            ),
          ]),
          Row(children: [
            Expanded(
              child: _textField('Actual Weight (kg)', item.actualWeightCtrl,
                  keyboard: TextInputType.number,
                  hint: s('actual_weight'),
                  onChanged: (_) => spaceToFill(item.actualWeightCtrl, s('actual_weight'))),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _textField('Charged Weight (kg)', item.chargedWeightCtrl,
                  keyboard: TextInputType.number,
                  hint: s('charged_weight'),
                  onChanged: (_) => spaceToFill(item.chargedWeightCtrl, s('charged_weight'))),
            ),
          ]),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Charges & Pricing
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _stepCharges() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel('Payment & GST'),
        const SizedBox(height: 8),
        _dropdown('Payment Mode', _paymentMode, _paymentModes,
            (v) => setState(() => _paymentMode = v!)),
        _dropdown('GST Rate (%)', _gstRate, _gstRates,
            (v) => setState(() => _gstRate = v!)),
        const SizedBox(height: 16),

        _sectionLabel('Charges'),
        const SizedBox(height: 8),
        _textField('Freight Amount (₹) *', _freightCtrl,
            keyboard: TextInputType.number,
            onChanged: (_) => setState(() {}),
            validator: (v) => v == null || v.trim().isEmpty ? 'Required' : null),
        Row(children: [
          Expanded(
            child: _textField('Loading (₹)', _loadingChargesCtrl,
                keyboard: TextInputType.number, onChanged: (_) => setState(() {})),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _textField('Unloading (₹)', _unloadingChargesCtrl,
                keyboard: TextInputType.number, onChanged: (_) => setState(() {})),
          ),
        ]),
        Row(children: [
          Expanded(
            child: _textField('Detention (₹)', _detentionChargesCtrl,
                keyboard: TextInputType.number, onChanged: (_) => setState(() {})),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _textField('Other (₹)', _otherChargesCtrl,
                keyboard: TextInputType.number, onChanged: (_) => setState(() {})),
          ),
        ]),
        _textField('Declared Value (₹)', _declaredValueCtrl,
            keyboard: TextInputType.number),
        const SizedBox(height: 16),

        // Price summary
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: KTColors.fleetAccent.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: KTColors.fleetAccent.withValues(alpha: 0.3)),
          ),
          child: Column(
            children: [
              _summaryRow('Subtotal', '₹${_subtotal.toStringAsFixed(2)}'),
              if (_gstAmount > 0)
                _summaryRow('GST ($_gstRate%)', '₹${_gstAmount.toStringAsFixed(2)}'),
              const Divider(color: KTColors.borderColor),
              _summaryRow('Grand Total', '₹${_grandTotal.toStringAsFixed(2)}',
                  bold: true, color: KTColors.fleetAccent),
            ],
          ),
        ),
      ],
    );
  }

  Widget _summaryRow(String label, String value, {bool bold = false, Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: KTTextStyles.body.copyWith(
                  color: color ?? KTColors.textHeading,
                  fontWeight: bold ? FontWeight.w700 : FontWeight.normal)),
          Text(value,
              style: KTTextStyles.body.copyWith(
                  color: color ?? KTColors.textHeading,
                  fontWeight: bold ? FontWeight.w700 : FontWeight.w600,
                  fontSize: bold ? 18 : 14)),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Vehicle & Driver Assignment
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _stepAssignment() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [

        // ── Mode Toggle: Fleet Vehicle / Market Trip ──────────────────────
        Row(
          children: [
            Expanded(
              child: GestureDetector(
                onTap: () => setState(() => _isMarketTrip = false),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: !_isMarketTrip ? KTColors.fleetAccent : KTColors.surface,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(10),
                      bottomLeft: Radius.circular(10),
                    ),
                    border: Border.all(
                      color: !_isMarketTrip ? KTColors.fleetAccent : KTColors.borderColor,
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.local_shipping_outlined,
                          size: 16,
                          color: !_isMarketTrip ? Colors.white : KTColors.textMuted),
                      const SizedBox(width: 6),
                      Text('Fleet Vehicle',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: !_isMarketTrip ? Colors.white : KTColors.textMuted,
                          )),
                    ],
                  ),
                ),
              ),
            ),
            Expanded(
              child: GestureDetector(
                onTap: () => setState(() => _isMarketTrip = true),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: _isMarketTrip ? const Color(0xFFF97316) : KTColors.surface,
                    borderRadius: const BorderRadius.only(
                      topRight: Radius.circular(10),
                      bottomRight: Radius.circular(10),
                    ),
                    border: Border.all(
                      color: _isMarketTrip ? const Color(0xFFF97316) : KTColors.borderColor,
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.handshake_outlined,
                          size: 16,
                          color: _isMarketTrip ? Colors.white : KTColors.textMuted),
                      const SizedBox(width: 6),
                      Text('Market Trip',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: _isMarketTrip ? Colors.white : KTColors.textMuted,
                          )),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // ── FLEET VEHICLE MODE ────────────────────────────────────────────
        if (!_isMarketTrip) ...[
          // Auto-create trip toggle
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            decoration: BoxDecoration(
              color: KTColors.surface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: KTColors.borderColor),
            ),
            child: SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('Create Trip & Assign Driver',
                  style: KTTextStyles.body.copyWith(color: KTColors.textHeading)),
              subtitle: Text('Auto-creates a trip from this LR and assigns to selected driver',
                  style: KTTextStyles.bodySmall.copyWith(color: KTColors.textMuted)),
              value: _autoCreateTrip,
              activeThumbColor: KTColors.fleetAccent,
              onChanged: (v) => setState(() => _autoCreateTrip = v),
            ),
          ),
          const SizedBox(height: 16),

          if (_autoCreateTrip) ...[
            _sectionLabel('Vehicle'),
            const SizedBox(height: 8),
            DropdownButtonFormField<int>(
              initialValue: _selectedVehicleId,
              dropdownColor: KTColors.surface,
              style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
              hint: Text('Select Vehicle',
                  style: KTTextStyles.body.copyWith(color: KTColors.textMuted)),
              decoration: _dropDecor('Vehicle *'),
              isExpanded: true,
              items: _vehicles.map((v) {
                final reg = v['registration_number'] ?? v['reg_number'] ?? '#${v['id']}';
                final make = v['make'] ?? '';
                final cap = v['capacity_tons'];
                return DropdownMenuItem<int>(
                  value: v['id'] as int?,
                  child: Text(
                      '$reg${make.isNotEmpty ? ' ($make)' : ''}${cap != null ? ' · ${cap}T' : ''}'),
                );
              }).toList(),
              onChanged: (vehicleId) {
                setState(() {
                  _selectedVehicleId = vehicleId;
                  if (vehicleId != null) {
                    final veh = _vehicles.firstWhere(
                      (v) => v['id'] == vehicleId, orElse: () => {});
                    final defDriverId = veh['default_driver_id'];
                    if (defDriverId != null) {
                      final dId = defDriverId is int ? defDriverId : int.tryParse(defDriverId.toString());
                      if (dId != null && _drivers.any((d) => d['id'] == dId)) {
                        _selectedDriverId = dId;
                        _driverDocs = [];
                        Future.microtask(() => _loadDriverDocs(dId));
                      }
                    }
                  }
                });
              },
              validator: _autoCreateTrip ? (v) => v == null ? 'Select a vehicle' : null : null,
            ),
            const SizedBox(height: 12),

            _sectionLabel('Driver'),
            const SizedBox(height: 8),
            DropdownButtonFormField<int>(
              initialValue: _selectedDriverId,
              dropdownColor: KTColors.surface,
              style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
              hint: Text('Select Driver',
                  style: KTTextStyles.body.copyWith(color: KTColors.textMuted)),
              decoration: _dropDecor('Driver *'),
              isExpanded: true,
              items: _drivers.map((d) {
                final name = '${d['first_name'] ?? ''} ${d['last_name'] ?? ''}'.trim();
                final phone = d['phone'] ?? '';
                final isAssigned = _vehicles.any((v) {
                  final defId = v['default_driver_id'];
                  return defId != null &&
                      (defId is int ? defId : int.tryParse(defId.toString())) == d['id'];
                });
                return DropdownMenuItem<int>(
                  value: d['id'] as int?,
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${name.isNotEmpty ? name : 'Driver #${d['id']}'}${phone.isNotEmpty ? ' · $phone' : ''}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (isAssigned) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                          decoration: BoxDecoration(
                            color: KTColors.success.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text('Assigned',
                              style: TextStyle(
                                  fontSize: 9, color: KTColors.success, fontWeight: FontWeight.w600)),
                        ),
                      ],
                    ],
                  ),
                );
              }).toList(),
              onChanged: (driverId) {
                setState(() {
                  _selectedDriverId = driverId;
                  _driverDocs = [];
                  if (driverId != null && _selectedVehicleId == null) {
                    final veh = _vehicles.firstWhere((v) {
                      final defId = v['default_driver_id'];
                      if (defId == null) return false;
                      final dId = defId is int ? defId : int.tryParse(defId.toString());
                      return dId == driverId;
                    }, orElse: () => {});
                    if (veh.isNotEmpty) {
                      final vId = veh['id'];
                      _selectedVehicleId = vId is int ? vId : int.tryParse(vId.toString());
                    }
                  }
                });
                if (driverId != null) _loadDriverDocs(driverId);
              },
              validator: _autoCreateTrip ? (v) => v == null ? 'Select a driver' : null : null,
            ),
            if (_selectedDriverId != null && _selectedVehicleId != null) (() {
              final veh = _vehicles.firstWhere((v) => v['id'] == _selectedVehicleId, orElse: () => {});
              final defId = veh['default_driver_id'];
              final dId = defId != null ? (defId is int ? defId : int.tryParse(defId.toString())) : null;
              if (dId == _selectedDriverId) {
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(
                    children: [
                      const Icon(Icons.link_rounded, size: 13, color: KTColors.success),
                      const SizedBox(width: 5),
                      Text('Assigned by fleet manager',
                          style: TextStyle(
                              fontSize: 11, color: KTColors.success, fontWeight: FontWeight.w500)),
                    ],
                  ),
                );
              }
              return const SizedBox.shrink();
            })(),

            // ── Driver Documents Section ─────────────────────────────────
            if (_selectedDriverId != null) ...[
              const SizedBox(height: 16),
              _sectionLabel('Driver Documents'),
              const SizedBox(height: 8),
              if (_loadingDriverDocs)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Center(
                      child: SizedBox(
                          width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
                )
              else if (_driverDocs.isEmpty)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: KTColors.surface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: KTColors.borderColor),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.folder_off_outlined, size: 16, color: KTColors.textMuted),
                      const SizedBox(width: 8),
                      Text('No documents uploaded for this driver',
                          style: KTTextStyles.bodySmall.copyWith(color: KTColors.textMuted)),
                    ],
                  ),
                )
              else
                Column(
                  children: _driverDocs.map((doc) {
                    final docName = doc['doc_name'] as String? ??
                        (doc['doc_type'] as String? ?? 'Document')
                            .replaceAll('_', ' ')
                            .toUpperCase();
                    final docNumber = doc['doc_number'] as String?;
                    final status = doc['status'] as String? ?? 'pending';
                    final hasFile = (doc['file_url'] as String? ?? '').isNotEmpty;
                    final expiry = doc['expiry_date'] as String?;
                    final isExpired = status == 'expired';
                    final isVerified = status == 'verified' || status == 'valid';
                    final isUploaded = !isVerified && !isExpired && hasFile;
                    final statusColor = isExpired
                        ? KTColors.danger
                        : isVerified
                            ? KTColors.success
                            : isUploaded
                                ? KTColors.info
                                : const Color(0xFFD97706);
                    final statusLabel =
                        isExpired ? 'Expired' : isVerified ? 'Valid' : isUploaded ? 'Uploaded' : 'Pending';
                    return Container(
                      margin: const EdgeInsets.only(bottom: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: KTColors.surface,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: KTColors.borderColor),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            isExpired
                                ? Icons.warning_amber_rounded
                                : Icons.description_outlined,
                            size: 18,
                            color: statusColor,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(docName,
                                    style: KTTextStyles.body.copyWith(
                                        fontWeight: FontWeight.w600,
                                        color: KTColors.textHeading,
                                        fontSize: 13)),
                                if (docNumber != null && docNumber.isNotEmpty)
                                  Text(docNumber,
                                      style: KTTextStyles.bodySmall
                                          .copyWith(color: KTColors.textMuted)),
                                if (expiry != null)
                                  Text('Expiry: $expiry',
                                      style: KTTextStyles.bodySmall.copyWith(
                                          color: isExpired
                                              ? KTColors.danger
                                              : KTColors.textMuted)),
                              ],
                            ),
                          ),
                          Container(
                            padding:
                                const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: statusColor.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(statusLabel,
                                style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: statusColor)),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
            ],
          ] else ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: KTColors.info.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: KTColors.info.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: KTColors.info, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'LR will be saved as draft. You can assign a vehicle and driver later via the website.',
                      style: KTTextStyles.body.copyWith(color: KTColors.info, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],

        // ── MARKET TRIP MODE ──────────────────────────────────────────────
        if (_isMarketTrip) ...[
          // Info banner
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF7ED),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xFFFDBA74)),
            ),
            child: Row(
              children: [
                const Icon(Icons.info_outline, size: 16, color: Color(0xFFF97316)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Enter details for the hired/leased vehicle — vehicle and driver are independent.',
                    style: KTTextStyles.bodySmall.copyWith(color: const Color(0xFFEA580C)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // ─── VEHICLE DETAILS ───────────────────────────────────────────
          _sectionLabel('Vehicle Details'),
          const SizedBox(height: 10),

          // RC Upload
          _OcrUploadButton(
            label: 'RC (Registration Certificate)',
            isLoading: _mktRcLoading,
            isUploaded: _mktRcFileUrl.isNotEmpty,
            onTap: _mktRcLoading ? null : _pickAndOcrRc,
          ),
          const SizedBox(height: 12),

          // Auto-filled from RC
          _mktSectionHeader('Auto-filled from RC', Icons.auto_awesome_outlined, const Color(0xFF2563EB)),
          const SizedBox(height: 8),
          TextFormField(
            controller: _mktRegNoCtrl,
            style: KTTextStyles.body.copyWith(color: KTColors.textHeading, fontFamily: 'monospace'),
            textCapitalization: TextCapitalization.characters,
            decoration: _fieldDecor('Registration Number', hint: 'e.g. TN01AB1234'),
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: _mktOwnerNameCtrl,
            style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
            decoration: _fieldDecor('Owner Name', hint: 'Auto-filled from RC'),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: _mktDateRegnCtrl,
                  style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
                  decoration: _fieldDecor('Date of Regn.', hint: 'DD/MM/YYYY'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  controller: _mktRegnValidityCtrl,
                  style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
                  decoration: _fieldDecor('Regn. Validity', hint: 'DD/MM/YYYY'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: _mktChassisNoCtrl,
                  style: KTTextStyles.body.copyWith(
                      color: KTColors.textHeading, fontSize: 12, fontFamily: 'monospace'),
                  decoration: _fieldDecor('Chassis Number', hint: 'Auto-filled from RC'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  controller: _mktEngineNoCtrl,
                  style: KTTextStyles.body.copyWith(
                      color: KTColors.textHeading, fontSize: 12, fontFamily: 'monospace'),
                  decoration: _fieldDecor('Engine Number', hint: 'Auto-filled from RC'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Manual entry for vehicle
          _mktSectionHeader('Enter Manually', Icons.edit_outlined, KTColors.textMuted),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _mktVehicleType.isEmpty ? null : _mktVehicleType,
                  dropdownColor: KTColors.surface,
                  style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
                  hint: Text('Select type',
                      style: KTTextStyles.body.copyWith(color: KTColors.textMuted, fontSize: 13)),
                  decoration: _fieldDecor('Vehicle Type'),
                  isExpanded: true,
                  items: ['Truck', 'Trailer', 'Tanker', 'Container', 'LCV', 'HCV', 'Tipper', 'Other']
                      .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                      .toList(),
                  onChanged: (v) => setState(() => _mktVehicleType = v ?? ''),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _mktFuelType.isEmpty ? null : _mktFuelType,
                  dropdownColor: KTColors.surface,
                  style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
                  hint: Text('Select fuel',
                      style: KTTextStyles.body.copyWith(color: KTColors.textMuted, fontSize: 13)),
                  decoration: _fieldDecor('Fuel Type'),
                  isExpanded: true,
                  items: ['Diesel', 'Petrol', 'CNG', 'Electric', 'LPG']
                      .map((f) => DropdownMenuItem(value: f, child: Text(f)))
                      .toList(),
                  onChanged: (v) => setState(() => _mktFuelType = v ?? ''),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: _mktMakeCtrl,
                  style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
                  decoration: _fieldDecor('Manufacturer', hint: 'e.g. TATA'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  controller: _mktModelCtrl,
                  style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
                  decoration: _fieldDecor('Model', hint: 'e.g. Prima 4028'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: _mktYearCtrl,
                  keyboardType: TextInputType.number,
                  style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
                  decoration: _fieldDecor('Year of Manufacture', hint: 'e.g. 2019'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  controller: _mktOwnerPhoneCtrl,
                  keyboardType: TextInputType.phone,
                  style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
                  decoration: _fieldDecor('Owner Phone', hint: 'Owner contact'),
                ),
              ),
            ],
          ),

          const SizedBox(height: 20),
          const Divider(height: 1),
          const SizedBox(height: 20),

          // ─── DRIVER DETAILS ────────────────────────────────────────────
          _sectionLabel('Driver Details'),
          const SizedBox(height: 10),

          // DL Upload
          _OcrUploadButton(
            label: 'Driving Licence (DL)',
            isLoading: _mktDlLoading,
            isUploaded: _mktDlFileUrl.isNotEmpty,
            onTap: _mktDlLoading ? null : _pickAndOcrDl,
          ),
          const SizedBox(height: 12),

          // Auto-filled from DL
          _mktSectionHeader('Auto-filled from DL', Icons.auto_awesome_outlined, const Color(0xFF2563EB)),
          const SizedBox(height: 8),
          TextFormField(
            controller: _mktDlNoCtrl,
            style: KTTextStyles.body.copyWith(color: KTColors.textHeading, fontFamily: 'monospace'),
            textCapitalization: TextCapitalization.characters,
            decoration: _fieldDecor('Licence Number', hint: 'Auto-filled from DL'),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: _mktDlIssueDateCtrl,
                  style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
                  decoration: _fieldDecor('DL Issue Date', hint: 'DD/MM/YYYY'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  controller: _mktDlValidUntilCtrl,
                  style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
                  decoration: _fieldDecor('DL Valid Until', hint: 'DD/MM/YYYY'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Manual entry for driver
          _mktSectionHeader('Enter Manually', Icons.edit_outlined, KTColors.textMuted),
          const SizedBox(height: 8),
          TextFormField(
            controller: _mktDriverNameCtrl,
            style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
            decoration: _fieldDecor('Driver Name *', hint: 'Full name'),
            validator: _isMarketTrip
                ? (v) => (v == null || v.trim().isEmpty) ? 'Driver name is required' : null
                : null,
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: _mktDriverPhoneCtrl,
                  keyboardType: TextInputType.phone,
                  style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
                  decoration: _fieldDecor('Phone', hint: 'Primary number'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  controller: _mktDriverAltPhoneCtrl,
                  keyboardType: TextInputType.phone,
                  style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
                  decoration: _fieldDecor('Alternate Phone', hint: 'Alt contact'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: _mktDriverAddressCtrl,
            style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
            maxLines: 2,
            decoration: _fieldDecor('Address', hint: 'Permanent address'),
          ),
        ],
      ],
    );
  }

  /// Small header chip used inside Market Trip sections.
  Widget _mktSectionHeader(String label, IconData icon, Color color) {
    return Row(
      children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 5),
        Text(label,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color,
                letterSpacing: 0.3)),
      ],
    );
  }

  /// Input decoration used for market trip text fields.
  InputDecoration _fieldDecor(String label, {String? hint}) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      labelStyle: KTTextStyles.bodySmall.copyWith(color: KTColors.textMuted),
      hintStyle: KTTextStyles.bodySmall.copyWith(color: KTColors.textMuted.withOpacity(0.6)),
      filled: true,
      fillColor: KTColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: KTColors.borderColor),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: KTColors.borderColor),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: KTColors.fleetAccent, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: KTColors.danger),
      ),
    );
  }



  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Insurance & Notes
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _stepNotes() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel('Insurance (Optional)'),
        const SizedBox(height: 8),
        _textField('Insurance Company', _insuranceCompanyCtrl),
        _textField('Policy Number', _insurancePolicyCtrl),
        _textField('Insured Amount (₹)', _insuranceAmountCtrl,
            keyboard: TextInputType.number),
        const SizedBox(height: 16),
        _sectionLabel('Notes (Optional)'),
        const SizedBox(height: 8),
        _textField('Remarks', _remarksCtrl, maxLines: 3),
        _textField('Special Instructions', _specialInstructionsCtrl, maxLines: 3),
      ],
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Shared widgets
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _sectionLabel(String text) {
    return Text(text,
        style: KTTextStyles.h3.copyWith(color: KTColors.fleetAccent, decoration: TextDecoration.none));
  }

  Widget _readonlyField(String label, String value, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: KTColors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: KTColors.borderColor),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: KTTextStyles.label.copyWith(color: KTColors.textMuted, fontSize: 11)),
                const SizedBox(height: 2),
                Text(value, style: KTTextStyles.body.copyWith(color: KTColors.textHeading, fontWeight: FontWeight.w600)),
              ],
            ),
            Icon(icon, size: 18, color: KTColors.fleetAccent),
          ],
        ),
      ),
    );
  }

  Widget _textField(String label, TextEditingController ctrl,
      {TextInputType keyboard = TextInputType.text,
      String? hint,
      TextCapitalization capitalization = TextCapitalization.none,
      String? Function(String?)? validator,
      int maxLines = 1,
      ValueChanged<String>? onChanged}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: ctrl,
        keyboardType: keyboard,
        textCapitalization: capitalization,
        maxLines: maxLines,
        validator: validator,
        onChanged: onChanged,
        style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          hintStyle: KTTextStyles.label.copyWith(color: KTColors.textMuted, fontSize: 12),
          labelStyle: KTTextStyles.label.copyWith(color: KTColors.textMuted),
          filled: true,
          fillColor: KTColors.surface,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: KTColors.borderColor),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: KTColors.borderColor),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: KTColors.fleetAccent),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: KTColors.danger),
          ),
        ),
      ),
    );
  }

  Widget _dropdown(String label, String current, List<String> options,
      ValueChanged<String?> onChanged) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: DropdownButtonFormField<String>(
        initialValue: current,
        dropdownColor: KTColors.surface,
        style: KTTextStyles.body.copyWith(color: KTColors.textHeading),
        decoration: _dropDecor(label),
        items: options
            .map((o) => DropdownMenuItem(
                value: o,
                child: Text(o.replaceAll('_', ' ').toUpperCase())))
            .toList(),
        onChanged: onChanged,
      ),
    );
  }

  InputDecoration _dropDecor(String label) {
    return InputDecoration(
      labelText: label,
      labelStyle: KTTextStyles.label.copyWith(color: KTColors.textMuted),
      filled: true,
      fillColor: KTColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: KTColors.borderColor),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: KTColors.borderColor),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: KTColors.fleetAccent),
      ),
    );
  }
}

// ── OCR Upload Button widget ──────────────────────────────────────────────────
class _OcrUploadButton extends StatelessWidget {
  const _OcrUploadButton({
    required this.label,
    required this.isLoading,
    required this.isUploaded,
    this.onTap,
  });

  final String label;
  final bool isLoading;
  final bool isUploaded;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final borderColor = isUploaded
        ? KTColors.success
        : isLoading
            ? KTColors.fleetAccent
            : const Color(0xFFD1D5DB);
    final bgColor = isUploaded
        ? KTColors.success.withOpacity(0.05)
        : isLoading
            ? KTColors.fleetAccent.withOpacity(0.04)
            : const Color(0xFFF9FAFB);

    return GestureDetector(
      onTap: isLoading ? null : onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: borderColor,
            width: 1.5,
          ),
          boxShadow: [
            if (!isUploaded && !isLoading)
              BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 4,
                  offset: const Offset(0, 1)),
          ],
        ),
        child: Row(
          children: [
            if (isLoading)
              const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: KTColors.fleetAccent))
            else if (isUploaded)
              const Icon(Icons.check_circle_rounded, size: 20, color: KTColors.success)
            else
              const Icon(Icons.upload_file_outlined, size: 20, color: Color(0xFF9CA3AF)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    isLoading
                        ? 'Extracting details…'
                        : isUploaded
                            ? '$label uploaded ✓'
                            : 'Upload $label for auto-fill',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isUploaded
                          ? KTColors.success
                          : isLoading
                              ? KTColors.fleetAccent
                              : const Color(0xFF374151),
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    isLoading ? 'Please wait…' : 'JPG, PNG or PDF',
                    style: const TextStyle(fontSize: 11, color: Color(0xFF9CA3AF)),
                  ),
                ],
              ),
            ),
            if (!isLoading)
              Icon(
                isUploaded ? Icons.refresh_outlined : Icons.arrow_forward_ios_rounded,
                size: 14,
                color: isUploaded ? KTColors.success : const Color(0xFFD1D5DB),
              ),
          ],
        ),
      ),
    );
  }
}

// ── Cargo item model ──────────────────────────────────────────────────────────
class _CargoItem {
  final descriptionCtrl = TextEditingController();
  final hsnCtrl = TextEditingController();
  final packagesCtrl = TextEditingController();
  final quantityCtrl = TextEditingController();
  final actualWeightCtrl = TextEditingController();
  final chargedWeightCtrl = TextEditingController();
  final rateCtrl = TextEditingController();
  String packageType = 'boxes';
  String unit = 'kgs';

  void dispose() {
    descriptionCtrl.dispose();
    hsnCtrl.dispose();
    packagesCtrl.dispose();
    quantityCtrl.dispose();
    actualWeightCtrl.dispose();
    chargedWeightCtrl.dispose();
    rateCtrl.dispose();
  }
}

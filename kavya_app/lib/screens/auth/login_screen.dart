import 'dart:async';
import 'dart:math';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/kt_colors.dart';
import '../../providers/auth_provider.dart';

// ═══════════════════════════════════════════════════════════════════
//  LOGIN SCREEN — glossy glass card + ambient glow + vehicle anim
// ═══════════════════════════════════════════════════════════════════

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen>
    with TickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  // ── OTP step state ─────────────────────────────────────────────
  final List<TextEditingController> _otpCtrl =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _otpFocus = List.generate(6, (_) => FocusNode());
  Timer? _expiryTimer;
  Timer? _resendTimer;
  int _otpExpirySeconds = 300;   // 5 min
  int _resendCooldownSeconds = 0; // 30 s after send
  String _storedIdentifier = '';
  String _storedPassword = '';
  int _resendCount = 0;           // track how many resends (max 3 per 10 min)

  static const _bg1 = Color(0xFF050D1F);
  static const _bg2 = Color(0xFF0A1535);
  static const _bg3 = Color(0xFF071030);
  static const _orange = Color(0xFF60A5FA);
  static const _navy = Color(0xFF0D1F3C);

  late final AnimationController _entranceCtrl;
  late final AnimationController _truckCtrl;
  late final AnimationController _roadCtrl;
  late final AnimationController _glowCtrl;
  late final AnimationController _cardShimmerCtrl;

  late final Animation<double> _fadeIn;
  late final Animation<Offset> _slideUp;
  late final Animation<double> _truckFloat;
  late final Animation<double> _glowPulse;

  @override
  void initState() {
    super.initState();
    _entranceCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1100));
    _fadeIn =
        CurvedAnimation(parent: _entranceCtrl, curve: Curves.easeOutCubic);
    _slideUp = Tween<Offset>(begin: const Offset(0, 0.07), end: Offset.zero)
        .animate(_fadeIn);

    _truckCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 2800));
    _truckFloat = Tween<double>(begin: -5.0, end: 5.0).animate(
        CurvedAnimation(parent: _truckCtrl, curve: Curves.easeInOut));
    _truckCtrl.repeat(reverse: true);

    _roadCtrl =
        AnimationController(vsync: this, duration: const Duration(seconds: 3))
          ..repeat();

    _glowCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 2200))
      ..repeat(reverse: true);
    _glowPulse = Tween<double>(begin: 0.0, end: 1.0)
        .animate(CurvedAnimation(parent: _glowCtrl, curve: Curves.easeInOut));

    _cardShimmerCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 3500))
      ..repeat();

    _entranceCtrl.forward();
  }

  @override
  void dispose() {
    _expiryTimer?.cancel();
    _resendTimer?.cancel();
    for (final c in _otpCtrl) c.dispose();
    for (final f in _otpFocus) f.dispose();
    _entranceCtrl.dispose();
    _truckCtrl.dispose();
    _roadCtrl.dispose();
    _glowCtrl.dispose();
    _cardShimmerCtrl.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  // ── OTP HELPERS ────────────────────────────────────────────────
  void _startOtpTimers() {
    _expiryTimer?.cancel();
    _resendTimer?.cancel();
    setState(() {
      _otpExpirySeconds = 300;   // 5 min
      _resendCooldownSeconds = 30;
    });
    // Expiry countdown
    _expiryTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        if (_otpExpirySeconds > 0) _otpExpirySeconds--;
      });
    });
    // Resend cooldown
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        if (_resendCooldownSeconds > 0) _resendCooldownSeconds--;
      });
    });
  }

  String _otpValue() => _otpCtrl.map((c) => c.text).join();

  // ── AUTH LOGIC ─────────────────────────────────────────────────
  void _handleLogin() async {
    if (_formKey.currentState!.validate()) {
      final identifier = _emailController.text.trim();
      final password = _passwordController.text;
      _storedIdentifier = identifier;
      _storedPassword = password;
      _resendCount = 0;
      await ref.read(authProvider.notifier).login(identifier, password);
      if (mounted) {
        final st = ref.read(authProvider);
        if (st.error != null) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(st.error!),
            backgroundColor: KTColors.danger,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            margin: const EdgeInsets.all(16),
            duration: const Duration(seconds: 3),
          ));
        } else if (st.otpRequired) {
          _startOtpTimers();
        }
      }
    }
  }

  void _handleOtpSubmit() async {
    final otp = _otpValue();
    if (otp.length != 6) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Enter all 6 digits'),
        backgroundColor: Color(0xFFEF4444),
        behavior: SnackBarBehavior.floating,
        margin: EdgeInsets.all(16),
        duration: Duration(seconds: 2),
      ));
      return;
    }
    await ref.read(authProvider.notifier).confirmOtp(otp);
    if (mounted) {
      final st = ref.read(authProvider);
      if (st.error != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(st.error!),
          backgroundColor: KTColors.danger,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          margin: const EdgeInsets.all(16),
          duration: const Duration(seconds: 3),
        ));
        // Clear OTP boxes on failure
        for (final c in _otpCtrl) c.clear();
        _otpFocus[0].requestFocus();
      }
    }
  }

  void _handleResend() async {
    if (_resendCooldownSeconds > 0) return;
    if (_resendCount >= 3) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Maximum 3 OTPs per 10 minutes. Please wait before requesting again.'),
        backgroundColor: Color(0xFFF59E0B),
        behavior: SnackBarBehavior.floating,
        margin: EdgeInsets.all(16),
        duration: Duration(seconds: 4),
      ));
      return;
    }
    for (final c in _otpCtrl) c.clear();
    await ref.read(authProvider.notifier).resendOtp(
      _storedIdentifier, _storedPassword,
    );
    if (mounted) {
      final st = ref.read(authProvider);
      if (st.error != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(st.error!),
          backgroundColor: KTColors.danger,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          margin: const EdgeInsets.all(16),
          duration: const Duration(seconds: 4),
        ));
      } else {
        _resendCount++;
        _startOtpTimers();
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('New OTP sent to your registered number'),
          backgroundColor: Color(0xFF1D9E75),
          behavior: SnackBarBehavior.floating,
          margin: EdgeInsets.all(16),
          duration: Duration(seconds: 2),
        ));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final sz = MediaQuery.of(context).size;
    final pad = MediaQuery.of(context).padding;

    return Scaffold(
      backgroundColor: _bg1,
      resizeToAvoidBottomInset: true,
      body: Stack(
        children: [
          // ── DEEP GRADIENT BACKGROUND ──────────────────────────
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [_bg1, _bg2, _bg3],
                  stops: [0.0, 0.5, 1.0],
                ),
              ),
            ),
          ),

          // ── ROAD + PARTICLES ──────────────────────────────────
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _roadCtrl,
              builder: (_, __) =>
                  CustomPaint(painter: _RoadPainter(_roadCtrl.value)),
            ),
          ),

          // ── AMBIENT GLOW BLOBS ─────────────────────────────────
          AnimatedBuilder(
            animation: _glowPulse,
            builder: (_, __) => Stack(children: [
              Positioned(
                top: -60,
                left: -60,
                child: _glowBlob(
                  200 + _glowPulse.value * 30,
                  Color(0xFF1D4ED8)
                      .withValues(alpha: 0.22 + _glowPulse.value * 0.06),
                ),
              ),
              Positioned(
                top: 20,
                right: -80,
                child: _glowBlob(
                  160 + _glowPulse.value * 20,
                  Color(0xFF1E3A8A)
                      .withValues(alpha: 0.18 + _glowPulse.value * 0.05),
                ),
              ),
              Positioned(
                bottom: sz.height * 0.28,
                left: sz.width * 0.15,
                child: _glowBlob(
                  220 + _glowPulse.value * 25,
                  _orange
                      .withValues(alpha: 0.06 + _glowPulse.value * 0.04),
                ),
              ),
              Positioned(
                bottom: -40,
                right: -40,
                child: _glowBlob(
                  170,
                  const Color(0xFF1E40AF).withValues(alpha: 0.18),
                ),
              ),
            ]),
          ),

          // ── MAIN CONTENT ──────────────────────────────────────
          SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.zero,
              child: ConstrainedBox(
                constraints: BoxConstraints(
                    minHeight: sz.height - pad.top - pad.bottom),
                child: IntrinsicHeight(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 22),
                    child: Column(
                      children: [
                        SizedBox(height: sz.height * 0.055),
                        _buildTruckLogo(),
                        SizedBox(height: sz.height * 0.035),
                        SlideTransition(
                          position: _slideUp,
                          child: FadeTransition(
                            opacity: _fadeIn,
                            child: _buildGlossyCard(authState),
                          ),
                        ),
                        const Spacer(),
                        FadeTransition(
                            opacity: _fadeIn, child: _buildFooter()),
                        const SizedBox(height: 20),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── HELPERS ────────────────────────────────────────────────────

  Widget _glowBlob(double size, Color color) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(colors: [color, Colors.transparent]),
      ),
    );
  }

  // ── TRUCK LOGO ─────────────────────────────────────────────────

  Widget _buildTruckLogo() {
    return AnimatedBuilder(
      animation: _truckFloat,
      builder: (_, child) => Transform.translate(
          offset: Offset(0, _truckFloat.value), child: child),
      child: Column(
        children: [
          // Orange glow under truck
          AnimatedBuilder(
            animation: _glowPulse,
            builder: (_, __) => Container(
              width: 130,
              height: 24,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(60),
                boxShadow: [
                  BoxShadow(
                    color: _orange
                        .withValues(alpha: 0.18 + _glowPulse.value * 0.10),
                    blurRadius: 30,
                    spreadRadius: 5,
                  ),
                ],
              ),
            ),
          ),
          Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: _orange.withValues(alpha: 0.12),
                  blurRadius: 50,
                  spreadRadius: 4,
                ),
              ],
            ),
            child: Image.asset(
              'assets/truck-hero.png',
              width: 155,
              height: 105,
              fit: BoxFit.contain,
            ),
          ),
          const SizedBox(height: 16),
          // Gradient text
          ShaderMask(
            shaderCallback: (r) => const LinearGradient(
              colors: [Colors.white, Color(0xFFB0C4DE)],
            ).createShader(r),
            child: const Text(
              'Kavya Transports',
              style: TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
              ),
            ),
          ),
          const SizedBox(height: 6),
          // Animated underline
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: 1),
            duration: const Duration(milliseconds: 1500),
            curve: Curves.easeOutCubic,
            builder: (_, v, __) => Container(
              width: 36 * v,
              height: 2,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [
                  _orange.withValues(alpha: 0),
                  _orange,
                  _orange.withValues(alpha: 0),
                ]),
                borderRadius: BorderRadius.circular(1),
              ),
            ),
          ),
          const SizedBox(height: 7),
          Text(
            'FLEET ERP',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.32),
              fontSize: 9.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 2.8,
            ),
          ),
        ],
      ),
    );
  }

  // ── GLOSSY CARD ────────────────────────────────────────────────

  Widget _buildGlossyCard(AuthState authState) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(28),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Colors.white.withValues(alpha: 0.11),
                Colors.white.withValues(alpha: 0.04),
                Colors.white.withValues(alpha: 0.09),
              ],
              stops: const [0.0, 0.5, 1.0],
            ),
            border: Border.all(
              width: 1.2,
              color: Colors.white.withValues(alpha: 0.14),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 40,
                spreadRadius: -5,
                offset: const Offset(0, 15),
              ),
              BoxShadow(
                color: _orange.withValues(alpha: 0.06),
                blurRadius: 60,
              ),
            ],
          ),
          child: Stack(
            children: [
              // Diagonal shimmer sweep
              Positioned.fill(
                child: AnimatedBuilder(
                  animation: _cardShimmerCtrl,
                  builder: (_, __) => ClipRRect(
                    borderRadius: BorderRadius.circular(28),
                    child: CustomPaint(
                      painter: _ShimmerPainter(_cardShimmerCtrl.value),
                    ),
                  ),
                ),
              ),
              // Top-edge highlight stripe (glossy glass top reflection)
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: Container(
                  height: 1,
                  decoration: BoxDecoration(
                    borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(28)),
                    gradient: LinearGradient(
                      colors: [
                        Colors.white.withValues(alpha: 0),
                        Colors.white.withValues(alpha: 0.35),
                        Colors.white.withValues(alpha: 0),
                      ],
                    ),
                  ),
                ),
              ),
              // Content — OTP card or login form
              if (authState.otpRequired)
                _buildOtpContent(authState)
              else
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 30, 24, 28),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Title row
                      Row(
                        children: [
                          Container(
                            width: 4,
                            height: 22,
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [_orange, Color(0xFF2563EB)],
                              ),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                          const SizedBox(width: 10),
                          const Text(
                            'Welcome back',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.2,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Padding(
                        padding: const EdgeInsets.only(left: 14),
                        child: Text(
                          'Sign in to your fleet account',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.38),
                            fontSize: 11.5,
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),

                      // Identifier (email / employee ID / phone)
                      _GlossyInput(
                        controller: _emailController,
                        hint: 'Email, Employee ID or Phone',
                        keyboardType: TextInputType.text,
                        leadingIcon: Icons.person_outline_rounded,
                        autofillHints: const [AutofillHints.username],
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) {
                            return 'Enter your email, employee ID or phone';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),

                      // Password
                      _GlossyInput(
                        controller: _passwordController,
                        hint: 'Password',
                        keyboardType: TextInputType.visiblePassword,
                        leadingIcon: Icons.lock_outline_rounded,
                        obscure: _obscurePassword,
                        trailingWidget: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            GestureDetector(
                              onTap: () => setState(() =>
                                  _obscurePassword = !_obscurePassword),
                              child: Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: Icon(
                                  _obscurePassword
                                      ? Icons.visibility_off_outlined
                                      : Icons.visibility_outlined,
                                  color:
                                      Colors.white.withValues(alpha: 0.35),
                                  size: 18,
                                ),
                              ),
                            ),
                            GestureDetector(
                              onTap: _showForgotPassword,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 9, vertical: 4),
                                decoration: BoxDecoration(
                                  gradient: const LinearGradient(
                                    colors: [
                                      Color(0xFF60A5FA),
                                      Color(0xFF2563EB)
                                    ],
                                  ),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  'Forgot',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        validator: (v) {
                          if (v == null || v.isEmpty) return 'Enter password';
                          return null;
                        },
                      ),
                      const SizedBox(height: 26),

                      // Login button
                      _buildLoginButton(authState),

                      const SizedBox(height: 20),
                      // Divider
                      Row(children: [
                        Expanded(child: Divider(color: Colors.white.withValues(alpha: 0.12))),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Text(
                            'OR',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.25),
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Expanded(child: Divider(color: Colors.white.withValues(alpha: 0.12))),
                      ]),
                      const SizedBox(height: 16),

                      // Hired driver button
                      GestureDetector(
                        onTap: () => context.go('/market-driver-login'),
                        child: Container(
                          width: double.infinity,
                          height: 48,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.18),
                            ),
                            color: Colors.white.withValues(alpha: 0.05),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.local_shipping_outlined,
                                color: Colors.white.withValues(alpha: 0.55),
                                size: 18,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                "I'm a hired driver",
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.55),
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── OTP CARD CONTENT ────────────────────────────────────────────
  Widget _buildOtpContent(AuthState authState) {
    final expiryMin = _otpExpirySeconds ~/ 60;
    final expirySec = _otpExpirySeconds % 60;
    final expiryLabel =
        '${expiryMin.toString().padLeft(2, '0')}:${expirySec.toString().padLeft(2, '0')}';
    final isExpired = _otpExpirySeconds <= 0;
    final isVerifying = authState.isLoading;
    final canResend = _resendCooldownSeconds == 0 && !isVerifying;
    final rateLimitReached = _resendCount >= 3;

    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 30, 24, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Title row
          Row(
            children: [
              GestureDetector(
                onTap: () {
                  _expiryTimer?.cancel();
                  _resendTimer?.cancel();
                  ref.read(authProvider.notifier).resetOtp();
                },
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                        color: Colors.white.withValues(alpha: 0.12)),
                  ),
                  child: Icon(Icons.arrow_back_rounded,
                      color: Colors.white.withValues(alpha: 0.7), size: 16),
                ),
              ),
              const SizedBox(width: 10),
              Container(
                width: 4,
                height: 22,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [_orange, Color(0xFF2563EB)],
                  ),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 10),
              const Text(
                'Verify OTP',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(left: 14),
            child: Text(
              authState.phoneMasked != null
                  ? 'OTP sent to ${authState.phoneMasked}'
                  : 'OTP sent to your registered number',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.45),
                fontSize: 11.5,
              ),
            ),
          ),
          const SizedBox(height: 22),

          // Expiry countdown
          Center(
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: isExpired
                    ? const Color(0xFFEF4444).withValues(alpha: 0.12)
                    : _orange.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isExpired
                      ? const Color(0xFFEF4444).withValues(alpha: 0.35)
                      : _orange.withValues(alpha: 0.28),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    isExpired
                        ? Icons.timer_off_rounded
                        : Icons.timer_rounded,
                    color: isExpired
                        ? const Color(0xFFEF4444)
                        : _orange,
                    size: 14,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    isExpired
                        ? 'OTP expired — request a new one'
                        : 'Expires in $expiryLabel',
                    style: TextStyle(
                      color: isExpired
                          ? const Color(0xFFEF4444)
                          : _orange,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 22),

          // 6 OTP digit boxes
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(6, (i) {
              return SizedBox(
                width: 42,
                height: 52,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: _otpCtrl[i].text.isNotEmpty
                          ? _orange.withValues(alpha: 0.7)
                          : Colors.white.withValues(alpha: 0.18),
                      width: 1.2,
                    ),
                  ),
                  child: TextFormField(
                    controller: _otpCtrl[i],
                    focusNode: _otpFocus[i],
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    maxLength: 1,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                    decoration: const InputDecoration(
                      counterText: '',
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      contentPadding: EdgeInsets.zero,
                    ),
                    onChanged: (v) {
                      setState(() {});
                      if (v.isNotEmpty && i < 5) {
                        _otpFocus[i + 1].requestFocus();
                      }
                      if (v.isEmpty && i > 0) {
                        _otpFocus[i - 1].requestFocus();
                      }
                      if (_otpValue().length == 6) {
                        _handleOtpSubmit();
                      }
                    },
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 18),

          // Info / rate-limit warning
          if (rateLimitReached)
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFF59E0B).withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                    color: const Color(0xFFF59E0B).withValues(alpha: 0.30)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber_rounded,
                      color: Color(0xFFF59E0B), size: 14),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Max 3 OTPs per 10 minutes reached. Please wait before requesting again.',
                      style: TextStyle(
                        color: const Color(0xFFF59E0B).withValues(alpha: 0.90),
                        fontSize: 10.5,
                      ),
                    ),
                  ),
                ],
              ),
            )
          else
            Row(
              children: [
                Icon(Icons.info_outline_rounded,
                    color: Colors.white.withValues(alpha: 0.25), size: 12),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Max 5 attempts \u2022 Max 3 OTPs per 10 minutes \u2022 Valid for 5 min',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.28),
                      fontSize: 10,
                    ),
                  ),
                ),
              ],
            ),
          const SizedBox(height: 20),

          // Verify button
          Container(
            width: double.infinity,
            height: 52,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              gradient: isExpired || isVerifying
                  ? LinearGradient(
                      colors: [
                        Colors.white.withValues(alpha: 0.12),
                        Colors.white.withValues(alpha: 0.08),
                      ],
                    )
                  : const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFFFFFFFF), Color(0xFFDDE5EE)],
                    ),
              boxShadow: isExpired || isVerifying
                  ? []
                  : [
                      BoxShadow(
                        color: Colors.white.withValues(alpha: 0.25),
                        blurRadius: 20,
                        spreadRadius: -6,
                        offset: const Offset(0, -2),
                      ),
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.3),
                        blurRadius: 20,
                        offset: const Offset(0, 8),
                      ),
                    ],
            ),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: isExpired || isVerifying ? null : _handleOtpSubmit,
                child: Center(
                  child: isVerifying
                      ? SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            color: isExpired
                                ? Colors.white.withValues(alpha: 0.4)
                                : _navy,
                            strokeWidth: 2.5,
                          ),
                        )
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              isExpired
                                  ? Icons.timer_off_rounded
                                  : Icons.verified_rounded,
                              color: isExpired
                                  ? Colors.white.withValues(alpha: 0.35)
                                  : _navy,
                              size: 16,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              isExpired ? 'OTP Expired' : 'Verify & Login',
                              style: TextStyle(
                                color: isExpired
                                    ? Colors.white.withValues(alpha: 0.35)
                                    : _navy,
                                fontSize: 15.5,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.4,
                              ),
                            ),
                          ],
                        ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Resend row
          Center(
            child: canResend && !rateLimitReached
                ? GestureDetector(
                    onTap: _handleResend,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(10),
                        color: _orange.withValues(alpha: 0.10),
                        border: Border.all(
                            color: _orange.withValues(alpha: 0.28)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.refresh_rounded,
                              color: _orange, size: 14),
                          const SizedBox(width: 6),
                          Text(
                            'Resend OTP',
                            style: TextStyle(
                              color: _orange,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                : Text(
                    rateLimitReached
                        ? 'Resend limit reached (3/3)'
                        : 'Resend available in ${_resendCooldownSeconds}s',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.30),
                      fontSize: 11.5,
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  // ── LOGIN BUTTON ────────────────────────────────────────────────
  Widget _buildLoginButton(AuthState authState) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.92, end: 1.0),
      duration: const Duration(milliseconds: 700),
      curve: Curves.elasticOut,
      builder: (_, sc, child) => Transform.scale(scale: sc, child: child),
      child: Container(
        width: double.infinity,
        height: 54,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFFFFFFF), Color(0xFFDDE5EE)],
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.white.withValues(alpha: 0.25),
              blurRadius: 20,
              spreadRadius: -6,
              offset: const Offset(0, -2),
            ),
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.3),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: authState.isLoading ? null : _handleLogin,
            splashColor: _navy.withValues(alpha: 0.08),
            highlightColor: _navy.withValues(alpha: 0.04),
            child: Center(
              child: authState.isLoading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                          color: _navy, strokeWidth: 2.5),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          'Log in',
                          style: TextStyle(
                            color: _navy,
                            fontSize: 15.5,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.4,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            color: _navy.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Icon(
                            Icons.arrow_forward_rounded,
                            color: _navy,
                            size: 14,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }

  // ── FOOTER ──────────────────────────────────────────────────────

  Widget _buildFooter() {
    return Text.rich(
      TextSpan(
        style: TextStyle(
          color: Colors.white.withValues(alpha: 0.22),
          fontSize: 10,
          height: 1.6,
        ),
        children: [
          const TextSpan(text: 'By logging in you agree to our '),
          TextSpan(
            text: 'terms of service',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.42),
              decoration: TextDecoration.underline,
              decorationColor: Colors.white.withValues(alpha: 0.22),
            ),
          ),
          const TextSpan(text: '.'),
        ],
      ),
      textAlign: TextAlign.center,
    );
  }

  // ── FORGOT PASSWORD SHEET ───────────────────────────────────────

  void _showForgotPassword() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => ClipRRect(
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(24)),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            padding: EdgeInsets.fromLTRB(
                24, 20, 24, MediaQuery.of(context).viewInsets.bottom + 28),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Colors.white.withValues(alpha: 0.10),
                  Colors.white.withValues(alpha: 0.05),
                ],
              ),
              border: Border.all(
                  color: Colors.white.withValues(alpha: 0.12), width: 1),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Reset password',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 5),
                Text(
                  'Enter your registered email address',
                  style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.45),
                      fontSize: 12),
                ),
                const SizedBox(height: 18),
                const _GlossyInput(
                  hint: 'Email address',
                  keyboardType: TextInputType.emailAddress,
                  leadingIcon: Icons.alternate_email_rounded,
                ),
                const SizedBox(height: 16),
                Container(
                  width: double.infinity,
                  height: 50,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                        colors: [Color(0xFF60A5FA), Color(0xFF2563EB)]),
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                        color: _orange.withValues(alpha: 0.4),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () {
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Reset link sent to your email'),
                            backgroundColor: Color(0xFF1D9E75),
                          ),
                        );
                      },
                      child: const Center(
                        child: Text(
                          'Send reset link',
                          style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 14),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
//  CARD SHIMMER PAINTER — diagonal light sweep across glass card
// ═══════════════════════════════════════════════════════════════════

class _ShimmerPainter extends CustomPainter {
  final double progress;
  _ShimmerPainter(this.progress);

  @override
  void paint(Canvas canvas, Size size) {
    if (progress < 0.2 || progress > 0.75) return;
    final t = (progress - 0.2) / 0.55;
    final x = -size.width * 0.4 + t * (size.width * 1.8);
    final paint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [
          Colors.white.withValues(alpha: 0),
          Colors.white.withValues(alpha: 0.055),
          Colors.white.withValues(alpha: 0),
        ],
        stops: const [0.0, 0.5, 1.0],
      ).createShader(Rect.fromLTWH(x - 80, 0, 160, size.height));
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), paint);
  }

  @override
  bool shouldRepaint(_ShimmerPainter old) => old.progress != progress;
}

// ═══════════════════════════════════════════════════════════════════
//  ROAD BACKGROUND PAINTER — particles + scrolling dashes
// ═══════════════════════════════════════════════════════════════════

class _RoadPainter extends CustomPainter {
  final double progress;
  _RoadPainter(this.progress);

  @override
  void paint(Canvas canvas, Size size) {
    final rng = Random(42);
    final pp = Paint();
    for (int i = 0; i < 30; i++) {
      final bx = rng.nextDouble() * size.width;
      final by = rng.nextDouble() * size.height;
      final spd = 0.25 + rng.nextDouble() * 0.6;
      final r = 0.5 + rng.nextDouble() * 1.3;
      final y = (by + progress * size.height * spd * 0.12) % size.height;
      final a = (0.02 + rng.nextDouble() * 0.05) *
          (1.0 - y / size.height).clamp(0.0, 1.0);
      pp.color = Color(0xFF93C5FD).withValues(alpha: a);
      canvas.drawCircle(Offset(bx, y), r, pp);
    }
    const dw = 18.0;
    const gap = 32.0;
    final roadY = size.height * 0.93;
    final off = progress * (dw + gap);
    final dp = Paint()
      ..color = Colors.white.withValues(alpha: 0.04)
      ..strokeWidth = 1.8
      ..strokeCap = StrokeCap.round;
    for (double x = -dw + off; x < size.width + dw; x += dw + gap) {
      canvas.drawLine(Offset(x, roadY), Offset(x + dw, roadY), dp);
    }
    final ep = Paint()
      ..color = Colors.white.withValues(alpha: 0.015)
      ..strokeWidth = 1;
    for (final dy in [-10.0, 10.0]) {
      canvas.drawLine(
          Offset(0, roadY + dy), Offset(size.width, roadY + dy), ep);
    }
  }

  @override
  bool shouldRepaint(_RoadPainter old) => old.progress != progress;
}

// ═══════════════════════════════════════════════════════════════════
//  GLOSSY INPUT FIELD — glass fill + orange focus glow
// ═══════════════════════════════════════════════════════════════════

class _GlossyInput extends StatefulWidget {
  final TextEditingController? controller;
  final String hint;
  final bool obscure;
  final TextInputType? keyboardType;
  final Iterable<String>? autofillHints;
  final String? Function(String?)? validator;
  final IconData? leadingIcon;
  final Widget? trailingWidget;

  const _GlossyInput({
    this.controller,
    required this.hint,
    this.obscure = false,
    this.keyboardType,
    this.autofillHints,
    this.validator,
    this.leadingIcon,
    this.trailingWidget,
  });

  @override
  State<_GlossyInput> createState() => _GlossyInputState();
}

class _GlossyInputState extends State<_GlossyInput>
    with SingleTickerProviderStateMixin {
  final _focus = FocusNode();
  late final AnimationController _focusCtrl;
  static const _orange = Color(0xFF60A5FA);

  @override
  void initState() {
    super.initState();
    _focusCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 220));
    _focus.addListener(() {
      if (_focus.hasFocus) {
        _focusCtrl.forward();
      } else {
        _focusCtrl.reverse();
      }
      setState(() {});
    });
  }

  @override
  void dispose() {
    _focusCtrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _focusCtrl,
      builder: (_, __) {
        final v = _focusCtrl.value;
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 18),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.08 + v * 0.03),
            borderRadius: BorderRadius.circular(30),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.18 + v * 0.10),
              width: 1.0,
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: widget.controller,
                  focusNode: _focus,
                  obscureText: widget.obscure,
                  keyboardType: widget.keyboardType,
                  autofillHints: widget.autofillHints,
                  validator: widget.validator,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                  decoration: InputDecoration(
                    hintText: widget.hint,
                    hintStyle: TextStyle(
                      color: Colors.white.withValues(alpha: 0.35),
                      fontSize: 14,
                    ),
                    filled: true,
                    fillColor: Colors.transparent,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    errorBorder: InputBorder.none,
                    focusedErrorBorder: InputBorder.none,
                    contentPadding:
                        const EdgeInsets.symmetric(vertical: 15),
                    errorStyle: TextStyle(
                      color: _orange.withValues(alpha: 0.85),
                      fontSize: 10,
                    ),
                  ),
                ),
              ),
              if (widget.trailingWidget != null) ...[
                widget.trailingWidget!,
                const SizedBox(width: 6),
              ],
              if (widget.leadingIcon != null)
                Icon(
                  widget.leadingIcon,
                  size: 18,
                  color: Colors.white.withValues(alpha: 0.40 + v * 0.20),
                ),
            ],
          ),
        );
      },
    );
  }
}

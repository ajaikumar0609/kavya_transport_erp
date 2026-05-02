import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Eye, EyeOff, Shield, Zap, BarChart3, Phone, MessageSquare } from 'lucide-react';
import { getRoleHomePage } from '@/utils/roleRouting';
import { SubmitButton } from '@/components/common/SubmitButton';
import { authService } from '@/services/authService';
import brandLogo from '@/assets/logo.png';

type LoginTab = 'password' | 'otp';
type OtpStep = 'phone' | 'verify';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();

  // Shared
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);

  // Password tab
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP tab
  const [activeTab, setActiveTab] = useState<LoginTab>('password');
  const [otpStep, setOtpStep] = useState<OtpStep>('phone');
  const [otpPhone, setOtpPhone] = useState('');
  const [otpPassword, setOtpPassword] = useState('');
  const [showOtpPassword, setShowOtpPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [phoneMasked, setPhoneMasked] = useState('');
  const [otpDelivery, setOtpDelivery] = useState<'SMS' | 'email' | 'none' | ''>('');
  const [otpDevCode, setOtpDevCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await login(email, password);
      const nextRole = useAuthStore.getState().user?.roles?.[0];
      navigate(getRoleHomePage(nextRole), { replace: true });
    } catch {
      // error is set in the store
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
    setOtpLoading(true);
    try {
      const res = await authService.sendOtp({ phone: otpPhone }, otpPassword);
      setSessionId(res.session_id);
      setPhoneMasked(res.phone_masked ?? '');
      setOtpDelivery((res as any).delivery ?? 'SMS');
      setOtpDevCode((res as any).otp_dev ?? '');
      setOtpStep('verify');
    } catch (err: any) {
      setOtpError(err?.response?.data?.detail ?? 'Failed to send OTP. Check your phone number and password.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
    setOtpLoading(true);
    try {
      const res = await authService.verifyOtp(sessionId, otpCode);
      const token = (res as any).access_token;
      const refreshToken = (res as any).refresh_token;
      if (token) {
        localStorage.setItem('access_token', token);
        if (refreshToken && keepLoggedIn) localStorage.setItem('refresh_token', refreshToken);
        // Hydrate the auth store with the returned user
        const user = (res as any).user;
        useAuthStore.setState({ user, isAuthenticated: true });
        navigate(getRoleHomePage(user?.roles?.[0]), { replace: true });
      }
    } catch (err: any) {
      setOtpError(err?.response?.data?.detail ?? 'Invalid or expired OTP. Try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const switchTab = (tab: LoginTab) => {
    setActiveTab(tab);
    setOtpError('');
    clearError();
    setOtpStep('phone');
    setOtpCode('');
    setSessionId('');
    setOtpDevCode('');
    setOtpDelivery('');
  };



  return (
    <div className="min-h-screen flex">
      {/* Left: Branding panel */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 p-10 flex-col justify-between relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/90 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20 p-1">
              <img src={brandLogo} alt="Kavya Transport" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-white text-xl font-bold tracking-tight">Kavya Transport</h1>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <h2 className="text-white text-3xl xl:text-4xl font-bold leading-tight tracking-tight">
            Enterprise Fleet<br />Management System
          </h2>
          <p className="text-primary-200 text-sm leading-relaxed max-w-sm">
            Complete transport operations management — from job creation to invoice settlement.
            Track vehicles, manage trips, and handle finances all in one place.
          </p>

          <div className="space-y-3 pt-2">
            {[
              { icon: <Shield size={16} />, text: 'Role-based access control with 6 user roles' },
              { icon: <Zap size={16} />, text: 'Real-time GPS tracking and fleet monitoring' },
              { icon: <BarChart3 size={16} />, text: 'Advanced analytics and financial reporting' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-primary-100 text-sm">
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">{f.icon}</div>
                {f.text}
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex gap-8 text-primary-200 text-sm">
          <div>
            <p className="text-white text-2xl font-bold">500+</p>
            <p className="text-xs mt-0.5">Vehicles tracked</p>
          </div>
          <div>
            <p className="text-white text-2xl font-bold">10k+</p>
            <p className="text-xs mt-0.5">Trips completed</p>
          </div>
          <div>
            <p className="text-white text-2xl font-bold">99.9%</p>
            <p className="text-xs mt-0.5">Uptime SLA</p>
          </div>
        </div>
      </div>

      {/* Right: Login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-surface">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-primary-600/10 border border-primary-200 flex items-center justify-center p-1.5">
              <img src={brandLogo} alt="Kavya Transport" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">Kavya Transport</h1>
          </div>

          <div className="bg-white rounded-xl shadow-card border border-card-border p-8">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">Welcome back</h2>
              <p className="text-sm text-gray-500 mt-1">Sign in to your account to continue</p>
            </div>

            {/* Tabs */}
            <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
              <button
                onClick={() => switchTab('password')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'password' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Shield size={14} />
                Password
              </button>
              <button
                onClick={() => switchTab('otp')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'otp' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Phone size={14} />
                OTP Login
              </button>
            </div>

            {/* ── Password Tab ── */}
            {activeTab === 'password' && (
              <>
                {error && (
                  <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="label">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@transporterp.com"
                      className="input-field"
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="label">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="input-field pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={keepLoggedIn} onChange={(e) => setKeepLoggedIn(e.target.checked)} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5" />
                      <span className="text-sm text-gray-600">Keep me logged in</span>
                    </label>
                    <a href="#" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                      Forgot password?
                    </a>
                  </div>

                  <SubmitButton
                    isLoading={isLoading}
                    label="Sign in"
                    loadingLabel="Signing in..."
                    className="w-full flex items-center justify-center py-2.5"
                  />
                </form>
              </>
            )}

            {/* ── OTP Tab ── */}
            {activeTab === 'otp' && (
              <>
                {otpError && (
                  <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    {otpError}
                  </div>
                )}

                {otpStep === 'phone' && (
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <div>
                      <label className="label">Mobile Number</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">+91</span>
                        <input
                          type="tel"
                          value={otpPhone}
                          onChange={(e) => setOtpPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="9876543210"
                          className="input-field pl-12"
                          maxLength={10}
                          required
                          autoFocus
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label">Password</label>
                      <div className="relative">
                        <input
                          type={showOtpPassword ? 'text' : 'password'}
                          value={otpPassword}
                          onChange={(e) => setOtpPassword(e.target.value)}
                          placeholder="Enter your password"
                          className="input-field pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowOtpPassword(!showOtpPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showOtpPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <SubmitButton
                      isLoading={otpLoading}
                      label="Send OTP"
                      loadingLabel="Sending OTP..."
                      className="w-full flex items-center justify-center py-2.5"
                    />
                  </form>
                )}

                {otpStep === 'verify' && (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    {otpDevCode ? (
                      <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-800 text-sm">
                        <p className="font-semibold">⚠ Dev mode — delivery unavailable</p>
                        <p>OTP: <span className="font-mono font-bold tracking-widest text-lg">{otpDevCode}</span></p>
                      </div>
                    ) : (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
                        <MessageSquare size={14} className="flex-shrink-0" />
                        {otpDelivery === 'email' ? 'OTP sent to your registered email' : <>OTP sent to <span className="font-semibold ml-1">{phoneMasked}</span></>}
                      </div>
                    )}

                    <div>
                      <label className="label">Enter 6-digit OTP</label>
                      <input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        className="input-field text-center text-xl tracking-[0.4em] font-mono"
                        maxLength={6}
                        required
                        autoFocus
                      />
                    </div>

                    <SubmitButton
                      isLoading={otpLoading}
                      label="Verify & Sign in"
                      loadingLabel="Verifying..."
                      className="w-full flex items-center justify-center py-2.5"
                    />

                    <button
                      type="button"
                      onClick={() => { setOtpStep('phone'); setOtpCode(''); setOtpError(''); }}
                      className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      ← Change phone number
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

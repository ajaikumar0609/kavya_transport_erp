// Clerk Dashboard — Attendance + LR KPIs + Quick Actions + Pending Work
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Camera, CheckCircle2, FileText, Plus, Clock, ArrowRight,
  Upload, AlertTriangle, Package, TrendingUp, Printer,
  RefreshCw, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { lrService } from '@/services/dataService';
import { safeArray } from '@/utils/helpers';
import type { LR } from '@/types';

interface AttendanceRow {
  id: number;
  date?: string;
  status?: string;
  check_in_time?: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  generated: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-amber-100 text-amber-700',
  delivered: 'bg-green-100 text-green-700',
  pod_received: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-600',
};

const todayStr = new Date().toISOString().slice(0, 10);

function fmtTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export default function ClerkDashboardPage() {
  // ── attendance state ──
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [remarks, setRemarks] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── queries ──
  const { data: attendanceData, refetch: refetchAttendance } = useQuery({
    queryKey: ['clerk-attendance'],
    queryFn: () => api.get('/attendance', { params: { page: 1, limit: 10 } }),
  });

  const { data: todayLrData, refetch: refetchTodayLr } = useQuery({
    queryKey: ['clerk-today-lrs'],
    queryFn: () => lrService.list({ my_lrs: true, date_from: todayStr, date_to: todayStr, limit: 100 } as any),
  });

  const { data: myLrData } = useQuery({
    queryKey: ['clerk-my-lrs'],
    queryFn: () => lrService.list({ my_lrs: true, limit: 8 } as any),
  });

  const { data: pendingPodData } = useQuery({
    queryKey: ['clerk-pending-pod'],
    queryFn: () => lrService.list({ status: 'delivered', pod_uploaded: false, limit: 10 } as any),
  });

  const { data: pendingDispatchData } = useQuery({
    queryKey: ['clerk-pending-dispatch'],
    queryFn: () => lrService.list({ status: 'generated', limit: 10 } as any),
  });

  const { data: monthLrData } = useQuery({
    queryKey: ['clerk-month-lrs'],
    queryFn: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      return lrService.list({ my_lrs: true, date_from: from, limit: 1 } as any);
    },
  });

  // ── mutations ──
  const checkInMutation = useMutation({
    mutationFn: () => api.post('/attendance/check-in', { photo_data_url: photoDataUrl, remarks }),
    onSuccess: (res: any) => {
      toast.success(res?.message || 'Attendance marked');
      setPhotoDataUrl('');
      setRemarks('');
      setIsCameraOpen(false);
      void refetchAttendance();
      qc.invalidateQueries({ queryKey: ['clerk-attendance'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to mark attendance');
    },
  });

  // ── camera helpers ──
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      setIsCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 0);
    } catch {
      toast.error('Unable to access camera. Please allow camera permission.');
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.85));
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsCameraOpen(false);
  };

  // ── derived data ──
  const attendanceRows = safeArray<AttendanceRow>(
    (attendanceData as any)?.data?.items ?? (attendanceData as any)?.items ?? attendanceData,
  );
  const todayRecord = attendanceRows.find((r) => r.date?.slice(0, 10) === todayStr);
  const alreadyMarked = Boolean(todayRecord);

  const todayLrs = safeArray<LR>((todayLrData as any)?.items ?? todayLrData);
  const myLrs = safeArray<LR>((myLrData as any)?.items ?? myLrData);
  const pendingPod = safeArray<LR>((pendingPodData as any)?.items ?? pendingPodData);
  const pendingDispatch = safeArray<LR>((pendingDispatchData as any)?.items ?? pendingDispatchData);
  const monthTotal: number = (monthLrData as any)?.pagination?.total ?? (monthLrData as any)?.total ?? 0;
  const myLrTotal: number = (myLrData as any)?.pagination?.total ?? (myLrData as any)?.total ?? myLrs.length;

  const hasPendingActions = pendingPod.length > 0 || pendingDispatch.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Clerk Dashboard</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => { void refetchAttendance(); void refetchTodayLr(); }}
          className="btn-secondary flex items-center gap-1.5 text-sm"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link to="/lr/new"
          className="flex flex-col items-center gap-2 p-4 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition font-medium text-sm shadow-sm"
        >
          <Plus size={22} />
          New LR
        </Link>
        <Link to="/clerk/lrs"
          className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 text-gray-700 rounded-xl hover:border-primary-400 hover:text-primary-700 transition text-sm font-medium"
        >
          <FileText size={22} />
          My LRs
        </Link>
        <Link to="/clerk/pod"
          className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 text-gray-700 rounded-xl hover:border-primary-400 hover:text-primary-700 transition text-sm font-medium relative"
        >
          <Upload size={22} />
          Upload POD
          {pendingPod.length > 0 && (
            <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {pendingPod.length}
            </span>
          )}
        </Link>
        <Link to="/clerk/attendance"
          className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 text-gray-700 rounded-xl hover:border-primary-400 hover:text-primary-700 transition text-sm font-medium"
        >
          <Clock size={22} />
          Attendance
        </Link>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4 flex items-start gap-3">
          <div className={`p-2 rounded-lg ${alreadyMarked ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            <Clock size={18} />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Today</p>
            {alreadyMarked ? (
              <p className="text-sm font-bold text-green-700 capitalize">{todayRecord?.status}</p>
            ) : (
              <p className="text-sm font-bold text-amber-700">Not Marked</p>
            )}
            {todayRecord?.check_in_time && (
              <p className="text-xs text-gray-400">{fmtTime(todayRecord.check_in_time)}</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-700"><Package size={18} /></div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">LRs Today</p>
            <p className="text-2xl font-bold text-gray-900">{todayLrs.length}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-purple-100 text-purple-700"><TrendingUp size={18} /></div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">This Month</p>
            <p className="text-2xl font-bold text-gray-900">{monthTotal || myLrTotal}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4 flex items-start gap-3">
          <div className={`p-2 rounded-lg ${pendingPod.length > 0 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
            <Upload size={18} />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">POD Pending</p>
            <p className={`text-2xl font-bold ${pendingPod.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {pendingPod.length}
            </p>
          </div>
        </div>
      </div>

      {/* ── Pending Actions Banner ── */}
      {hasPendingActions && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
            <AlertTriangle size={16} /> Action Required
          </div>
          <div className="flex flex-wrap gap-3">
            {pendingPod.length > 0 && (
              <Link to="/clerk/pod" className="text-sm text-amber-700 hover:text-amber-900 flex items-center gap-1 underline underline-offset-2">
                {pendingPod.length} LR{pendingPod.length > 1 ? 's' : ''} awaiting POD upload
                <ChevronRight size={14} />
              </Link>
            )}
            {pendingDispatch.length > 0 && (
              <Link to="/clerk/lrs?status=generated" className="text-sm text-amber-700 hover:text-amber-900 flex items-center gap-1 underline underline-offset-2">
                {pendingDispatch.length} LR{pendingDispatch.length > 1 ? 's' : ''} ready for dispatch
                <ChevronRight size={14} />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance check-in card */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Attendance Check-In</h2>
            <Link to="/clerk/attendance" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
              View history <ArrowRight size={12} />
            </Link>
          </div>

          {alreadyMarked ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle2 size={20} className="text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">Attendance marked for today</p>
                <p className="text-xs text-green-600 capitalize">
                  Status: {todayRecord?.status} · Check-in: {fmtTime(todayRecord?.check_in_time)}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Camera check-in required. Marked late after 08:30 AM.</p>
              <button
                type="button"
                className="btn-primary flex items-center gap-2"
                onClick={startCamera}
                disabled={checkInMutation.isPending}
              >
                <Camera size={16} /> Open Camera
              </button>
            </div>
          )}

          {isCameraOpen && (
            <div className="space-y-3">
              <video
                ref={videoRef}
                className="w-full max-w-sm rounded-lg border border-gray-200"
                autoPlay
                muted
                playsInline
              />
              <button type="button" className="btn-primary" onClick={capturePhoto}>
                Capture Photo
              </button>
            </div>
          )}

          {photoDataUrl && !alreadyMarked && (
            <div className="space-y-3">
              <img
                src={photoDataUrl}
                alt="Captured"
                className="w-36 h-36 rounded-lg object-cover border border-gray-200"
              />
              <textarea
                className="input-field w-full"
                rows={2}
                placeholder="Remarks (optional)"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary flex-1"
                  disabled={checkInMutation.isPending}
                  onClick={() => checkInMutation.mutate()}
                >
                  {checkInMutation.isPending ? 'Submitting…' : 'Submit Attendance'}
                </button>
                <button
                  type="button"
                  className="btn-secondary px-3"
                  onClick={() => { setPhotoDataUrl(''); }}
                >
                  Retake
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Today's LRs */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Today's LRs</h2>
            <div className="flex items-center gap-2">
              <Link to="/clerk/lrs" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
              <Link to="/lr/new" className="btn-primary text-xs flex items-center gap-1.5 py-1.5 px-3">
                <Plus size={13} /> New LR
              </Link>
            </div>
          </div>

          {todayLrs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FileText size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No LRs created today.</p>
              <Link to="/lr/new" className="text-xs text-primary-600 hover:underline mt-1 inline-block">
                Create your first LR today →
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {todayLrs.slice(0, 6).map((lr) => (
                <div key={lr.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono font-semibold text-primary-600 truncate">
                      {lr.lr_number ?? `#${lr.id}`}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {lr.consignor_name} → {lr.consignee_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[lr.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {lr.status.replace(/_/g, ' ')}
                    </span>
                    <Link
                      to={`/lr/${lr.id}`}
                      className="p-1 text-gray-400 hover:text-primary-600 rounded"
                      title="View LR"
                    >
                      <Printer size={14} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending POD uploads */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              Awaiting POD Upload
              {pendingPod.length > 0 && (
                <span className="ml-2 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {pendingPod.length}
                </span>
              )}
            </h2>
            <Link to="/clerk/pod" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
              Manage <ArrowRight size={12} />
            </Link>
          </div>

          {pendingPod.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <CheckCircle2 size={28} className="mx-auto mb-1.5 opacity-40" />
              <p className="text-sm">All deliveries have POD uploaded.</p>
            </div>
          ) : (
            <div className="divide-y">
              {pendingPod.slice(0, 5).map((lr) => (
                <div key={lr.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono font-semibold text-primary-600">
                      {lr.lr_number ?? `#${lr.id}`}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {lr.consignee_name} · {lr.destination}
                    </p>
                  </div>
                  <Link
                    to={`/clerk/pod?lr=${lr.id}`}
                    className="text-xs text-amber-600 font-medium flex items-center gap-1 hover:text-amber-800 shrink-0 border border-amber-300 rounded-lg px-2 py-1"
                  >
                    <Upload size={12} /> Upload
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ready for dispatch */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              Ready for Dispatch
              {pendingDispatch.length > 0 && (
                <span className="ml-2 bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {pendingDispatch.length}
                </span>
              )}
            </h2>
            <Link to="/clerk/lrs?status=generated" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {pendingDispatch.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <Package size={28} className="mx-auto mb-1.5 opacity-40" />
              <p className="text-sm">No LRs waiting for dispatch.</p>
            </div>
          ) : (
            <div className="divide-y">
              {pendingDispatch.slice(0, 5).map((lr) => (
                <div key={lr.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono font-semibold text-primary-600">
                      {lr.lr_number ?? `#${lr.id}`}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {lr.origin} → {lr.destination} · {fmtDate(lr.lr_date)}
                    </p>
                  </div>
                  <Link
                    to={`/lr/${lr.id}`}
                    className="text-xs text-blue-600 font-medium flex items-center gap-1 hover:text-blue-800 shrink-0 border border-blue-300 rounded-lg px-2 py-1"
                  >
                    <Printer size={12} /> Print
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

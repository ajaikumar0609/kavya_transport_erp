// Force full-page reload on HMR update to prevent stale module double-submit.
if (import.meta.hot) { import.meta.hot.invalidate(); }

// Convert DD-MM-YYYY (manual entry) → YYYY-MM-DD (ISO, expected by backend)
const parseDMY = (val: string): string | undefined => {
  if (!val) return undefined;
  const m = val.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val; // already ISO
  return undefined;
};

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Search, Plus, Shield, X, Trash2, Mail, Lock, Phone, User, BadgeCheck, Eye, EyeOff, Pencil, Upload, ExternalLink, FileText, Camera, FolderOpen } from 'lucide-react';
import DataTable, { Column } from '@/components/common/DataTable';
import { KPICard, StatusBadge } from '@/components/common/Modal';
import { DocAutoFill } from '@/components/documents/DocAutoFill';
import { documentService } from '@/services/dataService';
import api from '@/services/api';
import { safeArray } from '@/utils/helpers';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

interface Employee {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  avatar_url?: string;
  roles: string[];
  role: string;
  status: string;
  joined_date: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  joining_date?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  bank_account_holder?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  account_type?: string;
  upi_id?: string;
  salary_amount?: string;
  pay_type?: string;
  aadhaar_file_url?: string;
  aadhaar_file_name?: string;
  pan_file_url?: string;
  pan_file_name?: string;
  passbook_file_url?: string;
  passbook_file_name?: string;
  dl_file_url?: string;
  dl_file_name?: string;
  dl_number?: string;
  dl_issue_date?: string;
  dl_expiry_date?: string;
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin', description: 'Full system access', color: 'bg-red-50 border-red-200 text-red-700' },
  { value: 'manager', label: 'Manager', description: 'Operations & team management', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { value: 'fleet_manager', label: 'Fleet Manager', description: 'Vehicle & driver oversight', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
  { value: 'accountant', label: 'Accountant', description: 'Finance & billing access', color: 'bg-green-50 border-green-200 text-green-700' },
  { value: 'finance_manager', label: 'Finance Manager', description: 'Payments, payroll & payouts', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  { value: 'project_associate', label: 'Project Associate', description: 'Job & trip coordination', color: 'bg-amber-50 border-amber-200 text-amber-700' },
  { value: 'driver', label: 'Driver', description: 'Trip execution & mobile app', color: 'bg-purple-50 border-purple-200 text-purple-700' },
  { value: 'pump_operator', label: 'Pump Operator', description: 'Fuel dispensing & stock management', color: 'bg-orange-50 border-orange-200 text-orange-700' },
] as const;

// ── Shared helpers (module-level) ────────────────────────────────────────────
const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const toISODate = (v?: string | null): string => {
  if (!v) return '';
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
};

// ── Generic scan-upload field (camera + browse) ──────────────────────────────
interface ScanUploadFieldProps {
  fileUrl: string;
  fileName: string;
  placeholder: string;
  altText: string;
  onChange: (url: string, name: string) => void;
}
function ScanUploadField({ fileUrl, fileName, placeholder, altText, onChange }: ScanUploadFieldProps) {
  const [mode, setMode] = useState<'upload' | 'scan'>('upload');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [capturing, setCapturing] = useState(false);

  const stopCamera = useCallback((stream?: MediaStream | null) => {
    (stream ?? cameraStream)?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
  }, [cameraStream]);

  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      setCameraStream(stream);
      setTimeout(() => {
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      }, 50);
    } catch {
      setCameraError('Camera access denied. Please allow camera permission and try again.');
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current) return;
    setCapturing(true);
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) { setCapturing(false); return; }
      const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' });
      try {
        const dataUrl = await fileToDataUrl(file);
        onChange(dataUrl, 'scan.jpg');
        stopCamera();
      } catch { toast.error('Failed to capture photo'); }
      finally { setCapturing(false); }
    }, 'image/jpeg', 0.92);
  }, [stopCamera, onChange]);

  return (
    <div>
      {mode === 'scan' && (
        <div className="mb-2">
          {cameraError ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
              <Camera className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-600">{cameraError}</p>
            </div>
          ) : fileUrl && !cameraStream ? (
            <div className="relative rounded-lg overflow-hidden border border-green-200">
              <img src={fileUrl} alt={altText} className="w-full object-cover max-h-48" />
              <div className="absolute top-2 right-2">
                <button type="button"
                  className="bg-white text-indigo-600 text-xs font-semibold px-3 py-1.5 rounded-md border border-indigo-200 shadow-sm hover:bg-indigo-50 transition-colors"
                  onClick={() => { onChange('', ''); startCamera(); }}>Retake</button>
              </div>
              <div className="absolute bottom-2 left-2 bg-green-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">Captured ✓</div>
            </div>
          ) : (
            <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-56 object-cover" />
              {!cameraStream && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60">
                  <div className="text-center text-white">
                    <Camera className="w-8 h-8 mx-auto mb-2 opacity-60" />
                    <p className="text-sm">Starting camera…</p>
                  </div>
                </div>
              )}
              <div className="absolute inset-4 pointer-events-none">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br" />
              </div>
            </div>
          )}
          {cameraStream && (
            <button type="button" disabled={capturing}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
              onClick={capturePhoto}>
              <Camera className="w-4 h-4" />
              {capturing ? 'Capturing…' : 'Take Photo'}
            </button>
          )}
          <button type="button" className="mt-2 text-xs text-indigo-600 hover:underline"
            onClick={() => { setMode('upload'); stopCamera(); }}>← Upload a file instead</button>
        </div>
      )}
      {mode === 'upload' && (
        <div className="flex items-center gap-2 border border-dashed border-indigo-300 bg-indigo-50/50 rounded-lg px-4 py-3">
          <Upload className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="text-sm text-gray-600 flex-1 truncate">{fileName || placeholder}</span>
          <label className="cursor-pointer shrink-0">
            <span className="text-xs font-semibold text-indigo-700 bg-white px-3 py-1.5 rounded-md border border-indigo-200 shadow-sm hover:bg-indigo-50 transition-colors">Browse</span>
            <input type="file" accept="image/*,application/pdf" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try { const dataUrl = await fileToDataUrl(file); onChange(dataUrl, file.name); }
                catch { toast.error(`Failed to read file`); }
              }} />
          </label>
          <button type="button"
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 px-3 py-1.5 rounded-md shadow-sm hover:bg-indigo-700 transition-colors shrink-0"
            onClick={() => { setMode('scan'); startCamera(); }}>
            <Camera className="w-3.5 h-3.5" /> Scan
          </button>
        </div>
      )}
    </div>
  );
}

// ── PhotoUploadField — Browse + front-camera Scan for employee portrait ──────
function PhotoUploadField({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [camErr, setCamErr] = useState('');
  const [capturing, setCapturing] = useState(false);

  const stopCam = useCallback((s?: MediaStream | null) => {
    (s ?? stream)?.getTracks().forEach(t => t.stop());
    setStream(null);
    setScanning(false);
  }, [stream]);

  const startCam = useCallback(async () => {
    setCamErr('');
    setScanning(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      setStream(s);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); } }, 50);
    } catch { setCamErr('Camera access denied. Please allow camera permission.'); }
  }, []);

  const capture = useCallback(async () => {
    if (!videoRef.current) return;
    setCapturing(true);
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
        try { const url = await fileToDataUrl(file); onChange(url); stopCam(); } catch { toast.error('Capture failed'); }
      }
      setCapturing(false);
    }, 'image/jpeg', 0.92);
  }, [stopCam, onChange]);

  if (value) {
    return (
      <div className="relative w-24 h-24">
        <img src={value} alt="Employee photo" className="w-24 h-24 rounded-full object-cover border-2 border-indigo-200" />
        <button type="button"
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white border border-gray-300 flex items-center justify-center shadow hover:bg-red-50"
          onClick={() => onChange('')}>
          <X size={12} className="text-gray-500" />
        </button>
      </div>
    );
  }

  if (scanning) {
    return (
      <div>
        {camErr ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{camErr}</div>
        ) : (
          <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-black w-full max-w-xs">
            <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-48 object-cover" />
            {!stream && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60">
                <p className="text-sm text-white">Starting camera…</p>
              </div>
            )}
            {/* circular overlay guide */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-32 h-32 rounded-full border-2 border-white/60" />
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-2">
          {!camErr && stream && (
            <button type="button" disabled={capturing}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 px-3 py-1.5 rounded-md shadow-sm hover:bg-indigo-700 disabled:opacity-60 transition-colors"
              onClick={capture}>
              <Camera className="w-3.5 h-3.5" />{capturing ? 'Capturing…' : 'Capture'}
            </button>
          )}
          <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => stopCam()}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border border-dashed border-indigo-300 bg-indigo-50/50 rounded-lg px-4 py-3 w-fit">
      <div className="w-10 h-10 rounded-full bg-white/60 flex items-center justify-center border border-gray-200">
        <User className="w-5 h-5 text-gray-400" />
      </div>
      <div className="mr-2">
        <p className="text-sm font-medium text-gray-700">Employee photo</p>
        <p className="text-xs text-gray-400">JPG, PNG or WEBP</p>
      </div>
      <label className="cursor-pointer shrink-0">
        <span className="text-xs font-semibold text-indigo-700 bg-white px-3 py-1.5 rounded-md border border-indigo-200 shadow-sm hover:bg-indigo-50 transition-colors">Browse</span>
        <input type="file" accept="image/*" className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try { const dataUrl = await fileToDataUrl(file); onChange(dataUrl); } catch { toast.error('Failed to read file'); }
          }} />
      </label>
      <button type="button"
        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 px-3 py-1.5 rounded-md shadow-sm hover:bg-indigo-700 transition-colors shrink-0"
        onClick={startCam}>
        <Camera className="w-3.5 h-3.5" /> Scan
      </button>
    </div>
  );
}

// ── DrivingLicenseSection component (needs its own hooks) ────────────────────
interface DLSectionProps {
  dlFileUrl: string;
  dlFileName: string;
  dlNumber: string;
  dlIssueDate: string;
  dlExpiryDate: string;
  onChange: (patch: { dl_file_url?: string; dl_file_name?: string; dl_number?: string; dl_issue_date?: string; dl_expiry_date?: string; dl_holder_name?: string }) => void;
}

function DrivingLicenseSection({ dlFileUrl, dlFileName, dlNumber, dlIssueDate, dlExpiryDate, onChange }: DLSectionProps) {
  const [dlMode, setDlMode] = useState<'upload' | 'scan'>('upload');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [extractState, setExtractState] = useState<'idle' | 'extracting' | 'done' | 'error'>('idle');
  const [extractError, setExtractError] = useState('');

  const extractFromFile = useCallback(async (file: File) => {
    setExtractState('extracting');
    setExtractError('');
    try {
      const { documentService } = await import('@/services/dataService');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('document_type', 'driving_license');
      fd.append('entity_type', 'driver');
      const result = await documentService.extract(fd);
      const data = result?.data ?? {};
      onChange({
        dl_number: data.license_number || data.dl_number || undefined,
        dl_issue_date: toISODate(data.issue_date || data.doi) || undefined,
        dl_expiry_date: toISODate(data.expiry_date || data.validity || data.valid_till) || undefined,
        dl_holder_name: data.holder_name || undefined,
      });
      setExtractState('done');
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? err?.response?.data?.message ?? err?.message ?? 'Extraction failed';
      setExtractError(String(msg));
      setExtractState('error');
    }
  }, [onChange]);

  const stopCamera = useCallback((stream?: MediaStream | null) => {
    (stream ?? cameraStream)?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
  }, [cameraStream]);

  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      setCameraStream(stream);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 50);
    } catch {
      setCameraError('Camera access denied. Please allow camera permission and try again.');
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current) return;
    setCapturing(true);
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) { setCapturing(false); return; }
      const file = new File([blob], 'dl_scan.jpg', { type: 'image/jpeg' });
      try {
        const dataUrl = await fileToDataUrl(file);
        onChange({ dl_file_url: dataUrl, dl_file_name: 'dl_scan.jpg' });
        stopCamera();
        extractFromFile(file);
      } catch {
        toast.error('Failed to capture photo');
      } finally {
        setCapturing(false);
      }
    }, 'image/jpeg', 0.92);
  }, [stopCamera, onChange, extractFromFile]);

  return (
    <div>
      <div className="mb-3">
        {/* Camera view */}
        {dlMode === 'scan' && (
          <div className="mb-3">
            {cameraError ? (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
                <Camera className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-sm text-red-600">{cameraError}</p>
              </div>
            ) : dlFileUrl && !cameraStream ? (
              <div className="relative rounded-lg overflow-hidden border border-green-200">
                <img src={dlFileUrl} alt="Captured DL" className="w-full object-cover max-h-48" />
                <div className="absolute top-2 right-2">
                  <button type="button"
                    className="bg-white text-indigo-600 text-xs font-semibold px-3 py-1.5 rounded-md border border-indigo-200 shadow-sm hover:bg-indigo-50 transition-colors"
                    onClick={() => { onChange({ dl_file_url: '', dl_file_name: '' }); startCamera(); }}>
                    Retake
                  </button>
                </div>
                <div className="absolute bottom-2 left-2 bg-green-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">Captured ✓</div>
              </div>
            ) : (
              <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-56 object-cover" />
                {!cameraStream && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60">
                    <div className="text-center text-white">
                      <Camera className="w-8 h-8 mx-auto mb-2 opacity-60" />
                      <p className="text-sm">Starting camera…</p>
                    </div>
                  </div>
                )}
                <div className="absolute inset-4 pointer-events-none">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br" />
                </div>
              </div>
            )}
            {cameraStream && (
              <button type="button" disabled={capturing}
                className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
                onClick={capturePhoto}>
                <Camera className="w-4 h-4" />
                {capturing ? 'Capturing…' : 'Take Photo'}
              </button>
            )}
          </div>
        )}

        {/* File picker row — always visible in upload mode; hidden when camera active */}
        {dlMode === 'upload' && (
          <div className="flex items-center gap-2 border border-dashed border-indigo-300 bg-indigo-50/50 rounded-lg px-4 py-3">
            <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="text-sm text-gray-600 flex-1 truncate">{dlFileName || 'Choose DL file (image or PDF)'}</span>
            <label className="cursor-pointer">
              <span className="text-xs font-semibold text-indigo-700 bg-white px-3 py-1.5 rounded-md border border-indigo-200 shadow-sm hover:bg-indigo-50 transition-colors">Browse</span>
              <input type="file" accept="image/*,application/pdf" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const dataUrl = await fileToDataUrl(file);
                    onChange({ dl_file_url: dataUrl, dl_file_name: file.name });
                    extractFromFile(file);
                  } catch { toast.error('Failed to read DL file'); }
                }} />
            </label>
            <button type="button"
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 px-3 py-1.5 rounded-md shadow-sm hover:bg-indigo-700 transition-colors shrink-0"
              onClick={() => { setDlMode('scan'); startCamera(); }}>
              <Camera className="w-3.5 h-3.5" /> Scan
            </button>
          </div>
        )}

        {/* Back to upload link when in scan mode */}
        {dlMode === 'scan' && (
          <button type="button"
            className="mt-2 text-xs text-indigo-600 hover:underline"
            onClick={() => { setDlMode('upload'); stopCamera(); }}>
            ← Upload a file instead
          </button>
        )}

        {!dlFileUrl && <p className="text-xs text-amber-600 mt-1.5">Driving license upload is required for drivers.</p>}

        {/* Extraction status */}
        {extractState === 'extracting' && (
          <div className="flex items-center gap-2.5 mt-3 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200">
            <svg className="animate-spin w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            <span className="text-xs font-medium text-blue-700">Extracting details from license image…</span>
          </div>
        )}
        {extractState === 'done' && (
          <div className="flex items-center gap-2.5 mt-3 px-3 py-2.5 rounded-lg bg-green-50 border border-green-200">
            <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
            <span className="text-xs font-medium text-green-700">Details extracted and auto-filled below</span>
            <button type="button" className="ml-auto text-green-500 hover:text-green-700" onClick={() => setExtractState('idle')}>
              <X size={13} />
            </button>
          </div>
        )}
        {extractState === 'error' && (
          <div className="flex items-center gap-2.5 mt-3 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200">
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M21 12A9 9 0 113 12a9 9 0 0118 0z"/></svg>
            <span className="text-xs font-medium text-red-700 flex-1">Extraction failed — fill in manually. {extractError}</span>
            <button type="button" className="text-red-400 hover:text-red-600" onClick={() => setExtractState('idle')}><X size={13} /></button>
          </div>
        )}
      </div>

    </div>
  );
}

export default function EmployeesPage() {
  const authUser = useAuthStore((s) => s.user);
  const isAdmin = Boolean(authUser?.roles?.includes('admin'));
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
    role_names: ['manager'] as string[],
    // Extended fields
    dob: '',
    joining_date: '',
    gender: 'male',
    address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    salary_amount: '',
    pay_type: 'monthly',
    bank_account_holder: '',
    bank_name: '',
    account_number: '',
    confirm_account_number: '',
    ifsc_code: '',
    account_type: '',
    upi_id: '',
    aadhaar_file_url: '',
    aadhaar_file_name: '',
    passbook_file_url: '',
    passbook_file_name: '',
    pan_file_url: '',
    pan_file_name: '',
    dl_file_url: '',
    dl_file_name: '',
    dl_number: '',
    dl_issue_date: '',
    dl_expiry_date: '',
    avatar_url: '',
  });
  const [editForm, setEditForm] = useState({
    id: 0,
    first_name: '',
    last_name: '',
    phone: '',
    role_name: 'manager',
    is_active: true,
    avatar_url: '',
    password: '',
    date_of_birth: '',
    joining_date: '',
    gender: '',
    address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    bank_account_holder: '',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    account_type: '',
    upi_id: '',
    aadhaar_file_url: '',
    aadhaar_file_name: '',
    dl_file_url: '',
    dl_file_name: '',
    dl_number: '',
    dl_issue_date: '',
    dl_expiry_date: '',
  });
  const [isExtractingAadhaar, setIsExtractingAadhaar] = useState(false);
  const qc = useQueryClient();

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  /** Convert DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD for <input type="date"> */
  const toISODate = (v?: string | null): string => {
    if (!v) return '';
    const s = v.trim();
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // DD/MM/YYYY or DD-MM-YYYY
    const m = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return s;
  };

  const openEditModal = (employee: Employee) => {
    setEditForm({
      id: employee.id,
      first_name: employee.first_name,
      last_name: employee.last_name,
      phone: employee.phone === '-' ? '' : employee.phone,
      role_name: employee.role || 'manager',
      is_active: employee.status === 'active',
      avatar_url: employee.avatar_url || '',
      password: '',
      date_of_birth: employee.date_of_birth || '',
      joining_date: employee.joining_date || '',
      gender: employee.gender || '',
      address: employee.address || '',
      emergency_contact_name: employee.emergency_contact_name || '',
      emergency_contact_phone: employee.emergency_contact_phone || '',
      bank_account_holder: employee.bank_account_holder || '',
      bank_name: employee.bank_name || '',
      account_number: employee.account_number || '',
      ifsc_code: employee.ifsc_code || '',
      account_type: employee.account_type || '',
      upi_id: employee.upi_id || '',
      aadhaar_file_url: employee.aadhaar_file_url || '',
      aadhaar_file_name: employee.aadhaar_file_name || '',
      dl_file_url: employee.dl_file_url || '',
      dl_file_name: employee.dl_file_name || '',
      dl_number: employee.dl_number || '',
      dl_issue_date: employee.dl_issue_date || '',
      dl_expiry_date: employee.dl_expiry_date || '',
    });
    setShowEditPassword(false);
    setIsEditOpen(true);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['admin-employees', search],
    queryFn: async () => {
      const res = await api.get('/users', { params: { search: search || undefined, limit: 500, page: 1 } });
      return res;
    },
  });

  const isCreatingRef = useRef(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      return api.post('/users', {
        email: createForm.email,
        password: createForm.password,
        first_name: createForm.first_name,
        last_name: createForm.last_name || undefined,
        phone: createForm.phone || undefined,
        role_names: createForm.role_names,
        date_of_birth: parseDMY(createForm.dob),
        joining_date: parseDMY(createForm.joining_date),
        gender: createForm.gender || undefined,
        address: createForm.address || undefined,
        emergency_contact_name: createForm.emergency_contact_name || undefined,
        emergency_contact_phone: createForm.emergency_contact_phone || undefined,
        bank_account_holder: createForm.bank_account_holder || undefined,
        bank_name: createForm.bank_name || undefined,
        account_number: createForm.account_number || undefined,
        ifsc_code: createForm.ifsc_code || undefined,
        account_type: createForm.account_type || undefined,
        upi_id: createForm.upi_id || undefined,
        salary_amount: createForm.salary_amount || undefined,
        pay_type: createForm.pay_type || undefined,
        aadhaar_file_url: createForm.aadhaar_file_url || undefined,
        aadhaar_file_name: createForm.aadhaar_file_name || undefined,
        pan_file_url: createForm.pan_file_url || undefined,
        pan_file_name: createForm.pan_file_name || undefined,
        passbook_file_url: createForm.passbook_file_url || undefined,
        passbook_file_name: createForm.passbook_file_name || undefined,
        dl_file_url: createForm.dl_file_url || undefined,
        dl_file_name: createForm.dl_file_name || undefined,
        dl_number: createForm.dl_number || undefined,
        dl_issue_date: createForm.dl_issue_date || undefined,
        dl_expiry_date: createForm.dl_expiry_date || undefined,
        avatar_url: createForm.avatar_url || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-employees'] });
      qc.invalidateQueries({ queryKey: ['jobs-assign-drivers'] });
      qc.invalidateQueries({ queryKey: ['trips-create-drivers'] });
      qc.invalidateQueries({ queryKey: ['trip-lookup-drivers'] });
      qc.invalidateQueries({ queryKey: ['lr-lookup-drivers'] });
      toast.success('Employee created successfully');
      setIsCreateOpen(false);
      setShowPassword(false);
      setCreateForm({ email: '', password: '', first_name: '', last_name: '', phone: '', role_names: ['manager'], dob: '', joining_date: '', gender: 'male', address: '', emergency_contact_name: '', emergency_contact_phone: '', salary_amount: '', pay_type: 'monthly', bank_account_holder: '', bank_name: '', account_number: '', confirm_account_number: '', ifsc_code: '', account_type: '', upi_id: '', aadhaar_file_url: '', aadhaar_file_name: '', passbook_file_url: '', passbook_file_name: '', pan_file_url: '', pan_file_name: '', dl_file_url: '', dl_file_name: '', dl_number: '', dl_issue_date: '', dl_expiry_date: '', avatar_url: '' });
    },
    onError: (err: any) => {
      const raw = err?.response?.data?.detail || err?.message || 'Failed to create employee';
      const msg = Array.isArray(raw) ? raw.map((e: any) => e?.msg || String(e)).join('; ') : String(raw);
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.delete(`/users/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-employees'] });
      qc.invalidateQueries({ queryKey: ['jobs-assign-drivers'] });
      qc.invalidateQueries({ queryKey: ['trips-create-drivers'] });
      qc.invalidateQueries({ queryKey: ['trip-lookup-drivers'] });
      qc.invalidateQueries({ queryKey: ['lr-lookup-drivers'] });
      toast.success('Employee deleted successfully');
    },
    onError: (err: any) => {
      const raw = err?.response?.data?.detail || err?.message || 'Failed to delete employee';
      const msg = Array.isArray(raw) ? raw.map((e: any) => e?.msg || String(e)).join('; ') : String(raw);
      toast.error(msg);
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {
        first_name: editForm.first_name,
        last_name: editForm.last_name || null,
        phone: editForm.phone || null,
        role_names: [editForm.role_name],
        is_active: editForm.is_active,
        avatar_url: editForm.avatar_url || null,
        date_of_birth: editForm.date_of_birth || null,
        joining_date: editForm.joining_date || null,
        gender: editForm.gender || null,
        address: editForm.address || null,
        emergency_contact_name: editForm.emergency_contact_name || null,
        emergency_contact_phone: editForm.emergency_contact_phone || null,
        bank_account_holder: editForm.bank_account_holder || null,
        bank_name: editForm.bank_name || null,
        account_number: editForm.account_number || null,
        ifsc_code: editForm.ifsc_code || null,
        account_type: editForm.account_type || null,
        upi_id: editForm.upi_id || null,
        aadhaar_file_url: editForm.aadhaar_file_url || null,
        aadhaar_file_name: editForm.aadhaar_file_name || null,
        dl_file_url: editForm.dl_file_url || null,
        dl_file_name: editForm.dl_file_name || null,
        dl_number: editForm.dl_number || null,
        dl_issue_date: editForm.dl_issue_date || null,
        dl_expiry_date: editForm.dl_expiry_date || null,
      };
      const trimmedPassword = editForm.password.trim();
      if (isAdmin && trimmedPassword) {
        payload.password = trimmedPassword;
      }
      return api.put(`/users/${editForm.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-employees'] });
      qc.invalidateQueries({ queryKey: ['jobs-assign-drivers'] });
      qc.invalidateQueries({ queryKey: ['trips-create-drivers'] });
      qc.invalidateQueries({ queryKey: ['trip-lookup-drivers'] });
      qc.invalidateQueries({ queryKey: ['lr-lookup-drivers'] });
      toast.success('Employee updated successfully');
      setIsEditOpen(false);
      setShowEditPassword(false);
      setSelectedEmployee(null);
    },
    onError: (err: any) => {
      const raw = err?.response?.data?.detail || err?.message || 'Failed to update employee';
      const msg = Array.isArray(raw) ? raw.map((e: any) => e?.msg || String(e)).join('; ') : String(raw);
      toast.error(msg);
    },
  });

  const employees: Employee[] = safeArray(data).map((u: any) => ({
    id: u.id,
    name: u.full_name || u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
    first_name: u.first_name || '',
    last_name: u.last_name || '',
    email: u.email,
    phone: u.phone || '-',
    avatar_url: u.avatar_url || undefined,
    roles: safeArray(u.roles),
    role: u.role || (u.roles && u.roles[0]) || 'user',
    status: u.is_active === false ? 'inactive' : 'active',
    joined_date: u.created_at || '-',
    date_of_birth: u.date_of_birth || undefined,
    gender: u.gender || undefined,
    address: u.address || undefined,
    joining_date: u.joining_date || undefined,
    emergency_contact_name: u.emergency_contact_name || undefined,
    emergency_contact_phone: u.emergency_contact_phone || undefined,
    bank_account_holder: u.bank_account_holder || undefined,
    bank_name: u.bank_name || undefined,
    account_number: u.account_number || undefined,
    ifsc_code: u.ifsc_code || undefined,
    account_type: u.account_type || undefined,
    upi_id: u.upi_id || undefined,
    salary_amount: u.salary_amount || undefined,
    pay_type: u.pay_type || undefined,
    aadhaar_file_url: u.aadhaar_file_url || undefined,
    aadhaar_file_name: u.aadhaar_file_name || undefined,
    pan_file_url: u.pan_file_url || undefined,
    pan_file_name: u.pan_file_name || undefined,
    passbook_file_url: u.passbook_file_url || undefined,
    passbook_file_name: u.passbook_file_name || undefined,
    dl_file_url: u.dl_file_url || undefined,
    dl_file_name: u.dl_file_name || undefined,
    dl_number: u.dl_number || undefined,
    dl_issue_date: u.dl_issue_date || undefined,
    dl_expiry_date: u.dl_expiry_date || undefined,
  }));

  const formatJoinedDate = (value: string) => {
    if (!value || value === '-') return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
  };

  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (e) => (
        <div className="flex items-center gap-3">
          {e.avatar_url ? (
            <img src={e.avatar_url} alt={e.name} className="w-8 h-8 rounded-full object-cover border border-gray-200" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-sm font-medium text-blue-600">{e.name.charAt(0)}</span>
            </div>
          )}
          <div>
            <p className="font-medium text-gray-900">{e.name}</p>
            <p className="text-xs text-gray-500">{e.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (e) => <span className="text-sm">{e.phone}</span> },
    { key: 'role', header: 'Role', render: (e) => <StatusBadge status={e.role} /> },
    { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      render: (e) => (
        <div className="inline-flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
            onClick={(ev) => {
              ev.stopPropagation();
              openEditModal(e);
            }}
            title="Edit employee"
          >
            <Pencil size={14} /> Edit
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 text-sm"
            onClick={(ev) => {
              ev.stopPropagation();
              if (deleteMutation.isPending) return;
              const ok = window.confirm(`Delete employee \"${e.name}\"?`);
              if (!ok) return;
              deleteMutation.mutate(e.id);
            }}
            disabled={deleteMutation.isPending}
            title="Delete employee"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">Manage all system users and employees</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setIsCreateOpen(true)}>
          <Plus size={16} /> Add Employee
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard title="Total Employees" value={employees.length} icon={<Users className="w-5 h-5" />} color="blue" />
        <KPICard title="Active" value={employees.filter(e => e.status === 'active').length} icon={<Shield className="w-5 h-5" />} color="green" />
        <KPICard title="Inactive" value={employees.filter(e => e.status === 'inactive').length} icon={<Users className="w-5 h-5" />} color="gray" />
      </div>

      {/* Role filter pills */}
      <div className="flex flex-wrap gap-2">
        {['All', ...Array.from(new Set(employees.map(e => e.role || 'Unknown'))).sort()].map((role) => {
          const count = role === 'All' ? employees.length : employees.filter(e => (e.role || 'Unknown') === role).length;
          return (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                roleFilter === role
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {role.replace(/_/g, ' ')} <span className={`ml-1 ${roleFilter === role ? 'text-blue-200' : 'text-gray-400'}`}>({count})</span>
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search employees..."
              className="input pl-10 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <DataTable
          columns={columns}
          data={roleFilter === 'All' ? employees : employees.filter(e => (e.role || '').toLowerCase().replace(/\s+/g, '_') === roleFilter.toLowerCase().replace(/\s+/g, '_'))}
          isLoading={isLoading}
          emptyMessage="No employees found"
          onRowClick={(employee) => setSelectedEmployee(employee)}
        />
      </div>

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="relative bg-gradient-to-r from-slate-700 to-slate-900 px-6 py-5 shrink-0">
              <div className="flex items-center gap-4">
                {selectedEmployee.avatar_url ? (
                  <img src={selectedEmployee.avatar_url} alt={selectedEmployee.name} className="w-14 h-14 rounded-2xl object-cover border-2 border-white/40" />
                ) : (
                  <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center border-2 border-white/30">
                    <span className="text-2xl font-bold text-white">{selectedEmployee.name.charAt(0).toUpperCase()}</span>
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedEmployee.first_name} {selectedEmployee.last_name}</h2>
                  <p className="text-slate-300 text-sm mt-0.5">{selectedEmployee.email}</p>
                  <div className="mt-1.5"><StatusBadge status={selectedEmployee.status} /></div>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmployee(null)}
                className="absolute top-4 right-4 p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X size={18} className="text-white" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">

              {/* Section: Personal Information */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Personal Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">First Name</p>
                    <p className="text-sm font-semibold text-slate-900">{selectedEmployee.first_name || '—'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Last Name</p>
                    <p className="text-sm font-semibold text-slate-900">{selectedEmployee.last_name || '—'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Date of Birth</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {selectedEmployee.date_of_birth ? formatJoinedDate(selectedEmployee.date_of_birth) : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Gender</p>
                    <p className="text-sm font-semibold text-slate-900 capitalize">{selectedEmployee.gender || '—'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Date of Joining</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {selectedEmployee.joining_date ? formatJoinedDate(selectedEmployee.joining_date) : formatJoinedDate(selectedEmployee.joined_date)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Employee ID</p>
                    <p className="text-sm font-semibold text-slate-900">EMP-{String(selectedEmployee.id).padStart(4, '0')}</p>
                  </div>
                </div>
                {/* Address full width */}
                <div className="rounded-xl bg-slate-50 p-4 mt-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Address</p>
                  <p className="text-sm font-semibold text-slate-900">{selectedEmployee.address || '—'}</p>
                </div>
              </div>

              {/* Section: Contact Details */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Contact Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Email</p>
                    <p className="text-sm font-semibold text-slate-900 break-all">{selectedEmployee.email || '—'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Phone</p>
                    <p className="text-sm font-semibold text-slate-900">{selectedEmployee.phone || '—'}</p>
                  </div>
                </div>
                {/* Emergency Contact */}
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-3">Emergency Contact</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Contact Name</p>
                      <p className="text-sm font-semibold text-slate-900">{selectedEmployee.emergency_contact_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Contact Phone</p>
                      <p className="text-sm font-semibold text-slate-900">{selectedEmployee.emergency_contact_phone || '—'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Role & Account */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Role & Account</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Role</p>
                    <StatusBadge status={selectedEmployee.role} />
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Status</p>
                    <StatusBadge status={selectedEmployee.status} />
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4 col-span-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Account Created</p>
                    <p className="text-sm font-semibold text-slate-900">{formatJoinedDate(selectedEmployee.joined_date)}</p>
                  </div>
                </div>
              </div>

              {/* Section: Bank Details */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Bank Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Account Holder</p>
                    <p className="text-sm font-semibold text-slate-900">{selectedEmployee.bank_account_holder || '—'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Bank Name</p>
                    <p className="text-sm font-semibold text-slate-900">{selectedEmployee.bank_name || '—'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Account Number</p>
                    <p className="text-sm font-semibold text-slate-900">{selectedEmployee.account_number || '—'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">IFSC Code</p>
                    <p className="text-sm font-semibold text-slate-900">{selectedEmployee.ifsc_code || '—'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Account Type</p>
                    <p className="text-sm font-semibold text-slate-900 capitalize">{selectedEmployee.account_type || '—'}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">UPI ID</p>
                    <p className="text-sm font-semibold text-slate-900">{selectedEmployee.upi_id || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Section: Documents */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Documents</p>
                {(() => {
                  const emp = selectedEmployee;
                  const docs = [
                    { label: 'Employee Photo', url: emp.avatar_url, name: undefined, isPhoto: true },
                    { label: 'Aadhaar Card', url: emp.aadhaar_file_url, name: emp.aadhaar_file_name },
                    { label: 'PAN Card', url: emp.pan_file_url, name: emp.pan_file_name },
                    { label: 'Passbook', url: emp.passbook_file_url, name: emp.passbook_file_name },
                    { label: 'Driving License', url: emp.dl_file_url, name: emp.dl_file_name,
                      meta: emp.dl_file_url ? [
                        { key: 'License No.', val: emp.dl_number || '—' },
                        { key: 'Issue Date', val: emp.dl_issue_date ? new Date(emp.dl_issue_date).toLocaleDateString('en-IN') : '—' },
                        { key: 'Expiry Date', val: emp.dl_expiry_date ? new Date(emp.dl_expiry_date).toLocaleDateString('en-IN') : '—' },
                      ] : undefined },
                  ];
                  const uploaded = docs.filter(d => d.url);
                  if (!uploaded.length) return <p className="text-sm text-slate-500 py-2">No documents uploaded.</p>;
                  return (
                    <div className="space-y-3">
                      {uploaded.map((doc) => (
                        <div key={doc.label} className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{doc.label}</p>
                              {doc.name && <p className="text-sm font-semibold text-slate-900 break-all">{doc.name}</p>}
                            </div>
                            <a href={doc.url} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 shrink-0">
                              <ExternalLink size={14} /> View File
                            </a>
                          </div>
                          {doc.url!.startsWith('data:image') && (
                            <img src={doc.url} alt={doc.label}
                              className={`w-full object-contain rounded-lg border border-slate-200 bg-white mt-3 ${doc.isPhoto ? 'max-h-40 object-top' : 'max-h-64'}`} />
                          )}
                          {doc.meta && (
                            <div className="grid grid-cols-3 gap-3 mt-3">
                              {doc.meta.map(m => (
                                <div key={m.key} className="rounded-lg bg-white p-3 border border-slate-100">
                                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">{m.key}</p>
                                  <p className="text-sm font-semibold text-slate-900">{m.val}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                className="px-4 py-2.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                onClick={() => openEditModal(selectedEmployee)}
              >
                Edit
              </button>
              <button
                type="button"
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                onClick={() => setSelectedEmployee(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[94vh]">

            {/* Modal Header */}
            <div className="relative bg-gradient-to-r from-emerald-600 to-teal-700 px-7 py-5 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                  <Pencil className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white leading-tight">Edit Employee</h2>
                  <p className="text-emerald-100 text-sm mt-0.5">Update profile, role and status</p>
                </div>
              </div>
              <button
                onClick={() => { setIsEditOpen(false); setShowEditPassword(false); }}
                className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X size={18} className="text-white" />
              </button>
            </div>

            <form
              className="overflow-y-auto flex-1 px-7 py-6 space-y-7"
              onSubmit={(e) => { e.preventDefault(); editMutation.mutate(); }}
            >
              {/* Profile Photo */}
              <div className="flex items-center gap-5 p-4 bg-gray-50 rounded-xl border border-gray-100">
                {editForm.avatar_url ? (
                  <img src={editForm.avatar_url} alt="Avatar" className="w-16 h-16 rounded-full object-cover border-2 border-emerald-200 shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xl shrink-0">
                    {(editForm.first_name || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 mb-1">Profile Photo</p>
                  <p className="text-xs text-gray-400 mb-2">JPG or PNG, will be shown as avatar</p>
                  <input type="file" accept="image/*"
                    className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const dataUrl = await fileToDataUrl(file);
                      setEditForm((p) => ({ ...p, avatar_url: dataUrl }));
                    }} />
                </div>
              </div>

              {/* Section helper */}
              {(() => {
                const Section = ({ title }: { title: string }) => (
                  <div className="flex items-center gap-3 mb-5">
                    <span className="text-xs font-bold tracking-widest uppercase text-emerald-600 whitespace-nowrap">{title}</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 to-transparent" />
                  </div>
                );
                return null; // defined inline below
              })()}

              {/* Personal Information */}
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-xs font-bold tracking-widest uppercase text-emerald-600 whitespace-nowrap">Personal Information</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 to-transparent" />
                </div>
                <div className="grid grid-cols-2 gap-5 mb-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">First Name <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input className="input w-full pl-10 py-2.5 text-sm" value={editForm.first_name}
                        onChange={(e) => setEditForm((p) => ({ ...p, first_name: e.target.value }))} required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input className="input w-full pl-10 py-2.5 text-sm" value={editForm.last_name}
                        onChange={(e) => setEditForm((p) => ({ ...p, last_name: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-5 mb-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                    <input type="date" className="input w-full py-2.5 text-sm" value={editForm.date_of_birth}
                      onChange={(e) => setEditForm((p) => ({ ...p, date_of_birth: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date of Joining</label>
                    <input type="date" className="input w-full py-2.5 text-sm" value={editForm.joining_date}
                      onChange={(e) => setEditForm((p) => ({ ...p, joining_date: e.target.value }))} />
                  </div>
                </div>
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                  <div className="flex gap-3">
                    {['male', 'female', 'other'].map((g) => (
                      <button key={g} type="button"
                        className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium capitalize transition-all ${editForm.gender === g ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600'}`}
                        onClick={() => setEditForm((p) => ({ ...p, gender: g }))}>
                        {g === 'male' ? '♂ Male' : g === 'female' ? '♀ Female' : '⚧ Other'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                  <textarea className="input w-full py-2.5 text-sm resize-none" rows={2} placeholder="Street, City, State, PIN"
                    value={editForm.address}
                    onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))} />
                </div>
              </div>

              {/* Contact Details */}
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-xs font-bold tracking-widest uppercase text-emerald-600 whitespace-nowrap">Contact Details</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 to-transparent" />
                </div>
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="tel" className="input w-full pl-10 py-2.5 text-sm" placeholder="9876543210"
                      value={editForm.phone}
                      onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Emergency Contact Name</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input className="input w-full pl-10 py-2.5 text-sm" placeholder="Contact person name"
                        value={editForm.emergency_contact_name}
                        onChange={(e) => setEditForm((p) => ({ ...p, emergency_contact_name: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Emergency Contact Phone</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="tel" className="input w-full pl-10 py-2.5 text-sm" placeholder="9876543210"
                        value={editForm.emergency_contact_phone}
                        onChange={(e) => setEditForm((p) => ({ ...p, emergency_contact_phone: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Role & Status */}
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-xs font-bold tracking-widest uppercase text-emerald-600 whitespace-nowrap">Role & Status</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 to-transparent" />
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                    <select className="input w-full py-2.5 text-sm" value={editForm.role_name}
                      onChange={(e) => setEditForm((p) => ({ ...p, role_name: e.target.value }))}>
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select className="input w-full py-2.5 text-sm"
                      value={editForm.is_active ? 'active' : 'inactive'}
                      onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.value === 'active' }))}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-xs font-bold tracking-widest uppercase text-emerald-600 whitespace-nowrap">Bank Details</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 to-transparent" />
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Account Holder Name</label>
                    <input className="input w-full py-2.5 text-sm" placeholder="Full name on bank account"
                      value={editForm.bank_account_holder}
                      onChange={(e) => setEditForm((p) => ({ ...p, bank_account_holder: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bank Name</label>
                    <input className="input w-full py-2.5 text-sm" placeholder="e.g. SBI, HDFC, ICICI"
                      value={editForm.bank_name}
                      onChange={(e) => setEditForm((p) => ({ ...p, bank_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Account Number</label>
                    <input className="input w-full py-2.5 text-sm" placeholder="Account number"
                      value={editForm.account_number}
                      onChange={(e) => setEditForm((p) => ({ ...p, account_number: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">IFSC Code</label>
                    <input className="input w-full py-2.5 text-sm uppercase" placeholder="e.g. SBIN0001234"
                      value={editForm.ifsc_code}
                      onChange={(e) => setEditForm((p) => ({ ...p, ifsc_code: e.target.value.toUpperCase() }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
                    <select className="input w-full py-2.5 text-sm"
                      value={editForm.account_type}
                      onChange={(e) => setEditForm((p) => ({ ...p, account_type: e.target.value }))}>
                      <option value="">Select type</option>
                      <option value="savings">Savings</option>
                      <option value="current">Current</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">UPI ID</label>
                    <input className="input w-full py-2.5 text-sm" placeholder="e.g. name@upi"
                      value={editForm.upi_id}
                      onChange={(e) => setEditForm((p) => ({ ...p, upi_id: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Aadhaar File */}
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-xs font-bold tracking-widest uppercase text-emerald-600 whitespace-nowrap">Aadhaar File</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 to-transparent" />
                </div>
                <div className="space-y-3">
                  {editForm.aadhaar_file_url && (
                    <a href={editForm.aadhaar_file_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100">
                      <ExternalLink size={13} />
                      {editForm.aadhaar_file_name || 'View existing Aadhaar file'}
                    </a>
                  )}
                  <label className="w-full flex items-center justify-between gap-3 border-2 border-dashed border-emerald-200 bg-emerald-50/30 rounded-xl px-4 py-3 cursor-pointer hover:bg-emerald-50 hover:border-emerald-300 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <Upload className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-sm text-gray-600 truncate">{editForm.aadhaar_file_name || 'Choose Aadhaar file (image or PDF)'}</span>
                    </div>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md whitespace-nowrap">Browse</span>
                    <input type="file" accept="image/*,application/pdf" className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const dataUrl = await fileToDataUrl(file);
                          setEditForm((p) => ({ ...p, aadhaar_file_url: dataUrl, aadhaar_file_name: file.name }));
                        } catch { toast.error('Failed to read Aadhaar file'); }
                      }} />
                  </label>
                </div>
              </div>

              {/* Driving License (driver only) */}
              {editForm.role_name === 'driver' && (
                <div>
                  <div className="flex items-center gap-3 mb-5">
                    <span className="text-xs font-bold tracking-widest uppercase text-emerald-600 whitespace-nowrap">Driving License</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 to-transparent" />
                  </div>
                  <div className="mb-4">
                    <DocAutoFill
                      documentType="driving_license"
                      entityType="driver"
                      label="Driving License"
                      onExtracted={(data) => {
                        setEditForm((p) => {
                          const patch: typeof p = {
                            ...p,
                            dl_number: data.license_number || data.dl_number || p.dl_number,
                            dl_issue_date: toISODate(data.issue_date || data.doi) || p.dl_issue_date,
                            dl_expiry_date: toISODate(data.expiry_date || data.validity || data.valid_till) || p.dl_expiry_date,
                          };
                          if (data.holder_name && !p.first_name) {
                            const parts = data.holder_name.trim().split(/\s+/);
                            patch.first_name = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
                            patch.last_name = parts.length > 1 ? parts[parts.length - 1] : '';
                          }
                          return patch;
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-3 mb-4">
                    {editForm.dl_file_url && (
                      <a href={editForm.dl_file_url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100">
                        <ExternalLink size={13} />
                        {editForm.dl_file_name || 'View existing DL file'}
                      </a>
                    )}
                    <label className="w-full flex items-center justify-between gap-3 border-2 border-dashed border-emerald-200 bg-emerald-50/30 rounded-xl px-4 py-3 cursor-pointer hover:bg-emerald-50 hover:border-emerald-300 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-sm text-gray-600 truncate">{editForm.dl_file_name || 'Choose DL file (image or PDF)'}</span>
                      </div>
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md whitespace-nowrap">Browse</span>
                      <input type="file" accept="image/*,application/pdf" className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const dataUrl = await fileToDataUrl(file);
                            setEditForm((p) => ({ ...p, dl_file_url: dataUrl, dl_file_name: file.name }));
                          } catch { toast.error('Failed to read DL file'); }
                        }} />
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">License Number</label>
                      <input className="input w-full py-2.5 text-sm uppercase" placeholder="KA0120200012345"
                        value={editForm.dl_number}
                        onChange={(e) => setEditForm((p) => ({ ...p, dl_number: e.target.value.toUpperCase() }))} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Issue Date</label>
                      <input type="date" className="input w-full py-2.5 text-sm"
                        value={editForm.dl_issue_date}
                        onChange={(e) => setEditForm((p) => ({ ...p, dl_issue_date: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Expiry Date</label>
                      <input type="date" className="input w-full py-2.5 text-sm"
                        value={editForm.dl_expiry_date}
                        onChange={(e) => setEditForm((p) => ({ ...p, dl_expiry_date: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {/* Account Security */}
              {isAdmin && (
                <div>
                  <div className="flex items-center gap-3 mb-5">
                    <span className="text-xs font-bold tracking-widest uppercase text-emerald-600 whitespace-nowrap">Account Security</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 to-transparent" />
                  </div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Reset Password <span className="text-xs font-normal text-gray-400">(Admin only — leave empty to keep current)</span></label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type={showEditPassword ? 'text' : 'password'}
                      className="input w-full pl-10 pr-11 py-2.5 text-sm"
                      placeholder="Min 6 characters"
                      value={editForm.password}
                      onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
                      minLength={6} />
                    <button type="button" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowEditPassword(!showEditPassword)} tabIndex={-1}>
                      {showEditPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {editForm.password && editForm.password.length < 6 && (
                    <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">⚠ Password must be at least 6 characters</p>
                  )}
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex justify-end gap-3 pt-5 border-t border-gray-100 sticky bottom-0 bg-white pb-1">
                <button type="button"
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                  onClick={() => { setIsEditOpen(false); setShowEditPassword(false); }}>
                  Cancel
                </button>
                <button type="submit"
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center gap-2 shadow-sm"
                  disabled={editMutation.isPending || !editForm.first_name || (!!editForm.password && editForm.password.length < 6)}>
                  {editMutation.isPending ? (
                    <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
                  ) : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Employee Modal */}
      {isCreateOpen && (() => {
        const empId = `KT-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
        const selectedRole = ROLE_OPTIONS.find(r => r.value === createForm.role_names[0]);
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-[1100px] overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[94vh]">

            {/* Scrollable body — two-column layout */}
            <div className="overflow-y-auto flex-1">
              <div className="flex min-h-0">

                {/* ═══ LEFT COLUMN: Form ═══ */}
                <div className="flex-1 min-w-0 px-8 py-7">
                  {/* Breadcrumb & Page Title */}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-3 hover:text-indigo-700"
                    onClick={() => { setIsCreateOpen(false); setShowPassword(false); }}
                  >
                    ← Employees
                  </button>
                  <h1 className="text-2xl font-bold text-gray-900 mb-1">Add New Employee</h1>
                  <p className="text-sm text-gray-500 mb-8">Onboard your latest talent. All fields marked with a dot are essential for compliance.</p>

                  <form
                    className="space-y-8"
                    id="create-employee-form"
                    onSubmit={(e) => { e.preventDefault(); if (isCreatingRef.current || createMutation.isPending) return; isCreatingRef.current = true; createMutation.mutate(undefined, { onSettled: () => { isCreatingRef.current = false; } }); }}
                  >

                    {/* ── Work Profile (Role) ── */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-1 h-6 rounded-full bg-indigo-600" />
                        <h2 className="text-base font-semibold text-gray-900">Work Profile</h2>
                      </div>
                      <div className="mb-4">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Employment Role</label>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {ROLE_OPTIONS.map((role) => {
                            const isSelected = createForm.role_names[0] === role.value;
                            return (
                              <button key={role.value} type="button"
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'}`}
                                onClick={() => setCreateForm((p) => ({ ...p, role_names: [role.value] }))}>
                                {role.label}
                              </button>
                            );
                          })}
                        </div>
                        {selectedRole && (
                          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${selectedRole.color}`}>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold uppercase tracking-wide mb-0.5">{selectedRole.label}</p>
                              <p className="text-[11px] opacity-75">{selectedRole.description}</p>
                            </div>
                            {createForm.role_names[0] === 'driver' && (
                              <span className="text-[10px] font-semibold bg-white/60 px-2 py-0.5 rounded shrink-0">Requires DL</span>
                            )}
                          </div>
                        )}
                      </div>

                    </div>

                    {/* ── Document Uploads ── */}
                    <div className="bg-gradient-to-br from-blue-100/80 via-indigo-50/70 to-blue-50/40 rounded-xl border border-blue-200 p-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-1 h-6 rounded-full bg-indigo-600" />
                        <h2 className="text-base font-semibold text-gray-900">Upload Documents</h2>
                      </div>
                      <p className="text-xs text-gray-500 mb-5">Upload Aadhaar card first — personal details will be auto-filled below.</p>
                      {/* Employee Photo */}
                      <div className="mb-4">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Employee Photo</label>
                        <PhotoUploadField
                          value={createForm.avatar_url}
                          onChange={(dataUrl) => setCreateForm((p) => ({ ...p, avatar_url: dataUrl }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Upload Aadhaar Card <span className="text-red-500">*</span></label>
                        {isExtractingAadhaar && (
                          <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
                            <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                            <span className="text-xs font-medium text-blue-700">Extracting details from Aadhaar…</span>
                          </div>
                        )}
                        <ScanUploadField
                          fileUrl={createForm.aadhaar_file_url}
                          fileName={createForm.aadhaar_file_name}
                          placeholder="Choose Aadhaar file (image or PDF)"
                          altText="Captured Aadhaar"
                          onChange={async (dataUrl, name) => {
                            setCreateForm((p) => ({ ...p, aadhaar_file_url: dataUrl, aadhaar_file_name: name }));
                            if (!dataUrl) return;
                            setIsExtractingAadhaar(true);
                            try {
                              const res = await fetch(dataUrl);
                              const blob = await res.blob();
                              const file = new File([blob], name, { type: blob.type });
                              const fd = new FormData();
                              fd.append('file', file);
                              fd.append('document_type', 'aadhaar');
                              fd.append('entity_type', 'employee');
                              const result = await documentService.extract(fd);
                              if (!result?.extracted) {
                                const reason = result?.message ?? '';
                                const isConfigIssue = reason.toLowerCase().includes('api_key') || reason.toLowerCase().includes('not configured') || reason.toLowerCase().includes('unavailable');
                                toast(isConfigIssue ? 'Auto-fill unavailable — please fill in personal details manually.' : (reason || 'Could not read document — please fill in manually.'), { icon: isConfigIssue ? 'ℹ️' : '⚠️' });
                                return;
                              }
                              const d = result?.data ?? {};
                              const genderRaw = String(d.gender || '').toLowerCase();
                              const genderVal = genderRaw.startsWith('f') ? 'female' : genderRaw.startsWith('t') ? 'other' : genderRaw.startsWith('m') ? 'male' : '';
                              setCreateForm((p) => ({
                                ...p,
                                dob: toISODate(d.date_of_birth) || p.dob,
                                gender: genderVal || p.gender,
                              }));
                              if (Object.keys(d).length > 0) toast.success('Personal details auto-filled from Aadhaar');
                            } catch (extractErr: any) {
                              const msg = extractErr?.response?.data?.message ?? extractErr?.response?.data?.detail ?? extractErr?.message ?? '';
                              const isConfigIssue = msg.toLowerCase().includes('api_key') || msg.toLowerCase().includes('not configured');
                              toast(isConfigIssue ? 'Auto-fill unavailable — please fill in personal details manually.' : (msg || 'Could not read document — please fill in manually.'), { icon: isConfigIssue ? 'ℹ️' : '⚠️' });
                            } finally {
                              setIsExtractingAadhaar(false);
                            }
                          }}
                        />
                        {!createForm.aadhaar_file_url && <p className="text-xs text-amber-600 mt-1.5">Aadhaar upload is required.</p>}
                      </div>
                      <div className="mt-4">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Upload Passbook</label>
                        <ScanUploadField
                          fileUrl={createForm.passbook_file_url}
                          fileName={createForm.passbook_file_name}
                          placeholder="Choose passbook file (image or PDF)"
                          altText="Captured Passbook"
                          onChange={async (dataUrl, name) => {
                            setCreateForm((p) => ({ ...p, passbook_file_url: dataUrl, passbook_file_name: name }));
                            if (!dataUrl) return;
                            try {
                              const res = await fetch(dataUrl);
                              const blob = await res.blob();
                              const file = new File([blob], name, { type: blob.type });
                              const fd = new FormData();
                              fd.append('file', file);
                              fd.append('document_type', 'passbook');
                              fd.append('entity_type', 'employee');
                              const result = await documentService.extract(fd);
                              if (!result?.extracted) return;
                              const d = result?.data ?? {};
                              setCreateForm((p) => ({
                                ...p,
                                bank_account_holder: d.account_holder_name || p.bank_account_holder,
                                bank_name: d.bank_name || p.bank_name,
                                account_number: d.account_number || p.account_number,
                                confirm_account_number: d.account_number || p.confirm_account_number,
                                ifsc_code: d.ifsc_code || p.ifsc_code,
                              }));
                              if (d.account_number || d.ifsc_code) toast.success('Bank details auto-filled from passbook');
                            } catch { /* silent — user can fill manually */ }
                          }}
                        />
                      </div>
                      <div className="mt-4">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Upload PAN Card</label>
                        <ScanUploadField
                          fileUrl={createForm.pan_file_url}
                          fileName={createForm.pan_file_name}
                          placeholder="Choose PAN card file (image or PDF)"
                          altText="Captured PAN Card"
                          onChange={(dataUrl, name) => setCreateForm((p) => ({ ...p, pan_file_url: dataUrl, pan_file_name: name }))}
                        />
                      </div>
                      {createForm.role_names[0] === 'driver' && (
                        <div className="mt-4">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Upload Driving License <span className="text-red-500">*</span></label>
                          <DrivingLicenseSection
                            dlFileUrl={createForm.dl_file_url}
                            dlFileName={createForm.dl_file_name}
                            dlNumber={createForm.dl_number}
                            dlIssueDate={createForm.dl_issue_date}
                            dlExpiryDate={createForm.dl_expiry_date}
                            onChange={(patch) => setCreateForm((p) => {
                              const update: typeof p = { ...p, ...patch };
                              if (patch.dl_holder_name) {
                                const parts = patch.dl_holder_name.trim().split(/\s+/);
                                update.first_name = p.first_name || (parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0]);
                                update.last_name = p.last_name || (parts.length > 1 ? parts[parts.length - 1] : '');
                              }
                              return update;
                            })}
                          />
                        </div>
                      )}
                    </div>

                    {/* ── Personal Information ── */}
                    <div className="bg-gradient-to-br from-blue-100/80 via-indigo-50/70 to-blue-50/40 rounded-xl border border-blue-200 p-6">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-1 h-6 rounded-full bg-indigo-600" />
                        <h2 className="text-base font-semibold text-gray-900">Personal Information</h2>
                      </div>
                      <div className="grid grid-cols-2 gap-5 mb-5">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Full Name <span className="text-red-500">*</span></label>
                          <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="e.g. John Doe"
                            value={createForm.first_name}
                            onChange={(e) => setCreateForm((p) => ({ ...p, first_name: e.target.value }))}
                            required />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Last Name</label>
                          <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="Optional"
                            value={createForm.last_name}
                            onChange={(e) => setCreateForm((p) => ({ ...p, last_name: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-5 mb-5">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Date of Birth</label>
                          <input type="text" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="DD-MM-YYYY"
                            value={createForm.dob}
                            onChange={(e) => setCreateForm((p) => ({ ...p, dob: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Date of Joining</label>
                          <input type="text" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="DD-MM-YYYY"
                            value={createForm.joining_date}
                            onChange={(e) => setCreateForm((p) => ({ ...p, joining_date: e.target.value }))} />
                        </div>
                      </div>
                      {createForm.role_names[0] === 'driver' && (
                        <div className="grid grid-cols-3 gap-4 mb-5">
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">License Number</label>
                            <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 uppercase placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="e.g. KA0120200012345"
                              value={createForm.dl_number}
                              onChange={(e) => setCreateForm((p) => ({ ...p, dl_number: e.target.value.toUpperCase() }))} />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Issue Date</label>
                            <input type="date" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors"
                              value={createForm.dl_issue_date}
                              onChange={(e) => setCreateForm((p) => ({ ...p, dl_issue_date: e.target.value }))} />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Expiry Date</label>
                            <input type="date" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors"
                              value={createForm.dl_expiry_date}
                              onChange={(e) => setCreateForm((p) => ({ ...p, dl_expiry_date: e.target.value }))} />
                          </div>
                        </div>
                      )}
                      <div className="mb-5">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Gender</label>
                        <div className="flex gap-2">
                          {['male', 'female', 'other'].map((g) => (
                            <button key={g} type="button"
                              className={`px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all ${createForm.gender === g ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'}`}
                              onClick={() => setCreateForm((p) => ({ ...p, gender: g }))}>
                              {g.charAt(0).toUpperCase() + g.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Address</label>
                        <textarea className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" rows={2} placeholder="Street, City, State, PIN"
                          value={createForm.address}
                          onChange={(e) => setCreateForm((p) => ({ ...p, address: e.target.value }))} />
                      </div>
                    </div>

                    {/* ── Contact Details ── */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-1 h-6 rounded-full bg-indigo-600" />
                        <h2 className="text-base font-semibold text-gray-900">Contact Details</h2>
                      </div>
                      <div className="grid grid-cols-2 gap-5 mb-5">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Email Address <span className="text-red-500">*</span></label>
                          <input type="email" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="john@kavyatransports.com"
                            value={createForm.email}
                            onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                            required />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Phone Number</label>
                          <input type="tel" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="9876543210"
                            value={createForm.phone}
                            onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-5">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Emergency Contact</label>
                          <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="Contact person name"
                            value={createForm.emergency_contact_name}
                            onChange={(e) => setCreateForm((p) => ({ ...p, emergency_contact_name: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Emergency Phone</label>
                          <input type="tel" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="9876543210"
                            value={createForm.emergency_contact_phone}
                            onChange={(e) => setCreateForm((p) => ({ ...p, emergency_contact_phone: e.target.value }))} />
                        </div>
                      </div>
                    </div>

                    {/* ── Salary Details ── */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-1 h-6 rounded-full bg-indigo-600" />
                        <h2 className="text-base font-semibold text-gray-900">Salary Details</h2>
                      </div>
                      <div className="grid grid-cols-2 gap-5">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Salary Amount (₹)</label>
                          <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
                            <input type="number" className="w-full pl-8 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="e.g. 25000"
                              value={createForm.salary_amount}
                              onChange={(e) => setCreateForm((p) => ({ ...p, salary_amount: e.target.value }))} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pay Type</label>
                          <div className="flex gap-2">
                            {['monthly', 'weekly', 'daily'].map((pt) => (
                              <button key={pt} type="button"
                                className={`flex-1 py-2.5 rounded-lg text-xs font-semibold capitalize transition-all ${createForm.pay_type === pt ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'}`}
                                onClick={() => setCreateForm((p) => ({ ...p, pay_type: pt }))}>
                                {pt.charAt(0).toUpperCase() + pt.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ── Bank & Payment Details ── */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-1 h-6 rounded-full bg-indigo-600" />
                        <h2 className="text-base font-semibold text-gray-900">Bank & Payment Details</h2>
                      </div>
                      <div className="grid grid-cols-2 gap-5 mb-5">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Account Holder Name</label>
                          <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="As per bank records"
                            value={createForm.bank_account_holder}
                            onChange={(e) => setCreateForm((p) => ({ ...p, bank_account_holder: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Bank Name</label>
                          <select className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors"
                            value={createForm.bank_name}
                            onChange={(e) => setCreateForm((p) => ({ ...p, bank_name: e.target.value }))}>
                            <option value="">Select Bank</option>
                            {['State Bank of India','HDFC Bank','ICICI Bank','Axis Bank','Bank of Baroda','Punjab National Bank','Kotak Mahindra Bank','Canara Bank','Indian Bank','Other'].map((b) => (
                              <option key={b}>{b}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-5 mb-5">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Account Number</label>
                          <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="Enter account number"
                            value={createForm.account_number}
                            onChange={(e) => setCreateForm((p) => ({ ...p, account_number: e.target.value }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Confirm Account Number</label>
                          <input className={`w-full px-4 py-2.5 bg-gray-50 border rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors ${createForm.confirm_account_number && createForm.confirm_account_number !== createForm.account_number ? 'border-red-400' : 'border-gray-200'}`}
                            placeholder="Re-enter account number"
                            value={createForm.confirm_account_number}
                            onChange={(e) => setCreateForm((p) => ({ ...p, confirm_account_number: e.target.value }))} />
                          {createForm.confirm_account_number && createForm.confirm_account_number !== createForm.account_number && (
                            <p className="text-xs text-red-500 mt-1">Account numbers do not match</p>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-5 mb-5">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">IFSC Code</label>
                          <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 uppercase placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="e.g. SBIN0001234" maxLength={11}
                            value={createForm.ifsc_code}
                            onChange={(e) => setCreateForm((p) => ({ ...p, ifsc_code: e.target.value.toUpperCase() }))} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Account Type</label>
                          <select className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors"
                            value={createForm.account_type}
                            onChange={(e) => setCreateForm((p) => ({ ...p, account_type: e.target.value }))}>
                            <option value="">Select type</option>
                            <option>Savings Account</option>
                            <option>Current Account</option>
                          </select>
                        </div>
                      </div>
                      <div className="pt-5 border-t border-gray-100">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">UPI ID</label>
                        <input className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors" placeholder="e.g. john@upi or 9876543210@paytm"
                          value={createForm.upi_id}
                          onChange={(e) => setCreateForm((p) => ({ ...p, upi_id: e.target.value }))} />
                        <p className="text-[11px] text-gray-400 mt-1.5">Used for quick salary transfers via UPI</p>
                      </div>
                    </div>

                    {/* ── Account Security ── */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-1 h-6 rounded-full bg-indigo-600" />
                        <h2 className="text-base font-semibold text-gray-900">Account Security</h2>
                      </div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Password <span className="text-red-500">*</span></label>
                      <div className="relative max-w-sm">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors"
                          placeholder="Min 6 characters"
                          value={createForm.password}
                          onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                          required minLength={6}
                        />
                        <button type="button" tabIndex={-1}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      {createForm.password && createForm.password.length < 6 && (
                        <p className="text-xs text-amber-600 mt-1.5">Password must be at least 6 characters</p>
                      )}
                    </div>

                  </form>
                </div>

                {/* ═══ RIGHT COLUMN: Identity Card + Tips ═══ */}
                <div className="w-[300px] shrink-0 py-7 pr-8 space-y-5 hidden lg:block">

                  {/* Employee Identity Card */}
                  <div className="rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
                    <div className="bg-gradient-to-br from-indigo-500 to-violet-600 px-5 pt-6 pb-8 flex flex-col items-center relative">
                      <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/20 flex items-center justify-center border-2 border-white/30 shadow-lg mb-3 relative">
                        {createForm.avatar_url ? (
                          <img src={createForm.avatar_url} alt="Employee" className="w-full h-full object-cover" />
                        ) : createForm.first_name ? (
                          <span className="text-2xl font-bold text-white">{createForm.first_name.charAt(0).toUpperCase()}</span>
                        ) : (
                          <User className="w-7 h-7 text-white/70" />
                        )}
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow">
                          <Pencil className="w-2.5 h-2.5 text-indigo-600" />
                        </div>
                      </div>
                      <p className="text-xs font-semibold text-indigo-100 uppercase tracking-wider">Employee Identity</p>
                      <p className="text-[10px] text-indigo-200 mt-0.5">System Generated ID</p>
                    </div>
                    <div className="px-5 py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Emp ID</span>
                        <span className="text-xs font-bold text-indigo-600">{empId}</span>
                      </div>
                      <div className="h-px bg-gray-100" />
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Joining Date</span>
                        <span className="text-xs font-medium text-gray-700">{createForm.joining_date ? new Date(createForm.joining_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : <span className="text-gray-400 italic">Pending</span>}</span>
                      </div>
                      <div className="h-px bg-gray-100" />
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Role</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${selectedRole ? selectedRole.color : 'bg-gray-100 text-gray-600'}`}>{selectedRole?.label || 'Not Set'}</span>
                      </div>
                      <div className="h-px bg-gray-100" />
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Status</span>
                        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Pending Setup</span>
                      </div>
                    </div>
                  </div>

                  {/* Tip Card */}
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                        <BadgeCheck className="w-3.5 h-3.5 text-indigo-600" />
                      </div>
                      <span className="text-xs font-bold text-indigo-700">Onboarding Tip</span>
                    </div>
                    <p className="text-[11.5px] text-gray-600 leading-relaxed">
                      Ensure the email provided is the employee's corporate domain address. Login credentials will be dispatched automatically upon creation.
                    </p>
                  </div>

                  {/* Encryption badge */}
                  <div className="flex items-center justify-center gap-1.5 py-2">
                    <Lock className="w-3 h-3 text-gray-400" />
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Encrypted Onboarding Protocol</span>
                  </div>

                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-8 py-4 border-t border-gray-200 flex justify-center gap-4 bg-white">
              <button
                type="button"
                className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 rounded-lg transition-colors border border-gray-300"
                onClick={() => { setIsCreateOpen(false); setShowPassword(false); }}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="create-employee-form"
                className="px-6 py-2.5 text-sm font-semibold text-white rounded-lg transition-all flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={
                  createMutation.isPending ||
                  !createForm.email ||
                  !createForm.password ||
                  !createForm.first_name ||
                  !createForm.aadhaar_file_url ||
                  (createForm.role_names[0] === 'driver' && !createForm.dl_file_url) ||
                  createForm.password.length < 6 ||
                  (!!createForm.confirm_account_number && createForm.confirm_account_number !== createForm.account_number)
                }
              >
                {createMutation.isPending ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Creating...
                  </>
                ) : (
                  <>Create Employee</>
                )}
              </button>
            </div>

          </div>
        </div>
        );
      })()}
    </div>
  );
}

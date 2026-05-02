import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import DataTable, { Column } from '@/components/common/DataTable';
import api from '@/services/api';
import { safeArray } from '@/utils/helpers';
import toast from 'react-hot-toast';
import { Camera, CheckCircle2 } from 'lucide-react';

interface AttendanceRow {
  id: number;
  date?: string;
  employee_name?: string;
  status?: string;
  check_in_time?: string;
  remarks?: string;
  check_in_photo_url?: string;
}

export default function DriverAttendancePage() {
  const [page, setPage] = useState(1);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [remarks, setRemarks] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['driver-attendance', page],
    queryFn: async () => api.get('/attendance', { params: { page, limit: 20 } }),
  });

  const rows = safeArray<AttendanceRow>((data as any)?.data?.items ?? (data as any)?.items ?? data);
  const total = (data as any)?.data?.total ?? (data as any)?.total ?? rows.length;

  const checkInMutation = useMutation({
    mutationFn: () => api.post('/attendance/check-in', { photo_data_url: photoDataUrl, remarks }),
    onSuccess: (res: any) => {
      toast.success(res?.message || 'Attendance marked');
      setRemarks('');
      setPhotoDataUrl('');
      setIsCameraOpen(false);
      qc.invalidateQueries({ queryKey: ['driver-attendance'] });
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.detail || 'Failed to mark attendance';
      toast.error(msg);
    },
  });

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setPhotoDataUrl(dataUrl);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const today = new Date().toISOString().slice(0, 10);
  const todayRecord = rows.find((row) => row.date?.slice(0, 10) === today);
  const alreadyMarked = Boolean(todayRecord);

  const columns: Column<AttendanceRow>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (row) => <span className="text-sm">{row.date ? new Date(row.date).toLocaleDateString('en-IN') : '-'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <span className="text-sm capitalize">{row.status || '-'}</span>,
    },
    {
      key: 'check_in_time',
      header: 'Check-In',
      render: (row) => <span className="text-sm">{row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}</span>,
    },
    {
      key: 'remarks',
      header: 'Remarks',
      render: (row) => <span className="text-sm text-gray-600">{row.remarks || '-'}</span>,
    },
    {
      key: 'check_in_photo_url',
      header: 'Photo',
      render: (row) => row.check_in_photo_url
        ? <img src={row.check_in_photo_url} alt="Attendance" className="w-10 h-10 rounded-lg object-cover border border-gray-200" />
        : <span className="text-sm text-gray-400">-</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance</h1>
          <p className="page-subtitle">Camera check-in required before 08:30 AM (late after cutoff)</p>
        </div>
        <Link to="/dashboard" className="btn-secondary">Back</Link>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">Today's Attendance</p>
            {alreadyMarked ? (
              <p className="text-sm font-medium text-green-700 flex items-center gap-1.5 mt-1">
                <CheckCircle2 size={16} /> Marked as {todayRecord?.status}
              </p>
            ) : (
              <p className="text-sm text-amber-700 mt-1">Not marked yet</p>
            )}
          </div>
          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            onClick={startCamera}
            disabled={alreadyMarked || checkInMutation.isPending}
          >
            <Camera size={16} /> Open Camera
          </button>
        </div>

        {isCameraOpen && (
          <div className="space-y-3">
            <video ref={videoRef} className="w-full max-w-md rounded-lg border border-gray-200" autoPlay muted playsInline />
            <button type="button" className="btn-primary" onClick={capturePhoto}>Capture Photo</button>
          </div>
        )}

        {photoDataUrl && (
          <div className="space-y-3">
            <img src={photoDataUrl} alt="Captured" className="w-40 h-40 rounded-lg object-cover border border-gray-200" />
            <textarea
              className="input-field"
              rows={2}
              placeholder="Remarks (optional)"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary"
              disabled={checkInMutation.isPending || alreadyMarked}
              onClick={() => checkInMutation.mutate()}
            >
              {checkInMutation.isPending ? 'Submitting...' : 'Submit Attendance'}
            </button>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        total={total}
        page={page}
        pageSize={20}
        isLoading={isLoading}
        onPageChange={setPage}
        onRefresh={() => refetch()}
        emptyMessage="No attendance records"
      />
    </div>
  );
}

// Clerk — POD Upload Page
// Lists all delivered LRs without POD and allows file upload
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, CheckCircle2, FileText, RefreshCw,
  Eye, X, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { lrService } from '@/services/dataService';
import { safeArray } from '@/utils/helpers';
import type { LR } from '@/types';

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ClerkPODPage() {
  const [searchParams] = useSearchParams();
  const highlightLrId = searchParams.get('lr') ? Number(searchParams.get('lr')) : null;
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  // Fetch all delivered LRs without POD
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['clerk-pod-pending'],
    queryFn: () => lrService.list({ status: 'delivered', limit: 100 } as any),
  });

  // Also fetch recently completed POD so clerk can verify
  const { data: doneData } = useQuery({
    queryKey: ['clerk-pod-done'],
    queryFn: () => lrService.list({ status: 'pod_received', limit: 20 } as any),
  });

  const pendingRows = safeArray<LR>((data as any)?.items ?? data).filter((lr) => !lr.pod_uploaded);
  const doneRows = safeArray<LR>((doneData as any)?.items ?? doneData);

  const uploadMutation = useMutation({
    mutationFn: ({ lrId, file }: { lrId: number; file: File }) =>
      lrService.uploadPOD(lrId, file),
    onSuccess: () => {
      toast.success('POD uploaded successfully');
      setUploadingId(null);
      setPreviewUrl(null);
      qc.invalidateQueries({ queryKey: ['clerk-pod-pending'] });
      qc.invalidateQueries({ queryKey: ['clerk-pod-done'] });
      qc.invalidateQueries({ queryKey: ['clerk-pending-pod'] });
      void refetch();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? 'Upload failed. Try again.');
      setUploadingId(null);
    },
  });

  const handleFileSelect = (lrId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type + size (max 10 MB)
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      toast.error('Only JPG, PNG, WebP or PDF files are accepted.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10 MB.');
      return;
    }

    // Show preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreviewUrl(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreviewUrl(null);
    }

    setUploadingId(lrId);
    uploadMutation.mutate({ lrId, file });
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">POD Upload</h1>
          <p className="page-subtitle">
            Proof of Delivery — {pendingRows.length} pending upload{pendingRows.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary flex items-center gap-1.5 text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 flex items-start gap-3">
        <AlertTriangle size={16} className="shrink-0 mt-0.5 text-blue-600" />
        <div>
          <p className="font-semibold">What is POD?</p>
          <p className="mt-0.5 text-blue-700">
            Upload the signed delivery receipt (photo or PDF) for each delivered LR.
            Accepted formats: JPG, PNG, WebP, PDF. Max 10 MB.
          </p>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          if (uploadingId !== null) handleFileSelect(uploadingId, e);
        }}
      />

      {/* Pending POD list */}
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500" />
          <h2 className="font-semibold text-gray-800">Pending Uploads ({pendingRows.length})</h2>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
        ) : pendingRows.length === 0 ? (
          <div className="py-14 text-center text-gray-400">
            <CheckCircle2 size={36} className="mx-auto mb-2 text-green-400 opacity-60" />
            <p className="text-sm font-medium text-green-700">All deliveries have POD uploaded!</p>
          </div>
        ) : (
          <div className="divide-y">
            {pendingRows.map((lr) => {
              const isHighlighted = lr.id === highlightLrId;
              const isUploading = uploadMutation.isPending && uploadingId === lr.id;
              return (
                <div
                  key={lr.id}
                  className={`px-5 py-4 flex items-center gap-4 flex-wrap transition-colors ${
                    isHighlighted ? 'bg-amber-50 border-l-4 border-amber-400' : 'hover:bg-gray-50'
                  }`}
                >
                  <FileText size={20} className="text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono font-semibold text-primary-600">
                      {lr.lr_number ?? `#${lr.id}`}
                      {isHighlighted && (
                        <span className="ml-2 text-xs bg-amber-200 text-amber-800 rounded px-1.5 py-0.5 font-sans">
                          Selected
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-600 truncate">
                      {lr.consignee_name} · {lr.destination}
                    </p>
                    <p className="text-xs text-gray-400">Delivered {fmtDate(lr.updated_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`/lr/${lr.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-primary-600"
                      title="View LR"
                    >
                      <Eye size={16} />
                    </a>
                    <button
                      disabled={isUploading}
                      onClick={() => {
                        setUploadingId(lr.id);
                        fileInputRef.current?.click();
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        isUploading
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-primary-600 text-white hover:bg-primary-700'
                      }`}
                    >
                      {isUploading ? (
                        <>
                          <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <Upload size={14} /> Upload POD
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recently uploaded PODs */}
      {doneRows.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-teal-500" />
            <h2 className="font-semibold text-gray-800">Recently Uploaded ({doneRows.length})</h2>
          </div>
          <div className="divide-y">
            {doneRows.map((lr) => (
              <div key={lr.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50">
                <CheckCircle2 size={16} className="text-teal-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-semibold text-gray-700">
                    {lr.lr_number ?? `#${lr.id}`}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {lr.consignee_name} · {lr.destination}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {lr.pod_file_url && (
                    <a
                      href={lr.pod_file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary-600 hover:underline flex items-center gap-1"
                    >
                      <Eye size={12} /> View POD
                    </a>
                  )}
                  <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">
                    POD Received
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image preview modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-800">POD Preview</p>
              <button onClick={() => setPreviewUrl(null)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <img src={previewUrl} alt="POD preview" className="w-full rounded-lg object-contain max-h-80" />
            <p className="text-xs text-gray-500 text-center">Uploading…</p>
          </div>
        </div>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, FileText, RefreshCw } from 'lucide-react';
import { driverService } from '@/services/dataService';
import { safeArray, openDocumentUrl } from '@/utils/helpers';

type DriverDoc = {
  id: number;
  document_type?: string;
  document_number?: string;
  file_name?: string;
  file_url?: string;
  uploaded_at?: string;
};

const DOC_LABELS: Record<string, string> = {
  driving_license: 'Driving License',
  license: 'Driving License',
  aadhaar_card: 'Aadhaar Card',
  aadhaar: 'Aadhaar Card',
  driver_badge: 'Driver Badge',
  medical_fitness: 'Medical Fitness',
  pan_card: 'PAN Card',
  puc: 'PUC',
  rc: 'RC',
};

function resolveFileUrl(fileUrl?: string): string {
  if (!fileUrl) return '';
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;

  const compact = String(fileUrl).trim().replace(/\\/g, '/');
  let normalized = compact.startsWith('/') ? compact : `/${compact}`;

  // Static uploads are mounted at /uploads (not under /api/v1).
  if (normalized.startsWith('/api/v1/uploads/')) {
    normalized = normalized.replace('/api/v1/uploads/', '/uploads/');
  } else if (normalized.startsWith('/api/uploads/')) {
    normalized = normalized.replace('/api/uploads/', '/uploads/');
  } else if (!normalized.startsWith('/uploads/')) {
    // Handle raw storage keys like "driver-documents/12/file.jpg".
    normalized = `/uploads/${normalized.replace(/^\/+/, '')}`;
  }

  if (import.meta.env.DEV) {
    const backendOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/api\/v1$/, '').replace(/\/$/, '');
    return `${backendOrigin}${normalized}`;
  }
  return normalized;
}

function toDisplayName(doc: DriverDoc): string {
  if (doc.file_name) return doc.file_name;

  const typeKey = (doc.document_type || '').toLowerCase();
  const label = DOC_LABELS[typeKey] || doc.document_type || 'Document';

  const url = doc.file_url || '';
  const filename = decodeURIComponent(url.split('/').pop() || '');
  const ext = filename.includes('.') ? `.${filename.split('.').pop()}` : '';

  // Storage keys are usually long hex strings; avoid showing them to drivers.
  const base = filename.replace(/\.[^.]+$/, '');
  const looksGenerated = /^[a-f0-9]{24,}$/i.test(base);
  if (looksGenerated || !filename) {
    return `${label}${doc.document_number ? ` - ${doc.document_number}` : ''}${ext}`;
  }

  return filename;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN');
}

export default function DriverDocumentsPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['driver-my-documents'],
    queryFn: () => driverService.getMyDocuments(),
  });

  const docs: DriverDoc[] = useMemo(
    () => safeArray<DriverDoc>((data as any)?.items ?? data),
    [data],
  );

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Documents</h1>
          <p className="text-sm text-gray-500 mt-1">Uploaded files for your driver profile</p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploaded File Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploaded</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">Loading documents...</td>
                </tr>
              ) : docs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">No uploaded documents found.</td>
                </tr>
              ) : (
                docs.map((doc) => {
                  const fileUrl = resolveFileUrl(doc.file_url);
                  const typeKey = (doc.document_type || '').toLowerCase();
                  return (
                    <tr key={doc.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/70">
                      <td className="px-4 py-3 text-sm text-gray-700">{DOC_LABELS[typeKey] || doc.document_type || 'Document'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={15} className="text-gray-400 shrink-0" />
                          <span className="text-sm text-gray-800 truncate" title={toDisplayName(doc)}>{toDisplayName(doc)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(doc.uploaded_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openDocumentUrl(fileUrl)}
                          disabled={!fileUrl}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Eye size={14} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

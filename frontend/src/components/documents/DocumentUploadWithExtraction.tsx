/**
 * DocumentUploadWithExtraction
 *
 * State machine     idle → extracting → review → saving → saved (or error at any step)
 * System-generated  (invoice, eway_bill, lr_copy, contract, pod, other) skip extraction
 * Extractable       run POST /documents/extract then show editable review panel
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  Upload, CheckCircle, Loader2, AlertCircle, Eye, EyeOff,
  ChevronRight, RefreshCw, FileText, X,
} from 'lucide-react';
import { documentService } from '@/services/dataService';

// ── Types ────────────────────────────────────────────────────────────────────

type UploadState = 'idle' | 'extracting' | 'review' | 'saving' | 'saved' | 'error';

export interface ExtractionResult {
  documentType: string;
  data: Record<string, any>;
  entityType?: string;
}

interface Props {
  documentType: string;          // e.g. "rc", "insurance", "driving_license"
  entityType: string;            // e.g. "vehicle", "driver"
  entityId?: number;             // required for final upload
  label?: string;
  description?: string;
  isRequired?: boolean;
  onExtracted?: (result: ExtractionResult) => void;
  onSaved?: (doc: any) => void;
  onClose?: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_GENERATED_TYPES = new Set([
  'invoice', 'eway_bill', 'lr_copy', 'contract', 'pod', 'other',
]);

const MASKED_FIELDS = new Set(['aadhaar_number', 'pan_number']);

const FIELD_LABELS: Record<string, string> = {
  registration_number: 'Registration Number',
  owner_name: 'Owner Name',
  vehicle_class: 'Vehicle Class',
  fuel_type: 'Fuel Type',
  fuel_type_extracted: 'Fuel Type',
  chassis_number: 'Chassis Number',
  engine_number: 'Engine Number',
  issue_date: 'Issue Date',
  validity_date: 'Validity Date',
  expiry_date: 'Expiry Date',
  registration_date: 'Registration Date',
  policy_number: 'Policy Number',
  insurer_name: 'Insurer Name',
  vehicle_number: 'Vehicle Registration Number',
  coverage_type: 'Coverage Type',
  premium_amount: 'Premium Amount',
  certificate_number: 'Certificate Number',
  fitness_status: 'Fitness Status',
  license_number: 'License Number',
  holder_name: 'Holder Name',
  date_of_birth: 'Date of Birth',
  license_classes: 'License Classes',
  mobile_number: 'Mobile Number',
  puc_number: 'PUC Number',
  vehicle_registration: 'Vehicle Registration',
  test_date: 'Test Date',
  valid_until: 'Valid Until',
  reading_values: 'Reading Values',
  permit_number: 'Permit Number',
  route_area: 'Route / Area',
  tax_amount: 'Tax Amount',
  permit_type: 'Permit Type',
  issued_by: 'Issued By',
  route: 'Route',
  valid_from: 'Valid From',
  receipt_number: 'Receipt Number',
  tax_type: 'Tax Type',
  amount: 'Amount',
  period_from: 'Period From',
  period_to: 'Period To',
  badge_number: 'Badge Number',
  employee_id: 'Employee ID',
  certificate_authority: 'Certificate Authority',
  doctor_name: 'Doctor Name',
  blood_group: 'Blood Group',
  medical_remarks: 'Medical Remarks',
  aadhaar_number: 'Aadhaar Number',
  address: 'Address',
  pan_number: 'PAN Number',
  name: 'Name',
  gstin: 'GSTIN',
  legal_name: 'Legal Name',
  trade_name: 'Trade Name',
  registration_type: 'Registration Type',
  state: 'State',
  pincode: 'Pincode',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  rc: 'Registration Certificate',
  insurance: 'Insurance Policy',
  fitness: 'Fitness Certificate',
  driving_license: 'Driving License',
  puc: 'Pollution Under Control',
  permit: 'Vehicle Permit',
  tax_receipt: 'Tax Receipt',
  driver_badge: 'Driver Badge',
  medical_fitness: 'Medical Fitness Certificate',
  aadhaar: 'Aadhaar Card',
  pan_card: 'PAN Card',
  gst_certificate: 'GST Certificate',
  invoice: 'Invoice',
  eway_bill: 'E-Way Bill',
  lr_copy: 'LR Copy',
  contract: 'Contract',
  pod: 'Proof of Delivery',
  other: 'Document',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function maskValue(field: string, value: string): string {
  if (!value) return '';
  if (field === 'aadhaar_number') return `XXXX XXXX ${value.slice(-4)}`;
  if (field === 'pan_number') return `XXXXX${value.slice(5, 9)}X`;
  return value;
}

function renderFieldValue(field: string, value: any, masked: boolean): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-400 italic">—</span>;
  }

  if (field === 'license_classes' && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((cls: string, i: number) => (
          <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            {cls}
          </span>
        ))}
      </div>
    );
  }

  if (field === 'reading_values' && typeof value === 'object') {
    return (
      <div className="space-y-0.5">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <span className="text-gray-500 min-w-20">{k.replace(/_/g, ' ')}:</span>
            <span className="font-mono text-gray-800">{String(v)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (field === 'fitness_status') {
    const fit = String(value).toLowerCase().includes('fit');
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${fit ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        {String(value)}
      </span>
    );
  }

  const strVal = String(value);
  if (MASKED_FIELDS.has(field) && masked) {
    return <span className="font-mono text-gray-800">{maskValue(field, strVal)}</span>;
  }
  return <span className="text-gray-800">{strVal}</span>;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DocumentUploadWithExtraction({
  documentType,
  entityType,
  entityId,
  label,
  description,
  isRequired = false,
  onExtracted,
  onSaved,
  onClose,
}: Props) {
  const [state, setState] = useState<UploadState>('idle');
  const [error, setError] = useState<string>('');
  const [extractionWarning, setExtractionWarning] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [editedData, setEditedData] = useState<Record<string, any>>({});
  const [maskedFields, setMaskedFields] = useState<Set<string>>(new Set(MASKED_FIELDS));
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docLabel = label ?? DOC_TYPE_LABELS[documentType] ?? documentType;

  // ── File handlers ─────────────────────────────────────────────────────────

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setError('');
    setExtractionWarning('');
    // Always upload directly — no frontend extraction step
    setState('saving');
    await saveDocument(f, {});
  }, [documentType, entityType]);

  const onDropZone = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  // ── Save handler ──────────────────────────────────────────────────────────

  const saveDocument = async (docFile: File, data: Record<string, any>) => {
    setState('saving');
    try {
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('document_type', documentType);
      fd.append('entity_type', entityType);
      if (entityId != null) fd.append('entity_id', String(entityId));
      fd.append('title', docLabel);
      if (Object.keys(data).length > 0) {
        fd.append('extracted_data', JSON.stringify(data));
      }

      const saved = await documentService.uploadFile(fd);
      setState('saved');
      if (onSaved) onSaved(saved);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Upload failed');
      setState('error');
    }
  };

  const handleConfirmSave = () => {
    if (file) saveDocument(file, editedData);
  };

  // ── Field edit handler ────────────────────────────────────────────────────

  const handleFieldChange = (key: string, value: string) => {
    setEditedData(prev => ({ ...prev, [key]: value }));
  };

  const toggleMask = (field: string) => {
    setMaskedFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  // ── Render panels ─────────────────────────────────────────────────────────

  if (state === 'saved') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle size={24} className="text-green-600" />
        </div>
        <p className="font-medium text-gray-800">{docLabel} uploaded successfully</p>
        <p className="text-sm text-gray-500">Document has been saved{entityId ? ' and linked to this record' : ''}.</p>
        {onClose && (
          <button onClick={onClose} className="mt-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            Close
          </button>
        )}
      </div>
    );
  }

  if (state === 'extracting') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Loader2 size={32} className="animate-spin text-blue-500" />
        <div className="text-center">
          <p className="font-medium text-gray-700">Extracting data from document…</p>
          <p className="text-sm text-gray-400 mt-1">AI is reading {file?.name}</p>
        </div>
        {/* Skeleton rows */}
        <div className="w-full max-w-sm space-y-2 mt-2">
          {[120, 90, 110, 95, 130].map(w => (
            <div key={w} className="h-4 rounded animate-pulse bg-gray-100" style={{ width: `${w}px` }} />
          ))}
        </div>
      </div>
    );
  }

  if (state === 'saving') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 size={28} className="animate-spin text-blue-500" />
        <p className="text-gray-600">Saving document…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
          <AlertCircle size={24} className="text-red-500" />
        </div>
        <div className="text-center">
          <p className="font-medium text-red-700">Something went wrong</p>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
        </div>
        <button
          onClick={() => { setState('idle'); setFile(null); setError(''); }}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );
  }

  if (state === 'review') {
    const fields = Object.entries(editedData).filter(([, v]) => v !== null && v !== undefined && v !== '');
    return (
      <div className="space-y-4">
        {/* Step 2 banner — always visible */}
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-600 shrink-0" />
            <p className="text-sm font-medium text-green-800">
              {fields.length > 0 ? 'Data extracted — review below, then save.' : 'File ready — click Save Document to upload.'}
            </p>
          </div>
          <button
            onClick={handleConfirmSave}
            disabled={!entityId}
            className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save Document
          </button>
        </div>

        {extractionWarning && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-700">
              Extraction unavailable. You can still upload this document manually.
            </p>
            <p className="text-xs text-amber-600 mt-1">{extractionWarning}</p>
          </div>
        )}

        {/* File info bar */}
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <FileText size={16} className="text-blue-600 shrink-0" />
          <span className="text-sm text-blue-800 truncate flex-1">{file?.name}</span>
          <button
            onClick={() => { setState('idle'); setFile(null); setExtractionWarning(''); }}
            className="text-blue-400 hover:text-blue-600 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {fields.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-gray-500 text-sm">No data could be extracted. Review the document manually.</p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Extracted Data — review and correct if needed
            </p>
            <div className="space-y-3">
              {fields.map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-500">
                      {FIELD_LABELS[key] ?? key.replace(/_/g, ' ')}
                    </label>
                    {MASKED_FIELDS.has(key) && (
                      <button
                        onClick={() => toggleMask(key)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {maskedFields.has(key) ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                    )}
                  </div>
                  {key === 'license_classes' || key === 'reading_values' || key === 'fitness_status' ? (
                    <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                      {renderFieldValue(key, value, maskedFields.has(key))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={MASKED_FIELDS.has(key) && maskedFields.has(key)
                        ? maskValue(key, String(value ?? ''))
                        : String(editedData[key] ?? '')}
                      readOnly={MASKED_FIELDS.has(key) && maskedFields.has(key)}
                      onChange={e => handleFieldChange(key, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => { setState('idle'); setFile(null); setExtractionWarning(''); }}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmSave}
            disabled={!entityId}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save Document <ChevronRight size={14} />
          </button>
        </div>
        {!entityId && (
          <p className="text-xs text-amber-600 text-center">
            Save the record first before uploading documents.
          </p>
        )}
      </div>
    );
  }

  // idle state — drop zone
  return (
    <div className="space-y-3">
      {description && (
        <p className="text-sm text-gray-500">{description}</p>
      )}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDropZone}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
          ${dragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={onInputChange}
        />
        <Upload size={28} className={`mx-auto mb-3 ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} />
        <p className="text-sm font-medium text-gray-700">
          {isRequired ? (
            <><span className="text-red-500">*</span> {docLabel}</>
          ) : docLabel}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {SYSTEM_GENERATED_TYPES.has(documentType)
            ? 'Click or drag to upload (PDF / image)'
            : 'Click or drag to upload — AI will extract the details'}
        </p>
        <p className="text-xs text-gray-300 mt-2">Max 10 MB · PDF or image</p>
      </div>
    </div>
  );
}

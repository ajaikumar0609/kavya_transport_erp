// ============================================================
// Create LR Page — Enterprise-Grade Transport ERP
// Lorry Receipt / Consignment Note creation with multi-item
// support, auto-calculations, GST, Print/PDF, validation,
// Draft/Generate workflow, permission-based rendering
// ============================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { lrService, clientService, jobService, documentService, marketTripService } from '@/services/dataService';
import api from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { safeArray } from '@/utils/helpers';
import {
  ChevronRight, Save, FileCheck, ArrowLeft, FileText, Package,
  MapPin, Truck, IndianRupee, StickyNote, Printer, Download,
  AlertCircle, CheckCircle2, XCircle, User, Phone, Hash,
  Loader2, Calendar, Building2, Shield, Upload,
  ChevronDown, Plus, Trash2, Copy, ReceiptText
} from 'lucide-react';

// ── Types ──
interface FormErrors { [key: string]: string; }

interface VehicleOption {
  id: number;
  registration_number: string;
  vehicle_type?: string;
  capacity_tons?: number;
  status?: string;
  driver?: {
    id: number;
    name: string;
    phone?: string;
    license_number?: string;
  } | null;
}

interface DriverOption {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  user_id?: number;
  license_number?: string;
  license_type?: string;
  status?: string;
}

interface ConsignmentItem {
  id: string;
  description: string;
  hsn_code: string;
  packages: number;
  package_type: string;
  quantity: number;
  quantity_unit: string;
  actual_weight: number;
  charged_weight: number;
  rate: number;
  amount: number;
  invoice_number: string;
  invoice_date: string;
  invoice_value: number;
}

// ── Constants ──
const PAYMENT_MODES = [
  { value: 'to_pay', label: 'To Pay', description: 'Receiver pays freight' },
  { value: 'paid', label: 'Paid', description: 'Sender paid freight' },
  { value: 'to_be_billed', label: 'To Be Billed', description: 'Invoice later' },
  { value: 'fod', label: 'FOD', description: 'Freight on Delivery' },
];

const GST_OPTIONS = [
  { value: 0, label: 'No GST (0%)' },
  { value: 5, label: 'GST 5%' },
  { value: 12, label: 'GST 12%' },
  { value: 18, label: 'GST 18%' },
  { value: 28, label: 'GST 28%' },
];

const DEFAULT_COMPANY_CONSIGNOR = {
  name: 'Kavya Transports',
  address: 'Kavya Transports Depot, Chennai',
  gstin: '33AABCK1234M1ZP',
  phone: '9876543210',
};

const DEFAULT_COMPANY_ORIGIN = {
  city: 'Chennai',
  state: 'Tamil Nadu',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft:     { label: 'Draft',          color: 'text-gray-700',    bg: 'bg-gray-100 border-gray-300',    icon: <FileText size={14} /> },
  generated: { label: 'Generated',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-300', icon: <CheckCircle2 size={14} /> },
  in_transit:{ label: 'In Transit',     color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-300',     icon: <Truck size={14} /> },
  delivered: { label: 'Delivered',       color: 'text-green-700',   bg: 'bg-green-50 border-green-300',   icon: <CheckCircle2 size={14} /> },
  cancelled: { label: 'Cancelled',      color: 'text-red-700',     bg: 'bg-red-50 border-red-300',       icon: <XCircle size={14} /> },
  linked:    { label: 'Linked to Trip', color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-300', icon: <Truck size={14} /> },
};

const EMPTY_ITEM: ConsignmentItem = {
  id: crypto.randomUUID(),
  description: '',
  hsn_code: '',
  packages: 1,
  package_type: 'boxes',
  quantity: 0,
  quantity_unit: 'kgs',
  actual_weight: 0,
  charged_weight: 0,
  rate: 0,
  amount: 0,
  invoice_number: '',
  invoice_date: '',
  invoice_value: 0,
};

const INITIAL_FORM = {
  lr_date: new Date().toISOString().split('T')[0],
  job_id: 0,

  // Consignor
  consignor_name: DEFAULT_COMPANY_CONSIGNOR.name,
  consignor_address: DEFAULT_COMPANY_CONSIGNOR.address,
  consignor_gstin: DEFAULT_COMPANY_CONSIGNOR.gstin,
  consignor_phone: DEFAULT_COMPANY_CONSIGNOR.phone,

  // Consignee
  consignee_name: '',
  consignee_address: '',
  consignee_gstin: '',
  consignee_phone: '',

  // Route (auto-fetched from job)
  origin: DEFAULT_COMPANY_ORIGIN.city,
  origin_state: DEFAULT_COMPANY_ORIGIN.state,
  destination: '',
  destination_state: '',

  // E-way Bill
  eway_bill_number: '',
  eway_bill_date: '',
  eway_bill_valid_until: '',

  // Vehicle & Driver
  vehicle_id: 0,
  vehicle_number: '',
  driver_id: 0,
  driver_name: '',
  driver_phone: '',
  driver_license: '',

  // Freight & Charges
  payment_mode: 'to_be_billed',
  freight_amount: 0,
  loading_charges: 0,
  unloading_charges: 0,
  detention_charges: 0,
  other_charges: 0,
  gst_percentage: 5,

  // Insurance
  insurance_company: '',
  insurance_policy_number: '',
  insurance_amount: 0,

  // Declared value
  declared_value: 0,

  // Notes
  remarks: '',
  special_instructions: '',

  // Status
  status: 'draft',
};

// ── Steps Config ──
const STEPS = [
  { number: 1, title: 'Parties',   subtitle: 'LR Date & Parties' },
  { number: 2, title: 'Route',     subtitle: 'Route & E-way Bill' },
  { number: 3, title: 'Cargo',     subtitle: 'Consignment & Charges' },
  { number: 4, title: 'Vehicle',   subtitle: 'Vehicle & Driver' },
  { number: 5, title: 'Documents', subtitle: 'Docs & Notes' },
];

// ── Step Indicator Component ──
function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-4">
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => (
          <div key={step.number} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                step.number < currentStep
                  ? 'bg-emerald-500 text-white'
                  : step.number === currentStep
                  ? 'bg-primary-600 text-white ring-4 ring-primary-100'
                  : 'bg-gray-100 text-gray-400'
              }`}>
                {step.number < currentStep ? <CheckCircle2 size={18} /> : step.number}
              </div>
              <div className="mt-1.5 text-center hidden sm:block">
                <p className={`text-xs font-semibold ${step.number === currentStep ? 'text-primary-600' : step.number < currentStep ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {step.title}
                </p>
                <p className="text-[10px] text-gray-400">{step.subtitle}</p>
              </div>
            </div>
            {index < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 transition-colors ${step.number < currentStep ? 'bg-emerald-400' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section Card Component ──
function SectionCard({
  title, subtitle, icon, children, collapsible = false, defaultOpen = true, badge,
}: {
  title: string; subtitle?: string; icon: React.ReactNode; children: React.ReactNode;
  collapsible?: boolean; defaultOpen?: boolean; badge?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-visible">
      <button
        type="button"
        onClick={() => collapsible && setIsOpen(!isOpen)}
        className={`w-full px-6 py-4 flex items-center gap-3 border-b border-gray-100 ${
          collapsible ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'
        }`}
      >
        <div className="p-2 rounded-lg bg-primary-50 text-primary-600">{icon}</div>
        <div className="flex-1 text-left">
          <h3 className="font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {badge}
        {collapsible && (
          <ChevronDown size={18} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>
      {isOpen && <div className="p-6">{children}</div>}
    </div>
  );
}

// ── Form Field Components ──
function FormField({ label, required, error, hint, children, className = '' }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text', error, disabled, prefix, suffix, onKeyDown }: {
  value: string | number | null | undefined; onChange: (v: string) => void; placeholder?: string; type?: string;
  error?: boolean; disabled?: boolean; prefix?: React.ReactNode; suffix?: React.ReactNode; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const normalizedValue = value ?? '';

  return (
    <div className={`flex items-center border rounded-lg transition-colors ${
      error ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-300 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-200'
    } ${disabled ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
      {prefix && <div className="pl-3 text-gray-400">{prefix}</div>}
      <input type={type} value={normalizedValue} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        disabled={disabled} onKeyDown={onKeyDown} className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none placeholder-gray-400" />
      {suffix && <div className="pr-3 text-gray-400 text-sm">{suffix}</div>}
    </div>
  );
}

function SelectInput({ value, onChange, options, placeholder, error, disabled }: {
  value: string | number; onChange: (v: string) => void;
  options: { id?: string | number; value?: string | number; name?: string; label: string }[]; placeholder?: string; error?: boolean; disabled?: boolean;
}) {
  const getOptionKey = (option: { id?: string | number; value?: string | number; name?: string }, index: number) => {
    if (option.id !== undefined && option.id !== null && option.id !== '') return `id-${String(option.id)}`;
    if (option.value !== undefined && option.value !== null && option.value !== '') return `value-${String(option.value)}`;
    if (option.name) return `name-${option.name}`;
    return `idx-${index}`;
  };

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
      className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-white outline-none transition-colors appearance-none ${
        error ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-200'
      } ${disabled ? 'bg-gray-50 opacity-60' : ''}`}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o, idx) => <option key={getOptionKey(o, idx)} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function TextArea({ value, onChange, placeholder, rows = 3, error, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; error?: boolean; disabled?: boolean;
}) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} disabled={disabled}
      className={`w-full px-3 py-2.5 text-sm border rounded-lg resize-none outline-none transition-colors ${
        error ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-200'
      } ${disabled ? 'bg-gray-50 opacity-60' : 'bg-white'}`} />
  );
}

// ── Market OCR Upload (used in Market Trip mode) ──
function MarketOcrUpload({ label, docType, onExtracted, fileUrl, isLoading, setLoading }: {
  label: string; docType: string; onExtracted: (data: Record<string, any>, url: string) => void;
  fileUrl: string; isLoading: boolean; setLoading: (v: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('document_type', docType);
      fd.append('entity_type', 'market_trip');
      const result = await documentService.extract(fd);
      const extracted = result?.data ?? result;
      let storedUrl = '';
      try {
        const upFd = new FormData();
        upFd.append('file', file);
        upFd.append('document_type', docType);
        upFd.append('entity_type', 'market_trip');
        const up = await documentService.uploadFile(upFd);
        storedUrl = (up as any)?.file_url ?? (up as any)?.url ?? '';
      } catch { /* non-critical */ }
      onExtracted(extracted, storedUrl);
      toast.success('Details extracted!');
    } catch (err: any) {
      toast.error(err?.message ?? 'Extraction failed — fill manually');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={isLoading}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 border-dashed transition-colors
          ${fileUrl ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-orange-400 hover:bg-orange-50'}
          disabled:opacity-60`}>
        {isLoading ? <Loader2 size={16} className="text-orange-500 animate-spin flex-shrink-0" />
          : fileUrl ? <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
            : <Upload size={16} className="text-gray-400 flex-shrink-0" />}
        <div className="text-left">
          <p className={`text-sm font-medium ${fileUrl ? 'text-green-700' : 'text-gray-600'}`}>
            {isLoading ? 'Extracting…' : fileUrl ? `${label} uploaded ✓` : `Upload ${label} for auto-fill`}
          </p>
          <p className="text-xs text-gray-400">JPG, PNG or PDF</p>
        </div>
      </button>
    </div>
  );
}

// ── Main Page Component ──
export default function CreateLRPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;
  const { user } = useAuthStore();
  const linkedJobId = Number(searchParams.get('job_id') || searchParams.get('jobId') || searchParams.get('job') || 0);

  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [items, setItems] = useState<ConsignmentItem[]>([{ ...EMPTY_ITEM }]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<DriverOption | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number>(0);
  const [lastClientItems, setLastClientItems] = useState<ConsignmentItem[]>([]);
  const [createdLrId, setCreatedLrId] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [vehicleMode, setVehicleMode] = useState<'fleet' | 'market'>('fleet');
  const [selectedMarketTrip, setSelectedMarketTrip] = useState<number>(0);
  const [mktRcLoading, setMktRcLoading] = useState(false);
  const [mktDlLoading, setMktDlLoading] = useState(false);
  const [mktVehicle, setMktVehicle] = useState({ vehicle_registration: '', vehicle_type: '', fuel_type: '', vehicle_make: '', vehicle_model: '', year_of_manufacture: '', chassis_number: '', engine_number: '', owner_phone: '', rc_file_url: '', owner_name: '', vehicle_class: '', rc_issue_date: '', rc_validity_date: '' });
  const [mktDriver, setMktDriver] = useState({ driver_name: '', driver_phone: '', driver_alt_phone: '', driver_address: '', driver_license: '', driver_license_issue: '', driver_license_valid: '', dl_file_url: '' });

  // ── Data Queries ──
  const { data: nextLrNumber } = useQuery({
    queryKey: ['next-lr-number'],
    queryFn: () => lrService.getNextLRNumber(),
    enabled: !isEdit,
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ['lr-lookup-vehicles'],
    queryFn: () => lrService.getVehicles(),
    throwOnError: false,
    meta: { suppressErrorToast: true },
  });

  const { data: driversData } = useQuery({
    queryKey: ['lr-lookup-drivers'],
    queryFn: () => lrService.getDrivers(),
    throwOnError: false,
    meta: { suppressErrorToast: true },
  });

  const { data: usersData } = useQuery({
    queryKey: ['lr-lookup-driver-users'],
    queryFn: () => api.get('/users', { suppressErrorToast: true } as any),
    retry: false,
    throwOnError: false,
  });

  const { data: quantityUnitsData } = useQuery({
    queryKey: ['lr-lookup-quantity-units'],
    queryFn: () => lrService.getQuantityUnits(),
  });

  const { data: clientsData } = useQuery({
    queryKey: ['lr-lookup-clients'],
    queryFn: () => clientService.list({ page: 1, limit: 200 } as any),
    throwOnError: false,
    meta: { suppressErrorToast: true },
  });

  // Load existing LR for edit
  useEffect(() => {
    if (isEdit && id) {
      lrService.get(parseInt(id)).then((lr: any) => {
        setForm({
          lr_date: lr.lr_date || INITIAL_FORM.lr_date,
          job_id: lr.job_id || 0,
          consignor_name: lr.consignor_name || '',
          consignor_address: lr.consignor_address || '',
          consignor_gstin: lr.consignor_gstin || '',
          consignor_phone: lr.consignor_phone || '',
          consignee_name: lr.consignee_name || '',
          consignee_address: lr.consignee_address || '',
          consignee_gstin: lr.consignee_gstin || '',
          consignee_phone: lr.consignee_phone || '',
          origin: lr.origin || '',
          origin_state: lr.origin_state || '',
          destination: lr.destination || '',
          destination_state: lr.destination_state || '',
          eway_bill_number: lr.eway_bill_number || '',
          eway_bill_date: lr.eway_bill_date || '',
          eway_bill_valid_until: lr.eway_bill_valid_until || '',
          vehicle_id: lr.vehicle_id || 0,
          vehicle_number: lr.vehicle_number || '',
          driver_id: lr.driver_id || 0,
          driver_name: lr.driver_name || '',
          driver_phone: lr.driver_phone || '',
          driver_license: lr.driver_license || '',
          payment_mode: lr.payment_mode || 'to_be_billed',
          freight_amount: lr.freight_amount || 0,
          loading_charges: lr.loading_charges || 0,
          unloading_charges: lr.unloading_charges || 0,
          detention_charges: lr.detention_charges || 0,
          other_charges: lr.other_charges || 0,
          gst_percentage: lr.gst_percentage ?? 5,
          insurance_company: lr.insurance_company || '',
          insurance_policy_number: lr.insurance_policy_number || '',
          insurance_amount: lr.insurance_amount || 0,
          declared_value: lr.declared_value || 0,
          remarks: lr.remarks || '',
          special_instructions: lr.special_instructions || '',
          status: lr.status || 'draft',
        });
        if (lr.items && lr.items.length > 0) {
          setItems(lr.items.map((it: any) => ({
            id: crypto.randomUUID(),
            description: it.description || '',
            hsn_code: it.hsn_code || '',
            packages: it.packages || 1,
            package_type: it.package_type || 'boxes',
            quantity: it.quantity || 0,
            quantity_unit: it.quantity_unit || 'kgs',
            actual_weight: it.actual_weight || 0,
            charged_weight: it.charged_weight || 0,
            rate: it.rate || 0,
            amount: it.amount || 0,
            invoice_number: it.invoice_number || '',
            invoice_date: it.invoice_date || '',
            invoice_value: it.invoice_value || 0,
          })));
        }
        setCreatedLrId(parseInt(id));
      }).catch(() => { navigate('/lr'); });
    }
  }, [isEdit, id, navigate]);

  // LR is now expected to be opened from Jobs / Orders with a linked job id.
  useEffect(() => {
    if (!isEdit && linkedJobId > 0 && !form.job_id) {
      setForm((prev) => ({ ...prev, job_id: linkedJobId }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next.job_id;
        return next;
      });
    }
  }, [isEdit, linkedJobId, form.job_id]);

  // Auto-generate E-way bill number for new LRs
  useEffect(() => {
    if (!isEdit && !form.eway_bill_number) {
      lrService.getNextEwayNumber().then((num) => {
        if (num) setForm((prev) => ({ ...prev, eway_bill_number: num }));
      }).catch(() => {
        // fallback: leave empty for manual entry
      });
    }
  }, [isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch last consignment items for the selected client and store as suggestions
  useEffect(() => {
    if (!selectedClientId || isEdit) { setLastClientItems([]); return; }

    const selectedClient = clients.find((c: any) => Number(c.id) === selectedClientId);
    if (!selectedClient) { setLastClientItems([]); return; }

    lrService.list({ search: selectedClient.name, limit: 5 } as any)
      .then((res: any) => {
        const lrList: any[] = res?.items ?? res?.data?.items ?? (Array.isArray(res) ? res : []);
        const lastLr = lrList.find(
          (lr: any) =>
            String(lr.consignee_name || '').toLowerCase().includes(selectedClient.name.toLowerCase()) &&
            lr.items && lr.items.length > 0
        );
        if (!lastLr) { setLastClientItems([]); return; }
        const suggestions: ConsignmentItem[] = lastLr.items.map((it: any) => ({
          id: crypto.randomUUID(),
          description: it.description || '',
          hsn_code: it.hsn_code || '',
          packages: it.packages || 1,
          package_type: it.package_type || 'boxes',
          quantity: it.quantity || 0,
          quantity_unit: it.quantity_unit || 'kgs',
          actual_weight: it.actual_weight || 0,
          charged_weight: it.charged_weight || 0,
          rate: it.rate || 0,
          amount: it.amount || 0,
          invoice_number: '',
          invoice_date: '',
          invoice_value: 0,
        }));
        setLastClientItems(suggestions);
        toast(`Last order data available — press Space in empty fields to auto-fill`, { icon: '💡', duration: 4000 });
      })
      .catch(() => { setLastClientItems([]); });
  }, [selectedClientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: get suggestion value for an item field from last client order
  const getSuggestion = useCallback((index: number, field: keyof ConsignmentItem): string => {
    const s = lastClientItems[index];
    if (!s) return '';
    const val = s[field];
    if (val === undefined || val === null || val === '' || val === 0) return '';
    return String(val);
  }, [lastClientItems]);

  // ── Helpers ──
  const updateField = useCallback((field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }, []);

  const updateItem = useCallback((itemId: string, field: string, value: any) => {
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const updated = { ...it, [field]: value };
      // Auto-calculate amount = rate * charged_weight
      if (field === 'rate' || field === 'charged_weight') {
        const rate = field === 'rate' ? parseFloat(String(value)) || 0 : it.rate;
        const cw = field === 'charged_weight' ? parseFloat(String(value)) || 0 : it.charged_weight;
        updated.amount = Math.round(rate * cw * 100) / 100;
      }
      return updated;
    }));
  }, []);

  // Helper: handle Space key to auto-fill from suggestion
  const handleSuggestionKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, itemId: string, field: string, index: number) => {
    if (e.key !== ' ') return;
    const input = e.currentTarget;
    if (input.value && String(input.value) !== '0') return; // only auto-fill if field is empty or zero
    const suggestion = getSuggestion(index, field as keyof ConsignmentItem);
    if (!suggestion) return;
    e.preventDefault();
    const isNumeric = ['packages', 'actual_weight', 'charged_weight', 'rate', 'amount', 'quantity', 'invoice_value'].includes(field);
    updateItem(itemId, field, isNumeric ? parseFloat(suggestion) || 0 : suggestion);
  }, [getSuggestion, updateItem]);

  const addItem = useCallback(() => {
    setItems(prev => [...prev, { ...EMPTY_ITEM, id: crypto.randomUUID() }]);
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems(prev => prev.length > 1 ? prev.filter(it => it.id !== itemId) : prev);
  }, []);

  const duplicateItem = useCallback((itemId: string) => {
    setItems(prev => {
      const src = prev.find(it => it.id === itemId);
      if (!src) return prev;
      return [...prev, { ...src, id: crypto.randomUUID() }];
    });
  }, []);

  const selectVehicle = useCallback((vehicle: VehicleOption) => {
    setSelectedVehicle(vehicle);
    updateField('vehicle_id', vehicle.id);
    updateField('vehicle_number', vehicle.registration_number);
    // Auto-fill driver from vehicle's last assigned driver
    if (vehicle.driver) {
      const d = vehicle.driver;
      setSelectedDriver({ id: d.id, name: d.name, phone: d.phone, license_number: d.license_number });
      updateField('driver_id', d.id);
      updateField('driver_name', d.name || '');
      updateField('driver_phone', d.phone || '');
      updateField('driver_license', d.license_number || '');
    }
  }, [updateField]);

  const selectDriver = useCallback((driver: DriverOption) => {
    setSelectedDriver(driver);
    updateField('driver_id', driver.id);
    updateField('driver_name', driver.name || '');
    updateField('driver_phone', driver.phone || '');
    updateField('driver_license', driver.license_number || '');
  }, [updateField]);

  // ── Per-Step Validation ──
  const validateStep = useCallback((step: number): boolean => {
    const e: FormErrors = {};
    if (step === 1) {
      if (!form.consignor_name.trim()) e.consignor_name = 'Consignor name is required';
      if (!form.consignee_name.trim()) e.consignee_name = 'Consignee name is required';
    } else if (step === 2) {
      if (!form.origin.trim()) e.origin = 'Origin is required';
      if (!form.destination.trim()) e.destination = 'Destination is required';
    }
    setErrors(prev => ({ ...prev, ...e }));
    if (Object.keys(e).length > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
    return Object.keys(e).length === 0;
  }, [form]);

  // ── Price Calculations ──
  const priceSummary = useMemo(() => {
    const freight = parseFloat(String(form.freight_amount)) || 0;
    const loading = parseFloat(String(form.loading_charges)) || 0;
    const unloading = parseFloat(String(form.unloading_charges)) || 0;
    const detention = parseFloat(String(form.detention_charges)) || 0;
    const other = parseFloat(String(form.other_charges)) || 0;
    const subtotal = freight + loading + unloading + detention + other;
    const gstPct = parseFloat(String(form.gst_percentage)) || 0;
    const gstAmount = Math.round(subtotal * gstPct) / 100;
    const total = Math.round((subtotal + gstAmount) * 100) / 100;
    return { freight, loading, unloading, detention, other, subtotal, gstPct, gstAmount, total };
  }, [form.freight_amount, form.loading_charges, form.unloading_charges, form.detention_charges, form.other_charges, form.gst_percentage]);

  // ── Item Totals ──
  const itemTotals = useMemo(() => {
    let totalPackages = 0, totalWeight = 0, totalChargedWeight = 0, totalInvoiceValue = 0;
    for (const item of items) {
      totalPackages += (parseFloat(String(item.packages)) || 0);
      totalWeight += (parseFloat(String(item.actual_weight)) || 0);
      totalChargedWeight += (parseFloat(String(item.charged_weight)) || 0);
      totalInvoiceValue += (parseFloat(String(item.invoice_value)) || 0);
    }
    return { totalPackages, totalWeight: Math.round(totalWeight * 1000) / 1000, totalChargedWeight: Math.round(totalChargedWeight * 1000) / 1000, totalInvoiceValue: Math.round(totalInvoiceValue * 100) / 100 };
  }, [items]);

  // ── Validation ──
  const validate = useCallback((asDraft: boolean, currentForm = form): boolean => {
    const f = currentForm;
    const e: FormErrors = {};
    if (!f.job_id) e.job_id = 'No valid job found for this LR';
    if (!f.consignor_name.trim()) e.consignor_name = 'Consignor name is required';
    if (!f.consignee_name.trim()) e.consignee_name = 'Consignee name is required';
    if (!f.origin.trim()) e.origin = 'Origin is required';
    if (!f.destination.trim()) e.destination = 'Destination is required';

    if (!asDraft) {
      // Stricter validation for Generate
      if (items.length === 0 || !items[0].description.trim()) {
        e.items = 'At least one consignment item with description is required';
      }
      if (!f.freight_amount || f.freight_amount <= 0) {
        e.freight_amount = 'Freight amount must be greater than 0';
      }
      if (f.consignor_gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}[A-Z]{1}[A-Z\d]{1}$/.test(f.consignor_gstin)) {
        e.consignor_gstin = 'Invalid GSTIN format';
      }
      if (f.consignee_gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}[A-Z]{1}[A-Z\d]{1}$/.test(f.consignee_gstin)) {
        e.consignee_gstin = 'Invalid GSTIN format';
      }
      if (f.eway_bill_number && f.eway_bill_number.length < 12) {
        e.eway_bill_number = 'E-way bill number must be 12 digits';
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form, items]);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (payload: any) => lrService.create(payload),
    onSuccess: (data) => {
      setCreatedLrId(data.id);
      updateField('status', data.status);
    },
  });

  const generateMutation = useMutation({
    mutationFn: (lrId: number) => lrService.generate(lrId),
    onSuccess: () => {
      updateField('status', 'generated');
    },
  });

  // ── Save Handler ──
  const handleSave = useCallback(async (action: 'draft' | 'generate') => {
    const asDraft = action === 'draft';
    let workingForm = form;

    // If LR has no linked job, create one from current LR details so it appears in Jobs / Orders.
    if (!workingForm.job_id && selectedClientId) {
      try {
        const firstItem = items.find((it) => it.description.trim()) || items[0];
        const fallbackOriginAddress = [workingForm.consignor_address, workingForm.origin, workingForm.origin_state].filter(Boolean).join(', ');
        const fallbackDestinationAddress = [workingForm.consignee_address, workingForm.destination, workingForm.destination_state].filter(Boolean).join(', ');

        const jobPayload = {
          job_date: workingForm.lr_date,
          client_id: selectedClientId,
          origin_address: fallbackOriginAddress || workingForm.origin || 'Origin address',
          origin_city: workingForm.origin || 'Origin',
          origin_state: workingForm.origin_state || undefined,
          destination_address: fallbackDestinationAddress || workingForm.destination || 'Destination address',
          destination_city: workingForm.destination || 'Destination',
          destination_state: workingForm.destination_state || undefined,
          material_type: firstItem?.description || 'General Goods',
          quantity: Number(firstItem?.quantity || 0) || undefined,
          quantity_unit: firstItem?.quantity_unit || undefined,
          pickup_date: `${workingForm.lr_date}T00:00:00`,
          expected_delivery_date: `${workingForm.lr_date}T00:00:00`,
          agreed_rate: Number(workingForm.freight_amount || 0) || undefined,
          priority: 'NORMAL',
          contract_type: 'SPOT',
          job_type: 'OWN',
          rate_type: 'per_trip',
        };

        const createdJob: any = await jobService.create(jobPayload);
        const createdJobId = Number(createdJob?.data?.id ?? createdJob?.id ?? 0);
        if (createdJobId) {
          workingForm = { ...workingForm, job_id: createdJobId };
          setForm((prev) => ({ ...prev, job_id: createdJobId }));
        }
      } catch {
        // Keep existing flow; validation below will show clear message if job still missing.
      }
    }

    if (!validate(asDraft, workingForm)) {
      if (!workingForm.job_id) {
        toast.error('No valid job found. Select a client that has jobs.');
      } else {
        toast.error(asDraft ? 'Please fill required details for draft.' : 'Please complete required details before generating LR.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    try {
      const isMarket = vehicleMode === 'market';
      const payload = {
        ...workingForm,
        // Track transport type so LR list can separate fleet vs market trips
        transport_type: vehicleMode,
        // For market trips: vehicle_id and driver_id must be null (no fleet record)
        vehicle_id: isMarket ? null : (workingForm.vehicle_id || null),
        driver_id: isMarket ? null : (workingForm.driver_id || null),
        eway_bill_date: workingForm.eway_bill_date || null,
        eway_bill_valid_until: workingForm.eway_bill_valid_until || null,
        items: items.filter(it => it.description.trim()).map((it, idx) => ({
          item_number: idx + 1,
          description: it.description,
          hsn_code: it.hsn_code || null,
          packages: it.packages,
          package_type: it.package_type || null,
          quantity: it.quantity || null,
          quantity_unit: it.quantity_unit || null,
          actual_weight: it.actual_weight || null,
          charged_weight: it.charged_weight || null,
          rate: it.rate || null,
          amount: it.amount || null,
          invoice_number: it.invoice_number || null,
          invoice_date: it.invoice_date || null,
          invoice_value: it.invoice_value || null,
        })),
        status: 'draft',
      };

      let lrId = createdLrId;

      if (isEdit && lrId) {
        await lrService.update(lrId, payload);
      } else {
        const result = await createMutation.mutateAsync(payload);
        lrId = result.id;

        // Auto-create market trip so it shows in the Market Trips tab
        if (isMarket && workingForm.job_id) {
          try {
            await marketTripService.create({
              job_id: workingForm.job_id,
              supplier_id: undefined,
              client_rate: Number(workingForm.freight_amount) || 0,
              contractor_rate: 0,
              vehicle_registration: mktVehicle.vehicle_registration || undefined,
              vehicle_type: mktVehicle.vehicle_type || undefined,
              fuel_type: mktVehicle.fuel_type || undefined,
              vehicle_make: mktVehicle.vehicle_make || undefined,
              vehicle_model: mktVehicle.vehicle_model || undefined,
              year_of_manufacture: mktVehicle.year_of_manufacture ? Number(mktVehicle.year_of_manufacture) : undefined,
              chassis_number: mktVehicle.chassis_number || undefined,
              engine_number: mktVehicle.engine_number || undefined,
              rc_file_url: mktVehicle.rc_file_url || undefined,
              driver_name: mktDriver.driver_name || undefined,
              driver_phone: mktDriver.driver_phone || undefined,
              driver_alt_phone: mktDriver.driver_alt_phone || undefined,
              driver_address: mktDriver.driver_address || undefined,
              driver_license: mktDriver.driver_license || undefined,
              driver_license_issue: mktDriver.driver_license_issue || undefined,
              driver_license_valid: mktDriver.driver_license_valid || undefined,
              dl_file_url: mktDriver.dl_file_url || undefined,
            } as any);
          } catch {
            // Non-critical — LR is already created; market trip creation failure shouldn't block
          }
        }
      }

      if (action === 'generate' && lrId) {
        try {
          // Avoid calling /generate when the LR is already generated/advanced.
          const latestLr: any = await lrService.get(lrId);
          const latestStatus = String(latestLr?.status || '').toLowerCase();

          if (latestStatus === 'generated') {
            updateField('status', 'generated');
            toast.success('LR is already generated');
          } else if (['in_transit', 'delivered', 'linked'].includes(latestStatus)) {
            updateField('status', latestStatus as any);
            toast.error(`LR is already in '${latestStatus}' state and cannot be generated again.`);
            return;
          } else {
            try {
              // Prefer direct status update to avoid transition-map mismatch errors.
              await lrService.update(lrId, { status: 'generated' });
            } catch {
              // If update path fails, fallback to explicit generate endpoint.
              await generateMutation.mutateAsync(lrId);
            }
            updateField('status', 'generated');
            toast.success('LR generated successfully');
          }
        } catch (generateErr: any) {
          const detail = String(generateErr?.response?.data?.detail || '').toLowerCase();
          if (detail.includes('cannot transition from') && detail.includes('to') && detail.includes('generated')) {
            try {
              const latestLr: any = await lrService.get(lrId);
              const latestStatus = String(latestLr?.status || '').toLowerCase();
              if (latestStatus === 'generated') {
                updateField('status', 'generated');
                toast.success('LR is already generated');
              } else if (['in_transit', 'delivered', 'linked'].includes(latestStatus)) {
                updateField('status', latestStatus as any);
                toast.error(`LR is already in '${latestStatus}' state and cannot be generated again.`);
                return;
              } else {
                await lrService.update(lrId, { status: 'generated' });
                updateField('status', 'generated');
                toast.success('LR generated successfully');
              }
            } catch {
              throw generateErr;
            }
          } else {
            throw generateErr;
          }
        }
      } else {
        toast.success('LR saved as draft');
      }

      // Success — navigate or stay
      if (action === 'generate') {
        // Stay on page with generated status for print
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === 'string') {
        setErrors({ _server: detail });
        toast.error(detail);
      } else if (detail?.errors) {
        const message = detail.errors.join(', ');
        setErrors({ _server: message });
        toast.error(message);
      } else {
        toast.error('Failed to save LR');
      }
    } finally {
      setSaving(false);
    }
  }, [form, items, validate, isEdit, createdLrId, createMutation, generateMutation, selectedClientId]);

  // ── Print Handler ──
  const handlePrint = useCallback(async () => {
    if (!createdLrId) return;
    try {
      const printData = await lrService.print(createdLrId);
      // Open print window
      const printWindow = window.open('', '_blank', 'width=800,height=1100');
      if (!printWindow) return;
      printWindow.document.write(generatePrintHTML(printData));
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    } catch {
      alert('Failed to load print data');
    }
  }, [createdLrId]);

  // ── Permission Check ──
  const hasPermission = user?.permissions?.includes('lr:create') ||
    user?.roles?.some((r) => ['admin', 'manager', 'project_associate'].includes(r));

  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield size={48} className="mx-auto text-red-400 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
          <p className="text-gray-500 mt-2">You don't have permission to create Lorry Receipts.</p>
          <button onClick={() => navigate('/dashboard')} className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[form.status] || STATUS_CONFIG.draft;
  const isReadonly = form.status === 'generated' || form.status === 'cancelled';
  const quantityUnits = safeArray(quantityUnitsData);
  const vehicleOptions = safeArray<VehicleOption>(vehiclesData);
  const rawDriverOptions = safeArray<DriverOption>(driversData);
  const normalizePhone = (value?: string) => String(value || '').replace(/\D/g, '').slice(-10);
  const allUsers = safeArray<any>((usersData as any) || []);
  const driverUsers = allUsers.filter((u: any) => {
    const role = String(u?.role || '').toLowerCase();
    const roles = safeArray<string>(u?.roles).map((r) => String(r || '').toLowerCase());
    return role === 'driver' || roles.includes('driver');
  });
  const hasUsersCatalog = driverUsers.length > 0;
  const driverUserIds = new Set(driverUsers.map((u: any) => Number(u?.id)).filter((id) => Number.isFinite(id) && id > 0));
  const driverUserPhones = new Set(driverUsers.map((u: any) => normalizePhone(u?.phone)).filter(Boolean));
  const driverUserEmails = new Set(driverUsers.map((u: any) => String(u?.email || '').trim().toLowerCase()).filter(Boolean));

  let driverOptions = hasUsersCatalog
    ? rawDriverOptions.filter((d: any) => {
        const userId = Number(d?.user_id);
        if (Number.isFinite(userId) && driverUserIds.has(userId)) return true;
        const phone = normalizePhone(d?.phone);
        if (phone && driverUserPhones.has(phone)) return true;
        const email = String(d?.email || '').trim().toLowerCase();
        if (email && driverUserEmails.has(email)) return true;
        return false;
      })
    : rawDriverOptions;

  // Keep currently selected driver visible in edit/view flows even if it is legacy data.
  if (form.driver_id) {
    const selectedId = Number(form.driver_id);
    const exists = driverOptions.some((d) => Number(d.id) === selectedId);
    if (!exists) {
      const selectedRaw = rawDriverOptions.find((d) => Number(d.id) === selectedId);
      if (selectedRaw) {
        driverOptions = [selectedRaw, ...driverOptions];
      }
    }
  }
  const clients = safeArray<any>((clientsData as any)?.items ?? (clientsData as any)?.data?.items ?? clientsData);

  const currentVehicle = vehicleMode === 'fleet'
    ? (selectedVehicle || vehicleOptions.find((v) => Number(v.id) === Number(form.vehicle_id)) || null)
    : null;
  const currentDriver = vehicleMode === 'fleet'
    ? (selectedDriver || driverOptions.find((d) => Number(d.id) === Number(form.driver_id)) || null)
    : null;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <form onSubmit={(e) => e.preventDefault()} className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Breadcrumb ── */}
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link to="/dashboard" className="hover:text-primary-600">Dashboard</Link>
          <ChevronRight size={14} />
          <Link to="/lr" className="hover:text-primary-600">Lorry Receipts</Link>
          <ChevronRight size={14} />
          <span className="text-gray-900 font-medium">{isEdit ? 'Edit LR' : 'Create New LR'}</span>
        </nav>

        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/lr')} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50">
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">
                  {isEdit ? 'Edit Lorry Receipt' : 'Create Lorry Receipt'}
                </h1>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border ${statusInfo.bg} ${statusInfo.color}`}>
                  {statusInfo.icon} {statusInfo.label}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-mono font-semibold text-primary-600">
                  {isEdit ? `LR-${id}` : (nextLrNumber?.lr_number || 'LR-2026-XXXXX')}
                </span>
                <span className="mx-2">|</span>
                <span>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </p>
            </div>
          </div>

          {/* Print / Download when generated */}
          {(form.status === 'generated' && createdLrId) && (
            <div className="flex items-center gap-2">
              <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">
                <Printer size={16} /> Print LR
              </button>
              <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
                <Download size={16} /> Download PDF
              </button>
            </div>
          )}
        </div>

        {/* ── Step Indicator ── */}
        <StepIndicator currentStep={currentStep} />

        {/* Server error */}
        {errors._server && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-500 mt-0.5 shrink-0" />
            <div><p className="text-sm font-medium text-red-800">Error</p><p className="text-sm text-red-600">{errors._server}</p></div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
           STEP 1: LR Basic Details + Consignor + Consignee
        ══════════════════════════════════════════════════════ */}
        {currentStep === 1 && (
          <>
            <SectionCard title="LR Basic Details" subtitle="Set LR date" icon={<ReceiptText size={20} />}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <FormField label="LR Date" required className="md:col-span-1">
                  <TextInput type="date" value={form.lr_date} onChange={(v) => updateField('lr_date', v)}
                    disabled={isReadonly} prefix={<Calendar size={16} />} />
                </FormField>
              </div>
            </SectionCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Consignor */}
              <SectionCard title="Consignor (Sender)" subtitle="Party sending the goods" icon={<Building2 size={20} />}>
                <div className="space-y-4">
                  <FormField label="Name" required error={errors.consignor_name}>
                    <TextInput value={form.consignor_name} onChange={(v) => updateField('consignor_name', v)}
                      placeholder="Company / Person name" disabled={isReadonly} />
                  </FormField>
                  <FormField label="GSTIN" error={errors.consignor_gstin}>
                    <TextInput value={form.consignor_gstin} onChange={(v) => updateField('consignor_gstin', v.toUpperCase())}
                      placeholder="e.g. 27AABCU9603R1ZM" disabled={isReadonly} />
                  </FormField>
                  <FormField label="Address">
                    <TextArea value={form.consignor_address} onChange={(v) => updateField('consignor_address', v)}
                      placeholder="Full address" rows={2} disabled={isReadonly} />
                  </FormField>
                  <FormField label="Phone">
                    <TextInput value={form.consignor_phone} onChange={(v) => updateField('consignor_phone', v)}
                      placeholder="Contact number" disabled={isReadonly} prefix={<Phone size={14} />} />
                  </FormField>
                </div>
              </SectionCard>

              {/* Consignee */}
              <SectionCard title="Consignee (Receiver)" subtitle="Party receiving the goods" icon={<User size={20} />}>
                <div className="space-y-4">
                  <FormField label="Select Client">
                    <SelectInput
                      value={selectedClientId || ''}
                      onChange={(v) => {
                        const clientId = parseInt(v, 10) || 0;
                        setSelectedClientId(clientId);
                        if (!clientId) return;
                        const selectedClient = clients.find((c: any) => Number(c.id) === clientId);
                        if (!selectedClient) return;
                        updateField('consignee_name', selectedClient.name || '');
                        updateField('consignee_gstin', selectedClient.gstin || selectedClient.gst_number || '');
                        updateField('consignee_phone', selectedClient.phone || '');
                        updateField('consignee_address', selectedClient.address_line1 || selectedClient.billing_address || '');
                        updateField('destination', selectedClient.city || selectedClient.billing_city || '');
                        updateField('destination_state', selectedClient.state || selectedClient.billing_state || '');
                      }}
                      options={clients.map((c: any) => ({
                        value: c.id,
                        label: `${c.name}${c.city ? ` | ${c.city}` : ''}`,
                      }))}
                      placeholder="Select client to auto-fill"
                      disabled={isReadonly}
                    />
                  </FormField>
                  <FormField label="Name" required error={errors.consignee_name}>
                    <TextInput value={form.consignee_name} onChange={(v) => updateField('consignee_name', v)}
                      placeholder="Company / Person name" disabled={isReadonly} />
                  </FormField>
                  <FormField label="GSTIN" error={errors.consignee_gstin}>
                    <TextInput value={form.consignee_gstin} onChange={(v) => updateField('consignee_gstin', v.toUpperCase())}
                      placeholder="e.g. 07AABCB3456S1ZR" disabled={isReadonly} />
                  </FormField>
                  <FormField label="Address">
                    <TextArea value={form.consignee_address} onChange={(v) => updateField('consignee_address', v)}
                      placeholder="Full address" rows={2} disabled={isReadonly} />
                  </FormField>
                  <FormField label="Phone">
                    <TextInput value={form.consignee_phone} onChange={(v) => updateField('consignee_phone', v)}
                      placeholder="Contact number" disabled={isReadonly} prefix={<Phone size={14} />} />
                  </FormField>
                </div>
              </SectionCard>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════
           STEP 2: Route Details + E-way Bill
        ══════════════════════════════════════════════════════ */}
        {currentStep === 2 && (
          <SectionCard title="Route Details" subtitle="Origin defaults to company; destination from selected client" icon={<MapPin size={20} />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Origin */}
              <div className="bg-green-50/50 border border-green-100 rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  Origin (From)
                </div>
                <FormField label="City" required error={errors.origin}>
                  <TextInput value={form.origin} onChange={(v) => updateField('origin', v)} placeholder="Origin city" disabled={isReadonly} />
                </FormField>
                <FormField label="State">
                  <TextInput value={form.origin_state} onChange={(v) => updateField('origin_state', v)} placeholder="State" disabled={isReadonly} />
                </FormField>
                <FormField label="Address">
                  <TextArea value={form.consignor_address} onChange={(v) => updateField('consignor_address', v)} placeholder="Full address" rows={2} disabled={isReadonly} />
                </FormField>
              </div>

              {/* Destination */}
              <div className="bg-red-50/50 border border-red-100 rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                  Destination (To)
                </div>
                <FormField label="Select Client">
                  <SelectInput
                    value={selectedClientId || ''}
                    onChange={(v) => {
                      const clientId = parseInt(v, 10) || 0;
                      setSelectedClientId(clientId);
                      if (!clientId) {
                        updateField('job_id', 0);
                        return;
                      }
                      const selectedClient = clients.find((c: any) => Number(c.id) === clientId);
                      if (!selectedClient) return;
                      updateField('destination', selectedClient.city || selectedClient.billing_city || '');
                      updateField('destination_state', selectedClient.state || selectedClient.billing_state || '');
                      updateField('consignee_name', selectedClient.name || '');
                      updateField('consignee_gstin', selectedClient.gstin || selectedClient.gst_number || '');
                      updateField('consignee_phone', selectedClient.phone || '');
                      updateField('consignee_address', selectedClient.address_line1 || selectedClient.billing_address || '');
                    }}
                    options={clients.map((c: any) => ({
                      value: c.id,
                      label: `${c.name}${c.city ? ` | ${c.city}` : ''}`,
                    }))}
                    placeholder="Select client"
                    disabled={isReadonly}
                  />
                </FormField>
                <FormField label="City" required error={errors.destination}>
                  <TextInput value={form.destination} onChange={(v) => updateField('destination', v)} placeholder="Destination city" disabled={isReadonly} />
                </FormField>
                <FormField label="State">
                  <TextInput value={form.destination_state} onChange={(v) => updateField('destination_state', v)} placeholder="State" disabled={isReadonly} />
                </FormField>
                <FormField label="Address">
                  <TextArea value={form.consignee_address} onChange={(v) => updateField('consignee_address', v)} placeholder="Full address" rows={2} disabled={isReadonly} />
                </FormField>
              </div>
            </div>

            {/* E-way Bill */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2"><Shield size={16} className="text-orange-500" /> E-way Bill Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="E-way Bill Number" error={errors.eway_bill_number}>
                  <TextInput value={form.eway_bill_number} onChange={(v) => updateField('eway_bill_number', v)}
                    placeholder="e.g. 121000000001" disabled={isReadonly} prefix={<Hash size={14} />} />
                </FormField>
                <FormField label="E-way Bill Date">
                  <TextInput type="date" value={form.eway_bill_date} onChange={(v) => updateField('eway_bill_date', v)} disabled={isReadonly} />
                </FormField>
                <FormField label="Valid Until">
                  <TextInput type="date" value={form.eway_bill_valid_until} onChange={(v) => updateField('eway_bill_valid_until', v)} disabled={isReadonly} />
                </FormField>
              </div>
            </div>
          </SectionCard>
        )}

        {/* ══════════════════════════════════════════════════════
           STEP 3: Consignment Details + Freight & Charges
        ══════════════════════════════════════════════════════ */}
        {currentStep === 3 && (
          <>
            <SectionCard
              title="Consignment Details"
              subtitle="Add multiple items per consignment"
              icon={<Package size={20} />}
              badge={
                <span className="text-xs font-semibold bg-primary-50 text-primary-700 px-2.5 py-1 rounded-full">
                  {items.length} item{items.length > 1 ? 's' : ''}
                </span>
              }
            >
              {errors.items && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle size={16} /> {errors.items}
                </div>
              )}

              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={item.id} className="border border-gray-200 rounded-xl p-5 bg-gray-50/50 relative group">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-bold text-gray-700">Item #{index + 1}</h4>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={() => duplicateItem(item.id)} disabled={isReadonly}
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="Duplicate">
                          <Copy size={14} />
                        </button>
                        <button type="button" onClick={() => removeItem(item.id)} disabled={isReadonly || items.length <= 1}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30" title="Remove">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <FormField label="Description" required className="sm:col-span-2">
                        <TextInput value={item.description} onChange={(v) => updateItem(item.id, 'description', v)}
                          placeholder={getSuggestion(index, 'description') ? `⏎ ${getSuggestion(index, 'description')}` : 'e.g. Auto Parts, Electronics'}
                          disabled={isReadonly} onKeyDown={(e) => handleSuggestionKeyDown(e, item.id, 'description', index)} />
                      </FormField>
                      <FormField label="HSN Code">
                        <TextInput value={item.hsn_code} onChange={(v) => updateItem(item.id, 'hsn_code', v)}
                          placeholder={getSuggestion(index, 'hsn_code') ? `⏎ ${getSuggestion(index, 'hsn_code')}` : 'e.g. 87089900'}
                          disabled={isReadonly} onKeyDown={(e) => handleSuggestionKeyDown(e, item.id, 'hsn_code', index)} />
                      </FormField>
                      <FormField label="No. of Packages">
                        <TextInput type="number" value={item.packages} onChange={(v) => updateItem(item.id, 'packages', parseInt(v) || 0)}
                          placeholder={getSuggestion(index, 'packages') || undefined}
                          disabled={isReadonly} onKeyDown={(e) => handleSuggestionKeyDown(e, item.id, 'packages', index)} />
                      </FormField>
                      <FormField label="Product Type">
                        <TextInput value={item.package_type} onChange={(v) => updateItem(item.id, 'package_type', v)}
                          placeholder={getSuggestion(index, 'package_type') ? `⏎ ${getSuggestion(index, 'package_type')}` : 'Type product'}
                          disabled={isReadonly} onKeyDown={(e) => handleSuggestionKeyDown(e, item.id, 'package_type', index)} />
                      </FormField>
                      <FormField label="Actual Weight (Kgs)" hint="As measured">
                        <TextInput type="number" value={item.actual_weight} onChange={(v) => updateItem(item.id, 'actual_weight', parseFloat(v) || 0)}
                          placeholder={getSuggestion(index, 'actual_weight') || undefined}
                          disabled={isReadonly} suffix="Kgs" onKeyDown={(e) => handleSuggestionKeyDown(e, item.id, 'actual_weight', index)} />
                      </FormField>
                      <FormField label="Charged Weight (Kgs)" hint="Weight for billing">
                        <TextInput type="number" value={item.charged_weight} onChange={(v) => updateItem(item.id, 'charged_weight', parseFloat(v) || 0)}
                          placeholder={getSuggestion(index, 'charged_weight') || undefined}
                          disabled={isReadonly} suffix="Kgs" onKeyDown={(e) => handleSuggestionKeyDown(e, item.id, 'charged_weight', index)} />
                      </FormField>
                    </div>

                    {/* Item amount display */}
                    {item.amount > 0 && (
                      <div className="mt-3 text-right">
                        <span className="text-xs text-gray-500">Item Amount: </span>
                        <span className="font-bold text-gray-900">₹{(item.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Add item button */}
              {!isReadonly && (
                <button type="button" onClick={addItem}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/50 transition-colors">
                  <Plus size={18} /> Add Consignment Item
                </button>
              )}

              {/* Item totals summary */}
              <div className="mt-5 bg-gray-100 rounded-xl p-4 grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xs text-gray-500">Total Packages</p>
                  <p className="text-lg font-bold text-gray-900">{itemTotals.totalPackages}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Total Actual Weight</p>
                  <p className="text-lg font-bold text-gray-900">{(itemTotals.totalWeight ?? 0).toLocaleString('en-IN')} Kgs</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">Total Charged Weight</p>
                  <p className="text-lg font-bold text-gray-900">{(itemTotals.totalChargedWeight ?? 0).toLocaleString('en-IN')} Kgs</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Freight & Charges" subtitle="Pricing, GST calculation, and payment mode" icon={<IndianRupee size={20} />}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left — Charges inputs */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="Payment Mode" required>
                      <SelectInput value={form.payment_mode} onChange={(v) => updateField('payment_mode', v)}
                        options={PAYMENT_MODES.map(p => ({ value: p.value, label: `${p.label} — ${p.description}` }))}
                        disabled={isReadonly} />
                    </FormField>
                    <FormField label="GST Rate">
                      <SelectInput value={form.gst_percentage} onChange={(v) => updateField('gst_percentage', parseFloat(v))}
                        options={GST_OPTIONS.map(g => ({ value: g.value, label: g.label }))} disabled={isReadonly} />
                    </FormField>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FormField label="Freight Amount (₹)" required error={errors.freight_amount}>
                      <TextInput type="number" value={form.freight_amount}
                        onChange={(v) => updateField('freight_amount', parseFloat(v) || 0)}
                        disabled={isReadonly} prefix={<IndianRupee size={14} />} />
                    </FormField>
                    <FormField label="Loading Charges (₹)">
                      <TextInput type="number" value={form.loading_charges}
                        onChange={(v) => updateField('loading_charges', parseFloat(v) || 0)}
                        disabled={isReadonly} prefix={<IndianRupee size={14} />} />
                    </FormField>
                    <FormField label="Unloading Charges (₹)">
                      <TextInput type="number" value={form.unloading_charges}
                        onChange={(v) => updateField('unloading_charges', parseFloat(v) || 0)}
                        disabled={isReadonly} prefix={<IndianRupee size={14} />} />
                    </FormField>
                    <FormField label="Detention Charges (₹)">
                      <TextInput type="number" value={form.detention_charges}
                        onChange={(v) => updateField('detention_charges', parseFloat(v) || 0)}
                        disabled={isReadonly} prefix={<IndianRupee size={14} />} />
                    </FormField>
                    <FormField label="Other Charges (₹)">
                      <TextInput type="number" value={form.other_charges}
                        onChange={(v) => updateField('other_charges', parseFloat(v) || 0)}
                        disabled={isReadonly} prefix={<IndianRupee size={14} />} />
                    </FormField>
                    <FormField label="Declared Value (₹)" hint="For insurance">
                      <TextInput type="number" value={form.declared_value}
                        onChange={(v) => updateField('declared_value', parseFloat(v) || 0)}
                        disabled={isReadonly} prefix={<IndianRupee size={14} />} />
                    </FormField>
                  </div>
                </div>

                {/* Right — Price Summary */}
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white space-y-3">
                  <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Price Summary</h4>
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between"><span className="text-gray-400">Freight</span><span>₹{(priceSummary.freight ?? 0).toLocaleString('en-IN')}</span></div>
                    {priceSummary.loading > 0 && <div className="flex justify-between"><span className="text-gray-400">Loading</span><span>₹{(priceSummary.loading ?? 0).toLocaleString('en-IN')}</span></div>}
                    {priceSummary.unloading > 0 && <div className="flex justify-between"><span className="text-gray-400">Unloading</span><span>₹{(priceSummary.unloading ?? 0).toLocaleString('en-IN')}</span></div>}
                    {priceSummary.detention > 0 && <div className="flex justify-between"><span className="text-gray-400">Detention</span><span>₹{(priceSummary.detention ?? 0).toLocaleString('en-IN')}</span></div>}
                    {priceSummary.other > 0 && <div className="flex justify-between"><span className="text-gray-400">Other</span><span>₹{(priceSummary.other ?? 0).toLocaleString('en-IN')}</span></div>}
                    <div className="border-t border-gray-700 pt-2 flex justify-between font-semibold">
                      <span className="text-gray-300">Subtotal</span><span>₹{(priceSummary.subtotal ?? 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">GST ({priceSummary.gstPct}%)</span>
                      <span>₹{(priceSummary.gstAmount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="border-t border-gray-600 pt-3 flex justify-between">
                      <span className="text-lg font-bold">Grand Total</span>
                      <span className="text-2xl font-black text-emerald-400">₹{(priceSummary.total ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {/* ══════════════════════════════════════════════════════
           STEP 4: Vehicle & Driver Details
        ══════════════════════════════════════════════════════ */}
        {currentStep === 4 && (
          <SectionCard title="Vehicle & Driver Details" subtitle="Assign vehicle and driver to this LR" icon={<Truck size={20} />} collapsible defaultOpen={true}>
            {/* Mode toggle */}
            <div className="flex items-center gap-2 mb-5">
              <button
                type="button"
                onClick={() => { setVehicleMode('fleet'); setSelectedMarketTrip(0); updateField('vehicle_id', 0); updateField('vehicle_number', ''); updateField('driver_id', 0); updateField('driver_name', ''); updateField('driver_phone', ''); updateField('driver_license', ''); setSelectedVehicle(null); setSelectedDriver(null); }}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${vehicleMode === 'fleet' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'}`}
              >
                Fleet Vehicle
              </button>
              <button
                type="button"
                onClick={() => { setVehicleMode('market'); setSelectedVehicle(null); setSelectedDriver(null); updateField('vehicle_id', 0); updateField('driver_id', 0); updateField('vehicle_number', ''); updateField('driver_name', ''); updateField('driver_phone', ''); updateField('driver_license', ''); setSelectedMarketTrip(0); setMktVehicle({ vehicle_registration: '', vehicle_type: '', fuel_type: '', vehicle_make: '', vehicle_model: '', year_of_manufacture: '', chassis_number: '', engine_number: '', owner_phone: '', rc_file_url: '', owner_name: '', vehicle_class: '', rc_issue_date: '', rc_validity_date: '' }); setMktDriver({ driver_name: '', driver_phone: '', driver_alt_phone: '', driver_address: '', driver_license: '', driver_license_issue: '', driver_license_valid: '', dl_file_url: '' }); }}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${vehicleMode === 'market' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'}`}
              >
                Market Trip
              </button>
            </div>

            {vehicleMode === 'market' ? (
              /* ── Market Trip: add vehicle + driver with OCR ── */
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ── Vehicle ── */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Truck size={15} /> Vehicle Details</h4>
                  <MarketOcrUpload label="RC (Registration Certificate)" docType="rc" isLoading={mktRcLoading} setLoading={setMktRcLoading}
                    fileUrl={mktVehicle.rc_file_url}
                    onExtracted={(data, url) => {
                      setMktVehicle((p) => ({
                        ...p,
                        vehicle_registration: data.registration_number || p.vehicle_registration,
                        owner_name: data.owner_name || p.owner_name,
                        vehicle_class: data.vehicle_class || p.vehicle_class,
                        fuel_type: data.fuel_type || p.fuel_type,
                        chassis_number: data.chassis_number || p.chassis_number,
                        engine_number: data.engine_number || p.engine_number,
                        rc_issue_date: data.issue_date || p.rc_issue_date,
                        rc_validity_date: data.validity_date || p.rc_validity_date,
                        rc_file_url: url || p.rc_file_url,
                      }));
                      updateField('vehicle_number', data.registration_number || form.vehicle_number);
                    }}
                  />
                  {/* Auto-filled from RC */}
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 space-y-2 text-sm">
                    <p className="text-xs font-semibold text-blue-600 mb-2">Auto-filled from RC</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-0.5">Registration Number</label>
                        <input className="input-field font-mono uppercase bg-white" placeholder="e.g. TN01AB1234"
                          value={mktVehicle.vehicle_registration}
                          onChange={(e) => { setMktVehicle((p) => ({ ...p, vehicle_registration: e.target.value.toUpperCase() })); updateField('vehicle_number', e.target.value.toUpperCase()); }}
                          disabled={isReadonly} />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-0.5">Owner Name</label>
                        <input className="input-field bg-white" placeholder="Auto-filled from RC"
                          value={mktVehicle.owner_name}
                          onChange={(e) => setMktVehicle((p) => ({ ...p, owner_name: e.target.value }))}
                          disabled={isReadonly} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Date of Regn.</label>
                        <input className="input-field bg-white" placeholder="DD/MM/YYYY"
                          value={mktVehicle.rc_issue_date}
                          onChange={(e) => setMktVehicle((p) => ({ ...p, rc_issue_date: e.target.value }))}
                          disabled={isReadonly} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Regn. Validity</label>
                        <input className="input-field bg-white" placeholder="DD/MM/YYYY"
                          value={mktVehicle.rc_validity_date}
                          onChange={(e) => setMktVehicle((p) => ({ ...p, rc_validity_date: e.target.value }))}
                          disabled={isReadonly} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Chassis Number</label>
                        <input className="input-field font-mono text-xs bg-white" placeholder="Auto-filled from RC"
                          value={mktVehicle.chassis_number}
                          onChange={(e) => setMktVehicle((p) => ({ ...p, chassis_number: e.target.value }))}
                          disabled={isReadonly} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Engine Number</label>
                        <input className="input-field font-mono text-xs bg-white" placeholder="Auto-filled from RC"
                          value={mktVehicle.engine_number}
                          onChange={(e) => setMktVehicle((p) => ({ ...p, engine_number: e.target.value }))}
                          disabled={isReadonly} />
                      </div>
                    </div>
                  </div>
                  {/* User-entered fields */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500">Enter Manually</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Vehicle Type</label>
                        <select className="input-field" value={mktVehicle.vehicle_type}
                          onChange={(e) => setMktVehicle((p) => ({ ...p, vehicle_type: e.target.value }))} disabled={isReadonly}>
                          <option value="">Select type</option>
                          {['Truck','Trailer','Tanker','Container','LCV','HCV','Tipper','Other'].map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Fuel Type</label>
                        <select className="input-field" value={mktVehicle.fuel_type}
                          onChange={(e) => setMktVehicle((p) => ({ ...p, fuel_type: e.target.value }))} disabled={isReadonly}>
                          <option value="">Select fuel</option>
                          {['Diesel','Petrol','CNG','Electric','LPG'].map((f) => <option key={f}>{f}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Make</label>
                        <input className="input-field" placeholder="e.g. TATA" value={mktVehicle.vehicle_make}
                          onChange={(e) => setMktVehicle((p) => ({ ...p, vehicle_make: e.target.value }))} disabled={isReadonly} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
                        <input className="input-field" placeholder="e.g. Prima 4028" value={mktVehicle.vehicle_model}
                          onChange={(e) => setMktVehicle((p) => ({ ...p, vehicle_model: e.target.value }))} disabled={isReadonly} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Year of Manufacture</label>
                        <input className="input-field" placeholder="e.g. 2019" value={mktVehicle.year_of_manufacture}
                          onChange={(e) => setMktVehicle((p) => ({ ...p, year_of_manufacture: e.target.value }))} disabled={isReadonly} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Owner Phone</label>
                        <input className="input-field" placeholder="Owner contact" value={mktVehicle.owner_phone}
                          onChange={(e) => setMktVehicle((p) => ({ ...p, owner_phone: e.target.value }))} disabled={isReadonly} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Driver ── */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <User size={15} /> Driver Details
                  </h4>
                  <MarketOcrUpload label="Driving Licence (DL)" docType="driving_license" isLoading={mktDlLoading} setLoading={setMktDlLoading}
                    fileUrl={mktDriver.dl_file_url}
                    onExtracted={(data, url) => {
                      const toInputDate = (v: string) => { if (!v) return ''; const p = v.split('/'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : v; };
                      setMktDriver((p) => ({
                        ...p,
                        driver_license: data.license_number || p.driver_license,
                        driver_license_issue: toInputDate(data.issue_date) || p.driver_license_issue,
                        driver_license_valid: toInputDate(data.expiry_date) || p.driver_license_valid,
                        dl_file_url: url || p.dl_file_url,
                      }));
                      updateField('driver_license', data.license_number || form.driver_license);
                    }}
                  />
                  {/* Auto-filled from DL */}
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-600 mb-2">Auto-filled from DL</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-0.5">Licence Number</label>
                        <input className="input-field font-mono bg-white" placeholder="Auto-filled from DL"
                          value={mktDriver.driver_license}
                          onChange={(e) => { setMktDriver((p) => ({ ...p, driver_license: e.target.value })); updateField('driver_license', e.target.value); }}
                          disabled={isReadonly} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">DL Issue Date</label>
                        <input type="date" className="input-field bg-white" value={mktDriver.driver_license_issue}
                          onChange={(e) => setMktDriver((p) => ({ ...p, driver_license_issue: e.target.value }))} disabled={isReadonly} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">DL Valid Until</label>
                        <input type="date" className="input-field bg-white" value={mktDriver.driver_license_valid}
                          onChange={(e) => setMktDriver((p) => ({ ...p, driver_license_valid: e.target.value }))} disabled={isReadonly} />
                      </div>
                    </div>
                  </div>
                  {/* User-entered driver fields */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500">Enter Manually</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Driver Name *</label>
                        <input className="input-field" placeholder="Full name" value={mktDriver.driver_name}
                          onChange={(e) => { setMktDriver((p) => ({ ...p, driver_name: e.target.value })); updateField('driver_name', e.target.value); }}
                          disabled={isReadonly} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                        <input className="input-field" placeholder="Primary number" value={mktDriver.driver_phone}
                          onChange={(e) => { setMktDriver((p) => ({ ...p, driver_phone: e.target.value })); updateField('driver_phone', e.target.value); }}
                          disabled={isReadonly} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Alternate Phone</label>
                        <input className="input-field" placeholder="Alt contact" value={mktDriver.driver_alt_phone}
                          onChange={(e) => setMktDriver((p) => ({ ...p, driver_alt_phone: e.target.value }))} disabled={isReadonly} />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                        <textarea className="input-field resize-none" rows={2} placeholder="Permanent address"
                          value={mktDriver.driver_address}
                          onChange={(e) => setMktDriver((p) => ({ ...p, driver_address: e.target.value }))} disabled={isReadonly} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Vehicle Selection */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-gray-700">Vehicle</h4>
                <FormField label="Select Vehicle" hint="Pick from Vehicles master data">
                  <SelectInput
                    value={form.vehicle_id || ''}
                    onChange={(v) => {
                      const vehicleId = parseInt(v, 10) || 0;
                      if (!vehicleId) {
                        setSelectedVehicle(null);
                        updateField('vehicle_id', 0);
                        updateField('vehicle_number', '');
                        return;
                      }
                      const vehicle = vehicleOptions.find((opt) => Number(opt.id) === vehicleId);
                      if (vehicle) {
                        selectVehicle(vehicle);
                      }
                    }}
                    options={vehicleOptions.map((v) => ({
                      value: v.id,
                      label: `${v.registration_number} ${v.vehicle_type ? `| ${String(v.vehicle_type).replace(/_/g, ' ')}` : ''}`,
                    }))}
                    placeholder="Select vehicle"
                    disabled={isReadonly}
                  />
                </FormField>
                <FormField label="Vehicle Number">
                  <TextInput value={form.vehicle_number} onChange={() => {}}
                    placeholder="Vehicle number will auto-fill"
                    disabled={true} />
                </FormField>
                {currentVehicle && (
                  <p className="text-xs text-gray-500">
                    Selected: <span className="font-mono font-semibold text-gray-700">{currentVehicle.registration_number}</span>
                  </p>
                )}
              </div>

              {/* Driver Selection */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-gray-700">Driver</h4>
                {selectedVehicle?.driver ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 flex items-center gap-2">
                    <span className="font-semibold">{selectedVehicle.driver.name}</span>
                    {selectedVehicle.driver.phone && <span className="text-green-600">| {selectedVehicle.driver.phone}</span>}
                    <span className="ml-auto text-xs text-green-600 italic">Assigned by fleet manager</span>
                  </div>
                ) : (
                <FormField label="Select Driver" hint="Pick from Drivers master data">
                  <SelectInput
                    value={form.driver_id || ''}
                    onChange={(v) => {
                      const driverId = parseInt(v, 10) || 0;
                      if (!driverId) {
                        setSelectedDriver(null);
                        updateField('driver_id', 0);
                        updateField('driver_name', '');
                        updateField('driver_phone', '');
                        updateField('driver_license', '');
                        return;
                      }
                      const driver = driverOptions.find((opt) => Number(opt.id) === driverId);
                      if (driver) {
                        selectDriver(driver);
                      }
                    }}
                    options={driverOptions.map((d) => ({
                      value: d.id,
                      label: `${d.name}${d.phone ? ` | ${d.phone}` : ''}`,
                    }))}
                    placeholder="Select driver"
                    disabled={isReadonly}
                  />
                </FormField>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="Driver Name">
                    <TextInput value={form.driver_name} onChange={() => {}}
                      placeholder="Driver name will auto-fill" disabled={true} />
                  </FormField>
                  <FormField label="Driver Phone">
                    <TextInput value={form.driver_phone} onChange={() => {}}
                      placeholder="Phone number will auto-fill" disabled={true} prefix={<Phone size={14} />} />
                  </FormField>
                  <FormField label="Driver License Number">
                    <TextInput value={form.driver_license} onChange={() => {}}
                      placeholder="License number will auto-fill" disabled={true} prefix={<Hash size={14} />} />
                  </FormField>
                </div>
                {currentDriver && (
                  <p className="text-xs text-gray-500">
                    Selected: <span className="font-semibold text-gray-700">{currentDriver.name}</span>
                  </p>
                )}
              </div>
            </div>
            )}
          </SectionCard>
        )}

        {/* ══════════════════════════════════════════════════════
           STEP 5: Documents & Notes
        ══════════════════════════════════════════════════════ */}
        {currentStep === 5 && (
          <SectionCard title="Documents & Notes (Optional)" subtitle="Optional insurance, remarks, and special instructions" icon={<StickyNote size={20} />} collapsible defaultOpen={true}>
            <div className="space-y-6">
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                This section is optional. You can save and generate LR without filling these fields.
              </div>
              {/* Insurance */}
              <div>
                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Shield size={16} className="text-blue-500" /> Insurance Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="Insurance Company">
                    <TextInput value={form.insurance_company} onChange={(v) => updateField('insurance_company', v)}
                      placeholder="e.g. New India Assurance" disabled={isReadonly} />
                  </FormField>
                  <FormField label="Policy Number">
                    <TextInput value={form.insurance_policy_number} onChange={(v) => updateField('insurance_policy_number', v)}
                      placeholder="Policy number" disabled={isReadonly} />
                  </FormField>
                  <FormField label="Insured Amount (₹)">
                    <TextInput type="number" value={form.insurance_amount}
                      onChange={(v) => updateField('insurance_amount', parseFloat(v) || 0)}
                      prefix={<IndianRupee size={14} />} disabled={isReadonly} />
                  </FormField>
                </div>
              </div>

              {/* Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Remarks">
                  <TextArea value={form.remarks} onChange={(v) => updateField('remarks', v)}
                    placeholder="Any general remarks..." rows={3} disabled={isReadonly} />
                </FormField>
                <FormField label="Special Instructions">
                  <TextArea value={form.special_instructions} onChange={(v) => updateField('special_instructions', v)}
                    placeholder="Handling, delivery time, etc." rows={3} disabled={isReadonly} />
                </FormField>
              </div>
            </div>
          </SectionCard>
        )}

        {/* ══════════════════════════════════════════════════════
           Step Navigation Bar
        ══════════════════════════════════════════════════════ */}
        {!isReadonly && (
          <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-200 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 flex items-center justify-between gap-4 rounded-t-xl shadow-lg z-30">
            <button type="button" onClick={() => navigate('/lr')}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50">
              Cancel
            </button>
            <div className="flex items-center gap-3">
              {currentStep > 1 && (
                <button type="button" onClick={() => { setCurrentStep(s => s - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50">
                  <ArrowLeft size={16} /> Back
                </button>
              )}
              {currentStep < 5 && (
                <button type="button" onClick={() => {
                  if (validateStep(currentStep)) {
                    setCurrentStep(s => s + 1);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-primary-600 text-white rounded-xl hover:bg-primary-700 shadow-lg shadow-primary-200">
                  Next <ChevronRight size={16} />
                </button>
              )}
              {currentStep === 5 && (
                <>
                  <button type="button" onClick={() => handleSave('draft')} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save as Draft
                  </button>
                  <button type="button" onClick={() => handleSave('generate')} disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 shadow-lg shadow-emerald-200">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <FileCheck size={16} />}
                    Generate LR
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Generated success banner */}
        {form.status === 'generated' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-3">
            <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
            <h3 className="text-lg font-bold text-emerald-800">LR Generated Successfully!</h3>
            <p className="text-sm text-emerald-600">This Lorry Receipt is now an official document. You can print or download the PDF.</p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 text-sm font-medium">
                <Printer size={16} /> Print LR
              </button>
              <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 border border-emerald-300 text-emerald-700 rounded-xl hover:bg-emerald-100 text-sm font-medium">
                <Download size={16} /> Download PDF
              </button>
              <button onClick={() => navigate('/lr')} className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-medium">
                Back to LR List
              </button>
            </div>
          </div>
        )}

        {/* Bottom padding */}
        <div className="h-8" />
      </form>

    </div>
  );
}


// ── Print HTML Generator ──
function generatePrintHTML(data: any): string {
  const items = data.items || [];
  const itemRows = items.map((item: any, idx: number) => `
    <tr>
      <td style="border:1px solid #ccc;padding:6px;text-align:center">${idx + 1}</td>
      <td style="border:1px solid #ccc;padding:6px">${item.description || ''}</td>
      <td style="border:1px solid #ccc;padding:6px;text-align:center">${item.packages || ''}</td>
      <td style="border:1px solid #ccc;padding:6px;text-align:center">${item.package_type || ''}</td>
      <td style="border:1px solid #ccc;padding:6px;text-align:right">${item.actual_weight || ''}</td>
      <td style="border:1px solid #ccc;padding:6px;text-align:right">${item.charged_weight || ''}</td>
      <td style="border:1px solid #ccc;padding:6px">${item.invoice_number || ''}</td>
      <td style="border:1px solid #ccc;padding:6px;text-align:right">${item.invoice_value ? '₹' + Number((item.invoice_value) ?? 0).toLocaleString('en-IN') : ''}</td>
    </tr>
  `).join('');

  const terms = (data.terms || []).map((t: string) => `<li style="margin-bottom:4px">${t}</li>`).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Lorry Receipt - ${data.lr_number || ''}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; font-size: 13px; color: #333; }
    .header { text-align: center; border-bottom: 3px double #333; padding-bottom: 15px; margin-bottom: 15px; }
    .header h1 { margin: 0; font-size: 22px; letter-spacing: 2px; }
    .header p { margin: 3px 0; font-size: 12px; color: #666; }
    .lr-number { font-size: 16px; font-weight: bold; color: #1a56db; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
    .box { border: 1px solid #ccc; border-radius: 4px; padding: 12px; }
    .box h3 { margin: 0 0 8px 0; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
    .box p { margin: 3px 0; }
    .box .label { color: #888; font-size: 11px; }
    .box .value { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th { background: #f5f5f5; border: 1px solid #ccc; padding: 8px; font-size: 11px; text-transform: uppercase; }
    .summary { text-align: right; margin-top: 10px; }
    .summary td { padding: 4px 10px; }
    .total-row { font-size: 16px; font-weight: bold; border-top: 2px solid #333; }
    .terms { font-size: 11px; color: #666; margin-top: 20px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 50px; text-align: center; }
    .signatures div { border-top: 1px solid #999; padding-top: 8px; font-size: 12px; }
    @media print { body { margin: 0; padding: 10px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${data.company_name || 'TRANSPORT ERP'}</h1>
    <p>${data.company_address || ''}</p>
    <p>GSTIN: ${data.company_gstin || ''} | Phone: ${data.company_phone || ''}</p>
    <div style="margin-top:10px">
      <span style="font-size:18px;font-weight:bold;letter-spacing:3px">LORRY RECEIPT / CONSIGNMENT NOTE</span>
    </div>
  </div>

  <div class="grid-2">
    <div>
      <span class="lr-number">${data.lr_number || ''}</span>
      <p><span class="label">Date:</span> <span class="value">${data.lr_date || ''}</span></p>
      <p><span class="label">Job Ref:</span> <span class="value">${data.job_number || ''}</span></p>
    </div>
    <div style="text-align:right">
      <p><span class="label">Vehicle No:</span> <span class="value">${data.vehicle_number || 'N/A'}</span></p>
      <p><span class="label">Driver:</span> <span class="value">${data.driver_name || 'N/A'}</span></p>
      <p><span class="label">E-way Bill:</span> <span class="value">${data.eway_bill_number || 'N/A'}</span></p>
    </div>
  </div>

  <div class="grid-2">
    <div class="box">
      <h3>Consignor (From)</h3>
      <p class="value">${data.consignor_name || ''}</p>
      <p>${data.consignor_address || ''}</p>
      <p><span class="label">GSTIN:</span> ${data.consignor_gstin || 'N/A'}</p>
      <p><span class="label">Phone:</span> ${data.consignor_phone || 'N/A'}</p>
      <p><span class="label">Origin:</span> ${data.origin || ''}, ${data.origin_state || ''}</p>
    </div>
    <div class="box">
      <h3>Consignee (To)</h3>
      <p class="value">${data.consignee_name || ''}</p>
      <p>${data.consignee_address || ''}</p>
      <p><span class="label">GSTIN:</span> ${data.consignee_gstin || 'N/A'}</p>
      <p><span class="label">Phone:</span> ${data.consignee_phone || 'N/A'}</p>
      <p><span class="label">Destination:</span> ${data.destination || ''}, ${data.destination_state || ''}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px">S.No</th>
        <th>Description</th>
        <th style="width:60px">Pkgs</th>
        <th style="width:80px">Type</th>
        <th style="width:90px">Act. Wt (Kg)</th>
        <th style="width:90px">Chg. Wt (Kg)</th>
        <th style="width:100px">Invoice No.</th>
        <th style="width:100px">Invoice Value</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#999">No items</td></tr>'}
    </tbody>
  </table>

  <div style="display:grid;grid-template-columns:1fr 300px;gap:20px">
    <div>
      <p><span class="label">Payment Mode:</span> <span class="value" style="text-transform:uppercase">${(data.payment_mode || '').replace(/_/g, ' ')}</span></p>
      ${data.remarks ? `<p><span class="label">Remarks:</span> ${data.remarks}</p>` : ''}
      ${data.insurance_company ? `<p><span class="label">Insurance:</span> ${data.insurance_company} (₹${Number((data.insurance_amount || 0) ?? 0).toLocaleString('en-IN')})</p>` : ''}
      ${data.declared_value ? `<p><span class="label">Declared Value:</span> ₹${Number((data.declared_value) ?? 0).toLocaleString('en-IN')}</p>` : ''}
    </div>
    <table class="summary">
      <tr><td class="label">Freight:</td><td>₹${Number((data.freight_amount || 0) ?? 0).toLocaleString('en-IN')}</td></tr>
      ${data.loading_charges ? `<tr><td class="label">Loading:</td><td>₹${Number((data.loading_charges) ?? 0).toLocaleString('en-IN')}</td></tr>` : ''}
      ${data.unloading_charges ? `<tr><td class="label">Unloading:</td><td>₹${Number((data.unloading_charges) ?? 0).toLocaleString('en-IN')}</td></tr>` : ''}
      ${data.detention_charges ? `<tr><td class="label">Detention:</td><td>₹${Number((data.detention_charges) ?? 0).toLocaleString('en-IN')}</td></tr>` : ''}
      ${data.other_charges ? `<tr><td class="label">Other:</td><td>₹${Number((data.other_charges) ?? 0).toLocaleString('en-IN')}</td></tr>` : ''}
      <tr><td class="label" style="border-top:1px solid #ccc;padding-top:6px"><strong>Subtotal:</strong></td><td style="border-top:1px solid #ccc;padding-top:6px"><strong>₹${Number((data.subtotal || 0) ?? 0).toLocaleString('en-IN')}</strong></td></tr>
      <tr><td class="label">GST (${data.gst_percentage || 5}%):</td><td>₹${Number((data.gst_amount || 0) ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      <tr class="total-row"><td style="padding-top:8px"><strong>TOTAL:</strong></td><td style="padding-top:8px"><strong>₹${Number((data.total_amount || 0) ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
    </table>
  </div>

  <div class="terms">
    <strong>Terms & Conditions:</strong>
    <ol style="padding-left:18px;margin-top:5px">${terms}</ol>
  </div>

  <div class="signatures">
    <div>Consignor's Signature</div>
    <div>Transport Company</div>
    <div>Consignee's Signature</div>
  </div>

  <p style="text-align:center;font-size:10px;color:#999;margin-top:30px">
    This is a computer-generated document. Printed on ${new Date().toLocaleString('en-IN')}
  </p>
</body>
</html>`;
}

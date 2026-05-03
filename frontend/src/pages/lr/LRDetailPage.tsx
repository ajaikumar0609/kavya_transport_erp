import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { lrService } from '@/services/dataService';
import { StatusBadge, LoadingPage } from '@/components/common/Modal';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ChevronRight, Truck, User, Phone,
  MapPin, ArrowRight, FileText, IndianRupee, Package, Weight,
  Building2, CreditCard, Printer,
} from 'lucide-react';

function SectionCard({ icon, iconBg, iconColor, title, children }: {
  icon: React.ReactNode; iconBg: string; iconColor: string; title: string; children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, valueClass = '' }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className={`text-sm font-medium text-gray-900 ${valueClass}`}>{value}</span>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`flex-1 min-w-0 rounded-xl p-3 ${color}`}>
      <p className="text-xs opacity-70 mb-0.5">{label}</p>
      <p className="font-bold text-base truncate">{value}</p>
    </div>
  );
}

export default function LRDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: lr, isLoading } = useQuery({
    queryKey: ['lr', id],
    queryFn: () => lrService.get(Number(id)),
    enabled: !!id,
    retry: false,
  });

  if (isLoading) return <LoadingPage />;
  if (!lr) return <div className="text-center py-16 text-gray-400">LR not found</div>;

  const totalFreight = Number(lr.total_freight || lr.freight_amount || 0);
  const advance = Number(lr.advance_amount || 0);
  const balance = Number(lr.balance_amount || 0);
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  const handlePrint = async () => {
    try {
      const printData = await lrService.print(lr.id);
      const printWindow = window.open('', '_blank', 'width=800,height=1100');
      if (!printWindow) { toast.error('Pop-up blocked — allow pop-ups and try again'); return; }
      printWindow.document.write(generateLRPrintHTML(printData));
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    } catch {
      toast.error('Failed to load print data');
    }
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="breadcrumb">
        <Link to="/dashboard">Dashboard</Link>
        <ChevronRight size={14} className="breadcrumb-separator" />
        <Link to="/lr">Lorry Receipts</Link>
        <ChevronRight size={14} className="breadcrumb-separator" />
        <span className="text-gray-900 font-medium">{lr.lr_number}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/lr')} className="btn-icon"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">{lr.lr_number}</h1>
            <StatusBadge status={lr.status} />
          </div>
          <p className="text-gray-500 text-sm mt-0.5">
            {new Date(lr.lr_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            {lr.payment_mode && <> &bull; {lr.payment_mode.replace('_', ' ').toUpperCase()}</>}
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 shrink-0"
        >
          <Printer size={16} /> Print LR
        </button>
      </div>

      {/* Route banner */}
      <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-blue-700">
            <MapPin size={16} />
            <span className="font-semibold text-base">{lr.origin || '—'}</span>
          </div>
          <div className="flex-1 flex items-center justify-center gap-2">
            <div className="h-px flex-1 bg-blue-200" />
            <ArrowRight size={16} className="text-blue-400 shrink-0" />
            <div className="h-px flex-1 bg-blue-200" />
          </div>
          <div className="flex items-center gap-2 text-indigo-700">
            <span className="font-semibold text-base">{lr.destination || '—'}</span>
            <MapPin size={16} />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-3">
        <StatChip label="Total Freight" value={fmt(totalFreight)} color="bg-emerald-50 text-emerald-800" />
        {lr.total_weight && <StatChip label="Total Weight" value={`${lr.total_weight} kg`} color="bg-amber-50 text-amber-800" />}
      </div>

      {/* Consignor / Consignee */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SectionCard icon={<Building2 size={15} />} iconBg="bg-violet-50" iconColor="text-violet-600" title="Consignor">
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-gray-900 text-base">{lr.consignor_name}</p>
            {lr.consignor_address && <p className="text-gray-500">{lr.consignor_address}</p>}
            {lr.consignor_gstin && <p className="text-gray-400 font-mono text-xs">GST: {lr.consignor_gstin}</p>}
            {lr.consignor_phone && (
              <p className="text-gray-400 flex items-center gap-1 pt-1">
                <Phone size={11} /> {lr.consignor_phone}
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard icon={<Building2 size={15} />} iconBg="bg-teal-50" iconColor="text-teal-600" title="Consignee">
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-gray-900 text-base">{lr.consignee_name}</p>
            {lr.consignee_address && <p className="text-gray-500">{lr.consignee_address}</p>}
            {lr.consignee_gstin && <p className="text-gray-400 font-mono text-xs">GST: {lr.consignee_gstin}</p>}
            {lr.consignee_phone && (
              <p className="text-gray-400 flex items-center gap-1 pt-1">
                <Phone size={11} /> {lr.consignee_phone}
              </p>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Vehicle + E-way Bill */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {(lr.vehicle_registration || lr.driver_name) && (
          <SectionCard icon={<Truck size={15} />} iconBg="bg-blue-50" iconColor="text-blue-600" title="Vehicle & Driver">
            <div className="space-y-3">
              {lr.vehicle_registration && (
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-blue-50/60">
                  <div className="w-8 h-8 rounded-lg bg-white border border-blue-100 flex items-center justify-center shrink-0">
                    <Truck size={14} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Vehicle</p>
                    <p className="font-semibold text-gray-900 text-sm">{lr.vehicle_registration}</p>
                  </div>
                </div>
              )}
              {lr.driver_name && (
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-green-50/60">
                  <div className="w-8 h-8 rounded-lg bg-white border border-green-100 flex items-center justify-center shrink-0">
                    <User size={14} className="text-green-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Driver</p>
                    <p className="font-semibold text-gray-900 text-sm">{lr.driver_name}</p>
                    {lr.driver_phone && <p className="text-xs text-gray-400 mt-0.5">{lr.driver_phone}</p>}
                  </div>
                </div>
              )}
              {lr.transport_type && (
                <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                  <span className="text-gray-500 text-sm">Transport Type</span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${lr.transport_type === 'market' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                    {lr.transport_type === 'market' ? 'Market Trip' : 'Fleet Vehicle'}
                  </span>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {(lr.eway_bill_number || lr.eway_bill_date) && (
          <SectionCard icon={<FileText size={15} />} iconBg="bg-amber-50" iconColor="text-amber-600" title="E-way Bill">
            <div className="divide-y divide-gray-50">
              {lr.eway_bill_number && <Row label="E-way Bill No." value={<span className="font-mono text-xs">{lr.eway_bill_number}</span>} />}
              {lr.eway_bill_date && <Row label="Issue Date" value={new Date(lr.eway_bill_date).toLocaleDateString('en-IN')} />}
              {lr.eway_bill_valid_until && <Row label="Valid Until" value={new Date(lr.eway_bill_valid_until).toLocaleDateString('en-IN')} />}
            </div>
          </SectionCard>
        )}
      </div>

      {/* Freight Details */}
      <SectionCard icon={<IndianRupee size={15} />} iconBg="bg-emerald-50" iconColor="text-emerald-600" title="Freight Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Charges breakdown */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Charges</p>
            <div className="divide-y divide-gray-50">
              <Row label="Freight Amount" value={fmt(Number(lr.freight_amount || 0))} />
              {Number(lr.loading_charges || 0) > 0 && <Row label="Loading Charges" value={fmt(Number(lr.loading_charges))} />}
              {Number(lr.unloading_charges || 0) > 0 && <Row label="Unloading Charges" value={fmt(Number(lr.unloading_charges))} />}
              {Number(lr.detention_charges || 0) > 0 && <Row label="Detention Charges" value={fmt(Number(lr.detention_charges))} />}
              {Number(lr.other_charges || 0) > 0 && <Row label="Other Charges" value={fmt(Number(lr.other_charges))} />}
            </div>
            <div className="mt-2 pt-2 border-t-2 border-gray-200 flex justify-between items-center">
              <span className="font-semibold text-gray-700">Total Freight</span>
              <span className="text-lg font-bold text-gray-900">{fmt(totalFreight)}</span>
            </div>
          </div>

          {/* Payment summary */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Payment</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-3 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                  <CreditCard size={14} className="text-gray-400" />
                  <span className="text-sm text-gray-600">Total</span>
                </div>
                <span className="font-semibold">{fmt(totalFreight)}</span>
              </div>
            </div>
            {/* Weight/packages */}
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                <Weight size={14} className="text-gray-400" />
                <div>
                  <p className="text-xs text-gray-400">Weight</p>
                  <p className="text-sm font-medium">{lr.total_weight ? `${lr.total_weight} kg` : '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                <Package size={14} className="text-gray-400" />
                <div>
                  <p className="text-xs text-gray-400">Packages</p>
                  <p className="text-sm font-medium">{(lr.total_packages ?? 0) > 0 ? lr.total_packages : '—'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Line items */}
      {lr.items && lr.items.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center">
              <Package size={14} className="text-slate-500" />
            </div>
            <h3 className="font-semibold text-gray-900">Items</h3>
            <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{lr.items.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="table-header">Description</th>
                  <th className="table-header">Packages</th>
                  <th className="table-header">Actual Wt.</th>
                  <th className="table-header">Charged Wt.</th>
                  <th className="table-header text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lr.items.map((item: any, idx: number) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell">
                      <div className="font-medium text-gray-900">{item.description}</div>
                      {item.hsn_code && <div className="text-xs text-gray-400 mt-0.5">HSN: {item.hsn_code}</div>}
                      {item.package_type && <div className="text-xs text-gray-400">{item.package_type}</div>}
                    </td>
                    <td className="table-cell">{item.packages ?? '—'}</td>
                    <td className="table-cell">{item.actual_weight != null ? `${item.actual_weight} kg` : '—'}</td>
                    <td className="table-cell">{item.charged_weight != null ? `${item.charged_weight} kg` : '—'}</td>
                    <td className="table-cell text-right font-semibold text-gray-900">
                      {idx === 0 ? fmt(totalFreight) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function generateLRPrintHTML(data: any): string {
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
      <td style="border:1px solid #ccc;padding:6px;text-align:right">${item.invoice_value ? '₹' + Number(item.invoice_value ?? 0).toLocaleString('en-IN') : ''}</td>
    </tr>
  `).join('');
  const terms = (data.terms || []).map((t: string) => `<li style="margin-bottom:4px">${t}</li>`).join('');
  return `<!DOCTYPE html><html><head><title>Lorry Receipt - ${data.lr_number || ''}</title>
  <style>
    body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:20px;font-size:13px;color:#333}
    .header{text-align:center;border-bottom:3px double #333;padding-bottom:15px;margin-bottom:15px}
    .header h1{margin:0;font-size:22px;letter-spacing:2px}
    .header p{margin:3px 0;font-size:12px;color:#666}
    .lr-number{font-size:16px;font-weight:bold;color:#1a56db}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:15px}
    .box{border:1px solid #ccc;border-radius:4px;padding:12px}
    .box h3{margin:0 0 8px 0;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #eee;padding-bottom:5px}
    .box p{margin:3px 0}.box .label{color:#888;font-size:11px}.box .value{font-weight:600}
    table{width:100%;border-collapse:collapse;margin:15px 0}
    th{background:#f5f5f5;border:1px solid #ccc;padding:8px;font-size:11px;text-transform:uppercase}
    .summary{text-align:right;margin-top:10px}.summary td{padding:4px 10px}
    .total-row{font-size:16px;font-weight:bold;border-top:2px solid #333}
    .terms{font-size:11px;color:#666;margin-top:20px}
    .signatures{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:50px;text-align:center}
    .signatures div{border-top:1px solid #999;padding-top:8px;font-size:12px}
    @media print{body{margin:0;padding:10px}}
  </style></head><body>
  <div class="header">
    <h1>${data.company_name || 'TRANSPORT ERP'}</h1>
    <p>${data.company_address || ''}</p>
    <p>GSTIN: ${data.company_gstin || ''} | Phone: ${data.company_phone || ''}</p>
    <div style="margin-top:10px"><span style="font-size:18px;font-weight:bold;letter-spacing:3px">LORRY RECEIPT / CONSIGNMENT NOTE</span></div>
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
  <table><thead><tr>
    <th style="width:40px">S.No</th><th>Description</th><th style="width:60px">Pkgs</th>
    <th style="width:80px">Type</th><th style="width:90px">Act. Wt (Kg)</th>
    <th style="width:90px">Chg. Wt (Kg)</th><th style="width:100px">Invoice No.</th><th style="width:100px">Invoice Value</th>
  </tr></thead><tbody>
    ${itemRows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#999">No items</td></tr>'}
  </tbody></table>
  <div style="display:grid;grid-template-columns:1fr 300px;gap:20px">
    <div>
      <p><span class="label">Payment Mode:</span> <span class="value" style="text-transform:uppercase">${(data.payment_mode || '').replace(/_/g,' ')}</span></p>
      ${data.remarks ? `<p><span class="label">Remarks:</span> ${data.remarks}</p>` : ''}
      ${data.insurance_company ? `<p><span class="label">Insurance:</span> ${data.insurance_company} (₹${Number(data.insurance_amount ?? 0).toLocaleString('en-IN')})</p>` : ''}
      ${data.declared_value ? `<p><span class="label">Declared Value:</span> ₹${Number(data.declared_value ?? 0).toLocaleString('en-IN')}</p>` : ''}
    </div>
    <table class="summary">
      <tr><td class="label">Freight:</td><td>₹${Number(data.freight_amount ?? 0).toLocaleString('en-IN')}</td></tr>
      ${data.loading_charges ? `<tr><td class="label">Loading:</td><td>₹${Number(data.loading_charges ?? 0).toLocaleString('en-IN')}</td></tr>` : ''}
      ${data.unloading_charges ? `<tr><td class="label">Unloading:</td><td>₹${Number(data.unloading_charges ?? 0).toLocaleString('en-IN')}</td></tr>` : ''}
      ${data.detention_charges ? `<tr><td class="label">Detention:</td><td>₹${Number(data.detention_charges ?? 0).toLocaleString('en-IN')}</td></tr>` : ''}
      ${data.other_charges ? `<tr><td class="label">Other:</td><td>₹${Number(data.other_charges ?? 0).toLocaleString('en-IN')}</td></tr>` : ''}
      <tr><td class="label" style="border-top:1px solid #ccc;padding-top:6px"><strong>Subtotal:</strong></td><td style="border-top:1px solid #ccc;padding-top:6px"><strong>₹${Number(data.subtotal ?? 0).toLocaleString('en-IN')}</strong></td></tr>
      <tr><td class="label">GST (${data.gst_percentage || 5}%):</td><td>₹${Number(data.gst_amount ?? 0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
      <tr class="total-row"><td style="padding-top:8px"><strong>TOTAL:</strong></td><td style="padding-top:8px"><strong>₹${Number(data.total_amount ?? 0).toLocaleString('en-IN',{minimumFractionDigits:2})}</strong></td></tr>
    </table>
  </div>
  <div class="terms"><strong>Terms &amp; Conditions:</strong><ol style="padding-left:18px;margin-top:5px">${terms}</ol></div>
  <div class="signatures"><div>Consignor's Signature</div><div>Transport Company</div><div>Consignee's Signature</div></div>
  <p style="text-align:center;font-size:10px;color:#999;margin-top:30px">Computer-generated document. Printed on ${new Date().toLocaleString('en-IN')}</p>
</body></html>`;
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  IndianRupee, Truck, MapPin, User, CheckCircle, Clock, Image, ExternalLink,
  Bell, AlertCircle, History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { financeManagerService, type PendingAdvanceTripItem, type DriverAdvanceRequest, type PaymentHistoryItem } from '@/services/financeManagerService';

const ADVANCE_AMOUNT = 1500;

const fileUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  const clean = url.replace(/^https?:\/\/localhost:\d+/, 'https://api.kavyatransports.com');
  return clean.startsWith('http') ? clean : `https://api.kavyatransports.com${clean}`;
};

type Tab = 'post-loading' | 'driver-requests';
type PostLoadingSub = 'pending' | 'paid';

export default function TripAdvancePaymentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('driver-requests');
  const [postLoadingSub, setPostLoadingSub] = useState<PostLoadingSub>('pending');
  const [confirmingTripId, setConfirmingTripId] = useState<number | null>(null);
  const [confirmingReqId, setConfirmingReqId] = useState<number | null>(null);
  const [viewImg, setViewImg] = useState<string | null>(null);

  // Post-loading advances (trips where driver uploaded loading photo)
  const { data: trips = [], isLoading: tripsLoading } = useQuery({
    queryKey: ['fm-pending-advances'],
    queryFn: () => financeManagerService.getPendingAdvanceTrips(),
    refetchInterval: 20_000,
  });

  // Driver-requested advances (via "Request Advance" button in app)
  const { data: advanceRequests = [], isLoading: reqLoading } = useQuery({
    queryKey: ['fm-driver-advance-requests'],
    queryFn: () => financeManagerService.getDriverAdvanceRequests(),
    refetchInterval: 20_000,
  });

  // Payment history for paid post-loading advances
  const { data: paymentHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ['fm-payment-history'],
    queryFn: () => financeManagerService.getPaymentHistory(200),
    enabled: tab === 'post-loading' && postLoadingSub === 'paid',
  });
  const paidAdvanceHistory = (Array.isArray(paymentHistory) ? paymentHistory as PaymentHistoryItem[] : [])
    .filter(item => item.type === 'TRIP_ADVANCE');

  const payMutation = useMutation({
    mutationFn: (tripId: number) => financeManagerService.payTripAdvance(tripId),
    onSuccess: (_result, tripId) => {
      toast.success(`Advance of ₹${ADVANCE_AMOUNT} paid for trip ${(trips as PendingAdvanceTripItem[]).find(t => t.id === tripId)?.trip_number || tripId}`);
      setConfirmingTripId(null);
      queryClient.invalidateQueries({ queryKey: ['fm-pending-advances'] });
      queryClient.invalidateQueries({ queryKey: ['fm-dashboard'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Payment failed. Please try again.');
      setConfirmingTripId(null);
    },
  });

  const ackMutation = useMutation({
    mutationFn: (advanceId: number) => financeManagerService.acknowledgeAdvanceRequest(advanceId),
    onSuccess: (_result, advanceId) => {
      const req = (advanceRequests as DriverAdvanceRequest[]).find(r => r.id === advanceId);
      toast.success(`Advance request from ${req?.driver_name || 'driver'} acknowledged`);
      setConfirmingReqId(null);
      queryClient.invalidateQueries({ queryKey: ['fm-driver-advance-requests'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to acknowledge request.');
      setConfirmingReqId(null);
    },
  });

  const tripList = Array.isArray(trips) ? trips as PendingAdvanceTripItem[] : [];
  const reqList = Array.isArray(advanceRequests) ? advanceRequests as DriverAdvanceRequest[] : [];
  const pendingReqCount = reqList.filter(r => r.status === 'PENDING').length;

  const statusBadge = (status: string) => {
    if (status === 'APPROVED') return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Approved</span>;
    if (status === 'REJECTED') return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Rejected</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Pending</span>;
  };

  const fmtDate = (ts: string | null | undefined) => {
    if (!ts) return '—';
    const s = ts.endsWith('Z') || ts.includes('+') ? ts : ts + 'Z';
    return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <div className="space-y-5">
      {/* Lightbox */}
      {viewImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setViewImg(null)}
        >
          <img
            src={viewImg}
            alt="Loading photo"
            className="max-w-full max-h-[88vh] rounded-xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <IndianRupee size={22} className="text-amber-600" />
            Advance Payments
          </h1>
          <p className="page-subtitle">Manage driver advance requests and post-loading payments</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('driver-requests')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'driver-requests' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Bell size={15} />
          Driver Requests
          {pendingReqCount > 0 && (
            <span className="bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{pendingReqCount}</span>
          )}
        </button>
        <button
          onClick={() => setTab('post-loading')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'post-loading' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Truck size={15} />
          Post-Loading
          {tripList.length > 0 && (
            <span className="bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{tripList.length}</span>
          )}
        </button>
      </div>

      {/* ── Tab: Driver Requests ── */}
      {tab === 'driver-requests' && (
        <>
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800 flex items-start gap-3">
            <Bell size={18} className="mt-0.5 flex-shrink-0 text-blue-600" />
            <p>
              Drivers can request their <strong>₹1,500 advance</strong> at any time from the app. Acknowledge the request once you have paid the driver.
            </p>
          </div>

          {reqLoading ? (
            <div className="text-center py-14 text-gray-400">Loading requests…</div>
          ) : reqList.length === 0 ? (
            <div className="card text-center py-14">
              <CheckCircle size={40} className="mx-auto mb-3 text-green-400" />
              <p className="text-gray-500 font-medium">No advance requests yet</p>
              <p className="text-gray-400 text-sm mt-1">Driver-requested advances will appear here.</p>
            </div>
          ) : (
            <div className="card overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Driver</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Trip</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Requested On</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {reqList.map(req => (
                    <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <User size={14} className="text-blue-600" />
                          </div>
                          <span className="font-medium text-gray-900">{req.driver_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {req.trip_number ? (
                          <button
                            onClick={() => req.trip_id && navigate(`/trips/${req.trip_id}`)}
                            className="text-primary-600 hover:underline font-medium flex items-center gap-1"
                          >
                            {req.trip_number} <ExternalLink size={11} />
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        ₹{Number(req.amount).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(req.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">{statusBadge(req.status)}</td>
                      <td className="px-4 py-3 text-right">
                        {req.status === 'PENDING' && (
                          confirmingReqId === req.id ? (
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => setConfirmingReqId(null)}
                                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded-lg"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => ackMutation.mutate(req.id)}
                                disabled={ackMutation.isPending}
                                className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 disabled:opacity-60"
                              >
                                {ackMutation.isPending ? <Clock size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                Confirm Paid
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmingReqId(req.id)}
                              className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 ml-auto"
                            >
                              <IndianRupee size={12} />
                              Mark Paid
                            </button>
                          )
                        )}
                        {req.status !== 'PENDING' && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Tab: Post-Loading Advances ── */}
      {tab === 'post-loading' && (
        <>
          {/* Sub-tabs: Pending / Paid History */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setPostLoadingSub('pending')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${postLoadingSub === 'pending' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Clock size={14} />
              Pending
              {tripList.length > 0 && (
                <span className="bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{tripList.length}</span>
              )}
            </button>
            <button
              onClick={() => setPostLoadingSub('paid')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${postLoadingSub === 'paid' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <History size={14} />
              Paid History
            </button>
          </div>

          {/* ── Pending sub-tab ── */}
          {postLoadingSub === 'pending' && (
            <>
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-start gap-3">
                <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-amber-600" />
                <p>
                  Once a driver uploads the <strong>loading photo</strong>, pay the fixed advance of{' '}
                  <strong>₹{ADVANCE_AMOUNT.toLocaleString('en-IN')}</strong>. Both the driver and fleet manager are notified automatically.
                </p>
              </div>

              {tripsLoading ? (
                <div className="text-center py-14 text-gray-400">Loading pending advances…</div>
              ) : tripList.length === 0 ? (
                <div className="card text-center py-14">
                  <CheckCircle size={40} className="mx-auto mb-3 text-green-400" />
                  <p className="text-gray-500 font-medium">All post-loading advances are up to date!</p>
                  <p className="text-gray-400 text-sm mt-1">No trips are waiting for advance payment.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {tripList.map(trip => (
                    <div key={trip.id} className="card flex flex-col gap-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <button
                            onClick={() => navigate(`/trips/${trip.id}`)}
                            className="font-bold text-primary-700 hover:underline text-base flex items-center gap-1"
                          >
                            {trip.trip_number}
                            <ExternalLink size={13} />
                          </button>
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                            <MapPin size={12} />
                            {trip.origin} → {trip.destination}
                          </div>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium capitalize">
                          {trip.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1.5 text-gray-700">
                          <User size={14} />
                          <span>{trip.driver_name}</span>
                        </div>
                        {trip.vehicle_registration && (
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <Truck size={14} />
                            <span>{trip.vehicle_registration}</span>
                          </div>
                        )}
                      </div>

                      {trip.loaded_image_url && (() => {
                        const imgUrl = fileUrl(trip.loaded_image_url);
                        return imgUrl ? (
                        <div>
                          <p className="text-xs text-gray-400 mb-1.5 uppercase tracking-wide font-medium">Loading Photo</p>
                          <button
                            onClick={() => setViewImg(imgUrl)}
                            className="relative block w-full h-28 rounded-lg overflow-hidden border border-gray-200 hover:border-primary-400 transition-colors group"
                          >
                            <img
                              src={imgUrl}
                              alt="Loaded"
                              className="w-full h-full object-cover group-hover:opacity-90 transition"
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity">
                              <Image size={22} className="text-white" />
                            </div>
                          </button>
                        </div>
                        ) : null;
                      })()}

                      <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
                        <span className="text-sm text-gray-600">Advance to pay</span>
                        <span className="font-bold text-green-700 text-base">₹{ADVANCE_AMOUNT.toLocaleString('en-IN')}</span>
                      </div>

                      {confirmingTripId === trip.id ? (
                        <div className="space-y-2">
                          <p className="text-sm text-gray-700 text-center font-medium">
                            Confirm paying ₹{ADVANCE_AMOUNT} to {trip.driver_name}?
                          </p>
                          <div className="flex gap-2">
                            <button onClick={() => setConfirmingTripId(null)} className="btn-secondary flex-1 text-sm">Cancel</button>
                            <button
                              onClick={() => payMutation.mutate(trip.id)}
                              disabled={payMutation.isPending}
                              className="btn-success flex-1 text-sm flex items-center justify-center gap-1.5"
                            >
                              {payMutation.isPending ? <Clock size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                              Confirm Pay
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingTripId(trip.id)}
                          className="btn-success w-full flex items-center justify-center gap-2"
                        >
                          <IndianRupee size={16} />
                          Pay ₹{ADVANCE_AMOUNT.toLocaleString('en-IN')} Advance
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Paid History sub-tab ── */}
          {postLoadingSub === 'paid' && (
            <>
              {historyLoading ? (
                <div className="text-center py-14 text-gray-400">Loading history…</div>
              ) : paidAdvanceHistory.length === 0 ? (
                <div className="card text-center py-14">
                  <History size={40} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 font-medium">No paid advances yet</p>
                  <p className="text-gray-400 text-sm mt-1">Paid post-loading advances will appear here.</p>
                </div>
              ) : (
                <div className="card overflow-hidden p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Driver</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Trip</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Route</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid On</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Proof</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {paidAdvanceHistory.map((item, idx) => {
                        const driverName = item.title.replace('Trip Advance — ', '');
                        return (
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                  <User size={13} className="text-green-600" />
                                </div>
                                <span className="font-medium text-gray-900">{driverName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-700 font-medium">{item.subtitle || '—'}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{item.detail || '—'}</td>
                            <td className="px-4 py-3 font-semibold text-green-700">
                              ₹{item.amount_rupees.toLocaleString('en-IN')}
                            </td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(item.date)}</td>
                            <td className="px-4 py-3">
                              {item.payment_proof_url ? (
                                <a href={item.payment_proof_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 rounded-md text-xs font-medium hover:bg-purple-100 transition-colors">
                                  <span>📸</span> View
                                </a>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

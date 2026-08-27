import { useState, useEffect } from "react";
import { api } from "../api/client";
import { Package, MapPin, Phone, CheckCircle, Clock, Truck, XCircle, Search, RotateCcw } from "lucide-react";

const STATUSES = [
  { id: "PENDING", label: "New Orders", icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  { id: "PROCESSING", label: "Processing", icon: Package, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  { id: "SHIPPED", label: "Shipped", icon: Truck, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  { id: "DELIVERED", label: "Delivered", icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  { id: "RETURN_REQUESTED", label: "Return Req.", icon: RotateCcw, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20" },
  { id: "RETURNED", label: "Returned", icon: RotateCcw, color: "text-slate-500", bg: "bg-slate-500/10", border: "border-slate-500/20" },
  { id: "CANCELLED", label: "Cancelled", icon: XCircle, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" },
];

export default function Orders({ tenantId, tenantObj, onTenantsChanged }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [returnDays, setReturnDays] = useState(tenantObj?.return_days ?? 7);
  const [cancellationHours, setCancellationHours] = useState(tenantObj?.cancellation_hours ?? 24);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (tenantObj) {
      setReturnDays(tenantObj.return_days ?? 7);
      setCancellationHours(tenantObj.cancellation_hours ?? 24);
    }
  }, [tenantObj]);

  useEffect(() => {
    if (!tenantId) return;
    loadOrders();
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, [tenantId]);

  const loadOrders = () => {
    api.getOrders(tenantId)
      .then(res => {
        setOrders(res.orders || []);
        setLoading(false);
      })
      .catch(console.error);
  };

  const updateStatus = async (orderId, newStatus) => {
    // Optimistic update
    setOrders(orders.map(o => o._id === orderId ? { ...o, status: newStatus } : o));
    try {
      await api.updateOrderStatus(orderId, newStatus);
    } catch (e) {
      alert("Failed to update status");
      loadOrders();
    }
  };

  const handleVerifyPayment = async (orderId) => {
    setOrders(orders.map(o => o._id === orderId ? { ...o, payment_status: "VERIFIED" } : o));
    try {
      await api.verifyPayment(orderId);
    } catch (e) {
      alert("Failed to verify payment");
      loadOrders();
    }
  };

  const handleSaveSettings = async () => {
    if (!tenantId || !tenantObj) return;
    setSavingSettings(true);
    try {
      await api.updateTenant(tenantId, { 
        ...tenantObj, 
        return_days: returnDays,
        cancellation_hours: cancellationHours
      });
      if (onTenantsChanged) await onTenantsChanged();
      alert("Order policies updated successfully!");
    } catch (e) {
      alert("Failed to update settings: " + e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const filteredOrders = orders.filter(o => 
    o.customer_phone.includes(search) || 
    (o.product_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-canvas p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-semibold text-ink">Order Tracking</h1>
          <p className="text-[14px] text-muted mt-1">Manage incoming AI orders and track fulfillment.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input 
            type="text" 
            placeholder="Search by phone or product..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-surface border border-hair rounded-xl text-[13px] text-ink focus:outline-none focus:border-brand w-64 shadow-sm"
          />
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-x-auto pb-4 custom-scrollbar">
        {STATUSES.map(col => {
          const colOrders = filteredOrders.filter(o => o.status === col.id);
          
          return (
            <div key={col.id} className="w-[320px] flex-shrink-0 flex flex-col">
              <div className={`flex items-center justify-between p-3 rounded-t-xl border-t border-l border-r ${col.border} ${col.bg}`}>
                <div className="flex items-center gap-2">
                  <col.icon size={16} className={col.color} />
                  <span className={`text-[13px] font-bold uppercase tracking-wider ${col.color}`}>{col.label}</span>
                </div>
                <div className="text-[11px] font-bold bg-white/20 dark:bg-black/20 px-2 py-0.5 rounded-full text-ink">{colOrders.length}</div>
              </div>
              
              <div className={`flex-1 bg-surface border-l border-r border-b ${col.border} rounded-b-xl p-3 flex flex-col gap-3 overflow-y-auto custom-scrollbar`}>
                {colOrders.length === 0 ? (
                  <div className="text-[12px] text-muted text-center italic py-8">No orders</div>
                ) : (
                  colOrders.map(order => (
                    <div key={order._id} className="bg-canvas border border-hair rounded-xl p-4 shadow-sm hover:border-brand/30 hover:shadow-md transition-all group">
                      <div className="flex justify-between items-center mb-1">
                        <div className="text-[10px] font-mono text-muted/80">{order.order_id || "Legacy"}</div>
                        <div className="bg-brand/10 text-brand text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">x{order.quantity}</div>
                      </div>
                      <div className="font-bold text-ink text-[14px] leading-tight pr-2 mb-2">{order.product_name}</div>
                      
                      <div className="space-y-1.5 mb-4">
                        <div className="flex items-center gap-2 text-[12px] text-muted">
                          <Phone size={12} className="text-brand/60" /> {order.customer_phone}
                        </div>
                        {order.collected_info && typeof order.collected_info === 'object' && Object.entries(order.collected_info).map(([k, v]) => (
                          <div key={k} className="flex items-start gap-2 text-[12px] text-muted">
                            <MapPin size={12} className="text-brand/60 mt-0.5 flex-shrink-0" />
                            <span className="truncate" title={v}><span className="font-medium text-ink/70">{k}:</span> {v}</span>
                          </div>
                        ))}
                        {order.collected_info?.raw && (
                          <div className="flex items-start gap-2 text-[12px] text-muted">
                            <MapPin size={12} className="text-brand/60 mt-0.5 flex-shrink-0" />
                            <span className="truncate" title={order.collected_info.raw}>{order.collected_info.raw}</span>
                          </div>
                        )}
                        <div className="text-[10px] text-muted/60 mt-2 flex justify-between items-center">
                          <span>{new Date(order.created_at).toLocaleString()}</span>
                          {order.payment_status === "VERIFIED" && <span className="text-emerald-500 font-bold">✓ PAID</span>}
                        </div>
                      </div>
                      
                      {order.return_reason && (
                        <div className="mb-4 bg-orange-500/10 border border-orange-500/20 rounded-lg p-2.5">
                          <div className="text-[11px] font-bold text-orange-600 mb-0.5 flex items-center gap-1">
                            <RotateCcw size={12} /> Return Reason
                          </div>
                          <div className="text-[11px] text-orange-700/80 italic">{order.return_reason}</div>
                        </div>
                      )}

                      {order.payment_status === "VERIFICATION_PENDING" && (
                        <div className="mb-4 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                          <div className="text-[11px] font-bold text-blue-500 mb-1">Payment Proof Submitted</div>
                          <div className="text-[11px] text-ink/70 font-mono mb-2 truncate">ID: {order.payment_proof}</div>
                          <button 
                            onClick={() => handleVerifyPayment(order._id)}
                            className="w-full bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-bold py-1.5 rounded transition-colors"
                          >
                            VERIFY & NOTIFY CUSTOMER
                          </button>
                        </div>
                      )}

                      <div className="pt-3 border-t border-hair flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                        <select 
                          className="bg-surface border border-hair rounded-lg text-[11px] font-semibold text-ink px-2 py-1 outline-none focus:border-brand w-full"
                          value={order.status}
                          onChange={(e) => updateStatus(order._id, e.target.value)}
                        >
                          {STATUSES.map(s => (
                            <option key={s.id} value={s.id}>Move to {s.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Advanced Settings for Orders */}
      {(tenantObj?.returns_enabled || tenantObj?.cancellations_enabled) && (
        <div className="mt-8 bg-surface border border-hair rounded-xl p-6">
          <h3 className="text-[15px] font-display font-semibold mb-4 text-ink">Advanced Settings</h3>
          <div className="flex flex-col md:flex-row gap-6 items-end">
            
            {tenantObj?.returns_enabled && (
              <div className="w-full md:w-1/3">
                <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Return Window (Days)</label>
                <input 
                  type="number"
                  min="0"
                  value={returnDays}
                  onChange={e => setReturnDays(parseInt(e.target.value) || 0)}
                  className="w-full bg-canvas border border-hair rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand transition-colors font-mono" 
                />
                <p className="text-[11px] text-muted mt-2">Days allowed for return after delivery.</p>
              </div>
            )}

            {tenantObj?.cancellations_enabled && (
              <div className="w-full md:w-1/3">
                <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Cancellation Window (Hours)</label>
                <input 
                  type="number"
                  min="0"
                  value={cancellationHours}
                  onChange={e => setCancellationHours(parseInt(e.target.value) || 0)}
                  className="w-full bg-canvas border border-hair rounded-lg px-3 py-2 text-[13px] text-ink outline-none focus:border-brand transition-colors font-mono" 
                />
                <p className="text-[11px] text-muted mt-2">Hours allowed for cancellation after placing order.</p>
              </div>
            )}
            
            <button 
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="px-6 py-2.5 bg-brand text-white text-[13px] font-bold rounded-lg hover:bg-brand-deep transition-colors disabled:opacity-50"
            >
              {savingSettings ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

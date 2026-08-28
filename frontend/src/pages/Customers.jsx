import { useState, useEffect } from "react";
import { Users, Trash2, Phone, Search, RefreshCw, Mail, Calendar, ShoppingBag, Download, X, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../api/client";

export default function Customers({ activeTenant }) {
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [expandedOrders, setExpandedOrders] = useState(new Set());

  const toggleOrders = (phone) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  };

  const loadCustomers = async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const [custRes, ordRes] = await Promise.all([
        api.getCustomers(activeTenant),
        api.getOrders(activeTenant).catch(() => ({ orders: [] }))
      ]);
      setCustomers(custRes.customers || []);
      setOrders(ordRes.orders || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [activeTenant]);

  const handleDelete = async (phone) => {
    if (!confirm("Delete this customer profile completely?")) return;
    try {
      await api.deleteCustomer(activeTenant, phone);
      loadCustomers();
    } catch (e) {
      alert("Failed to delete");
    }
  };

  const filtered = customers.filter(c => 
    c.customer_phone.includes(searchTerm) || 
    JSON.stringify(c.profile || {}).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExport = () => {
    if (!exportFrom || !exportTo) {
      alert("Please select both From and To dates");
      return;
    }
    
    const from = new Date(exportFrom);
    const to = new Date(exportTo);
    to.setHours(23, 59, 59, 999);
    
    const exportData = customers.filter(c => {
      if (!c.last_updated) return false;
      const d = new Date(c.last_updated);
      return d >= from && d <= to;
    });

    if (exportData.length === 0) {
      alert("No customers found in this date range.");
      return;
    }

    const headers = ["Phone", "Name", "Email", "Other Details", "Orders", "Last Updated"];
    const rows = exportData.map(c => {
      const profile = c.profile || {};
      const nameKey = Object.keys(profile).find(k => k.toLowerCase().includes("name") && !k.toLowerCase().includes("company"));
      const emailKey = Object.keys(profile).find(k => k.toLowerCase().includes("email"));
      const name = nameKey ? profile[nameKey] : "";
      const email = emailKey ? profile[emailKey] : "";
      
      const otherDetails = Object.keys(profile)
        .filter(k => k !== nameKey && k !== emailKey)
        .map(k => `${k}: ${profile[k]}`)
        .join("; ");
        
      const customerOrders = orders.filter(o => o.customer_phone === c.customer_phone)
        .map(o => `${o.product_name} (${o.order_id} - ${o.status})`)
        .join("; ");
        
      return [
        c.customer_phone,
        name,
        email,
        otherDetails,
        customerOrders,
        c.last_updated ? new Date(c.last_updated).toLocaleString() : ""
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `customers_export_${exportFrom}_to_${exportTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportModal(false);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Users className="text-brand" />
            Customer Directory
          </h1>
          <p className="text-white/50 mt-1">Manage permanently saved customer details</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input 
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-brand w-64"
            />
          </div>
          <button 
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand/10 text-brand border border-brand/20 rounded-xl hover:bg-brand/20 transition-colors text-sm font-medium"
          >
            <Download size={16} />
            Export CSV
          </button>
          <button 
            onClick={loadCustomers}
            className="p-2.5 bg-white/[0.03] border border-white/10 rounded-xl hover:bg-white/[0.08] text-white transition-colors"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111111] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Download size={18} className="text-brand" /> Export Customer Data
              </h3>
              <button onClick={() => setShowExportModal(false)} className="p-1 text-white/40 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/60 uppercase tracking-wider mb-2">From Date</label>
                <div className="relative">
                  <input 
                    type="date" 
                    value={exportFrom}
                    onChange={(e) => setExportFrom(e.target.value)}
                    onClick={(e) => e.target.showPicker && e.target.showPicker()}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-brand transition-colors cursor-pointer [color-scheme:dark]" 
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-white/60 uppercase tracking-wider">To Date</label>
                  <button 
                    onClick={() => {
                      const today = new Date();
                      const yyyy = today.getFullYear();
                      const mm = String(today.getMonth() + 1).padStart(2, '0');
                      const dd = String(today.getDate()).padStart(2, '0');
                      setExportTo(`${yyyy}-${mm}-${dd}`);
                    }}
                    className="text-[10px] bg-brand/20 text-brand px-2 py-0.5 rounded border border-brand/30 hover:bg-brand/30 transition-colors uppercase font-bold"
                  >
                    Set Today
                  </button>
                </div>
                <div className="relative">
                  <input 
                    type="date" 
                    value={exportTo}
                    onChange={(e) => setExportTo(e.target.value)}
                    onClick={(e) => e.target.showPicker && e.target.showPicker()}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-brand transition-colors cursor-pointer [color-scheme:dark]" 
                  />
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-white/10 flex justify-end gap-3 bg-white/[0.02]">
              <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={handleExport} className="px-5 py-2 bg-brand text-white text-sm font-bold rounded-xl shadow-lg shadow-brand/20 hover:bg-brand-deep transition-all">
                Download CSV
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                <th className="px-6 py-4 font-medium text-white/70">Customer Phone</th>
                <th className="px-6 py-4 font-medium text-white/70">Name</th>
                <th className="px-6 py-4 font-medium text-white/70">Email</th>
                <th className="px-6 py-4 font-medium text-white/70">Other Details</th>
                <th className="px-6 py-4 font-medium text-white/70">Orders</th>
                <th className="px-6 py-4 font-medium text-white/70">Last Updated</th>
                <th className="px-6 py-4 font-medium text-white/70 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-white/40">Loading customers...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-white/40">No customers found.</td>
                </tr>
              ) : (
                filtered.map((c, i) => {
                  const profile = c.profile || {};
                  // Try to find common name/email keys (case insensitive)
                  const nameKey = Object.keys(profile).find(k => k.toLowerCase().includes("name") && !k.toLowerCase().includes("company"));
                  const emailKey = Object.keys(profile).find(k => k.toLowerCase().includes("email"));
                  
                  const name = nameKey ? profile[nameKey] : "-";
                  const email = emailKey ? profile[emailKey] : "-";
                  
                  // Filter out name and email from "other details"
                  const otherKeys = Object.keys(profile).filter(k => k !== nameKey && k !== emailKey);

                  return (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Phone size={14} className="text-white/40" />
                          <span className="font-mono text-white/90">{c.customer_phone}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-white">{name}</td>
                      <td className="px-6 py-4">
                        {email !== "-" && (
                          <div className="flex items-center gap-2 text-white/70">
                            <Mail size={14} className="text-brand" />
                            {email}
                          </div>
                        )}
                        {email === "-" && <span className="text-white/30">-</span>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {otherKeys.map(k => (
                            <span key={k} className="px-2 py-1 bg-white/[0.05] border border-white/10 rounded text-[11px] text-white/70">
                              <span className="text-white/40 mr-1">{k}:</span>
                              {profile[k]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2">
                          {(() => {
                            const custOrders = orders.filter(o => o.customer_phone === c.customer_phone);
                            if (custOrders.length === 0) {
                              return <span className="text-white/30 text-xs">-</span>;
                            }
                            
                            const isExpanded = expandedOrders.has(c.customer_phone);
                            
                            return (
                              <div className="flex flex-col gap-2">
                                <button 
                                  onClick={() => toggleOrders(c.customer_phone)}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-[11px] text-white/70 w-max"
                                >
                                  <ShoppingBag size={12} className="text-brand" />
                                  View {custOrders.length} Order{custOrders.length > 1 ? 's' : ''}
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                
                                {isExpanded && (
                                  <div className="flex flex-col gap-2 mt-1">
                                    {custOrders.map((o, idx) => (
                                      <div key={idx} className="flex flex-col bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[11px] animate-in fade-in slide-in-from-top-1 duration-200">
                                        <div className="flex items-center gap-1.5 font-medium text-white/80">
                                          <ShoppingBag size={12} className="text-brand" />
                                          {o.product_name} x{o.quantity || 1}
                                        </div>
                                        <div className="text-white/40 mt-1 flex justify-between items-center">
                                          <span className="font-mono">{o.order_id}</span>
                                          <span className={`px-1.5 py-0.5 rounded uppercase text-[9px] font-bold ${
                                            o.status === "DELIVERED" ? "bg-emerald-500/10 text-emerald-400" :
                                            o.status === "PENDING" ? "bg-amber-500/10 text-amber-400" :
                                            "bg-blue-500/10 text-blue-400"
                                          }`}>
                                            {o.status}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-white/50 text-xs">
                          <Calendar size={12} />
                          {c.last_updated ? new Date(c.last_updated).toLocaleString() : "-"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleDelete(c.customer_phone)}
                          className="p-2 hover:bg-rose-500/20 text-rose-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

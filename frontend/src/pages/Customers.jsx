import { useState, useEffect } from "react";
import { Users, Trash2, Phone, Search, RefreshCw, Mail, Calendar } from "lucide-react";
import { api } from "../api/client";

export default function Customers({ activeTenant }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const loadCustomers = async () => {
    if (!activeTenant) return;
    setLoading(true);
    try {
      const res = await api.getCustomers(activeTenant);
      setCustomers(res.customers || []);
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
            onClick={loadCustomers}
            className="p-2.5 bg-white/[0.03] border border-white/10 rounded-xl hover:bg-white/[0.08] text-white transition-colors"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                <th className="px-6 py-4 font-medium text-white/70">Customer Phone</th>
                <th className="px-6 py-4 font-medium text-white/70">Name</th>
                <th className="px-6 py-4 font-medium text-white/70">Email</th>
                <th className="px-6 py-4 font-medium text-white/70">Other Details</th>
                <th className="px-6 py-4 font-medium text-white/70">Last Updated</th>
                <th className="px-6 py-4 font-medium text-white/70 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-white/40">Loading customers...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-white/40">No customers found.</td>
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

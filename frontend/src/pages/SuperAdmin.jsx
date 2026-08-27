import { useState, useEffect, useCallback } from "react";
import { Users, Building, Bot, ShieldAlert, MonitorPlay, Save, Database, Activity, TrendingUp, AlertTriangle, MessageSquare, Plus, ChevronDown, ChevronUp, Calendar, DollarSign, Send, X, Trash2, Eye, EyeOff } from "lucide-react";
import { api } from "../api/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

export default function SuperAdmin({ user, activeTab }) {
  const [clients, setClients] = useState([]);
  const [usageData, setUsageData] = useState([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [videoUrl, setVideoUrl] = useState("");
  const [demoVideoUrl, setDemoVideoUrl] = useState("");
  const [messages, setMessages] = useState([]);
  const [globalSettings, setGlobalSettings] = useState({ master_system_prompt: "" });
  const [loading, setLoading] = useState(true);
  
  // UI State
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false);
  const [expandedClient, setExpandedClient] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [editingLimits, setEditingLimits] = useState(null);
  
  // New Client Form
  const [newClient, setNewClient] = useState({ name: "", email: "", password: "" });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const metricsRes = await api.saGetMetrics();
      setClients(metricsRes.clients || []);
      setUsageData(metricsRes.usage_data || []);
      setTotalDocs(metricsRes.total_documents || 0);
      
      const settingsRes = await api.saGetSettings();
      setVideoUrl(settingsRes.settings?.hero_video_url || "");
      setDemoVideoUrl(settingsRes.settings?.demo_video_url || "");
      
      const globalRes = await api.getGlobalSettings();
      setGlobalSettings(globalRes || { master_system_prompt: "" });
      
      if (activeTab === "settings") {
        const msgRes = await api.saGetMessages();
        setMessages(msgRes.messages || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateClient = async () => {
    if (!newClient.name || !newClient.email || !newClient.password) return alert("Fill all fields");
    try {
      await api.saCreateClient(newClient);
      setNewClient({ name: "", email: "", password: "" });
      loadData();
    } catch (e) {
      alert("Failed: " + e.message);
    }
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    const next = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      await api.saUpdateClientStatus(userId, next);
      loadData();
    } catch (e) {
      alert("Failed to update status");
    }
  };

  const handleDeleteClient = async () => {
    if (deleteConfirmText.toLowerCase() !== "confirm") {
      return alert("You must type 'confirm' to delete this client.");
    }
    try {
      await api.saDeleteClient(clientToDelete.user_id);
      setClientToDelete(null);
      setDeleteConfirmText("");
      loadData();
    } catch (e) {
      alert("Failed to delete client: " + e.message);
    }
  };

  const handleSaveLimits = async (tenantId) => {
    if (!editingLimits || editingLimits.tenant_id !== tenantId) return;
    try {
      let reqs = editingLimits.order_requirements || [];
      if (typeof reqs === "string") {
        reqs = reqs.split(",").map(s => s.trim()).filter(s => s);
      }
      
      await api.saUpdateTenantLimits(tenantId, {
        rate_limit_per_minute: parseInt(editingLimits.rate_limit_per_minute) || 25,
        retention_hours: parseInt(editingLimits.retention_hours) || 72,
        orders_enabled: !!editingLimits.orders_enabled,
        order_requirements: reqs,
        returns_enabled: !!editingLimits.returns_enabled,
        cancellations_enabled: !!editingLimits.cancellations_enabled,
        cancellation_hours: parseInt(editingLimits.cancellation_hours) || 24,
        custom_statuses: editingLimits.custom_statuses ? editingLimits.custom_statuses.split(",").map(s => s.trim()).filter(s => s) : null,
        cancellation_cutoff_status: editingLimits.cancellation_cutoff_status || "SHIPPED"
      });
      setEditingLimits(null);
      loadData();
    } catch (e) {
      alert("Failed to update limits: " + e.message);
    }
  };

  const handleSaveVideo = async () => {
    try {
      await api.saUpdateSettings({ hero_video_url: videoUrl, demo_video_url: demoVideoUrl });
      alert("Saved!");
    } catch (e) {
      alert("Failed to save settings");
    }
  };

  const handleSaveGlobalSettings = async () => {
    try {
      await api.updateGlobalSettings(globalSettings);
      alert("Global settings saved successfully!");
    } catch (e) {
      alert("Failed to save global settings: " + e.message);
    }
  };

  if (user?.role !== "SUPER_ADMIN") {
    return (
      <div className="p-8 text-center flex flex-col items-center justify-center h-[80vh]">
        <ShieldAlert className="w-20 h-20 text-rose-500 mb-6 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]" />
        <h1 className="text-3xl font-display font-bold text-ink">Access Denied</h1>
        <p className="text-muted mt-2 max-w-sm text-center text-[15px]">You do not have Super Admin privileges to view the master backoffice.</p>
      </div>
    );
  }

  const totalTokens = usageData.reduce((acc, curr) => acc + curr.tokens, 0);
  const totalCost = usageData.reduce((acc, curr) => acc + curr.cost, 0);
  const totalClients = clients.length;
  const totalTenants = clients.reduce((acc, curr) => acc + curr.tenant_count, 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 flex items-center gap-3">
            <ShieldAlert size={28} className="text-indigo-400" /> Enterprise Backoffice
          </h1>
          <p className="text-[15px] text-muted mt-2 font-medium">Manage global SaaS infrastructure, billing, and tenant limits.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-white/40 text-[14px] flex items-center gap-2 font-medium">
            <Activity className="animate-spin" size={18} /> Loading Enterprise Data...
          </div>
        </div>
      ) : activeTab === "dashboard" ? (
        <div className="space-y-6">
          
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            
            <div className="bg-surface/50 border border-white/5 rounded-2xl p-5 backdrop-blur-xl relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-20 h-20 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                  <Building size={16} />
                </div>
                <h3 className="text-white/60 font-medium text-[11px] uppercase tracking-wider">Active Clients</h3>
              </div>
              <div className="text-2xl font-display font-bold text-white mb-1">{totalClients}</div>
              <div className="text-[11px] text-white/40 font-medium">B2B Customers</div>
            </div>

            <div className="bg-surface/50 border border-white/5 rounded-2xl p-5 backdrop-blur-xl relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-20 h-20 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Bot size={16} />
                </div>
                <h3 className="text-white/60 font-medium text-[11px] uppercase tracking-wider">Deployed Tenants</h3>
              </div>
              <div className="text-2xl font-display font-bold text-white mb-1">{totalTenants}</div>
              <div className="text-[11px] text-white/40 font-medium">Active AI Bots</div>
            </div>

            <div className="bg-surface/50 border border-white/5 rounded-2xl p-5 backdrop-blur-xl relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-brand/10 rounded-full blur-2xl group-hover:bg-brand/20 transition-all"></div>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-brand/20 flex items-center justify-center text-brand">
                  <TrendingUp size={20} />
                </div>
                <h3 className="text-white/60 font-medium text-[13px] uppercase tracking-wider">Total Token Usage</h3>
              </div>
              <div className="text-3xl font-display font-bold text-white mb-1">{totalTokens.toLocaleString()}</div>
              <div className="text-[12px] text-emerald-400 font-medium">+14% vs last week</div>
            </div>

            <div className="bg-surface/50 border border-white/5 rounded-2xl p-6 backdrop-blur-xl relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Activity size={20} />
                </div>
                <h3 className="text-white/60 font-medium text-[13px] uppercase tracking-wider">LLM API Cost</h3>
              </div>
              <div className="text-3xl font-display font-bold text-white mb-1">${totalCost.toFixed(2)}</div>
              <div className="text-[12px] text-white/40 font-medium">Accumulated this month</div>
            </div>

            <div className="bg-surface/50 border border-white/5 rounded-2xl p-6 backdrop-blur-xl relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all"></div>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                  <Database size={20} />
                </div>
                <h3 className="text-white/60 font-medium text-[13px] uppercase tracking-wider">Vector DB Storage</h3>
              </div>
              <div className="text-2xl font-display font-bold text-white mb-1">{totalDocs.toLocaleString()} Docs</div>
              <div className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                {totalDocs > 500 && <AlertTriangle size={10} />}
                {totalDocs > 500 ? "Limit warning" : "Healthy capacity"}
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Billing Chart */}
            <div className="bg-surface border border-white/5 rounded-2xl p-6 backdrop-blur-xl">
              <div className="mb-6">
                <h2 className="text-[15px] font-semibold text-white">Platform Token Consumption</h2>
                <p className="text-[12px] text-white/40 mt-1">Daily breakdown of LLM API usage across all active tenants.</p>
              </div>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usageData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="rgba(255,255,255,0.2)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => `${value / 1000}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#111111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                      itemStyle={{ color: '#818cf8', fontWeight: 600, fontSize: 13 }}
                      labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4 }}
                    />
                    <Bar dataKey="tokens" fill="url(#colorTokens)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <defs>
                      <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#818cf8" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#c084fc" stopOpacity={1}/>
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Growth Chart */}
            <div className="bg-surface border border-white/5 rounded-2xl p-6 backdrop-blur-xl">
              <div className="mb-6">
                <h2 className="text-[15px] font-semibold text-white">Platform Adoption Growth</h2>
                <p className="text-[12px] text-white/40 mt-1">Historical trajectory of B2B clients and active bots.</p>
              </div>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={usageData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="rgba(255,255,255,0.2)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#111111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                      itemStyle={{ fontSize: 13, fontWeight: 600 }}
                      labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4 }}
                    />
                    <Area type="monotone" dataKey="tenants" name="Bots" stroke="#6366f1" fillOpacity={1} fill="url(#colorTenants)" strokeWidth={3} />
                    <Area type="monotone" dataKey="clients" name="Clients" stroke="#10b981" fillOpacity={1} fill="url(#colorClients)" strokeWidth={3} />
                    <defs>
                      <linearGradient id="colorTenants" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorClients" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === "clients" ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Building size={20} className="text-brand" /> Client Directory & Billing
              </h2>
              <p className="text-[13px] text-white/40 mt-1">Manage B2B agencies, active bots, and platform access.</p>
            </div>
            <button 
              onClick={() => setIsProvisionModalOpen(true)}
              className="flex items-center gap-2 bg-white text-black px-5 py-2.5 rounded-xl text-[13px] font-bold shadow-lg hover:bg-white/90 transition-all hover:-translate-y-0.5"
            >
              <Plus size={16} /> PROVISION NEW CLIENT
            </button>
          </div>

          <div className="bg-surface/60 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-md">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-black/20 border-b border-white/5 text-[11px] font-bold text-white/40 uppercase tracking-wider">
              <div className="col-span-2">Client Name</div>
              <div className="col-span-2">Contact Email</div>
              <div className="col-span-2">Registered</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1 text-center">Tenants</div>
              <div className="col-span-3 text-right">Actions</div>
            </div>
            
            {/* Table Body */}
            <div className="divide-y divide-white/5">
              {clients.length === 0 && <div className="text-center py-12 text-white/40 text-[14px]">No clients provisioned yet.</div>}
              {clients.map(client => {
                const isExpanded = expandedClient === client.user_id;
                return (
                  <div key={client.user_id} className="flex flex-col transition-all">
                    {/* Main Row */}
                    <div className="grid grid-cols-12 gap-4 px-6 py-5 items-center hover:bg-white/[0.02] transition-colors">
                      <div className="col-span-2 font-semibold text-white text-[14px] flex items-center gap-2 truncate pr-2">
                        {client.name}
                      </div>
                      <div className="col-span-2 text-[13px] text-white/50 font-mono truncate pr-2" title={client.email}>{client.email}</div>
                      <div className="col-span-2 text-[12px] text-white/60 font-medium">
                        {client.register_day}
                      </div>
                      <div className="col-span-2">
                        {client.status === "ACTIVE" ? 
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full font-bold tracking-wide">ACTIVE</span> : 
                          <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded-full font-bold tracking-wide">SUSPENDED</span>
                        }
                      </div>
                      <div className="col-span-1 text-center text-[13px] text-white/80 font-medium">
                        {client.tenant_count}
                      </div>
                      <div className="col-span-3 flex items-center justify-end gap-2">
                        
                        <button 
                          onClick={() => alert("Renewal link generated and sent to client!")}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg text-[11px] font-bold tracking-wide transition-colors"
                        >
                          <Calendar size={12} /> RENEW
                        </button>
                        
                        <button 
                          onClick={() => handleToggleStatus(client.user_id, client.status)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition-colors border ${
                            client.status === "ACTIVE" 
                              ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20" 
                              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20"
                          }`}
                        >
                          <ShieldAlert size={12} /> {client.status === "ACTIVE" ? "SUSPEND" : "RESTORE"}
                        </button>
                        
                        <div className="w-px h-4 bg-white/10 mx-1"></div>
                        
                        <button 
                          onClick={() => setClientToDelete(client)}
                          className="p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 transition-colors border border-transparent hover:border-rose-500/20"
                          title="Delete Client"
                        >
                          <Trash2 size={16} />
                        </button>
                        
                        <button 
                          onClick={() => setExpandedClient(isExpanded ? null : client.user_id)}
                          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>
                    
                    {/* Expanded Tenants Data */}
                    {isExpanded && (
                      <div className="bg-black/30 border-t border-white/5 p-6 animate-in slide-in-from-top-2 duration-200">
                        <h4 className="text-[12px] font-bold text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
                          <Bot size={14} className="text-brand"/> Deployed Bots / Billing
                        </h4>
                        
                        {client.tenants && client.tenants.length > 0 ? (
                          <div className="space-y-3">
                            {client.tenants.map(t => (
                              <div key={t.tenant_id} className="bg-surface/50 border border-white/5 rounded-xl p-4 flex flex-col gap-4">
                                <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-4">
                                  <div className="w-full lg:w-1/4">
                                    <div className="text-[14px] font-bold text-white">{t.name}</div>
                                    <div className="text-[11px] text-white/40 font-mono mt-0.5">ID: {t.tenant_id}</div>
                                  </div>
                                  
                                  <div className="w-full lg:w-1/4 flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2 text-[12px] text-white/60">
                                      <Calendar size={14} className="text-indigo-400"/>
                                      <span>Renews: <strong className="text-white">{t.expire_day}</strong></span>
                                    </div>
                                    <div className="text-[11px] text-indigo-400 font-bold">{t.days_remaining} days remaining</div>
                                  </div>
                                  
                                  <div className="w-full lg:w-1/4 flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2 text-[12px] text-white/60">
                                      <Activity size={14} className="text-emerald-400"/>
                                      <span>Current Bill: <strong className="text-white">${t.bill?.toFixed(2)}</strong></span>
                                    </div>
                                    <div className="text-[11px] text-white/40">Tokens: {t.tokens_used.toLocaleString()}</div>
                                  </div>
                                  
                                  <div className="w-full lg:w-auto flex justify-end">
                                    <button onClick={() => alert("Invoice Reminder Sent to " + client.email)} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[11px] font-bold tracking-wide transition-colors border border-white/10">
                                      <Send size={14} className="text-brand" /> SEND REMINDER
                                    </button>
                                  </div>
                                </div>

                                {/* Limits Configuration */}
                                <div className="border-t border-white/5 pt-6 mt-2">
                                  <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-[12px] font-bold text-white/60 uppercase tracking-wider flex items-center gap-2">
                                      <Activity size={14} className="text-indigo-400"/> Bot Configuration Limits & Features
                                    </h4>
                                    <div>
                                      {editingLimits?.tenant_id === t.tenant_id ? (
                                        <div className="flex gap-2">
                                          <button onClick={() => setEditingLimits(null)} className="px-3 py-1.5 text-[11px] font-bold text-white/40 hover:text-white transition-colors">CANCEL</button>
                                          <button onClick={() => handleSaveLimits(t.tenant_id)} className="px-3 py-1.5 bg-brand text-white rounded-lg text-[11px] font-bold shadow-lg hover:bg-brand-deep transition-all">SAVE CONFIG</button>
                                        </div>
                                      ) : (
                                        <button onClick={() => setEditingLimits({ 
                                          tenant_id: t.tenant_id, 
                                          rate_limit_per_minute: t.rate_limit_per_minute || 25, 
                                          retention_hours: t.retention_hours || 72,
                                          orders_enabled: t.orders_enabled || false,
                                          returns_enabled: t.returns_enabled || false,
                                          cancellations_enabled: t.cancellations_enabled || false,
                                          order_requirements: (t.order_requirements || []).join(", "),
                                          custom_statuses: (t.custom_statuses || []).join(", "),
                                          cancellation_cutoff_status: t.cancellation_cutoff_status || "SHIPPED",
                                          cancellation_hours: t.cancellation_hours || 24
                                        })} className="px-3 py-1.5 border border-white/10 text-white/60 hover:text-white hover:bg-white/5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap">EDIT CONFIG</button>
                                      )}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Limits Box */}
                                    <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                                      <div className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-4 border-b border-white/5 pb-2">Rate & Retention Limits</div>
                                      <div className="grid grid-cols-2 gap-6">
                                        <div className="flex flex-col gap-2">
                                          <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">Msgs per Minute</label>
                                          {editingLimits?.tenant_id === t.tenant_id ? (
                                            <input type="number" className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-brand" 
                                              value={editingLimits.rate_limit_per_minute} onChange={(e) => setEditingLimits({...editingLimits, rate_limit_per_minute: e.target.value})} />
                                          ) : (
                                            <div className="text-[14px] font-medium text-white">{t.rate_limit_per_minute} <span className="text-[11px] text-white/40 ml-1">msg/min</span></div>
                                          )}
                                        </div>
                                        <div className="flex flex-col gap-2">
                                          <label className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">Retention Timer</label>
                                          {editingLimits?.tenant_id === t.tenant_id ? (
                                            <select className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-brand" 
                                              value={editingLimits.retention_hours} onChange={(e) => setEditingLimits({...editingLimits, retention_hours: e.target.value})}>
                                              <option value="24">24 Hours</option>
                                              <option value="48">48 Hours</option>
                                              <option value="72">72 Hours</option>
                                              <option value="168">7 Days</option>
                                              <option value="720">30 Days</option>
                                            </select>
                                          ) : (
                                            <div className="text-[14px] font-medium text-white">{t.retention_hours} <span className="text-[11px] text-white/40 ml-1">hours</span></div>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* E-Commerce Box */}
                                    <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                                      <div className="text-[11px] font-bold text-white/40 uppercase tracking-wider mb-4 border-b border-white/5 pb-2">E-Commerce Features</div>
                                      <div className="grid grid-cols-3 gap-4 mb-4">
                                        <div className="flex flex-col gap-2">
                                          <label className="text-[10px] font-bold text-brand uppercase tracking-wider flex items-center gap-1.5">Orders</label>
                                          {editingLimits?.tenant_id === t.tenant_id ? (
                                            <select className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-white outline-none focus:border-brand" 
                                              value={editingLimits.orders_enabled ? "yes" : "no"} onChange={(e) => setEditingLimits({...editingLimits, orders_enabled: e.target.value === "yes"})} >
                                              <option value="yes">Enabled</option>
                                              <option value="no">Disabled</option>
                                            </select>
                                          ) : (
                                            <div className={`text-[13px] font-semibold ${t.orders_enabled ? 'text-brand' : 'text-white/40'}`}>{t.orders_enabled ? "Enabled" : "Disabled"}</div>
                                          )}
                                        </div>

                                        <div className="flex flex-col gap-2">
                                          <label className="text-[10px] font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">Returns</label>
                                          {editingLimits?.tenant_id === t.tenant_id ? (
                                            <select className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-white outline-none focus:border-brand" 
                                              value={editingLimits.returns_enabled ? "yes" : "no"} onChange={(e) => setEditingLimits({...editingLimits, returns_enabled: e.target.value === "yes"})} >
                                              <option value="yes">Enabled</option>
                                              <option value="no">Disabled</option>
                                            </select>
                                          ) : (
                                            <div className={`text-[13px] font-semibold ${t.returns_enabled ? 'text-orange-400' : 'text-white/40'}`}>{t.returns_enabled ? "Enabled" : "Disabled"}</div>
                                          )}
                                        </div>

                                        <div className="flex flex-col gap-2">
                                          <label className="text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">Cancel</label>
                                          {editingLimits?.tenant_id === t.tenant_id ? (
                                            <select className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[12px] text-white outline-none focus:border-brand" 
                                              value={editingLimits.cancellations_enabled ? "yes" : "no"} onChange={(e) => setEditingLimits({...editingLimits, cancellations_enabled: e.target.value === "yes"})} >
                                              <option value="yes">Enabled</option>
                                              <option value="no">Disabled</option>
                                            </select>
                                          ) : (
                                            <div className={`text-[13px] font-semibold ${t.cancellations_enabled ? 'text-rose-400' : 'text-white/40'}`}>{t.cancellations_enabled ? "Enabled" : "Disabled"}</div>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex flex-col gap-2 mt-4">
                                        <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider flex items-center gap-1.5">Required Fields (Comma Separated)</label>
                                        {editingLimits?.tenant_id === t.tenant_id ? (
                                          <input type="text" className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-brand" 
                                            placeholder="e.g. Name, Email, Address"
                                            value={editingLimits.order_requirements} onChange={(e) => setEditingLimits({...editingLimits, order_requirements: e.target.value})} />
                                        ) : (
                                          <div className="text-[12px] text-white/60 font-mono bg-black/40 px-3 py-2 rounded-lg border border-white/5 truncate">
                                            {(t.order_requirements || []).join(", ") || "No requirements"}
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex flex-col gap-2 mt-4">
                                        <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider flex items-center gap-1.5">Custom Statuses (Comma Separated)</label>
                                        {editingLimits?.tenant_id === t.tenant_id ? (
                                          <input type="text" className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-brand" 
                                            placeholder="e.g. PENDING, SHIPPED, DELIVERED"
                                            value={editingLimits.custom_statuses || ""} onChange={(e) => setEditingLimits({...editingLimits, custom_statuses: e.target.value})} />
                                        ) : (
                                          <div className="text-[12px] text-white/60 font-mono bg-black/40 px-3 py-2 rounded-lg border border-white/5 truncate">
                                            {(t.custom_statuses || []).join(", ") || "Default"}
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex flex-col gap-2 mt-4">
                                        <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider flex items-center gap-1.5">No Cancellations After (Status)</label>
                                        {editingLimits?.tenant_id === t.tenant_id ? (
                                          <select className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-brand" 
                                            value={editingLimits.cancellation_cutoff_status || "SHIPPED"} onChange={(e) => setEditingLimits({...editingLimits, cancellation_cutoff_status: e.target.value})}>
                                            {(editingLimits.custom_statuses || "").split(",").map(s => s.trim()).filter(s => s).map(s => (
                                              <option key={s} value={s}>{s}</option>
                                            ))}
                                            {!(editingLimits.custom_statuses) && ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED"].map(s => (
                                              <option key={s} value={s}>{s}</option>
                                            ))}
                                          </select>
                                        ) : (
                                          <div className="text-[12px] text-white/60 font-mono bg-black/40 px-3 py-2 rounded-lg border border-white/5 truncate">
                                            {t.cancellation_cutoff_status || "SHIPPED"}
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex flex-col gap-2 mt-4">
                                        <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider flex items-center gap-1.5">Cancellation Window (Hours)</label>
                                        {editingLimits?.tenant_id === t.tenant_id ? (
                                          <input type="number" className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-brand" 
                                            value={editingLimits.cancellation_hours} onChange={(e) => setEditingLimits({...editingLimits, cancellation_hours: e.target.value})} />
                                        ) : (
                                          <div className="text-[12px] text-white/60 font-mono bg-black/40 px-3 py-2 rounded-lg border border-white/5 truncate">
                                            {t.cancellation_hours || 24} hours
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[13px] text-white/40 italic">This client has no active bots deployed yet.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Provision Modal */}
          {isProvisionModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
              <div className="bg-surface border border-white/10 shadow-2xl rounded-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                  <h3 className="text-[16px] font-bold text-white flex items-center gap-2">
                    <Users size={18} className="text-brand" /> Provision New Client
                  </h3>
                  <button onClick={() => setIsProvisionModalOpen(false)} className="text-white/40 hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 space-y-5">
                  <div>
                    <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-2">Agency Name</label>
                    <input value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-[13px] text-white placeholder-white/20 focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all" placeholder="Acme Corp" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-2">Admin Email</label>
                    <input value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-[13px] text-white placeholder-white/20 focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all" placeholder="admin@acme.com" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-white/50 uppercase tracking-wider mb-2">Initial Password</label>
                    <div className="relative">
                      <input type={showPassword ? "text" : "password"} value={newClient.password} onChange={e => setNewClient({...newClient, password: e.target.value})} className="w-full pl-4 pr-10 py-3 bg-black/40 border border-white/10 rounded-xl text-[13px] text-white placeholder-white/20 focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all" placeholder="••••••••" />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-6 border-t border-white/5 bg-black/20 flex justify-end gap-3">
                  <button onClick={() => setIsProvisionModalOpen(false)} className="px-5 py-2.5 text-[13px] font-bold text-white/60 hover:text-white transition-colors">CANCEL</button>
                  <button onClick={() => { handleCreateClient(); setIsProvisionModalOpen(false); }} className="px-5 py-2.5 bg-brand text-white rounded-xl text-[13px] font-bold shadow-lg hover:bg-brand-deep transition-all">PROVISION</button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Client Modal */}
          {clientToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
              <div className="bg-surface border border-rose-500/30 shadow-2xl shadow-rose-500/10 rounded-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-rose-500/10 flex items-center justify-between bg-rose-500/5">
                  <h3 className="text-[16px] font-bold text-rose-400 flex items-center gap-2">
                    <AlertTriangle size={18} /> Delete Client & All Data
                  </h3>
                  <button onClick={() => { setClientToDelete(null); setDeleteConfirmText(""); }} className="text-white/40 hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-[13px] text-white/70 leading-relaxed">
                    You are about to permanently delete <strong className="text-white">{clientToDelete.name}</strong> and all of their deployed tenants, knowledge base documents, active WhatsApp sessions, and message logs.
                  </p>
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                    <p className="text-rose-400 text-[12px] font-bold uppercase tracking-wider mb-1">Warning: Irreversible Action</p>
                    <p className="text-[12px] text-rose-400/70">To confirm, please type <strong>confirm</strong> below.</p>
                  </div>
                  <div>
                    <input 
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      className="w-full px-4 py-3 bg-black/40 border border-rose-500/30 rounded-xl text-[13px] text-white placeholder-white/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none transition-all" 
                      placeholder="confirm" 
                    />
                  </div>
                </div>
                <div className="p-6 border-t border-white/5 bg-black/20 flex justify-end gap-3">
                  <button onClick={() => { setClientToDelete(null); setDeleteConfirmText(""); }} className="px-5 py-2.5 text-[13px] font-bold text-white/60 hover:text-white transition-colors">CANCEL</button>
                  <button 
                    onClick={handleDeleteClient} 
                    disabled={deleteConfirmText.toLowerCase() !== "confirm"}
                    className="px-5 py-2.5 bg-rose-600 text-white rounded-xl text-[13px] font-bold shadow-lg hover:bg-rose-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    PERMANENTLY DELETE
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          <div className="bg-surface/60 border border-white/5 rounded-2xl p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
             <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-blue-400 to-indigo-500"></div>
            
            <h2 className="text-[18px] font-bold text-white flex items-center gap-3 mb-6">
              <MonitorPlay size={20} className="text-blue-400" /> Dynamic CMS Configuration
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[12px] font-bold text-white/60 uppercase tracking-wider mb-2">Landing Page Hero Video (YouTube Embed URL)</label>
                <input 
                  value={videoUrl} 
                  onChange={e => setVideoUrl(e.target.value)} 
                  className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-[14px] text-emerald-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono transition-all shadow-inner" 
                  placeholder="https://www.youtube.com/embed/..." 
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-white/60 uppercase tracking-wider mb-2">Secondary Demo Video (YouTube Embed URL)</label>
                <input 
                  value={demoVideoUrl} 
                  onChange={e => setDemoVideoUrl(e.target.value)} 
                  className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-[14px] text-emerald-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono transition-all shadow-inner" 
                  placeholder="https://www.youtube.com/embed/..." 
                />
              </div>
            </div>
            
            <p className="text-[12px] text-white/40 mt-4 font-medium flex items-center gap-1.5">
              <ShieldAlert size={12}/> Changes reflect instantly on the public landing page without redeploying code.
            </p>
              
            <div className="mt-6 flex justify-end">
              <button onClick={handleSaveVideo} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-bold rounded-xl shadow-lg shadow-blue-900/50 transition-all active:scale-95">
                <Save size={16} /> SAVE MEDIA CONFIG
              </button>
            </div>
            
            <div className="mt-12 border-t border-white/5 pt-8">
              <h3 className="text-[15px] font-bold text-white flex items-center gap-2 mb-4">
                <Bot size={16} className="text-brand" /> Global System Prompt
              </h3>
              <p className="text-[13px] text-white/60 mb-4">
                This is the master prompt applied to ALL tenants (unless they enable Exclusive Prompt Mode). Use this to enforce platform-wide safety, language rules, or escalation policies.
              </p>
              <textarea 
                rows={8}
                value={globalSettings.master_system_prompt || ""}
                onChange={(e) => setGlobalSettings({...globalSettings, master_system_prompt: e.target.value})}
                className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-[13px] text-white focus:border-brand focus:ring-1 focus:ring-brand outline-none font-mono transition-all resize-y shadow-inner"
                placeholder="IMPORTANT: If the user uses frustrated language..."
              />
              <div className="mt-4 flex justify-end">
                <button onClick={handleSaveGlobalSettings} className="flex items-center gap-2 px-6 py-2.5 bg-brand hover:bg-brand/80 text-white text-[13px] font-bold rounded-xl shadow-lg transition-all active:scale-95">
                  <Save size={16} /> SAVE GLOBAL PROMPT
                </button>
              </div>
            </div>
          </div>

          <div className="bg-surface/60 border border-white/5 rounded-2xl p-8 backdrop-blur-xl relative overflow-hidden">
            <h2 className="text-[18px] font-bold text-white flex items-center gap-3 mb-6">
              <MessageSquare size={20} className="text-pink-400" /> Inbound Contact Inquiries
            </h2>
            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-10 bg-black/20 rounded-xl border border-white/5">
                  <p className="text-white/40 text-[14px]">No messages received yet.</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className="bg-black/30 border border-white/5 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[15px] font-bold text-white">{msg.name}</span>
                        <span className="text-[12px] text-white/40 bg-white/5 px-2 py-1 rounded-md">{msg.email}</span>
                      </div>
                      <span className="text-[11px] text-white/30">{new Date(msg.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-[13px] text-white/70 leading-relaxed bg-white/5 p-4 rounded-lg">{msg.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

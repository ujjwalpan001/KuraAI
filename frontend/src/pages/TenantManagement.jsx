import { useState, useEffect, useRef } from "react";
import { Users, Bot, Key, Phone, Save, Search, Plus, Edit2, X, Smartphone, Wifi, WifiOff, RefreshCw, LogOut, QrCode, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { themeFor } from "../tenants";
import { api } from "../api/client";

const STATE_COLORS = { open: "text-emerald-400", connecting: "text-amber-400", close: "text-rose-400", error: "text-rose-400" };
const STATE_ICONS = { open: CheckCircle2, connecting: Loader2, close: WifiOff, error: AlertCircle };
const STATE_LABELS = { open: "Connected", connecting: "Connecting...", close: "Disconnected", error: "Error" };

function WhatsAppPanel({ instanceName, tenantId, onCreated }) {
  const [qr, setQr] = useState(null);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState("");
  const pollRef = useRef(null);

  const fetchState = async () => {
    if (!instanceName) return "close";
    try {
      const res = await api.evoGetState(instanceName);
      const s = res?.state?.instance?.state || res?.state?.state || "close";
      setState(s);
      return s;
    } catch {
      setState("error");
      return "error";
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (instanceName) {
      const getStatus = async () => {
        const s = await fetchState();
        if (!isMounted) return;
      };
      
      getStatus();
      pollRef.current = setInterval(getStatus, 5000);
      return () => {
        isMounted = false;
        clearInterval(pollRef.current);
      };
    }
  }, [instanceName]);

  const handleCreate = async () => {
    setLoading(true);
    try {
      await api.evoCreateInstance(tenantId, tenantId);
      onCreated(tenantId);
    } catch (e) {
      alert("We are unable to connect to the WhatsApp Gateway right now. Please try again after some time.");
    } finally {
      setLoading(false);
    }
  };

  const handleGetQR = async () => {
    setLoading(true); setAction("qr");
    try {
      const res = await api.evoGetQR(instanceName);
      setQr(res?.qr?.base64 || res?.qr?.code || null);
    } catch (e) {
      alert("Failed to get QR: " + e.message);
    } finally {
      setLoading(false); setAction("");
    }
  };

  const handleRestart = async () => {
    setLoading(true); setAction("restart");
    try {
      await api.evoRestartInstance(instanceName);
      setQr(null); await fetchState();
    } catch (e) {
      alert("Failed to restart: " + e.message);
    } finally {
      setLoading(false); setAction("");
    }
  };

  const handleLogout = async () => {
    if (!confirm(`Log out ${instanceName} from WhatsApp? You'll need to scan QR again.`)) return;
    setLoading(true); setAction("logout");
    try {
      await api.evoLogoutInstance(instanceName);
      setQr(null); setState("close");
    } catch (e) {
      alert("Failed to logout: " + e.message);
    } finally {
      setLoading(false); setAction("");
    }
  };

  if (!instanceName) {
    return (
      <div className="w-full px-4 py-4 bg-canvas border border-hair rounded-xl flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-ink">No WhatsApp Instance Linked</div>
          <div className="text-[11px] text-muted mt-1">Create a dedicated connection for this workspace.</div>
        </div>
        <button onClick={handleCreate} disabled={loading} className="px-4 py-2 bg-brand text-white text-[12px] font-bold rounded-lg hover:bg-brand-deep transition-all">
          {loading ? "CREATING..." : "CREATE CONNECTION"}
        </button>
      </div>
    );
  }

  const connState = state || "connecting";
  const StateIcon = STATE_ICONS[connState] || AlertCircle;
  const stateColor = STATE_COLORS[connState] || "text-muted";
  const stateLabel = STATE_LABELS[connState] || connState;
  const isConnected = connState === "open";

  return (
    <div className="w-full bg-canvas border border-hair rounded-xl overflow-hidden">
      <div className="p-4 border-b border-hair flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isConnected ? "bg-emerald-500/15" : "bg-muted/10"}`}>
            <Smartphone size={18} className={isConnected ? "text-emerald-400" : "text-muted"} />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-ink">{instanceName}</div>
            <div className={`flex items-center gap-1.5 mt-0.5 text-[11px] font-medium ${stateColor}`}>
              <StateIcon size={10} className={connState === "connecting" ? "animate-spin" : ""} />
              {stateLabel}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {!isConnected && (
            <button onClick={handleGetQR} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-brand bg-brand/10 rounded-lg hover:bg-brand/20 transition-colors">
              {loading && action === "qr" ? <Loader2 size={12} className="animate-spin" /> : <QrCode size={12} />}
              Scan QR
            </button>
          )}
          {isConnected && (
            <button onClick={handleLogout} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-amber-500 bg-amber-500/10 rounded-lg hover:bg-amber-500/20 transition-colors">
              {loading && action === "logout" ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
              Disconnect
            </button>
          )}
          <button onClick={handleRestart} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-muted border border-hair rounded-lg hover:bg-surface transition-colors">
            {loading && action === "restart" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Restart
          </button>
        </div>
      </div>
      
      {qr && !isConnected && (
        <div className="p-6 flex flex-col items-center justify-center bg-white border-t border-hair">
          <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR Code" className="w-48 h-48 mb-4 border border-hair rounded-xl p-2" />
          <p className="text-[12px] text-gray-500 font-medium">Scan this code with WhatsApp (Linked Devices)</p>
        </div>
      )}
    </div>
  );
}

export default function TenantManagement({ tenants, activeTenant, onSelectTenant, onTenantsChanged }) {
  const [q, setQ] = useState("");
  const activeObj = tenants.find(t => t.tenant_id === activeTenant);
  
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [instances, setInstances] = useState([]);
  const [editingInstance, setEditingInstance] = useState(false);

  useEffect(() => {
    if (activeObj) {
      setFormData(prev => ({
        ...prev,
        system_prompt: activeObj.system_prompt || "",
        evolution_instance: activeObj.evolution_instance || "",
        llm_model: activeObj.llm_model || "llama-3.3-70b",
        personal_numbers: activeObj.personal_numbers || [],
        rate_limit_per_minute: activeObj.rate_limit_per_minute ?? 25,
        exclusive_prompt_mode: activeObj.exclusive_prompt_mode || false,
        exclusive_prompt: activeObj.exclusive_prompt || "",
      }));
    }
  }, [activeObj]);

  useEffect(() => {
    // Fetch available evolution instances for the dropdown
    api.evoInstances().then(res => {
      if (res?.instances) {
        setInstances(res.instances);
      }
    }).catch(err => console.error("Failed to fetch instances:", err));
  }, []);

  const handleSave = async () => {
    if (!activeTenant) return;
    setSaving(true);
    try {
      await api.updateTenant(activeTenant, formData);
      if (onTenantsChanged) await onTenantsChanged();
      alert("Configuration saved successfully.");
    } catch (e) {
      alert("Failed to save: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleNewTenant = async () => {
    const name = prompt("Enter new workspace name (e.g. 'Luxury Furniture'):");
    if (!name) return;
    const id = prompt("Enter unique workspace ID (e.g. 'luxury_corp'):");
    if (!id) return;
    
    try {
      await api.createTenant({
        tenant_id: id,
        name: name,
        system_prompt: `You are an AI assistant for ${name}.`
      });
      if (onTenantsChanged) await onTenantsChanged();
      onSelectTenant(id);
      alert("Workspace created successfully!");
    } catch (e) {
      alert("Failed to create workspace: " + e.message);
    }
  };

  const handleDelete = async () => {
    if (!activeTenant) return;
    if (!confirm(`Are you absolutely sure you want to delete ${activeObj.name}? This will delete all catalog items, media, and knowledge associated with this workspace. This action cannot be undone.`)) return;
    
    setSaving(true);
    try {
      await api.deleteTenant(activeTenant);
      if (onTenantsChanged) await onTenantsChanged();
      const remaining = tenants.filter(t => t.tenant_id !== activeTenant);
      onSelectTenant(remaining.length > 0 ? remaining[0].tenant_id : null);
      alert("Workspace deleted successfully.");
    } catch (e) {
      alert("Failed to delete workspace: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-canvas">
      {/* Left: Tenant List */}
      <section className="w-[340px] shrink-0 border-r border-hair bg-surface flex flex-col">
        <div className="p-4 border-b border-hair">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-display font-semibold">Tenants</h2>
            <button onClick={handleNewTenant} className="text-[12px] font-medium text-brand flex items-center gap-1 hover:text-brand-deep transition-colors">
              <Plus size={14} /> New
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input 
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tenants..."
              className="w-full pl-9 pr-3 py-2 bg-canvas border border-hair rounded-lg text-[13px] focus:outline-none focus:border-brand"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {tenants.filter(t => t.name.toLowerCase().includes(q.toLowerCase())).map(t => {
            const th = themeFor(t.tenant_id);
            const isActive = activeTenant === t.tenant_id;
            return (
              <button 
                key={t.tenant_id}
                onClick={() => onSelectTenant(t.tenant_id)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${isActive ? "bg-canvas border-brand/50 shadow-[0_0_10px_rgba(99,102,241,0.1)]" : "border-hair bg-surface hover:border-faint"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-display font-semibold text-[15px] shrink-0" style={{ backgroundColor: th.accent }}>
                    {th.initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-semibold text-[14px] text-ink truncate">{t.name}</div>
                    <div className="text-[11px] font-mono text-muted truncate mt-0.5">{t.tenant_id}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
                  <span className="flex items-center gap-1"><Bot size={12} /> Active</span>
                  <span className="flex items-center gap-1"><Users size={12} /> {t.chat_count || 0} Chats</span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Right: Tenant Details & Configuration */}
      <main className="flex-1 flex flex-col min-w-0 bg-canvas overflow-y-auto">
        {activeObj ? (
          <div className="max-w-4xl w-full mx-auto p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-display font-semibold text-ink">{activeObj.name}</h1>
                <p className="text-[14px] text-muted mt-1 font-mono">{activeObj.tenant_id}</p>
              </div>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-[13px] font-medium shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:bg-brand-deep transition-colors disabled:opacity-50"
              >
                <Save size={16} /> {saving ? "Saving..." : "Save Configuration"}
              </button>
            </div>

            <div className="space-y-6">
              {/* WhatsApp / Evolution Config */}
              <div className="bg-surface border border-hair rounded-xl p-6">
                <h3 className="text-[15px] font-display font-semibold flex items-center gap-2 mb-4">
                  <Phone size={16} className="text-emerald-500" /> WhatsApp Connection
                </h3>
                <WhatsAppPanel 
                  instanceName={formData.evolution_instance} 
                  tenantId={activeTenant} 
                  onCreated={(newInstanceName) => {
                    setFormData({...formData, evolution_instance: newInstanceName});
                    // Instantly save it to backend so the tenant officially links the new instance
                    api.updateTenant(activeTenant, {...formData, evolution_instance: newInstanceName})
                      .then(() => { if (onTenantsChanged) onTenantsChanged(); })
                      .catch(e => console.error(e));
                  }}
                />
              </div>

              {/* Rate Limiting Config */}
              <div className="bg-surface border border-hair rounded-xl p-6">
                <h3 className="text-[15px] font-display font-semibold flex items-center gap-2 mb-4">
                  <span className="w-4 h-4 flex items-center justify-center rounded-full bg-orange-500/10 text-orange-500">⚡</span>
                  Rate Limiting
                </h3>
                <p className="text-[13px] text-muted mb-4">
                  Set the maximum number of messages a single customer can send per minute. If they exceed this, the bot will silently drop their messages to protect your LLM costs from spam or DoS attacks. (Default: 25)
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-1/3">
                    <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">Max Msgs / Minute</label>
                    <input 
                      type="number"
                      min="1"
                      max="100"
                      value={formData.rate_limit_per_minute}
                      onChange={e => setFormData({...formData, rate_limit_per_minute: parseInt(e.target.value) || 25})}
                      className="w-full px-4 py-2 bg-canvas border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* System Prompt (LLM Config) */}
              <div className="bg-surface border border-hair rounded-xl p-6">
                <h3 className="text-[15px] font-display font-semibold flex items-center gap-2 mb-4">
                  <Bot size={16} className="text-brand" /> System Prompt Configuration
                </h3>
                <p className="text-[13px] text-muted mb-4">
                  Define the AI's personality, boundaries, and specific rules for this tenant. The engine will automatically append RAG context and catalog data below this prompt.
                </p>
                <div>
                  <div className="mb-6 flex items-start gap-4 bg-surface p-5 rounded-xl border border-hair shadow-sm">
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, exclusive_prompt_mode: !formData.exclusive_prompt_mode})}
                      className={`relative inline-flex h-6 w-11 mt-0.5 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${formData.exclusive_prompt_mode ? 'bg-brand' : 'bg-canvas border-hair'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out ${formData.exclusive_prompt_mode ? 'translate-x-5 bg-white' : 'translate-x-0 bg-muted'}`} />
                    </button>
                    <div className="flex-1">
                      <label onClick={() => setFormData({...formData, exclusive_prompt_mode: !formData.exclusive_prompt_mode})} className="text-[14px] font-semibold text-ink block cursor-pointer">Exclusive Prompt Mode (Auto-Reply)</label>
                      <p className="text-[13px] text-muted mt-1 leading-relaxed">If enabled, the AI completely ignores global rules and only follows the strict instructions below. Use this to create guaranteed "Out of Office" auto-replies.</p>
                    </div>
                  </div>

                  {formData.exclusive_prompt_mode ? (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="text-[12px] font-semibold text-brand mb-2 block uppercase tracking-wider">Exclusive Instructions</label>
                      <textarea 
                        rows={8} 
                        value={formData.exclusive_prompt || ""}
                        onChange={e => setFormData({...formData, exclusive_prompt: e.target.value})}
                        className="w-full px-4 py-3 bg-canvas border border-brand/40 rounded-xl text-[13px] text-ink focus:outline-none focus:border-brand font-mono leading-relaxed resize-y shadow-[0_0_15px_rgba(var(--color-brand-rgb),0.1)]"
                        placeholder="e.g. Just reply 'We will be back soon' for everything. Do not reply anything else."
                      />
                    </div>
                  ) : (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="text-[12px] font-semibold text-muted mb-2 block uppercase tracking-wider">Standard System Prompt</label>
                      <textarea 
                        rows={12} 
                        value={formData.system_prompt || ""}
                        onChange={e => setFormData({...formData, system_prompt: e.target.value})}
                        className="w-full px-4 py-3 bg-canvas border border-hair rounded-xl text-[13px] text-ink focus:outline-none focus:border-brand font-mono leading-relaxed resize-y"
                        placeholder="You are a helpful assistant..."
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Personal Numbers Config */}
              <div className="bg-surface border border-hair rounded-xl p-6">
                <h3 className="text-[15px] font-display font-semibold flex items-center gap-2 mb-4">
                  <Users size={16} className="text-blue-500" /> Personal Numbers (Do Not Disturb)
                </h3>
                <p className="text-[13px] text-muted mb-4">
                  Add personal phone numbers (including country code) that the AI should completely ignore. Messages from these numbers will not trigger auto-replies or be logged.
                </p>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-mono">+</span>
                      <input 
                        id="new-personal-number"
                        placeholder="e.g. 919876543210"
                        className="w-full pl-8 pr-3 py-2 bg-canvas border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = e.currentTarget.value.replace(/\D/g, "");
                            if (val && !(formData.personal_numbers || []).includes(val)) {
                              setFormData({...formData, personal_numbers: [...(formData.personal_numbers || []), val]});
                              e.currentTarget.value = "";
                            }
                          }
                        }}
                      />
                    </div>
                    <button 
                      onClick={() => {
                        const input = document.getElementById("new-personal-number");
                        const val = input.value.replace(/\D/g, "");
                        if (val && !(formData.personal_numbers || []).includes(val)) {
                          setFormData({...formData, personal_numbers: [...(formData.personal_numbers || []), val]});
                          input.value = "";
                        }
                      }}
                      className="px-4 py-2 bg-brand/10 text-brand rounded-lg text-[13px] font-medium hover:bg-brand/20 transition-colors shrink-0"
                    >
                      Add Number
                    </button>
                  </div>
                  
                  {formData.personal_numbers && formData.personal_numbers.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {formData.personal_numbers.map(num => (
                        <div key={num} className="flex items-center gap-2 px-3 py-1.5 bg-canvas border border-hair rounded-full text-[12.5px] font-mono text-ink">
                          <span>+{num}</span>
                          <button 
                            onClick={() => setFormData({
                              ...formData, 
                              personal_numbers: formData.personal_numbers.filter(n => n !== num)
                            })}
                            className="text-muted hover:text-rose-500 transition-colors"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* API Configuration */}
              <div className="bg-surface border border-hair rounded-xl p-6">
                <h3 className="text-[15px] font-display font-semibold flex items-center gap-2 mb-4">
                  <Key size={16} className="text-amber-500" /> Advanced Overrides
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">Custom LLM Model</label>
                    <select 
                      value={formData.llm_model}
                      onChange={e => setFormData({...formData, llm_model: e.target.value})}
                      className="w-full px-3 py-2 bg-canvas border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand"
                    >
                      <option value="llama-3.3-70b">Use System Default (llama-3.3-70b)</option>
                      <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                      <option value="gemma-7b-it">gemma-7b-it</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">Routing Keyword Match</label>
                    <input 
                      value={formData.switch_code || ""}
                      onChange={e => setFormData({...formData, switch_code: e.target.value})}
                      placeholder="e.g. luxury, furniture" 
                      className="w-full px-3 py-2 bg-canvas border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand font-mono" 
                    />
                  </div>
                </div>
              </div>
              
              {/* Danger Zone */}
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-6">
                <h3 className="text-[15px] font-display font-semibold text-rose-500 mb-2">Danger Zone</h3>
                <p className="text-[13px] text-muted mb-4">Permanently delete this workspace and all its data (catalog, media, knowledge base). This action cannot be undone.</p>
                <button 
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-4 py-2 bg-rose-500 text-white rounded-lg text-[13px] font-medium hover:bg-rose-600 transition-colors disabled:opacity-50"
                >
                  Delete Workspace
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted text-[14px]">Select a tenant to view details</div>
        )}
      </main>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Users, Bot, Key, Phone, Save, Search, Plus, Edit2, X } from "lucide-react";
import { themeFor } from "../tenants";
import { api } from "../api/client";

export default function TenantManagement({ tenants, activeTenant, onSelectTenant, onTenantsChanged }) {
  const [q, setQ] = useState("");
  const activeObj = tenants.find(t => t.tenant_id === activeTenant);
  
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [instances, setInstances] = useState([]);
  const [editingInstance, setEditingInstance] = useState(false);

  useEffect(() => {
    if (activeObj) {
      setFormData({
        system_prompt: activeObj.system_prompt || "",
        evolution_instance: activeObj.evolution_instance || "",
        llm_model: activeObj.llm_model || "llama-3.3-70b",
        personal_numbers: activeObj.personal_numbers || [],
        rate_limit_per_minute: activeObj.rate_limit_per_minute ?? 25,
      });
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
                  <Phone size={16} className="text-emerald-500" /> WhatsApp Integration
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">Evolution Instance Name</label>
                    {formData.evolution_instance && !editingInstance ? (
                      <div className="flex items-center justify-between w-full px-3 py-2 bg-canvas border border-hair rounded-lg text-[13px] text-ink font-mono">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          {formData.evolution_instance}
                        </div>
                        <button 
                          onClick={() => {
                            setFormData({...formData, evolution_instance: ""});
                          }} 
                          className="text-muted hover:text-rose-400 transition-colors"
                          title="Unlink this instance"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <select
                        value={formData.evolution_instance || ""}
                        onChange={e => {
                           setFormData({...formData, evolution_instance: e.target.value});
                           setEditingInstance(false);
                        }}
                        className="w-full px-3 py-2 bg-canvas border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                      >
                        <option value="">No instance linked</option>
                        {instances.map(inst => {
                          const name = inst.name || inst.instanceName;
                          return <option key={name} value={name}>{name}</option>;
                        })}
                      </select>
                    )}
                    <p className="text-[11px] text-muted mt-1">Select an active instance from <strong>WhatsApp Connect</strong> to link it to this workspace.</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">Status</label>
                    <div className="w-full px-3 py-2 bg-canvas border border-hair rounded-lg text-[13px] text-muted">
                      {formData.evolution_instance ? (
                        <span className="text-emerald-400 font-medium">✓ Instance configured — check <strong>WhatsApp Connect</strong> for QR/status</span>
                      ) : (
                        <span>No instance linked — connect via <strong>WhatsApp Connect</strong> tab</span>
                      )}
                    </div>
                  </div>
                </div>
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
                  <textarea 
                    rows={12} 
                    value={formData.system_prompt || ""}
                    onChange={e => setFormData({...formData, system_prompt: e.target.value})}
                    className="w-full px-4 py-3 bg-canvas border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand font-mono leading-relaxed resize-y"
                    placeholder="You are a helpful assistant..."
                  />
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

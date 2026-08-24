import { useState, useEffect, useRef } from "react";
import {
  Smartphone, Wifi, WifiOff, RefreshCw, LogOut, Trash2,
  Plus, QrCode, CheckCircle2, AlertCircle, Loader2, Copy, ExternalLink
} from "lucide-react";
import { api } from "../api/client";

const STATE_COLORS = {
  open: "text-emerald-400",
  connecting: "text-amber-400",
  close: "text-rose-400",
  error: "text-rose-400",
};
const STATE_ICONS = {
  open: CheckCircle2,
  connecting: Loader2,
  close: WifiOff,
  error: AlertCircle,
};

const STATE_LABELS = {
  open: "Connected",
  connecting: "Connecting...",
  close: "Disconnected",
  error: "Error",
};

function InstanceCard({ instance, tenants, onRefresh }) {
  const [qr, setQr] = useState(null);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState("");
  const pollRef = useRef(null);

  const instanceName = instance?.instance?.instanceName || instance?.instanceName || "";
  const linked = tenants?.find(
    (t) => t.evolution_instance === instanceName
  );

  const fetchState = async () => {
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
    fetchState();
    // Poll state every 5 seconds
    pollRef.current = setInterval(fetchState, 5000);
    return () => clearInterval(pollRef.current);
  }, [instanceName]);

  const handleGetQR = async () => {
    setLoading(true);
    setAction("qr");
    try {
      const res = await api.evoGetQR(instanceName);
      const qrData = res?.qr?.base64 || res?.qr?.code || null;
      setQr(qrData);
    } catch (e) {
      alert("Failed to get QR: " + e.message);
    } finally {
      setLoading(false);
      setAction("");
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    setAction("restart");
    try {
      await api.evoRestartInstance(instanceName);
      setQr(null);
      await fetchState();
    } catch (e) {
      alert("Failed to restart: " + e.message);
    } finally {
      setLoading(false);
      setAction("");
    }
  };

  const handleLogout = async () => {
    if (!confirm(`Log out ${instanceName} from WhatsApp? You'll need to scan QR again.`)) return;
    setLoading(true);
    setAction("logout");
    try {
      await api.evoLogoutInstance(instanceName);
      setQr(null);
      setState("close");
    } catch (e) {
      alert("Failed to logout: " + e.message);
    } finally {
      setLoading(false);
      setAction("");
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Permanently delete instance "${instanceName}"? This cannot be undone.`)) return;
    setLoading(true);
    setAction("delete");
    try {
      await api.evoDeleteInstance(instanceName, linked?.tenant_id || "");
      onRefresh();
    } catch (e) {
      alert("Failed to delete: " + e.message);
    } finally {
      setLoading(false);
      setAction("");
    }
  };

  const connState = state || "close";
  const StateIcon = STATE_ICONS[connState] || AlertCircle;
  const stateColor = STATE_COLORS[connState] || "text-muted";
  const stateLabel = STATE_LABELS[connState] || connState;
  const isConnected = connState === "open";

  return (
    <div className="bg-surface border border-hair rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-hair flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isConnected ? "bg-emerald-500/15" : "bg-muted/10"}`}>
          <Smartphone size={22} className={isConnected ? "text-emerald-400" : "text-muted"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-[15px] text-ink truncate">{instanceName}</h3>
            {linked && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand/15 text-brand shrink-0">
                {linked.name}
              </span>
            )}
          </div>
          <div className={`flex items-center gap-1.5 mt-1 text-[12px] font-medium ${stateColor}`}>
            <StateIcon size={12} className={connState === "connecting" ? "animate-spin" : ""} />
            {stateLabel}
          </div>
        </div>
        <button
          onClick={fetchState}
          className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-canvas transition-colors"
          title="Refresh state"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* QR Code area */}
      {!isConnected && (
        <div className="p-5 border-b border-hair">
          {qr ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-[12px] text-muted text-center">
                Open WhatsApp on your phone → Settings → Linked Devices → Link a device
              </p>
              <div className="bg-white p-3 rounded-xl shadow-lg inline-block">
                <img
                  src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                  alt="WhatsApp QR Code"
                  className="w-48 h-48 object-contain"
                />
              </div>
              <button
                onClick={handleGetQR}
                disabled={loading}
                className="text-[12px] text-brand hover:text-brand-deep flex items-center gap-1 transition-colors"
              >
                <RefreshCw size={12} /> Refresh QR
              </button>
            </div>
          ) : (
            <button
              onClick={handleGetQR}
              disabled={loading}
              className="w-full py-3 border border-dashed border-hair rounded-xl text-[13px] text-muted hover:border-brand hover:text-brand transition-colors flex items-center justify-center gap-2"
            >
              {loading && action === "qr" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <QrCode size={14} />
              )}
              {loading && action === "qr" ? "Loading QR..." : "Show QR Code to Connect"}
            </button>
          )}
        </div>
      )}

      {/* Connected state */}
      {isConnected && (
        <div className="px-5 py-3 border-b border-hair bg-emerald-500/5">
          <div className="flex items-center gap-2 text-[12px] text-emerald-400">
            <CheckCircle2 size={13} />
            <span>WhatsApp is connected and auto-replying is active</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 flex flex-wrap gap-2">
        {isConnected && (
          <button
            onClick={handleLogout}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-amber-400 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-colors disabled:opacity-50"
          >
            {loading && action === "logout" ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
            Disconnect
          </button>
        )}
        <button
          onClick={handleRestart}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-muted border border-hair rounded-lg hover:text-ink hover:bg-canvas transition-colors disabled:opacity-50"
        >
          {loading && action === "restart" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Restart
        </button>
        <div className="flex-1" />
        <button
          onClick={handleDelete}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-rose-400 border border-rose-400/30 rounded-lg hover:bg-rose-400/10 transition-colors disabled:opacity-50"
        >
          {loading && action === "delete" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Delete
        </button>
      </div>
    </div>
  );
}

function CreateInstanceModal({ tenants, onClose, onCreated }) {
  const [instanceName, setInstanceName] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    const name = instanceName.trim().replace(/\s+/g, "-").toLowerCase();
    if (!name) { alert("Instance name is required."); return; }
    setLoading(true);
    try {
      await api.evoCreateInstance(name, tenantId || null);
      onCreated();
      onClose();
    } catch (e) {
      alert("Failed to create instance: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-hair rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-[17px] font-display font-semibold text-ink mb-1">Connect WhatsApp</h2>
        <p className="text-[13px] text-muted mb-5">Create a new instance on your Evolution API server, then scan the QR code to connect a WhatsApp number.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">
              Instance Name <span className="text-rose-400">*</span>
            </label>
            <input
              value={instanceName}
              onChange={e => setInstanceName(e.target.value)}
              placeholder="e.g. my-business-01"
              className="w-full px-3 py-2 bg-canvas border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
            />
            <p className="text-[11px] text-muted mt-1">Lowercase, hyphens allowed. This is the identifier on your Evolution API server.</p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">
              Link to Tenant (optional)
            </label>
            <select
              value={tenantId}
              onChange={e => setTenantId(e.target.value)}
              className="w-full px-3 py-2 bg-canvas border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand"
            >
              <option value="">— None —</option>
              {tenants.map(t => (
                <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted mt-1">Messages from this WhatsApp number will be routed to this tenant's AI agent.</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-hair rounded-lg text-[13px] font-medium text-muted hover:text-ink hover:bg-canvas transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex-1 py-2 bg-brand text-white rounded-lg text-[13px] font-medium hover:bg-brand-deep transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {loading ? "Creating..." : "Create & Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppConnect({ tenants }) {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [evoUrl, setEvoUrl] = useState("");

  const loadInstances = async () => {
    setLoading(true);
    try {
      const res = await api.evoInstances();
      setInstances(res.instances || []);
    } catch (e) {
      // Evolution API might not be configured yet — show empty state gracefully
      setInstances([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstances();
  }, []);

  const webhookUrl = `${window.location.origin.includes("localhost") ? "http://localhost:8000" : window.location.origin}/api/webhooks/whatsapp`;

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-5xl mx-auto w-full">
      {showModal && (
        <CreateInstanceModal
          tenants={tenants}
          onClose={() => setShowModal(false)}
          onCreated={loadInstances}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold text-ink">WhatsApp Connect</h1>
          <p className="text-[14px] text-muted mt-1">
            Manage WhatsApp instances via Evolution API. Each instance = one linked WhatsApp number.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-[13px] font-medium shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:bg-brand-deep transition-colors"
        >
          <Plus size={15} /> New Instance
        </button>
      </div>

      {/* Webhook Info Card */}
      <div className="bg-brand/5 border border-brand/20 rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand/15 flex items-center justify-center shrink-0 mt-0.5">
            <ExternalLink size={14} className="text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold text-ink mb-1">Your Webhook URL</h3>
            <p className="text-[12px] text-muted mb-2">
              When creating instances, this URL is automatically set as the webhook. Evolution API will forward all WhatsApp messages here.
            </p>
            <div className="flex items-center gap-2 bg-canvas border border-hair rounded-lg px-3 py-2">
              <code className="text-[11px] text-brand font-mono flex-1 truncate">{webhookUrl}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(webhookUrl); }}
                className="text-muted hover:text-ink transition-colors shrink-0"
                title="Copy"
              >
                <Copy size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { step: "1", title: "Create Instance", desc: "Click 'New Instance' to register a WhatsApp slot on your Evolution API server." },
          { step: "2", title: "Scan QR Code", desc: "Open WhatsApp on your phone → Linked Devices → Link a Device, then scan the QR." },
          { step: "3", title: "Auto Reply Active", desc: "Once connected, the AI agent starts auto-replying to incoming messages instantly." },
        ].map((s) => (
          <div key={s.step} className="bg-surface border border-hair rounded-xl p-4">
            <div className="w-7 h-7 rounded-lg bg-brand/15 text-brand font-display font-semibold text-[13px] flex items-center justify-center mb-3">
              {s.step}
            </div>
            <div className="font-semibold text-[13px] text-ink mb-1">{s.title}</div>
            <div className="text-[12px] text-muted leading-relaxed">{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Instances list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-[13px]">Loading instances...</span>
        </div>
      ) : instances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface border border-hair flex items-center justify-center">
            <Smartphone size={28} className="text-muted" />
          </div>
          <div>
            <div className="font-semibold text-[15px] text-ink mb-1">No instances yet</div>
            <div className="text-[13px] text-muted max-w-sm">
              Create your first WhatsApp instance to start connecting numbers and enabling auto-replies.
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-[13px] font-medium hover:bg-brand-deep transition-colors"
          >
            <Plus size={14} /> Create First Instance
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {instances.map((inst, i) => (
            <InstanceCard
              key={inst?.instance?.instanceName || inst?.instanceName || i}
              instance={inst}
              tenants={tenants}
              onRefresh={loadInstances}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import { api, isLoggedIn, logout } from "./api/client";
import Login from "./components/Login";
import Layout from "./components/Layout";

// New Pages
import DashboardOverview from "./pages/DashboardOverview";
import LiveChats from "./pages/LiveChats";
import Analytics from "./pages/Analytics";
import Broadcasts from "./pages/Broadcasts";
import MediaLibrary from "./pages/MediaLibrary";
import TenantManagement from "./pages/TenantManagement";
import WhatsAppConnect from "./pages/WhatsAppConnect";
// Force logout on initial load for demo purposes so the Login page always comes first
if (!sessionStorage.getItem("demo_init")) {
  logout();
  sessionStorage.setItem("demo_init", "true");
}

export default function App() {
  const [authed, setAuthed] = useState(isLoggedIn());
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;
  return <Console />;
}

function Console() {
  const [tenants, setTenants] = useState([]);
  const [activeTenant, setActiveTenant] = useState(null);
  const [view, setView] = useState("overview");

  const loadTenants = useCallback(() => {
    return api.getTenants().then((d) => {
      setTenants(d.tenants);
      setActiveTenant((cur) => cur || (d.tenants[0]?.tenant_id ?? null));
    }).catch(console.error);
  }, []);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const activeTenantObj = tenants.find((t) => t.tenant_id === activeTenant);

  const renderPage = () => {
    switch (view) {
      case "whatsapp-connect":
        return <WhatsAppConnect tenants={tenants} />;
      case "overview":
        return <DashboardOverview tenantId={activeTenant} />;
      case "live-chats":
        return <LiveChats tenantId={activeTenant} />;
      case "broadcasts":
        return <Broadcasts tenantId={activeTenant} />;
      case "media-library":
        return <MediaLibrary tenantId={activeTenant} />;
      case "tenants":
        return <TenantManagement tenants={tenants} activeTenant={activeTenant} onSelectTenant={setActiveTenant} onTenantsChanged={loadTenants} />;
      case "analytics":
        return <Analytics tenantId={activeTenant} />;
      case "settings":
        return (
           <div className="p-8 max-w-4xl mx-auto">
              <h1 className="text-2xl font-display font-semibold mb-2 text-ink">Settings</h1>
              <p className="text-[14px] text-muted mb-8">Global configuration for the WhatsAgent platform.</p>
                            <div className="space-y-6">
                <div className="bg-surface border border-hair rounded-xl p-6">
                  <h3 className="text-[15px] font-display font-semibold mb-4">Global API Keys</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">Groq API Key (Llama 3)</label>
                      <input type="password" placeholder="gsk_..." className="w-full px-3 py-2 bg-canvas border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand font-mono" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">Evolution API URL</label>
                      <input type="text" placeholder="http://localhost:8080" className="w-full px-3 py-2 bg-canvas border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand font-mono" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">Evolution API Key</label>
                      <input type="password" placeholder="Your Evolution API global key" className="w-full px-3 py-2 bg-canvas border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand font-mono" />
                    </div>
                  </div>
                  <button className="mt-6 bg-surface border border-hair text-ink text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-canvas transition-colors">
                    Save Global Settings
                  </button>
                </div>
              </div>
           </div>
        );
      default:
        return null;
    }
  };

  return (
    <Layout
      view={view}
      onViewChange={setView}
      tenants={tenants}
      activeTenant={activeTenant}
      activeTenantName={activeTenantObj?.name}
      onSelectTenant={setActiveTenant}
    >
      {renderPage()}
    </Layout>
  );
}

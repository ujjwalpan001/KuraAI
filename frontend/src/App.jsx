import { useEffect, useState, useCallback } from "react";
import { api, isLoggedIn, logout, getUser, getUserRole } from "./api/client";
import Login from "./components/Login";
import Layout from "./components/Layout";

// New Pages
import DashboardOverview from "./pages/DashboardOverview";
import LiveChats from "./pages/LiveChats";
import Analytics from "./pages/Analytics";
import Broadcasts from "./pages/Broadcasts";
import Orders from "./pages/Orders";
import MediaLibrary from "./pages/MediaLibrary";
import TenantManagement from "./pages/TenantManagement";
import Landing from "./pages/Landing";
import SuperAdmin from "./pages/SuperAdmin";

// Force logout on initial load for demo purposes so the Landing/Login page always comes first
if (!sessionStorage.getItem("demo_init")) {
  logout();
  sessionStorage.setItem("demo_init", "true");
}

export default function App() {
  const [authed, setAuthed] = useState(isLoggedIn());
  const [showLogin, setShowLogin] = useState(false);

  if (!authed) {
    if (showLogin) {
      return <Login onSuccess={() => setAuthed(true)} onBack={() => setShowLogin(false)} />;
    }
    return <Landing onLoginClick={() => setShowLogin(true)} />;
  }

  return <Console />;
}

function Console() {
  const [tenants, setTenants] = useState([]);
  const [activeTenant, setActiveTenant] = useState(null);
  const [view, setView] = useState(getUserRole() === "SUPER_ADMIN" ? "sa-overview" : "overview");

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
      case "overview":
        return <DashboardOverview tenantId={activeTenant} tenantObj={activeTenantObj} onTenantsChanged={loadTenants} />;
      case "live-chats":
        return <LiveChats tenantId={activeTenant} />;
      case "orders":
        return <Orders tenantId={activeTenant} tenantObj={activeTenantObj} onTenantsChanged={loadTenants} />;
      case "broadcasts":
        return <Broadcasts tenantId={activeTenant} />;
      case "media-library":
        return <MediaLibrary tenantId={activeTenant} />;
      case "tenants":
        return <TenantManagement tenants={tenants} activeTenant={activeTenant} onSelectTenant={setActiveTenant} onTenantsChanged={loadTenants} />;
      case "analytics":
        return <Analytics tenantId={activeTenant} />;
      case "sa-overview":
        return <SuperAdmin user={{...getUser(), role: getUserRole()}} activeTab="dashboard" />;
      case "sa-clients":
        return <SuperAdmin user={{...getUser(), role: getUserRole()}} activeTab="clients" />;
      case "sa-settings":
        return <SuperAdmin user={{...getUser(), role: getUserRole()}} activeTab="settings" />;
      case "settings":
        // This is for CLIENT role settings
        return (
           <div className="p-8 max-w-4xl mx-auto">
              <h1 className="text-2xl font-display font-semibold mb-2 text-ink">Settings</h1>
              <p className="text-[14px] text-muted mb-8">Tenant configuration.</p>
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

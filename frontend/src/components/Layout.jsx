import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  MessageSquare,
  Activity,
  Megaphone,
  Image as ImageIcon,
  Users,
  BarChart3,
  Settings,
  Bell,
  Search,
  Menu,
  UserX,
  Smartphone
} from "lucide-react";
import { getUser, logout, api } from "../api/client";

const NAVIGATION = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "live-chats", label: "Live Chats", icon: MessageSquare },
  { id: "broadcasts", label: "Broadcasts", icon: Megaphone },
  { id: "media-library", label: "Media Library", icon: ImageIcon },
  { id: "tenants", label: "Tenants", icon: Users },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function Layout({ view, onViewChange, children, activeTenantName, tenants, onSelectTenant, activeTenant }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const user = getUser();
  const initials = (user?.name || "Admin").slice(0, 2).toUpperCase();

  const [tenantDropdownOpen, setTenantDropdownOpen] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Notifications logic
  const [notifications, setNotifications] = useState([]);
  const [bellOpen, setBellOpen] = useState(false);

  useEffect(() => {
    if (!activeTenant) {
      setNotifications([]);
      return;
    }
    const fetchNotifs = () => {
      api.getSessions(activeTenant).then(res => {
        const escalations = (res.sessions || [])
          .filter(s => s.status === "NEEDS_HUMAN")
          .slice(0, 5); // top 5 recent escalations
        setNotifications(escalations);
      }).catch(() => {});
    };
    
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 5000);
    return () => clearInterval(interval);
  }, [activeTenant]);

  return (
    <div className="h-screen w-full flex bg-canvas text-ink overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside
        className={`shrink-0 border-r border-hair bg-surface flex flex-col transition-all duration-300 ${
          sidebarOpen ? "w-[260px]" : "w-[72px]"
        }`}
      >
        <div className="h-16 flex items-center px-4 border-b border-hair">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M21 11.5a8.4 8.4 0 01-12 7.6L3 21l1.9-5.8A8.5 8.5 0 1121 11.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          {sidebarOpen && <span className="ml-3 font-display font-bold text-[16px] tracking-tight truncate">WhatsAgent</span>}
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAVIGATION.map((nav) => {
            const active = view === nav.id;
            return (
              <button
                key={nav.id}
                onClick={() => onViewChange(nav.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  active ? "bg-brand/10 text-brand" : "text-faint hover:bg-canvas hover:text-ink"
                }`}
                title={sidebarOpen ? undefined : nav.label}
              >
                <nav.icon size={18} className={active ? "text-brand" : "text-muted"} />
                {sidebarOpen && <span className="text-[13.5px] font-medium">{nav.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-hair">
          <button
            onClick={() => {
              logout();
              window.location.reload();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-faint hover:bg-alert/10 hover:text-alert transition-colors"
          >
            <div className="w-6 h-6 rounded-md bg-canvas border border-hair flex items-center justify-center shrink-0 text-[10px] font-bold text-muted">
              {initials}
            </div>
            {sidebarOpen && <span className="text-[13px] font-medium">Log out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-canvas">
        {/* Global Header */}
        <header className="h-16 shrink-0 bg-surface border-b border-hair flex items-center justify-between px-6 z-20 relative">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen((v) => !v)} className="text-muted hover:text-ink transition-colors">
              <Menu size={20} />
            </button>

            {/* Premium Custom Tenant Switcher */}
            <div className="relative">
              <button 
                onClick={() => setTenantDropdownOpen(!tenantDropdownOpen)}
                className="h-9 flex items-center gap-2 px-3 border border-hair rounded-lg bg-canvas hover:border-brand/50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                <div className="w-5 h-5 rounded bg-brand/10 text-brand flex items-center justify-center text-[10px] font-bold">
                  {activeTenantName ? activeTenantName.charAt(0).toUpperCase() : "T"}
                </div>
                <span className="text-[13px] font-medium text-ink max-w-[120px] truncate">
                  {activeTenantName || "Select Tenant"}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-muted transition-transform ${tenantDropdownOpen ? 'rotate-180' : ''}`}>
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {tenantDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setTenantDropdownOpen(false)}></div>
                  <div className="absolute left-0 top-full mt-2 w-64 bg-surface border border-hair rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] z-40 overflow-hidden py-1">
                    <div className="px-3 py-2 border-b border-hair mb-1">
                      <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Switch Workspace</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto px-1 space-y-0.5">
                      {tenants.map((t) => (
                        <button
                          key={t.tenant_id}
                          onClick={() => {
                            onSelectTenant(t.tenant_id);
                            setTenantDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                            activeTenant === t.tenant_id ? "bg-brand/10 text-brand" : "text-ink hover:bg-canvas"
                          }`}
                        >
                          <div className={`w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold shrink-0 ${
                            activeTenant === t.tenant_id ? "bg-brand text-white" : "bg-canvas border border-hair text-muted"
                          }`}>
                            {t.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium truncate">{t.name}</div>
                            <div className="text-[10px] opacity-70 truncate font-mono">{t.tenant_id}</div>
                          </div>
                          {activeTenant === t.tenant_id && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(e.target.value.length > 0);
                }}
                onFocus={() => {
                  if (searchQuery.length > 0) setSearchOpen(true);
                }}
                placeholder="Search phone number..."
                className="w-64 h-9 pl-9 pr-4 rounded-full bg-canvas border border-hair text-[13px] focus:outline-none focus:border-brand transition-colors"
              />
              
              {searchOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setSearchOpen(false)}></div>
                  <div className="absolute left-0 right-0 top-full mt-2 bg-surface border border-hair rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] z-40 overflow-hidden">
                    <button 
                      onClick={() => {
                        onViewChange("live-chats");
                        setSearchOpen(false);
                        setSearchQuery("");
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-canvas transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                        <MessageSquare size={14} className="text-brand" />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-ink">Search for "{searchQuery}" in chats</p>
                        <p className="text-[11px] text-muted mt-0.5">Jump to Live Chats</p>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
            
            <div className="relative">
              <button 
                onClick={() => setBellOpen(!bellOpen)}
                className="relative text-muted hover:text-ink transition-colors flex items-center justify-center"
              >
                <Bell size={20} />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-surface animate-pulse"></span>
                )}
              </button>
              
              {bellOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setBellOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-3 w-80 bg-surface border border-hair rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] z-40 overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-hair flex items-center justify-between">
                      <span className="text-[13px] font-display font-semibold text-ink">Notifications</span>
                      {notifications.length > 0 && (
                        <span className="px-2 py-0.5 bg-rose-500/10 text-rose-500 text-[10px] font-bold rounded-full">
                          {notifications.length} New
                        </span>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-[12px] text-muted">
                          You're all caught up! No recent escalations.
                        </div>
                      ) : (
                        <div className="divide-y divide-hair">
                          {notifications.map(n => (
                            <button 
                              key={n.session_id}
                              onClick={() => {
                                onViewChange("live-chats");
                                setBellOpen(false);
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-canvas transition-colors flex gap-3 group"
                            >
                              <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                                <UserX size={14} className="text-rose-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12.5px] font-medium text-ink leading-tight truncate">
                                  Human Escalation Request
                                </p>
                                <p className="text-[11px] text-muted mt-0.5 truncate font-mono">
                                  {n.customer_phone}
                                </p>
                                <p className="text-[10px] text-brand mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  Click to view in Live Chats &rarr;
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              <span className="text-[12px] font-medium text-muted">All Systems Operational</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

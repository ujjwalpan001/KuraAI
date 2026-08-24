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
  Smartphone,
  Bot
} from "lucide-react";
import { getUser, logout, api } from "../api/client";

const NAVIGATION = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "live-chats", label: "Live Chats", icon: MessageSquare },
  { id: "broadcasts", label: "Broadcasts", icon: Megaphone },
  { id: "media-library", label: "Media Library", icon: ImageIcon },
  { id: "tenants", label: "Tenants", icon: Users },
  { id: "whatsapp-connect", label: "WhatsApp Connect", icon: Smartphone },
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
    <div className="h-screen w-full flex bg-[#030305] text-ink overflow-hidden font-sans relative">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] rounded-full bg-brand/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none"></div>

      {/* Sidebar Navigation */}
      <aside
        className={`shrink-0 border-r border-white/5 bg-white/[0.02] backdrop-blur-2xl flex flex-col transition-all duration-300 relative z-20 ${
          sidebarOpen ? "w-[260px]" : "w-[72px]"
        }`}
      >
        <div className="h-24 flex items-center px-6 mb-2">
          <div className="flex items-center gap-3 text-white font-bold text-xl tracking-wide">
            <Bot size={28} className="text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
            {sidebarOpen && (
              <div className="flex flex-col">
                <span className="font-display font-bold text-[18px] tracking-tight text-white">WhatsAgent</span>
                <span className="text-[10px] text-indigo-400 font-semibold tracking-widest uppercase mt-0.5">Enterprise</span>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 py-2 px-4 space-y-2 overflow-y-auto custom-scrollbar">
          {NAVIGATION.map((nav) => {
            const active = view === nav.id;
            return (
              <button
                key={nav.id}
                onClick={() => onViewChange(nav.id)}
                className={`group relative w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all duration-500 overflow-hidden ${
                  active ? "bg-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] text-white" : "text-white/40 hover:bg-white/[0.02] hover:text-white/80"
                }`}
                title={sidebarOpen ? undefined : nav.label}
              >
                {active && (
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-transparent opacity-50"></div>
                )}
                {active && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-indigo-400 to-purple-500 rounded-r-md shadow-[0_0_12px_rgba(129,140,248,0.8)]"></div>
                )}
                
                <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-500 ${
                  active ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20" : "bg-white/[0.03] text-white/40 group-hover:bg-white/[0.08] group-hover:text-white/80 group-hover:scale-110"
                }`}>
                  <nav.icon size={16} strokeWidth={active ? 2.5 : 2} />
                </div>
                
                {sidebarOpen && <span className={`relative z-10 text-[13.5px] tracking-wide transition-all duration-300 ${
                  active ? "font-semibold" : "font-medium"
                }`}>{nav.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 mt-auto mb-4 mx-3 bg-white/[0.02] border border-white/5 rounded-2xl backdrop-blur-xl">
          <button
            onClick={() => {
              logout();
              window.location.reload();
            }}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-white/50 hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-300 group"
          >
            <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/5 flex items-center justify-center shrink-0 text-[11px] font-bold text-white/70 group-hover:bg-rose-500/20 group-hover:border-rose-500/30 group-hover:text-rose-400 transition-all">
              {initials}
            </div>
            {sidebarOpen && (
              <div className="flex flex-col items-start min-w-0">
                <span className="text-[13px] font-semibold text-white/80 group-hover:text-rose-400 transition-colors truncate">Admin User</span>
                <span className="text-[10px] font-medium text-white/40 tracking-wide uppercase">Log out</span>
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative z-10">
        {/* Global Header */}
        <header className="h-20 shrink-0 bg-white/[0.02] backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-8 z-30 relative">
          <div className="flex items-center gap-6">
            <button onClick={() => setSidebarOpen((v) => !v)} className="text-white/50 hover:text-white transition-colors">
              <Menu size={20} />
            </button>

            {/* Premium Custom Tenant Switcher */}
            <div className="relative">
              <button 
                onClick={() => setTenantDropdownOpen(!tenantDropdownOpen)}
                className="h-10 flex items-center gap-3 px-4 border border-white/10 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] transition-all focus:outline-none focus:border-indigo-500/50 backdrop-blur-md shadow-lg"
              >
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-[11px] font-bold shadow-inner">
                  {activeTenantName ? activeTenantName.charAt(0).toUpperCase() : "T"}
                </div>
                <span className="text-[14px] font-medium text-white max-w-[140px] truncate tracking-wide">
                  {activeTenantName || "Select Tenant"}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-white/50 transition-transform duration-300 ${tenantDropdownOpen ? 'rotate-180' : ''}`}>
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

          <div className="flex items-center gap-6">
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
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
                className="w-72 h-10 pl-11 pr-4 rounded-xl bg-white/[0.03] border border-white/10 text-[13px] text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.06] transition-all backdrop-blur-md shadow-inner"
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
                className="relative w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.03] border border-white/10 text-white/60 hover:bg-white/[0.08] hover:text-white transition-all backdrop-blur-md"
              >
                <Bell size={18} />
                {notifications.length > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse"></span>
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

            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"></div>
              <span className="text-[11px] font-semibold text-emerald-400 tracking-wide uppercase">Operational</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 min-h-0 overflow-y-auto relative z-10 custom-scrollbar">
          {children}
        </div>
      </main>
    </div>
  );
}

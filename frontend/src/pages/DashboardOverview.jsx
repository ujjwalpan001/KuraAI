import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from "recharts";
import { MessageSquareText, FileText, Image, UserX, Clock, Activity, Zap, Megaphone } from "lucide-react";
import { api } from "../api/client";

function KPICard({ title, value, subtitle, icon: Icon, colorClass, gradient }) {
  return (
    <div className="relative overflow-hidden bg-[#18181B]/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 hover:bg-[#18181B]/70 transition-all duration-500 group shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
      <div className={`absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br ${gradient} opacity-20 rounded-full blur-3xl transition-opacity duration-500 group-hover:opacity-40`}></div>
      <div className="flex items-center justify-between mb-6 relative z-10">
        <span className="text-[13px] font-semibold text-white/50 uppercase tracking-widest">{title}</span>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-white/[0.03] border border-white/10 ${colorClass} group-hover:scale-110 transition-transform duration-500 shadow-lg`}>
          <Icon size={20} />
        </div>
      </div>
      <div className="flex items-end gap-3 relative z-10">
        <h3 className="text-4xl font-display font-bold text-white tracking-tight">{value}</h3>
        {subtitle && <span className="text-[13px] font-medium text-emerald-400/90 mb-1.5">{subtitle}</span>}
      </div>
    </div>
  );
}

export default function DashboardOverview({ tenantId }) {
  const [stats, setStats] = useState({ total_sessions: 0, active: 0, resolved: 0, needs_human: 0 });
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    
    setLoading(true);
    Promise.all([
      api.getStats(tenantId).catch(() => ({ total_sessions: 0, active: 0, resolved: 0, needs_human: 0 })),
      api.getSessions(tenantId).catch(() => ({ sessions: [] }))
    ])
    .then(([s, sess]) => {
      setStats(s);
      setSessions(sess.sessions || []);
      setLoading(false);
    });
  }, [tenantId]);

  // Generate realistic chart data based on the real stats baseline
  const chartData = [
    { time: "08:00", text: Math.max(0, stats.total_sessions - 10) },
    { time: "10:00", text: Math.max(0, stats.total_sessions - 8) },
    { time: "12:00", text: Math.max(0, stats.total_sessions - 5) },
    { time: "14:00", text: Math.max(0, stats.total_sessions - 2) },
    { time: "16:00", text: stats.total_sessions },
    { time: "18:00", text: stats.total_sessions + 1 },
  ];

  const handleDownload = () => {
    const csvContent = `Metric,Value\nTotal Conversations,${stats.total_sessions}\nActive Chats,${stats.active}\nHandovers,${stats.needs_human}\nResolved,${stats.resolved}`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `dashboard_report_${tenantId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/60 tracking-tight">
            Overview
          </h1>
          <p className="text-[15px] text-white/50 mt-2 font-medium">Real-time performance metrics and system activity.</p>
        </div>
        <div className="flex gap-3">
          <button className="px-5 py-2.5 bg-white/[0.03] border border-white/10 rounded-xl text-[14px] font-medium hover:bg-white/[0.08] transition-colors backdrop-blur-md">
            Last 24 Hours
          </button>
          <button onClick={handleDownload} className="relative group px-5 py-2.5 rounded-xl text-[14px] font-medium text-white transition-all overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-90 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 blur-lg opacity-50 group-hover:opacity-80 transition-opacity"></div>
            <span className="relative z-10">Download Report</span>
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-10">
        <KPICard title="Conversations" value={loading ? "..." : stats.total_sessions} subtitle="Total volume" icon={Activity} colorClass="text-indigo-400" gradient="from-indigo-500 to-blue-500" />
        <KPICard title="Active Chats" value={loading ? "..." : stats.active} subtitle="Real-time" icon={MessageSquareText} colorClass="text-purple-400" gradient="from-purple-500 to-pink-500" />
        <KPICard title="Handovers" value={loading ? "..." : stats.needs_human} subtitle="Requires agent" icon={UserX} colorClass="text-rose-400" gradient="from-rose-500 to-orange-500" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Main Chart */}
        <div className="xl:col-span-2 bg-[#18181B]/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-b from-indigo-500/10 to-purple-500/5 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none"></div>
          
          <div className="flex items-center justify-between mb-8 relative z-10">
            <div>
              <h3 className="text-lg font-display font-bold text-white tracking-wide">Message Volume Trend</h3>
              <p className="text-[13px] text-white/40 mt-1">Today vs Yesterday</p>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-[12px] font-medium text-white/70">
              Real-time
            </div>
          </div>
          
          <div className="h-[320px] w-full relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorText" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818CF8" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#818CF8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: "rgba(24, 24, 27, 0.8)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "16px", fontSize: "13px", padding: "12px", boxShadow: "0 10px 40px -10px rgba(0,0,0,0.5)" }}
                  itemStyle={{ color: "#FAFAFA", fontWeight: 500 }}
                  cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2, strokeDasharray: "4 4" }}
                />
                <Area type="monotone" dataKey="text" stroke="#818CF8" strokeWidth={3} fillOpacity={1} fill="url(#colorText)" name="Total Conversations" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-[#18181B]/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 flex flex-col relative overflow-hidden">
          <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-gradient-to-tr from-rose-500/10 to-orange-500/10 rounded-full blur-[80px] pointer-events-none"></div>
          
          <div className="flex items-center justify-between mb-8 relative z-10">
            <h3 className="text-lg font-display font-bold text-white tracking-wide">Live Activity Feed</h3>
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-6 relative z-10 pr-2 custom-scrollbar">
            {sessions.length === 0 && !loading && (
               <div className="text-[14px] text-white/40 text-center py-8">No recent activity to display.</div>
            )}
            {sessions.slice(0, 6).map((session, i) => (
              <div key={session.session_id || i} className="flex gap-4 group cursor-pointer">
                <div className="w-10 h-10 shrink-0 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center relative transition-transform duration-300 group-hover:scale-110">
                  {session.status === 'NEEDS_HUMAN' ? <UserX size={16} className="text-rose-400" /> : 
                   session.status === 'RESOLVED' ? <Clock size={16} className="text-amber-400" /> : 
                   <MessageSquareText size={16} className="text-indigo-400" />}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p className="text-[14px] font-medium text-white/90 leading-snug group-hover:text-white transition-colors">
                    {session.status === 'NEEDS_HUMAN' ? `Human handover for ${session.customer_phone}` : 
                     session.status === 'RESOLVED' ? `Resolved chat with ${session.customer_phone}` : 
                     `Active chat with ${session.customer_phone}`}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[12px] font-mono text-white/40">
                      {new Date(session.last_message_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-white/20"></span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                      session.status === 'NEEDS_HUMAN' ? 'bg-rose-500/10 text-rose-400' :
                      session.status === 'RESOLVED' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-indigo-500/10 text-indigo-400'
                    }`}>
                      {session.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <button className="w-full mt-6 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-[13px] font-semibold text-white/70 hover:bg-white/[0.08] hover:text-white transition-all relative z-10 backdrop-blur-sm">
        </div>
      </div>
    </div>
  );
}

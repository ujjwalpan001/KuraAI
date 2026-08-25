import React from 'react';
import { ArrowRight, MessageSquare, Cpu, Database, Zap, CheckCircle2, Clock, Globe, Shield, Activity, Layers, BarChart2 } from 'lucide-react';

const row1 = [
  { step: "01", title: "Customer sends a message", icon: <MessageSquare className="w-5 h-5" /> },
  { step: "02", title: "AI understands the intent", icon: <Cpu className="w-5 h-5" /> },
  { step: "03", title: "Knowledge base is analyzed", icon: <Database className="w-5 h-5" /> },
  { step: "04", title: "Best response is generated", icon: <Zap className="w-5 h-5" /> },
  { step: "05", title: "Reply delivered instantly", icon: <CheckCircle2 className="w-5 h-5" /> },
  { step: "06", title: "Multi-language support", icon: <Globe className="w-5 h-5" /> },
  { step: "07", title: "Human handoff when needed", icon: <Layers className="w-5 h-5" /> },
  { step: "08", title: "Conversation tracked", icon: <BarChart2 className="w-5 h-5" /> },
  { step: "09", title: "Feedback loop improves AI", icon: <Activity className="w-5 h-5" /> },
  { step: "10", title: "Customer leaves satisfied", icon: <Shield className="w-5 h-5" /> },
];

const row2 = [
  { title: "Always available", desc: "24/7 support without downtime", icon: <Clock className="w-5 h-5" /> },
  { title: "Replies in seconds", desc: "Lightning fast resolution", icon: <Zap className="w-5 h-5" /> },
  { title: "Understands context", desc: "Multilingual & semantic", icon: <Globe className="w-5 h-5" /> },
  { title: "Works while you sleep", desc: "Fully automated pipeline", icon: <Activity className="w-5 h-5" /> },
  { title: "Built for your business", desc: "Custom knowledge integration", icon: <Shield className="w-5 h-5" /> },
  { title: "Deep analytics", desc: "Track every interaction", icon: <BarChart2 className="w-5 h-5" /> },
  { title: "Smart escalation", desc: "Route to human when needed", icon: <Layers className="w-5 h-5" /> },
  { title: "Zero downtime", desc: "Cloud-native reliability", icon: <CheckCircle2 className="w-5 h-5" /> },
  { title: "API-first design", desc: "Integrates with anything", icon: <Cpu className="w-5 h-5" /> },
  { title: "Instant deployment", desc: "Go live in minutes", icon: <MessageSquare className="w-5 h-5" /> },
];

const Card1 = ({ item }) => (
  <div className="w-[240px] h-[140px] shrink-0 rounded-2xl bg-[rgba(255,255,255,0.04)] border border-white/[0.08] p-5 flex flex-col justify-between hover:bg-[rgba(255,255,255,0.07)] hover:border-white/[0.15] transition-colors duration-300">
    <div className="flex justify-between items-start text-white/30">
      <span className="text-[11px] font-mono">{item.step}</span>
      <span className="text-white/50">{item.icon}</span>
    </div>
    <h3 className="text-[14px] font-display font-semibold text-white/90 leading-snug">{item.title}</h3>
  </div>
);

const Card2 = ({ item }) => (
  <div className="w-[240px] h-[140px] shrink-0 rounded-2xl bg-[rgba(255,255,255,0.04)] border border-white/[0.08] p-5 flex flex-col justify-between hover:bg-[rgba(255,255,255,0.07)] hover:border-white/[0.15] transition-colors duration-300">
    <span className="text-white/40">{item.icon}</span>
    <div>
      <h3 className="text-[14px] font-display font-semibold text-white/90 mb-1">{item.title}</h3>
      <p className="text-[12px] text-white/40">{item.desc}</p>
    </div>
  </div>
);

export default function HowItWorksSection({ onLoginClick }) {
  return (
    <section className="relative py-16 bg-black border-t border-white/5 overflow-hidden" id="how-it-works">

      <style>{`
        @keyframes marquee-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee-right {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .marquee-left {
          display: flex;
          width: max-content;
          animation: marquee-left 40s linear infinite;
          will-change: transform;
        }
        .marquee-right {
          display: flex;
          width: max-content;
          animation: marquee-right 45s linear infinite;
          will-change: transform;
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-6 mb-16">
        <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-8">
          <div>
            <div className="inline-flex items-center px-3 py-1.5 rounded-full border border-white/10 bg-white/5 mb-6">
              <span className="text-[11px] font-semibold text-white/70 uppercase tracking-widest">How It Works</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-display font-bold text-white leading-[1.1] tracking-tight">
              From message to <br className="hidden lg:block" /> meaningful reply.
            </h2>
          </div>
          <p className="text-lg text-white/50 max-w-md leading-relaxed">
            Our intelligent automation understands conversations, processes what matters, and responds instantly.
          </p>
        </div>
      </div>

      {/* Carousel Rows */}
      <div className="flex flex-col gap-5 relative">
        {/* Fade masks */}
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none" />

        {/* Row 1 — left */}
        <div className="overflow-hidden">
          <div className="marquee-left gap-4" style={{ gap: '1rem' }}>
            {[...row1, ...row1].map((item, idx) => (
              <div key={idx} className="px-2">
                <Card1 item={item} />
              </div>
            ))}
          </div>
        </div>

        {/* Row 2 — right */}
        <div className="overflow-hidden">
          <div className="marquee-right gap-4" style={{ gap: '1rem' }}>
            {[...row2, ...row2].map((item, idx) => (
              <div key={idx} className="px-2">
                <Card2 item={item} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-7xl mx-auto px-6 mt-16">
        <button onClick={onLoginClick} className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/20 bg-transparent text-white font-medium hover:bg-white/5 hover:border-white/40 transition-all">
          See how it works
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

    </section>
  );
}

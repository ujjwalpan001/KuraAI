import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Zap, Shield, ChevronRight, Play } from 'lucide-react';

const navVariants = {
  hidden: { y: -20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.6, ease: "easeOut" } }
};

const heroVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.2, ease: "easeOut" } }
};

const messages = [
  { id: 1, sender: 'user', text: 'Hi, I need help with my recent order #4592.' },
  { id: 2, sender: 'ai', text: 'Hello! I can help with that. Let me look up order #4592 for you.' },
  { id: 3, sender: 'ai', text: 'Your order was shipped yesterday and will arrive by tomorrow.' },
];

export default function HeroSection({ onLoginClick }) {
  const [displayedMessages, setDisplayedMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const mountedRef = React.useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let currentIdx = 0;
    let timers = [];
    
    const showNextMessage = () => {
      if (!mountedRef.current) return;
      const msg = messages[currentIdx];
      if (!msg) return; // guard against out-of-bounds
      if (msg.sender === 'ai') {
        setIsTyping(true);
        const t1 = setTimeout(() => {
          if (!mountedRef.current) return;
          setIsTyping(false);
          setDisplayedMessages(prev => [...prev, messages[currentIdx]]);
          currentIdx++;
          const t2 = setTimeout(showNextMessage, 1500);
          timers.push(t2);
        }, 1200);
        timers.push(t1);
      } else {
        setDisplayedMessages(prev => [...prev, messages[currentIdx]]);
        currentIdx++;
        const t3 = setTimeout(showNextMessage, 1500);
        timers.push(t3);
      }
    };
    
    const timer = setTimeout(showNextMessage, 1000);
    timers.push(timer);
    
    return () => {
      mountedRef.current = false;
      timers.forEach(t => clearTimeout(t));
    };
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col overflow-hidden bg-canvas">
      {/* Background Video Placeholder / Animated Gradient */}
      <div className="absolute inset-0 z-0 overflow-hidden">
         <div className="absolute inset-0 bg-canvas/80 z-10"></div>
         <motion.div 
           initial={{ opacity: 0 }}
           animate={{ opacity: 0.15 }}
           transition={{ duration: 2 }}
           className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.1)_0%,transparent_70%)] pointer-events-none" 
         />
         <motion.div 
           initial={{ opacity: 0 }}
           animate={{ opacity: 0.1 }}
           transition={{ duration: 2, delay: 0.5 }}
           className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.1)_0%,transparent_70%)] pointer-events-none" 
         />
         <div className="absolute inset-0 bg-gradient-to-b from-transparent to-canvas z-10" />
      </div>

      {/* Navigation */}
      <motion.nav 
        variants={navVariants}
        initial="hidden"
        animate="visible"
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 w-full bg-black/40 backdrop-blur-xl border-b border-white/10"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between w-full">
          <div className="flex items-center">
            <img src="/kura.png" alt="Kura Logo" className="h-14 w-auto object-contain" />
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-[14px] font-medium text-white/70">
            <a href="#video-showcase" onClick={e => { e.preventDefault(); document.getElementById('video-showcase')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-white transition-colors cursor-pointer">Demo</a>
            <a href="#how-it-works" onClick={e => { e.preventDefault(); document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-white transition-colors cursor-pointer">How it Works</a>
            <a href="#contact" onClick={e => { e.preventDefault(); document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-white transition-colors cursor-pointer">Contact</a>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={onLoginClick} className="text-[14px] font-medium text-white/70 hover:text-white transition-colors">
              Login
            </button>
            <button onClick={onLoginClick} className="bg-white text-black px-4 py-2 rounded-lg text-[14px] font-semibold hover:bg-white/90 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)]">
              Get Started
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Hero Content */}
      <div className="relative z-20 flex-grow flex flex-col lg:flex-row items-center justify-between px-6 max-w-7xl mx-auto w-full mt-24 lg:mt-16">
        
        {/* Left Copy */}
        <motion.div 
          variants={heroVariants}
          initial="hidden"
          animate="visible"
          className="w-full lg:w-1/2 flex flex-col items-start pt-10 pb-20 lg:py-0"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-6">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            <span className="text-[12px] font-medium text-white/80">WhatsApp AI Automation 2.0</span>
          </div>
          
          <h1 className="text-5xl lg:text-7xl font-display font-bold leading-[1.1] tracking-tight mb-6 text-white">
            Your Business Never Stops <span className="text-white/60">Replying</span>
          </h1>
          
          <p className="text-lg lg:text-xl text-muted mb-10 max-w-xl leading-relaxed">
            Let AI handle your WhatsApp conversations, answer customers instantly, and bring your team in when it matters.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <button onClick={onLoginClick} className="w-full sm:w-auto bg-white text-black px-8 py-4 rounded-xl text-[15px] font-semibold hover:bg-white/90 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center justify-center gap-2 group">
              Get Started Free
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button onClick={() => document.getElementById('video-showcase')?.scrollIntoView({ behavior: 'smooth' })} className="w-full sm:w-auto bg-white/5 border border-white/10 text-white px-8 py-4 rounded-xl text-[15px] font-medium hover:bg-white/10 transition-colors flex items-center justify-center gap-2 backdrop-blur-md">
              <Play className="w-4 h-4" />
              Watch How It Works
            </button>
          </div>
        </motion.div>

        {/* Right Interactive Mockup */}
        <motion.div 
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
          className="w-full lg:w-[400px] h-[600px] relative mt-12 lg:mt-0"
        >
          {/* Phone Frame */}
          <div className="absolute inset-0 bg-[#111111] rounded-[40px] border-[8px] border-[#222222] shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-[#111111] px-4 pt-12 pb-4 flex items-center gap-3 border-b border-white/5">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold">
                A
              </div>
              <div>
                <h3 className="font-semibold text-[15px] text-white">Support Agent</h3>
                <p className="text-[12px] text-white/50">Online</p>
              </div>
            </div>
            
            {/* Chat Area */}
            <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto bg-black bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-opacity-10">
              <AnimatePresence>
                {displayedMessages.filter(Boolean).map((msg) => (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`max-w-[85%] rounded-2xl p-3 text-[14px] leading-relaxed shadow-sm ${
                      msg.sender === 'user' 
                        ? 'bg-white/10 text-white self-end rounded-tr-sm border border-white/5' 
                        : 'bg-white text-black self-start rounded-tl-sm'
                    }`}
                  >
                    {msg.text}
                  </motion.div>
                ))}
                
                {isTyping && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white/10 text-white self-start rounded-2xl rounded-tl-sm p-3 w-16 h-10 flex items-center justify-center gap-1 border border-white/5"
                  >
                    <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-1.5 h-1.5 rounded-full bg-white/70" />
                    <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-white/70" />
                    <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-white/70" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* Input Area */}
            <div className="bg-[#111111] p-4 flex items-center gap-2 border-t border-white/5">
              <div className="flex-1 bg-white/5 border border-white/10 rounded-full h-10 px-4 flex items-center">
                <span className="text-white/40 text-[14px]">Type a message...</span>
              </div>
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
          
          {/* Decorative floating elements */}
          <div
            className="absolute -right-12 top-20 bg-black border border-white/10 rounded-xl p-4 shadow-xl hidden lg:flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-white">0.4s Latency</p>
              <p className="text-[10px] text-white/50">Lightning fast</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

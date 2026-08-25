import React from 'react';
import { motion } from 'framer-motion';
import { Settings, Activity } from 'lucide-react';

export default function VideoShowcaseSection() {
  return (
    <section id="video-showcase" className="bg-black py-32 overflow-hidden border-t border-white/5">
      <div className="max-w-7xl mx-auto px-6 flex flex-col gap-32">
        
        {/* Section 1: Text Left, Video Right */}
        <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="w-full lg:w-5/12 flex flex-col items-start"
          >
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-inner">
              <Settings className="w-6 h-6 text-white/80" />
            </div>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-6 leading-[1.1] tracking-tight">
              Build, test, and deploy in minutes.
            </h2>
            <p className="text-lg text-white/50 leading-relaxed">
              Configure everything from voice and conversation flow, to telephony and integrations. Kura handles the infrastructure so you can go from prompt to production fast.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="w-full lg:w-7/12"
          >
            <div className="relative p-2 rounded-[2rem] bg-white/5 border border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.05)] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none rounded-[2rem]" />
              <video 
                src="/Kura1.mp4"
                autoPlay 
                loop 
                muted 
                playsInline
                className="w-full h-auto rounded-[1.5rem] bg-[#0a0a0a] object-cover"
              />
            </div>
          </motion.div>
        </div>

        {/* Section 2: Video Left, Text Right */}
        <div className="flex flex-col-reverse lg:flex-row items-center gap-16 lg:gap-24">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
            className="w-full lg:w-7/12"
          >
            <div className="relative p-2 rounded-[2rem] bg-white/5 border border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.05)] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-white/5 pointer-events-none rounded-[2rem]" />
              <video 
                src="/Kura2.mp4"
                autoPlay 
                loop 
                muted 
                playsInline
                className="w-full h-auto rounded-[1.5rem] bg-[#0a0a0a] object-cover"
              />
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="w-full lg:w-5/12 flex flex-col items-start"
          >
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-inner">
              <Activity className="w-6 h-6 text-white/80" />
            </div>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-6 leading-[1.1] tracking-tight">
              Ship better agents.<br />Faster. Every time.
            </h2>
            <p className="text-lg text-white/50 leading-relaxed">
              Track what's working across every interaction, surface what isn't, and continuously improve the experiences that drive your business forward.
            </p>
          </motion.div>
        </div>

      </div>
    </section>
  );
}

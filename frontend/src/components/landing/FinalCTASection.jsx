import React, { useState } from 'react';
import { Mail, Send, Loader2 } from 'lucide-react';

export default function FinalCTASection() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch('http://localhost:8000/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`Server error ${response.status}`);
      setStatus('success');
      setFormData({ name: '', email: '', message: '' });
      setTimeout(() => setStatus('idle'), 5000);
    } catch (err) {
      if (err.name === 'AbortError') {
        setErrorMessage('Request timed out. Please try again.');
      } else {
        setErrorMessage(err.message || 'Failed to send. Please try again.');
      }
      setStatus('error');
    }
  };

  return (
    <section className="relative py-16 overflow-hidden bg-black" id="contact">

      {/* Pure CSS background — no JS animation so it never crashes on re-render */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)',
            animation: 'pulseGlow 8s ease-in-out infinite',
          }}
        />
      </div>

      <style>{`
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
      `}</style>

      <div className="max-w-xl mx-auto px-6 relative z-10">

        <div className="text-center mb-12 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-2xl">
            <Mail className="w-8 h-8 text-white/80" />
          </div>
          <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-4 tracking-tight">
            Let's build something great.
          </h2>
          <p className="text-lg text-white/50">
            Drop us a message and our team will get back to you shortly.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white/5 border border-white/10 rounded-[2rem] p-8 shadow-[0_0_50px_rgba(255,255,255,0.03)] flex flex-col gap-6"
        >
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-white/70 ml-2">Name</label>
            <input
              required
              type="text"
              value={formData.name}
              onChange={handleChange('name')}
              className="bg-black border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
              placeholder="John Doe"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-white/70 ml-2">Email Address</label>
            <input
              required
              type="email"
              value={formData.email}
              onChange={handleChange('email')}
              className="bg-black border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
              placeholder="john@company.com"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium text-white/70 ml-2">Message</label>
            <textarea
              required
              rows={4}
              value={formData.message}
              onChange={handleChange('message')}
              className="bg-black border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors resize-none"
              placeholder="How can we help your business?"
            />
          </div>

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full mt-2 bg-white text-black px-6 py-4 rounded-xl text-[15px] font-semibold hover:bg-white/90 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Send Message
                <Send className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </>
            )}
          </button>

          {status === 'success' && (
            <p className="text-green-400 text-sm text-center font-medium">✓ Message sent successfully!</p>
          )}
          {status === 'error' && (
            <p className="text-red-400 text-sm text-center font-medium">⚠ {errorMessage || 'Failed to send message.'}</p>
          )}
        </form>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 left-0 w-full text-center z-10">
        <p className="text-[12px] text-white/20">&copy; {new Date().getFullYear()} Kura. All rights reserved.</p>
      </div>
    </section>
  );
}

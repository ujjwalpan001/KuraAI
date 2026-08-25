import { useState, useEffect } from "react";
import { login, signup, googleLogin } from "../api/client";
import { Bot, Eye, EyeOff, Zap, ShieldCheck, LineChart } from "lucide-react";
import { GoogleLogin } from '@react-oauth/google';

/* ────────────────────────────────────────────────────────────
   Kura — Re-designed Dark Theme with Carousel
   ──────────────────────────────────────────────────────────── */

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
`;

const CAROUSEL_SLIDES = [
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1620121692029-d088224ddc74?q=80&w=2832&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1604871000636-074fa5117945?q=80&w=2787&auto=format&fit=crop"
];

export default function Login({ onSuccess, onBack }) {
  const [mode, setMode] = useState("login");
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % CAROUSEL_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#24242F] font-sans text-white p-4 sm:p-6 lg:p-8" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{FONT_IMPORT}</style>

      <div className="w-full max-w-[1000px] h-auto lg:h-[720px] bg-[#1E1E26] rounded-[32px] shadow-2xl flex flex-col lg:flex-row p-3 gap-3 relative overflow-hidden">
        
        {/* ── Left Carousel Panel ── */}
        <div className="hidden lg:flex flex-col relative w-[48%] h-full rounded-[24px] overflow-hidden group bg-black">
          {CAROUSEL_SLIDES.map((slide, i) => (
            <img 
              key={i} 
              src={slide} 
              alt="Background"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${i === currentSlide ? 'opacity-100' : 'opacity-0'}`}
            />
          ))}
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#181822]/70 via-[#181822]/60 to-[#181822]/90" />

          <div className="absolute inset-0 z-10 flex flex-col justify-between p-8">
            {/* Top Bar */}
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <img src="/kura.png" alt="Logo" className="h-12 w-auto object-contain" />
              </div>
              {onBack && (
                <button onClick={onBack} className="flex items-center gap-1.5 text-[11px] font-medium bg-white/10 hover:bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full text-white transition-colors cursor-pointer">
                  Back to website <span aria-hidden="true">&rarr;</span>
                </button>
              )}
            </div>

            {/* Middle/Bottom Text & Features */}
            <div className="mb-4 mt-auto">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 text-[11px] font-medium tracking-wide bg-white/10 border border-white/20 backdrop-blur-md text-[#E0E0EC]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8468F5] animate-pulse" />
                Enterprise Multi-Tenant AI Platform
              </div>
              <h2 className="text-white text-[42px] font-bold mb-4 leading-[1.1] tracking-tight">
                Automate support.<br/>
                <span className="text-[#8468F5]">Scale your sales.</span>
              </h2>
              <p className="text-[14px] leading-relaxed mb-8 text-[#A0A0B0] max-w-[95%]">
                Connect your WhatsApp numbers, upload enterprise documentation, and deploy highly intelligent RAG agents across multiple tenants instantly.
              </p>

              <div className="grid grid-cols-2 gap-y-5 gap-x-4 mb-10">
                {[
                  { icon: Bot, text: "Llama-3.3 70B Reasoning" },
                  { icon: Zap, text: "Instant RAG PDF Search" },
                  { icon: ShieldCheck, text: "Multi-Tenant Isolation" },
                  { icon: LineChart, text: "Real-time Monitoring" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-white/5 border border-white/10 text-[#8468F5]">
                      <Icon size={16} />
                    </div>
                    <span className="text-[13px] font-medium text-[#D7D9E6]">{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Carousel Indicators */}
            <div className="flex gap-2 justify-center">
              {CAROUSEL_SLIDES.map((_, i) => (
                <button 
                  key={i} 
                  onClick={() => setCurrentSlide(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === currentSlide ? 'w-8 bg-white' : 'w-4 bg-white/30 hover:bg-white/50'}`} 
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Right Form Panel ── */}
        <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-10 relative overflow-y-auto">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center mb-10">
             <img src="/kura.png" alt="Logo" className="h-12 w-auto object-contain" />
          </div>

          <div className="w-full max-w-[400px] mx-auto">
            {mode === "login" 
              ? <LoginForm onSwitch={() => setMode("signup")} onSuccess={onSuccess} /> 
              : <SignupForm onSwitch={() => setMode("login")} onSuccess={onSuccess} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Login form ── */
function LoginForm({ onSwitch, onSuccess }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) { setError("Please enter your email and password"); return; }
    setLoading(true); setError("");
    try {
      await login(form.email, form.password);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-[32px] font-semibold text-white mb-2 tracking-tight">
        Welcome back
      </h1>
      <p className="text-[#8A8A9D] text-[14px] mb-6">
        Sign in to your enterprise dashboard
      </p>

      <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[13px] text-emerald-400 leading-relaxed flex items-start gap-3">
        <div className="mt-0.5 text-emerald-500">
          <ShieldCheck size={18} />
        </div>
        <div>
          <p className="font-medium mb-1">Fresh Database</p>
          <p className="text-emerald-500/80">
            The database has been securely wiped. Please create a new account to get started.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <AuthField 
          type="email" 
          value={form.email} 
          placeholder="admin@company.com"
          onChange={(v) => setForm({ ...form, email: v })} 
        />
        
        <div className="relative">
          <AuthField 
            type={showPassword ? "text" : "password"} 
            value={form.password} 
            placeholder="••••••••"
            onChange={(v) => setForm({ ...form, password: v })} 
          />
          <button 
            type="button" 
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6C6C7D] hover:text-[#A0A0B0] transition-colors"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-[13px] bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        <SubmitButton loading={loading} label="Sign in to Dashboard" />

        <div className="mt-4 flex justify-center">
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              try {
                await googleLogin(credentialResponse.credential);
                onSuccess();
              } catch (err) {
                setError(err.message);
              }
            }}
            onError={() => {
              setError("Google Sign-In failed");
            }}
            theme="filled_black"
          />
        </div>
      </form>

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-[#1E1E26] text-[#6C6C7D]">New here?</span>
          </div>
        </div>
        
        <button 
          type="button" 
          onClick={onSwitch} 
          className="w-full mt-6 py-3.5 rounded-xl font-medium text-[15px] bg-[#2A2A36] text-white hover:bg-[#343442] border border-white/10 transition-colors flex justify-center items-center gap-2"
        >
          Create a new account
        </button>
      </div>
    </>
  );
}

/* ── Signup form ── */
function SignupForm({ onSwitch, onSuccess }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Please enter your name"); return; }
    if (!form.email.trim()) { setError("Please enter your email"); return; }
    if (form.password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError("");
    try {
      await signup(form.name, form.email, form.password);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-[32px] font-semibold text-white mb-2 tracking-tight">
        Create an account
      </h1>
      <p className="text-[#8A8A9D] text-[14px] mb-8">
        Start building intelligent WhatsApp agents
      </p>

      <form onSubmit={submit} className="space-y-4">
        <AuthField 
          type="text" 
          value={form.name} 
          placeholder="Full name"
          onChange={(v) => setForm({ ...form, name: v })} 
        />
        <AuthField 
          type="email" 
          value={form.email} 
          placeholder="admin@company.com"
          onChange={(v) => setForm({ ...form, email: v })} 
        />
        
        <div className="relative">
          <AuthField 
            type={showPassword ? "text" : "password"} 
            value={form.password} 
            placeholder="••••••••"
            onChange={(v) => setForm({ ...form, password: v })} 
          />
          <button 
            type="button" 
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6C6C7D] hover:text-[#A0A0B0] transition-colors"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <div className="flex items-center gap-3 mt-4 mb-2 px-1">
          <input type="checkbox" id="terms" className="w-4 h-4 rounded-sm border-none bg-[#2A2A36] text-[#8468F5] focus:ring-[#8468F5] focus:ring-offset-0 cursor-pointer" required />
          <label htmlFor="terms" className="text-[13px] text-white">
            I agree to the <a href="#" className="text-[#8468F5] underline hover:text-[#9B84F8]">Terms & Conditions</a>
          </label>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-[13px] bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        <SubmitButton loading={loading} label="Start free trial" />

        <div className="mt-4 flex justify-center">
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              try {
                await googleLogin(credentialResponse.credential);
                onSuccess();
              } catch (err) {
                setError(err.message);
              }
            }}
            onError={() => {
              setError("Google Sign-In failed");
            }}
            theme="filled_black"
          />
        </div>
      </form>

      <div className="mt-8 text-center pt-2">
        <span className="text-[13px] text-[#8A8A9D]">
          Already have an account?{" "}
          <button type="button" onClick={onSwitch} className="text-[#8468F5] underline hover:text-[#9B84F8] transition-colors font-medium">
            Log in
          </button>
        </span>
      </div>
    </>
  );
}

/* ── Shared inputs and buttons ── */
function AuthField({ type, value, placeholder, onChange }) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl px-4 py-3.5 text-[14px] bg-[#2A2A36] text-white placeholder-[#6C6C7D] border border-transparent focus:outline-none focus:border-[#8468F5] focus:ring-1 focus:ring-[#8468F5] transition-all duration-200"
    />
  );
}

function SubmitButton({ loading, label }) {
  return (
    <button 
      type="submit" 
      disabled={loading}
      className="w-full py-3.5 mt-2 rounded-xl font-medium text-[15px] bg-[#8468F5] text-white hover:bg-[#7455F4] transition-colors flex justify-center items-center gap-2 shadow-lg shadow-[#8468F5]/20 disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {loading ? (
        <>
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Please wait...
        </>
      ) : (
        label
      )}
    </button>
  );
}
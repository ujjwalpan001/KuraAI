import { useState, useEffect } from "react";
import { Megaphone, Users, MessageSquare, Send, CheckCircle2, AlertCircle, Paperclip, X, Sparkles, Copy, Check } from "lucide-react";
import { api } from "../api/client";

export default function Broadcasts({ tenantId }) {
  const [phones, setPhones] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { sent: [...], failed: [...] }
  const [totalContacts, setTotalContacts] = useState(0);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaData, setMediaData] = useState(null); // { url, type, filename }
  const [tenantObj, setTenantObj] = useState(null);
  
  const [showPromptHelper, setShowPromptHelper] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    api.getTenants().then(res => {
      const t = res.tenants.find(t => t.tenant_id === tenantId);
      if (t) setTenantObj(t);
    }).catch(e => console.error("Failed to load tenant", e));
  }, [tenantId]);

  const handleMediaUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!tenantId) {
      alert("Please select a tenant first.");
      return;
    }
    
    setMediaUploading(true);
    try {
      const keyword = `broadcast_${Date.now()}`;
      const res = await api.addMedia(tenantId, keyword, file);
      let mType = "IMAGE";
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        mType = "DOCUMENT";
      }
      setMediaData({ url: res.url, type: mType, filename: file.name });
    } catch (err) {
      alert("Media upload failed: " + err.message);
    } finally {
      setMediaUploading(false);
    }
  };

  const handleBroadcast = async () => {
    if (!tenantId) {
      alert("Please select a tenant first.");
      return;
    }
    const contactList = phones
      .split("\n")
      .map(p => p.trim())
      .filter(p => p.length > 5)
      .map(p => {
        const parts = p.split(",");
        if (parts.length >= 2) {
          return { phone: parts[0].trim(), name: parts.slice(1).join(",").trim() };
        }
        return { phone: p.trim(), name: "" };
      });

    if (contactList.length === 0) {
      alert("Please enter at least one valid phone number.");
      return;
    }
    if (!message.trim() && !mediaData) {
      alert("Please enter a message or attach media to broadcast.");
      return;
    }

    setSending(true);
    setResult({ sent: [], failed: [] });
    setTotalContacts(contactList.length);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < contactList.length; i++) {
      const contact = contactList[i];
      try {
        const res = await api.broadcast({
          tenant_id: tenantId,
          contacts: [contact],
          message: message.trim(),
          media_url: mediaData?.url,
          media_type: mediaData?.type,
          media_filename: mediaData?.filename
        });
        
        if (res.sent && res.sent.length > 0) {
           setResult(prev => ({ ...prev, sent: [...prev.sent, contact.phone] }));
           successCount++;
        }
        if (res.failed && res.failed.length > 0) {
           setResult(prev => ({ ...prev, failed: [...prev.failed, res.failed[0]] }));
           failCount++;
        }
      } catch (e) {
        setResult(prev => ({ ...prev, failed: [...prev.failed, { phone: contact.phone, error: e.message }] }));
        failCount++;
      }

      // Add a random delay between 3-8 seconds if it's not the last contact
      if (i < contactList.length - 1) {
        const delayMs = Math.floor(Math.random() * (8000 - 3000 + 1) + 3000);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    if (failCount === 0) {
      setPhones("");
      setMessage("");
      setMediaData(null);
      setMediaFile(null);
    }
    setSending(false);
  };

  const aiPrompt = `I have a list of customer contacts. Please format them exactly as a simple text list with each line in the format: "Phone, Name". 
Rules:
1. Remove any spaces, dashes, or special characters from the phone number.
2. Ensure the country code is included.
3. Do not output any markdown, explanations, or other text—ONLY the formatted list.
4. If a name is missing, just use "Customer".

Here is the raw data:
[PASTE YOUR RAW DATA HERE]`;

  const copyPrompt = () => {
    navigator.clipboard.writeText(aiPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <div className="p-8 max-w-[1000px] mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold text-ink">Broadcast Campaigns</h1>
          <p className="text-[14px] text-muted mt-1">Send mass messages directly to customer WhatsApp numbers.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Composer */}
        <div className="bg-surface border border-hair rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
              <Megaphone size={20} className="text-brand" />
            </div>
            <div>
              <h2 className="text-[15px] font-display font-semibold text-ink">Campaign Builder</h2>
              <p className="text-[12px] text-muted">Create your outbound message</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-[12px] font-semibold text-muted uppercase tracking-wider">
                  <Users size={14} /> Audience (Phone Numbers)
                </label>
                <button 
                  onClick={() => setShowPromptHelper(!showPromptHelper)}
                  className="text-[11px] text-brand font-medium hover:underline flex items-center gap-1"
                >
                  <Sparkles size={12} /> Format with AI
                </button>
              </div>

              {showPromptHelper && (
                <div className="mb-4 p-4 bg-brand/5 border border-brand/20 rounded-xl animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[12px] text-brand/80 font-semibold">Copy this prompt into ChatGPT or Gemini:</p>
                    <button 
                      onClick={copyPrompt}
                      className="text-[11px] px-3 py-1.5 bg-brand/10 border border-brand/20 rounded-lg text-brand hover:bg-brand/20 transition flex items-center gap-1.5 font-bold shadow-sm"
                    >
                      {copiedPrompt ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      {copiedPrompt ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <pre className="text-[11px] text-white/60 whitespace-pre-wrap font-mono p-4 bg-black/40 border border-white/5 rounded-xl custom-scrollbar max-h-48 overflow-y-auto leading-relaxed shadow-inner">
                    {aiPrompt}
                  </pre>
                </div>
              )}

              <textarea
                value={phones}
                onChange={(e) => setPhones(e.target.value)}
                placeholder="Format: Phone, Name&#10;e.g. 15551234567, John Doe&#10;447700900000, Alice"
                className="w-full px-4 py-3 bg-canvas border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand font-mono leading-relaxed h-32 resize-none"
              />
              <p className="text-[11px] text-muted mt-1.5 flex justify-between">
                <span>Use {'{name}'} in your message to personalize it!</span>
                <span>{phones.split("\n").filter(p => p.trim().length > 5).length} valid contacts</span>
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2 text-[12px] font-semibold text-muted uppercase tracking-wider mb-2">
                <MessageSquare size={14} /> Message Content
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Hello {name}! Check out our new summer collection..."
                className="w-full px-4 py-3 bg-canvas border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand leading-relaxed h-32 resize-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-[12px] font-semibold text-muted uppercase tracking-wider mb-2">
                  <Paperclip size={14} /> Attach Media (Optional)
                </label>
              </div>
              {mediaData ? (
                <div className="flex items-center justify-between p-3 bg-brand/5 border border-brand/20 rounded-lg">
                  <span className="text-[12px] font-mono text-brand truncate pr-4">
                    {mediaData.filename}
                  </span>
                  <button 
                    onClick={() => setMediaData(null)}
                    className="p-1 hover:bg-brand/10 rounded text-brand/70 hover:text-brand transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 w-full">
                  <label className="flex items-center justify-center gap-2 w-full p-4 border border-dashed border-hair rounded-lg hover:bg-canvas cursor-pointer transition-colors text-muted hover:text-ink">
                    {mediaUploading ? (
                      <span className="text-[12px] animate-pulse">Uploading...</span>
                    ) : (
                      <>
                        <Paperclip size={16} />
                        <span className="text-[13px] font-medium">Click to upload Image or PDF from device</span>
                      </>
                    )}
                    <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleMediaUpload} disabled={mediaUploading} />
                  </label>

                  {tenantObj?.media_library && Object.keys(tenantObj.media_library).length > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3 opacity-50">
                        <div className="h-px bg-hair flex-1"></div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted">OR</span>
                        <div className="h-px bg-hair flex-1"></div>
                      </div>
                      <select 
                        className="w-full bg-canvas border border-hair rounded-lg text-[13px] px-3 py-2.5 outline-none focus:border-brand text-ink cursor-pointer"
                        onChange={(e) => {
                          const url = e.target.value;
                          if (!url) return;
                          const keyword = e.target.options[e.target.selectedIndex].text;
                          let mType = "IMAGE";
                          if (url.toLowerCase().endsWith(".pdf") || url.includes("/files/")) {
                             mType = "DOCUMENT";
                          }
                          setMediaData({ url, type: mType, filename: keyword + (mType === "DOCUMENT" ? ".pdf" : ".jpg") });
                          e.target.value = "";
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Select existing file from Media Library...</option>
                        {Object.entries(tenantObj.media_library).map(([kw, url]) => (
                          <option key={kw} value={url}>{kw.replace(/_/g, ' ').toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleBroadcast}
              disabled={sending}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-[14px] font-medium transition-all duration-200 mt-2 ${
                sending ? "bg-brand/50 text-white cursor-not-allowed" : "bg-brand text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:bg-brand-deep"
              }`}
            >
              {sending ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Sending Campaign...
                </>
              ) : (
                <>
                  <Send size={16} /> Send to Audience
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="bg-surface border border-hair rounded-xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-[15px] font-display font-semibold text-ink">Delivery Results</h2>
          </div>

          {!result && !sending && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-canvas border border-hair flex items-center justify-center mb-4">
                <Send size={24} className="text-faint" />
              </div>
              <p className="text-[14px] text-muted">Awaiting broadcast execution...</p>
            </div>
          )}

          {sending && (
            <div className="flex flex-col items-center justify-center text-center p-6 bg-brand/5 rounded-lg border border-brand/20 mb-4">
               <svg className="animate-spin w-8 h-8 text-brand mb-3" viewBox="0 0 24 24" fill="none">
                 <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                 <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
               </svg>
               <p className="text-[14px] text-brand font-medium">Broadcasting in progress...</p>
               <p className="text-[12px] text-muted mt-2 font-bold">
                 Sent: {(result?.sent?.length || 0) + (result?.failed?.length || 0)} / {totalContacts}
               </p>
               <p className="text-[11px] text-brand/60 mt-2">Please do not close this tab.</p>
            </div>
          )}

          {result && (
            <div className="flex-1 overflow-y-auto space-y-4">
              {result.sent && result.sent.length > 0 && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-emerald-500 mb-2">
                    <CheckCircle2 size={16} />
                    <span className="font-semibold text-[13px]">Successfully Delivered ({result.sent.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {result.sent.map(p => (
                      <span key={p} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-md text-[11px] font-mono">
                        +{p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.failed && result.failed.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-rose-500 mb-2">
                    <AlertCircle size={16} />
                    <span className="font-semibold text-[13px]">Failed to Deliver ({result.failed.length})</span>
                  </div>
                  <div className="space-y-2 mt-2">
                    {result.failed.map(f => (
                      <div key={f.phone} className="text-[11px] flex items-start gap-2 bg-rose-500/10 p-2 rounded text-rose-400 font-mono">
                        <span className="font-bold shrink-0">+{f.phone}:</span>
                        <span>{f.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { Folder, FileText, Image, Search, Upload, Trash2, BookOpen, Plus, Tag, Brain, X, ChevronDown } from "lucide-react";
import { api, displayUrl } from "../api/client";

// ---------------------------------------------------------------------------
// Zero-LLM keyword extraction — pure frequency / TF approach
// ---------------------------------------------------------------------------
const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","and","but","or",
  "nor","so","yet","both","either","neither","not","only","very","just","to","in",
  "on","at","by","for","with","about","as","until","while","of","if","no","you",
  "we","i","they","it","he","she","our","your","their","this","that","these","those",
  "what","which","who","how","all","any","each","every","some","such","from","up",
  "out","then","than","too","its","my","me","him","her","us","them","can","also",
  "into","over","after","before","when","where","why","more","most","other",
]);

function extractKeywords(title, content, topN = 6) {
  const text = `${title} ${title} ${content}`.toLowerCase(); // title weighted 2x
  const words = text.match(/\b[a-z]{3,}\b/g) || [];
  const freq = {};
  for (const w of words) {
    if (!STOPWORDS.has(w)) freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([w]) => w);
}

// ---------------------------------------------------------------------------
// DocType config
// ---------------------------------------------------------------------------
const DOC_TYPES = [
  { value: "faq",      label: "FAQ",              color: "bg-sky-500/10 text-sky-400" },
  { value: "product",  label: "Product",          color: "bg-emerald-500/10 text-emerald-400" },
  { value: "pricing",  label: "Pricing",          color: "bg-amber-500/10 text-amber-400" },
  { value: "policy",   label: "Policy",           color: "bg-rose-500/10 text-rose-400" },
  { value: "service",  label: "Service",          color: "bg-violet-500/10 text-violet-400" },
];

function typeColor(t) {
  return DOC_TYPES.find(d => d.value === t)?.color || "bg-canvas text-muted";
}

// ---------------------------------------------------------------------------
// KnowledgeCard — inline editable entry
// ---------------------------------------------------------------------------
function KnowledgeCard({ doc, onDelete }) {
  const kws = doc.keywords || extractKeywords(doc.title, doc.content);
  return (
    <div className="bg-surface border border-hair rounded-xl p-5 group hover:border-brand/30 transition-all">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${typeColor(doc.doc_type)}`}>
              {DOC_TYPES.find(d => d.value === doc.doc_type)?.label || doc.doc_type}
            </span>
            <span className="text-[11px] text-muted flex items-center gap-1">
              <Brain size={10} /> Indexed in Vector DB
            </span>
          </div>
          <h3 className="text-[14px] font-semibold text-ink truncate">{doc.title}</h3>
        </div>
        <button
          onClick={() => onDelete(doc.doc_id)}
          className="p-1.5 text-muted hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <p className="text-[12.5px] text-muted leading-relaxed line-clamp-3 mb-3">{doc.content}</p>
      <div className="flex flex-wrap gap-1.5">
        {kws.map(k => (
          <span key={k} className="flex items-center gap-1 px-2 py-0.5 bg-brand/5 border border-brand/10 text-brand rounded-full text-[11px] font-mono">
            <Tag size={9} /> {k}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewEntryForm — blank card for composing a new knowledge entry
// ---------------------------------------------------------------------------
function NewEntryForm({ tenantId, onSaved, onCancel }) {
  const [title, setTitle]     = useState("");
  const [content, setContent] = useState("");
  const [docType, setDocType] = useState("faq");
  const [saving, setSaving]   = useState(false);
  const [previewKws, setPreviewKws] = useState([]);

  useEffect(() => {
    setPreviewKws(extractKeywords(title, content));
  }, [title, content]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      alert("Please enter both a title and content.");
      return;
    }
    setSaving(true);
    try {
      await api.addKnowledge({
        tenant_id: tenantId,
        doc_type: docType,
        title: title.trim(),
        content: content.trim(),
      });
      onSaved();
    } catch (e) {
      alert("Failed to save: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-canvas border border-brand/30 rounded-xl p-5 shadow-[0_0_20px_rgba(99,102,241,0.08)]">
      <div className="flex items-center gap-3 mb-4">
        {/* Doc type selector */}
        <div className="relative">
          <select
            value={docType}
            onChange={e => setDocType(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 bg-surface border border-hair rounded-lg text-[12px] font-medium text-ink focus:outline-none focus:border-brand cursor-pointer"
          >
            {DOC_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        </div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Entry title (e.g. Delivery Policy, Return Process, About Us)"
          className="flex-1 px-3 py-1.5 bg-surface border border-hair rounded-lg text-[13px] text-ink focus:outline-none focus:border-brand"
        />
      </div>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Write the full knowledge content here. The more detail, the better the AI will answer. You can write FAQs, policies, service descriptions, pricing details, team info, etc."
        rows={6}
        className="w-full px-3 py-2.5 bg-surface border border-hair rounded-lg text-[13px] text-ink leading-relaxed focus:outline-none focus:border-brand resize-y mb-3"
      />
      {/* Live keyword preview */}
      {previewKws.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-[11px] text-muted font-medium">Auto-keywords:</span>
          {previewKws.map(k => (
            <span key={k} className="flex items-center gap-1 px-2 py-0.5 bg-brand/5 border border-brand/10 text-brand rounded-full text-[11px] font-mono">
              <Tag size={9} /> {k}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-muted hover:text-ink text-[13px] transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim() || !content.trim()}
          className="px-4 py-1.5 bg-brand text-white rounded-lg text-[13px] font-medium shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:bg-brand-deep transition-colors disabled:opacity-50"
        >
          {saving ? "Saving & Indexing..." : "Save to Vector DB"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main MediaLibrary component
// ---------------------------------------------------------------------------
export default function MediaLibrary({ tenantId }) {
  const [activeTab, setActiveTab] = useState("media");
  const [media, setMedia] = useState({});
  const [knowledgeDocs, setKnowledgeDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [mediaSearch, setMediaSearch] = useState("");
  const [kbSearch, setKbSearch] = useState("");
  const [kbTypeFilter, setKbTypeFilter] = useState("all");
  const fileInputRef = useRef(null);

  const loadMedia = () => {
    if (!tenantId) return;
    setLoading(true);
    api.adminTenants().then(d => {
      const active = d.tenants.find(t => t.tenant_id === tenantId);
      setMedia(active?.media_library || {});
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  const loadKnowledge = () => {
    if (!tenantId) return;
    api.knowledge(tenantId).then(d => {
      setKnowledgeDocs(d.docs || []);
    }).catch(console.error);
  };

  useEffect(() => {
    loadMedia();
    loadKnowledge();
  }, [tenantId]);

  const handleUploadClick = () => {
    if (!tenantId) { alert("Please select a tenant first."); return; }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";
    setUploading(true);
    let successCount = 0;
    for (const file of files) {
      const ext = file.name.split(".").pop().toLowerCase();
      if (!["jpg","jpeg","png","pdf"].includes(ext)) {
        alert(`Unsupported format: ${file.name}`); continue;
      }
      const keyword = window.prompt(`Enter a keyword trigger for '${file.name}':\n(e.g. 'menu', 'catalog')`);
      if (!keyword) continue;
      if (!keyword.trim().match(/^[a-zA-Z0-9_-]+$/)) {
        alert(`Keyword should only contain letters, numbers, hyphens or underscores.`); continue;
      }
      try {
        await api.addMedia(tenantId, keyword.trim().toLowerCase(), file);
        successCount++;
      } catch (err) { alert(`Upload failed: ${err.message}`); }
    }
    if (successCount > 0) { alert(`${successCount} file(s) uploaded!`); loadMedia(); }
    setUploading(false);
  };

  const handleDeleteMedia = async (keyword) => {
    if (!window.confirm(`Delete '${keyword}'?`)) return;
    try { await api.removeMedia(tenantId, keyword); loadMedia(); }
    catch (e) { alert("Delete failed: " + e.message); }
  };

  const handleDeleteKnowledge = async (docId) => {
    if (!window.confirm("Delete this knowledge entry? It will be removed from the Vector DB.")) return;
    try { await api.deleteKnowledge(docId); loadKnowledge(); }
    catch (e) { alert("Delete failed: " + e.message); }
  };

  const mediaList = Object.entries(media)
    .map(([keyword, url]) => ({
      keyword, url,
      isPdf: url.toLowerCase().includes(".pdf"),
      filename: url.split("/").pop().split("?")[0],
    }))
    .filter(m => !mediaSearch || m.keyword.toLowerCase().includes(mediaSearch.toLowerCase()));

  const filteredDocs = knowledgeDocs.filter(d => {
    const matchSearch = !kbSearch || d.title.toLowerCase().includes(kbSearch.toLowerCase()) || d.content.toLowerCase().includes(kbSearch.toLowerCase());
    const matchType = kbTypeFilter === "all" || d.doc_type === kbTypeFilter;
    return matchSearch && matchType;
  });

  return (
    <div className="p-8 max-w-[1400px] mx-auto h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold text-ink">Media & Knowledge</h1>
          <p className="text-[14px] text-muted mt-1">Manage files, images, and text knowledge for your AI agent.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple />
          {activeTab === "media" && (
            <button onClick={handleUploadClick} disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-[13px] font-medium shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:bg-brand-deep transition-colors disabled:opacity-50">
              <Upload size={15} /> {uploading ? "Uploading..." : "Upload Asset"}
            </button>
          )}
          {activeTab === "knowledge" && !showNewForm && (
            <button onClick={() => setShowNewForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-[13px] font-medium shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:bg-brand-deep transition-colors">
              <Plus size={15} /> Add Knowledge Entry
            </button>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 shrink-0 bg-surface border border-hair rounded-xl p-1 self-start">
        <button onClick={() => setActiveTab("media")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${activeTab === "media" ? "bg-brand text-white shadow-sm" : "text-muted hover:text-ink"}`}>
          <Folder size={14} /> Media Files
        </button>
        <button onClick={() => setActiveTab("knowledge")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${activeTab === "knowledge" ? "bg-brand text-white shadow-sm" : "text-muted hover:text-ink"}`}>
          <BookOpen size={14} /> Knowledge Base
          {knowledgeDocs.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-brand/20 text-brand rounded-full text-[10px] font-semibold">{knowledgeDocs.length}</span>
          )}
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* MEDIA TAB                                                           */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === "media" && (
        <div className="flex-1 flex flex-col bg-surface border border-hair rounded-xl overflow-hidden min-h-0">
          <div className="p-4 border-b border-hair flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={mediaSearch} onChange={e => setMediaSearch(e.target.value)}
                placeholder="Search keywords..." className="w-full pl-9 pr-4 py-2 bg-canvas border border-hair rounded-lg text-[13px] focus:outline-none focus:border-brand" />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-surface z-10 shadow-[0_1px_0_var(--hair)]">
                <tr>
                  <th className="px-5 py-3 text-[11px] font-medium text-muted uppercase tracking-wider w-1/2">Asset File</th>
                  <th className="px-5 py-3 text-[11px] font-medium text-muted uppercase tracking-wider">Keyword Trigger</th>
                  <th className="px-5 py-3 text-[11px] font-medium text-muted uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-[11px] font-medium text-muted uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {loading && <tr><td colSpan="4" className="text-center py-8 text-muted text-[13px]">Loading...</td></tr>}
                {!loading && mediaList.length === 0 && <tr><td colSpan="4" className="text-center py-8 text-muted text-[13px]">No media files uploaded yet.</td></tr>}
                {!loading && mediaList.map(file => (
                  <tr key={file.keyword} className="hover:bg-canvas/50 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${file.isPdf ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                          {file.isPdf ? <FileText size={20} /> : <Image size={20} />}
                        </div>
                        <div className="min-w-0">
                          <a href={displayUrl(file.url)} target="_blank" rel="noreferrer" className="text-[13.5px] font-medium text-ink truncate hover:text-brand transition-colors">{file.filename}</a>
                          <div className="text-[12px] text-muted uppercase mt-0.5">{file.isPdf ? "PDF Document" : "Image"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-block px-2.5 py-1 bg-canvas border border-hair rounded-md font-mono text-[11px] text-ink">{file.keyword}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[11px] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {file.isPdf ? "Indexed in Vector DB" : "Active"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => handleDeleteMedia(file.keyword)}
                        className="p-1.5 text-muted hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* KNOWLEDGE BASE TAB                                                  */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === "knowledge" && (
        <div className="flex-1 flex flex-col min-h-0 gap-4 overflow-auto">
          {/* New entry form */}
          {showNewForm && (
            <NewEntryForm
              tenantId={tenantId}
              onSaved={() => { setShowNewForm(false); loadKnowledge(); }}
              onCancel={() => setShowNewForm(false)}
            />
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={kbSearch} onChange={e => setKbSearch(e.target.value)}
                placeholder="Search knowledge entries..." className="w-full pl-9 pr-4 py-2 bg-surface border border-hair rounded-lg text-[13px] focus:outline-none focus:border-brand" />
            </div>
            <div className="flex gap-1 bg-surface border border-hair rounded-lg p-1">
              <button onClick={() => setKbTypeFilter("all")}
                className={`px-3 py-1 rounded-md text-[12px] font-medium transition-all ${kbTypeFilter === "all" ? "bg-brand/10 text-brand" : "text-muted hover:text-ink"}`}>All</button>
              {DOC_TYPES.map(t => (
                <button key={t.value} onClick={() => setKbTypeFilter(t.value)}
                  className={`px-3 py-1 rounded-md text-[12px] font-medium transition-all ${kbTypeFilter === t.value ? "bg-brand/10 text-brand" : "text-muted hover:text-ink"}`}>{t.label}</button>
              ))}
            </div>
          </div>

          {/* Empty state */}
          {filteredDocs.length === 0 && !showNewForm && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center">
                <Brain size={28} className="text-brand" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-ink mb-1">No knowledge entries yet</p>
                <p className="text-[13px] text-muted max-w-sm">Add text entries about your business — FAQs, policies, pricing, services — and the AI will use them to answer customer questions.</p>
              </div>
              <button onClick={() => setShowNewForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-[13px] font-medium shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:bg-brand-deep transition-colors">
                <Plus size={15} /> Add Your First Entry
              </button>
            </div>
          )}

          {/* Cards grid */}
          {filteredDocs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredDocs.map(doc => (
                <KnowledgeCard key={doc.doc_id} doc={doc} onDelete={handleDeleteKnowledge} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

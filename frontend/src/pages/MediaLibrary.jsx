import { useState, useEffect, useRef } from "react";
import { Folder, FileText, Image, Search, Upload, Trash2 } from "lucide-react";
import { api, displayUrl } from "../api/client";

export default function MediaLibrary({ tenantId }) {
  const [activeTab, setActiveTab] = useState("all");
  const [media, setMedia] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const loadMedia = () => {
    if (!tenantId) return;
    setLoading(true);
    api.adminTenants().then(d => {
      const active = d.tenants.find(t => t.tenant_id === tenantId);
      if (active && active.media_library) {
        setMedia(active.media_library);
      } else {
        setMedia({});
      }
      setLoading(false);
    }).catch(e => {
      console.error(e);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadMedia();
  }, [tenantId]);

  const handleUploadClick = () => {
    if (!tenantId) {
      alert("Please select a tenant first.");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    
    // Clear the input so the same file can be selected again if needed
    e.target.value = "";

    setUploading(true);
    let successCount = 0;
    let anyIndexed = false;

    for (const file of files) {
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'pdf'];
      const fileExt = file.name.split('.').pop().toLowerCase();
      if (!allowedExtensions.includes(fileExt)) {
        alert(`Unsupported format: ${file.name}. Only .jpg, .png, and .pdf are supported by Meta WhatsApp API.`);
        continue;
      }

      const keyword = window.prompt(`Enter a keyword trigger for '${file.name}':\n(e.g. 'sofa', 'catalog')`);
      if (!keyword) continue; // Skip if cancelled
      if (!keyword.trim().match(/^[a-zA-Z0-9_-]+$/)) {
        alert(`Keyword should only contain letters, numbers, hyphens or underscores. Skipping ${file.name}.`);
        continue;
      }

      try {
        const res = await api.addMedia(tenantId, keyword.trim().toLowerCase(), file);
        successCount++;
        if (res.indexing) anyIndexed = true;
      } catch (err) {
        alert(`Upload failed for ${file.name}: ` + err.message);
      }
    }

    if (successCount > 0) {
      if (anyIndexed) {
        alert(`${successCount} file(s) uploaded successfully! Background AI indexing has started for your documents.`);
      } else {
        alert(`${successCount} image(s) uploaded successfully to your media library!`);
      }
      loadMedia(); // Refresh list
    }
    setUploading(false);
  };

  const handleDelete = async (keyword) => {
    if (!window.confirm(`Are you sure you want to delete '${keyword}'?`)) return;
    try {
      await api.removeMedia(tenantId, keyword);
      loadMedia();
    } catch (e) {
      alert("Delete failed: " + e.message);
    }
  };

  // Convert the object { keyword: url } into an array for rendering
  const mediaList = Object.entries(media).map(([keyword, url]) => {
    const isPdf = url.toLowerCase().includes('.pdf');
    const filename = url.split('/').pop().split('?')[0];
    return { keyword, url, isPdf, filename };
  });

  const filteredMedia = mediaList.filter(m => {
    if (activeTab === "pdf") return m.isPdf;
    if (activeTab === "image") return !m.isPdf;
    return true;
  });

  return (
    <div className="p-8 max-w-[1400px] mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold text-ink">Media Library</h1>
          <p className="text-[14px] text-muted mt-1">Manage documents, PDFs, and images for RAG Vector Indexing.</p>
        </div>
        <div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
          />
          <button 
            onClick={handleUploadClick}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-[13px] font-medium shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:bg-brand-deep transition-colors disabled:opacity-50"
          >
            <Upload size={16} />
            {uploading ? "Uploading & Indexing..." : "Upload Asset"}
          </button>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Categories Sidebar */}
        <div className="w-[240px] shrink-0">
          <div className="bg-surface border border-hair rounded-xl overflow-hidden">
            <div className="p-3 border-b border-hair font-medium text-[13px] text-muted uppercase tracking-wider">
              Categories
            </div>
            <div className="p-2 space-y-1">
              <button onClick={() => setActiveTab("all")} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors ${activeTab === 'all' ? 'bg-brand/10 text-brand font-medium' : 'text-ink hover:bg-canvas'}`}>
                <Folder size={16} className={activeTab === 'all' ? 'text-brand' : 'text-muted'} /> All Files
              </button>
              <button onClick={() => setActiveTab("pdf")} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors ${activeTab === 'pdf' ? 'bg-brand/10 text-brand font-medium' : 'text-ink hover:bg-canvas'}`}>
                <FileText size={16} className={activeTab === 'pdf' ? 'text-brand' : 'text-muted'} /> PDFs & Documents
              </button>
              <button onClick={() => setActiveTab("image")} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors ${activeTab === 'image' ? 'bg-brand/10 text-brand font-medium' : 'text-ink hover:bg-canvas'}`}>
                <Image size={16} className={activeTab === 'image' ? 'text-brand' : 'text-muted'} /> Images & Visuals
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col bg-surface border border-hair rounded-xl overflow-hidden">
          <div className="p-4 border-b border-hair flex items-center justify-between bg-surface z-10">
            <div className="relative w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input type="text" placeholder="Search keywords..." className="w-full pl-9 pr-4 py-2 bg-canvas border border-hair rounded-lg text-[13px] focus:outline-none focus:border-brand" />
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
                {loading && (
                  <tr><td colSpan="4" className="text-center py-8 text-muted text-[13px]">Loading media library...</td></tr>
                )}
                {!loading && filteredMedia.length === 0 && (
                  <tr><td colSpan="4" className="text-center py-8 text-muted text-[13px]">No media files uploaded yet.</td></tr>
                )}
                {!loading && filteredMedia.map(file => (
                  <tr key={file.keyword} className="hover:bg-canvas/50 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${file.isPdf ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                          {file.isPdf ? <FileText size={20} /> : <Image size={20} />}
                        </div>
                        <div className="min-w-0">
                          <a href={displayUrl(file.url)} target="_blank" rel="noreferrer" className="text-[13.5px] font-medium text-ink truncate hover:text-brand transition-colors">
                            {file.filename}
                          </a>
                          <div className="text-[12px] text-muted uppercase mt-0.5">{file.isPdf ? 'PDF Document' : 'Image'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-block px-2.5 py-1 bg-canvas border border-hair rounded-md font-mono text-[11px] text-ink">
                        {file.keyword}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[11px] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        {file.isPdf ? "Indexed in Vector DB" : "Active"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button 
                        onClick={() => handleDelete(file.keyword)}
                        className="p-1.5 text-muted hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete Asset"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

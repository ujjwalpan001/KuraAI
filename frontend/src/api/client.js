const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// Stored media URLs use the public (ngrok) host so WhatsApp can fetch them.
// But <img> tags can't send the ngrok-skip header, so for in-dashboard display
// we rewrite the origin to our API base (localhost), which serves the same file.
export function displayUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    return BASE.replace(/\/$/, "") + u.pathname + u.search;
  } catch {
    return url;
  }
}

function headers(extra = {}) {
  const h = { "ngrok-skip-browser-warning": "true", ...extra };
  const token = localStorage.getItem("admin_token");
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function send(path, method, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || `${method} ${path} failed`);
  return res.json();
}

async function upload(path, formData) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: headers(), body: formData });
  if (!res.ok) throw new Error((await res.text()) || `Upload failed`);
  return res.json();
}

export async function signup(name, email, password) {
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Signup failed");
  localStorage.setItem("admin_token", data.token);
  localStorage.setItem("user_name", data.name);
  localStorage.setItem("user_email", data.email);
  return data;
}

export async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Invalid email or password");
  localStorage.setItem("admin_token", data.token);
  localStorage.setItem("user_name", data.name);
  localStorage.setItem("user_email", data.email);
  return data;
}

export function logout() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("user_name");
  localStorage.removeItem("user_email");
}

export function isLoggedIn() {
  return !!localStorage.getItem("admin_token");
}

export function getUser() {
  return {
    name: localStorage.getItem("user_name") || "Admin",
    email: localStorage.getItem("user_email") || "",
  };
}

export const api = {
  // monitoring
  getTenants: () => get(`/api/tenants?_t=${Date.now()}`),
  getSessions: (id) => get(`/api/tenants/${id}/sessions`),
  getMessages: (sid) => get(`/api/sessions/${sid}/messages`),
  getStats: (id) => get(`/api/tenants/${id}/stats`),
  setSessionStatus: (sid, status) => send(`/api/sessions/${sid}/status`, "POST", { status }),
  replySession: (sid, text) => send(`/api/sessions/${sid}/reply`, "POST", { text }),
  deleteSession: (sid) => send(`/api/sessions/${sid}`, "DELETE"),
  broadcast: (p) => send("/api/broadcast", "POST", p),

  // admin — customer routing (phone -> tenant)
  routing: () => get("/api/admin/routing"),
  setRoute: (customer_phone, tenant_id) => send("/api/admin/routing", "POST", { customer_phone, tenant_id }),
  deleteRoute: (phone) => send(`/api/admin/routing/${encodeURIComponent(phone)}`, "DELETE"),

  // admin — tenants
  adminTenants: () => get("/api/admin/tenants"),
  createTenant: (p) => send("/api/admin/tenants", "POST", p),
  updateTenant: (id, p) => send(`/api/admin/tenants/${id}`, "PUT", p),
  deleteTenant: (id) => send(`/api/admin/tenants/${id}`, "DELETE"),

  // admin — media library
  addMedia: (id, keyword, file) => {
    const fd = new FormData();
    fd.append("keyword", keyword);
    fd.append("file", file);
    return upload(`/api/admin/tenants/${id}/media`, fd);
  },
  removeMedia: (id, keyword) => send(`/api/admin/tenants/${id}/media/${encodeURIComponent(keyword)}`, "DELETE"),

  // admin — catalog
  catalog: (id) => get(`/api/admin/tenants/${id}/catalog`),
  addCatalog: (id, { name, price, description, attributes, file }) => {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("price", price || "");
    fd.append("description", description || "");
    fd.append("attributes", attributes || "{}");
    fd.append("auto_describe", !description);
    fd.append("file", file);
    return upload(`/api/admin/tenants/${id}/catalog`, fd);
  },
  deleteCatalog: (itemId) => send(`/api/admin/catalog/${itemId}`, "DELETE"),
  ingestPdf: (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return upload(`/api/admin/tenants/${id}/catalog/from-pdf`, fd);
  },
  ingestStatus: (id) => get(`/api/admin/tenants/${id}/ingest-status`),

  // admin — knowledge
  knowledge: (id) => get(`/api/admin/tenants/${id}/knowledge`),
  addKnowledge: (p) => send("/api/admin/knowledge", "POST", p),
  deleteKnowledge: (docId) => send(`/api/admin/knowledge/${docId}`, "DELETE"),
  ingestKnowledgePdf: (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return upload(`/api/admin/tenants/${id}/knowledge/from-pdf`, fd);
  },
  deleteKnowledgeBySource: (id, sourcePdf) =>
    send(`/api/admin/tenants/${id}/knowledge/by-source?source_pdf=${encodeURIComponent(sourcePdf)}`, "DELETE"),

  // Evolution API — instance management
  evoInstances: () => get("/api/admin/evolution/instances"),
  evoCreateInstance: (instanceName, tenantId) =>
    send("/api/admin/evolution/instances", "POST", { instance_name: instanceName, tenant_id: tenantId }),
  evoGetQR: (instanceName) => get(`/api/admin/evolution/instances/${encodeURIComponent(instanceName)}/qr`),
  evoGetState: (instanceName) => get(`/api/admin/evolution/instances/${encodeURIComponent(instanceName)}/state`),
  evoRestartInstance: (instanceName) =>
    send(`/api/admin/evolution/instances/${encodeURIComponent(instanceName)}/restart`, "POST", {}),
  evoLogoutInstance: (instanceName) =>
    send(`/api/admin/evolution/instances/${encodeURIComponent(instanceName)}/logout`, "POST", {}),
  evoDeleteInstance: (instanceName, tenantId) =>
    send(`/api/admin/evolution/instances/${encodeURIComponent(instanceName)}?tenant_id=${encodeURIComponent(tenantId || "")}`, "DELETE"),
};

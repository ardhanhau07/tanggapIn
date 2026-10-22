// Klien backend TanggapIn v1.0 (FE publik): POST /api/v1/chat, GET /api/v1/chat/{session_id},
// dan unggah foto langsung ke Cloudinary.
window.API = (() => {
  "use strict";
  const C = window.APP_CONFIG || {};
  const BASE = String(C.API_BASE_URL || "").replace(/\/+$/, "");
  const SKEY = "aduan_session";
  const DAY = 24 * 3600 * 1000;
  let memSession = null; // cadangan bila localStorage tidak tersedia

  /* ---------- session_id: UUID v4, berlaku 24 jam ---------- */
  function readSession() {
    try {
      const raw = JSON.parse(localStorage.getItem(SKEY) || "null");
      if (raw && Date.now() - raw.createdAt < DAY) return raw;
    } catch (e) { /* abaikan */ }
    return memSession && Date.now() - memSession.createdAt < DAY ? memSession : null;
  }
  const hasSession = () => !!readSession();
  function getSessionId() {
    const cur = readSession();
    if (cur) return cur.id;
    memSession = { id: crypto.randomUUID(), createdAt: Date.now() };
    try { localStorage.setItem(SKEY, JSON.stringify(memSession)); } catch (e) { /* abaikan */ }
    return memSession.id;
  }

  /* ---------- Foto: unggah langsung ke Cloudinary, ambil secure_url ---------- */
  async function uploadFoto(blob) {
    const fd = new FormData();
    fd.append("file", blob, "foto.jpg");
    fd.append("upload_preset", C.CLOUDINARY_UPLOAD_PRESET);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${C.CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: "POST", body: fd,
    });
    if (!r.ok) throw new Error("upload gagal");
    return (await r.json()).secure_url;
  }

  /* ---------- Chat ---------- */
  async function parse(r) {
    let body = null;
    try { body = await r.json(); } catch (e) { /* bukan JSON */ }
    if (!r.ok) {
      const err = new Error((body && body.error && body.error.message) || "Terjadi kesalahan pada server.");
      err.code = body && body.error ? body.error.code : "http_" + r.status;
      err.status = r.status;
      throw err;
    }
    return body;
  }

  // Satu pemanggilan = satu pesan warga. Mengembalikan { reply, status, is_emergency, session_id }.
  async function kirimPesan({ message = "", lat = null, lng = null, label = null, photoUrls = [] }) {
    const r = await fetch(`${BASE}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: getSessionId(),
        message,
        latitude: lat, longitude: lng, // harus berpasangan atau keduanya null
        manual_location: label,
        photo_urls: photoUrls,
        time: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(60000), // respons LLM bisa 2-10 detik
    });
    return parse(r);
  }

  // Polling: { status, last_submitted_at, notice }
  async function getStatus() {
    const r = await fetch(`${BASE}/api/v1/chat/${getSessionId()}`, { signal: AbortSignal.timeout(15000) });
    return parse(r);
  }

  return { hasSession, getSessionId, uploadFoto, kirimPesan, getStatus };
})();
window.API = (() => {
  "use strict";
  const C = window.APP_CONFIG || {};
  const BASE = String(C.API_BASE_URL || "").replace(/\/+$/, "");
  const SKEY = "aduan_session";
  const DAY = 24 * 3600 * 1000;
  let memSession = null; 

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

  async function kirimPesan({ message = "", lat = null, lng = null, label = null, photoUrls = [] }) {
    const r = await fetch(`${BASE}/api/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: getSessionId(),
        message,
        latitude: lat, longitude: lng, 
        manual_location: label,
        photo_urls: photoUrls,
        time: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(60000),
    });
    return parse(r);
  }

  async function getStatus() {
    const r = await fetch(`${BASE}/api/v1/chat/${getSessionId()}`, { signal: AbortSignal.timeout(15000) });
    return parse(r);
  }

   const PATH_LAPORAN_PUBLIK = "/api/v1/aduan/publik";

  async function getLaporan() {
    const r = await fetch(BASE + PATH_LAPORAN_PUBLIK, { signal: AbortSignal.timeout(20000) });
    const body = await parse(r);
    return Array.isArray(body) ? body : body.data || [];
  }

 function toCard(a) {
    return {
      kode: String(a.id_aduan || "").slice(0, 8),
      status: String(a.status || "").toLowerCase(),
      judul: a.isi_aduan || "",
      lokasi: a.lokasi_teks || "-",
      tanggal: new Date(a.created_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }), // YYYY-MM-DD (WIB)
      deskripsi: "", 
      catatan: a.catatan || "",
    };
  }

  return { hasSession, getSessionId, uploadFoto, kirimPesan, getStatus, getLaporan, toCard };
})();
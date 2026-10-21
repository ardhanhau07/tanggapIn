(() => {
  "use strict";

  const MAX_PHOTOS = 4;
  const MAX_SIDE = 1280; // sisi terpanjang foto setelah dikecilkan (px)
  const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4";
  const CLOUDINARY_CLOUD = "diwwapxhs";
  const CLOUDINARY_PRESET = "tanggapin"; // buat di Cloudinary: Settings > Upload > Upload presets (mode Unsigned)
  const API_URL = "";
  const DEFAULT_CENTER = [-6.2088, 106.8456]; // titik awal peta (Jakarta)

  const SESSION_KEY = "tanggapin_session";
  const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 jam

  function getSessionId() {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (saved && saved.id && Date.now() < saved.expires) return saved.id;
    } catch {}

    const id = crypto.randomUUID();
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ id, expires: Date.now() + SESSION_TTL }),
      );
    } catch {} // localStorage diblokir (mode privat): id tetap dipakai sementara
    return id;
  }

  /* ---------- Markup overlay (disuntikkan, tidak perlu di tiap HTML) ---------- */
  const TEMPLATE = `
  <div class="chat-overlay" id="chatOverlay" aria-hidden="true">
    <div class="chat-dialog" role="dialog" aria-modal="true" aria-labelledby="chatTitle">
      <div class="chat-header">
        <img src="assets/images/mascots/mascot.webp" alt="" class="chat-avatar" />
        <div class="chat-title">
          <h2 id="chatTitle">Asisten TanggapIn</h2>
          <p>Siap membantu menyusun laporanmu</p>
        </div>
        <button type="button" class="chat-close" id="chatClose" aria-label="Tutup chat">✕</button>
      </div>

      <div class="chat-messages" id="chatMessages" aria-live="polite"></div>

      <div class="chat-chips" id="chatChips">
        <button type="button">Jalan rusak</button>
        <button type="button">Sampah menumpuk</button>
        <button type="button">Lampu jalan mati</button>
      </div>

      <p class="chat-note" id="chatNote" role="status" hidden></p>
      <div class="chat-draft" id="chatDraft" hidden></div>

      <div class="loc-panel" id="locPanel" hidden>
        <div class="loc-manual">
          <input type="text" id="locText" maxlength="200" placeholder="Ketik alamat atau patokan" aria-label="Alamat atau patokan lokasi" />
          <button type="button" id="locSave">Simpan</button>
        </div>
        <button type="button" id="locGps">📍 Gunakan lokasi saya saat ini</button>
        <button type="button" id="locMap">🗺️ Pilih di peta</button>
      </div>

      <form class="chat-form" id="chatForm">
        <div class="chat-tools">
          <button type="button" id="btnCamera" aria-label="Ambil foto dengan kamera">📷 Kamera</button>
          <button type="button" id="btnGallery" aria-label="Pilih foto dari galeri">🖼️ Galeri</button>
          <button type="button" id="btnLoc" aria-expanded="false" aria-controls="locPanel">📍 Lokasi</button>
        </div>
        <textarea id="chatInput" rows="1" placeholder="Tulis laporanmu..." aria-label="Pesan"></textarea>
        <button type="submit" class="chat-send" aria-label="Kirim">➤</button>
      </form>

      <input type="file" id="fileCamera" accept="image/*" capture="environment" hidden />
      <input type="file" id="fileGallery" accept="image/*" multiple hidden />

      <div class="map-modal" id="mapModal" hidden role="dialog" aria-label="Pilih lokasi di peta">
        <div class="map-bar">
          <strong>Pilih lokasi di peta</strong>
          <button type="button" class="chat-close" id="mapClose" aria-label="Tutup peta">✕</button>
        </div>
        <div class="map-wrap">
          <div id="chatMap"></div>
          <div class="map-pin" aria-hidden="true">📍</div>
          <button type="button" class="map-locate" id="mapLocate">Lokasi saya</button>
        </div>
        <div class="map-foot">
          <p id="mapHint">Geser peta, pin di tengah menandai lokasi.</p>
          <button type="button" class="map-confirm" id="mapConfirm">Pilih lokasi ini</button>
        </div>
      </div>
    </div>
  </div>`;

  document.getElementById("chatOverlay")?.remove(); // buang markup lama jika masih ada
  document.body.insertAdjacentHTML("beforeend", TEMPLATE);

  const $ = (id) => document.getElementById(id);
  const overlay = $("chatOverlay"),
    messages = $("chatMessages"),
    form = $("chatForm");
  const input = $("chatInput"),
    chips = $("chatChips"),
    note = $("chatNote");
  const draftEl = $("chatDraft"),
    locPanel = $("locPanel"),
    btnLoc = $("btnLoc");
  const mapModal = $("mapModal"),
    mapHint = $("mapHint"),
    mapConfirm = $("mapConfirm");
  const sendBtn = form.querySelector(".chat-send");

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text; // aman dari XSS
    return n;
  }

  /* ---------- State ---------- */
  let draftPhotos = []; // {blob, url}
  let draftLoc = null; // {text, lat, lng, source: "manual" | "gps" | "map"}
  let lastFocus = null,
    started = false,
    noteTimer = null;

  /* ---------- Buka / tutup ---------- */
  function openChat() {
    lastFocus = document.activeElement;
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("chat-open");
    if (!started) {
      started = true;
      addMessage(
        "bot",
        "Halo! Saya asisten TanggapIn. Ceritakan apa yang terjadi, lalu tambahkan lokasi dan foto lewat tombol di bawah kolom pesan.",
      );
    }
    setTimeout(() => input.focus(), 150);
  }

  function closeChat() {
    closeMap();
    setPanel(false);
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("chat-open");
    if (lastFocus) lastFocus.focus();
  }

  document.querySelectorAll("[data-open-chat]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openChat();
    }),
  );
  $("chatClose").addEventListener("click", closeChat);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) closeChat();
  });

  document.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("open")) return;
    if (e.key === "Escape") {
      if (!mapModal.hidden) closeMap();
      else if (!locPanel.hidden) setPanel(false);
      else closeChat();
    }
    if (e.key === "Tab") trapFocus(e);
  });

  function trapFocus(e) {
    const scope = mapModal.hidden ? overlay : mapModal;
    const f = [
      ...scope.querySelectorAll("button, textarea, input, [href]"),
    ].filter((n) => !n.disabled && n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0],
      last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---------- Pesan ---------- */
  function addMessage(who, text) {
    const d = el("div", "chat-msg " + who, text);
    messages.appendChild(d);
    messages.scrollTop = messages.scrollHeight;
  }

  function addUserMessage(text, photoUrls, loc) {
    const d = el("div", "chat-msg user");
    if (photoUrls.length) {
      const wrap = el("div", "msg-photos");
      photoUrls.forEach((u, i) => {
        const im = document.createElement("img");
        im.src = u;
        im.alt = "Foto lampiran " + (i + 1);
        wrap.appendChild(im);
      });
      d.appendChild(wrap);
    }
    if (text) d.appendChild(el("span", "", text));
    if (loc) d.appendChild(el("div", "msg-loc", "📍 " + loc.text));
    messages.appendChild(d);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping() {
    const d = el("div", "chat-msg bot chat-typing");
    d.innerHTML = "<span></span><span></span><span></span>";
    messages.appendChild(d);
    messages.scrollTop = messages.scrollHeight;
    return d;
  }

  function showNote(text, ms = 5000) {
    clearTimeout(noteTimer);
    note.textContent = text;
    note.hidden = !text;
    if (text && ms) noteTimer = setTimeout(() => (note.hidden = true), ms);
  }

  /* ---------- Foto: kamera & galeri ---------- */
  $("btnCamera").addEventListener("click", () => $("fileCamera").click());
  $("btnGallery").addEventListener("click", () => $("fileGallery").click());
  ["fileCamera", "fileGallery"].forEach((id) =>
    $(id).addEventListener("change", async (e) => {
      await addPhotos([...e.target.files]);
      e.target.value = ""; // agar foto yang sama bisa dipilih lagi
    }),
  );

  async function uploadToCloudinary(blob) {
    const fd = new FormData();
    fd.append("file", blob);
    fd.append("upload_preset", CLOUDINARY_PRESET);
    fd.append("folder", "tanggapin");
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
      { method: "POST", body: fd },
    );
    if (!res.ok) throw new Error("Upload gagal: " + res.status);
    return (await res.json()).secure_url;
  }

  async function addPhotos(files) {
    for (const f of files) {
      if (draftPhotos.length >= MAX_PHOTOS) {
        showNote(`Maksimal ${MAX_PHOTOS} foto per pesan.`);
        break;
      }
      if (!f.type.startsWith("image/")) {
        showNote("Hanya file gambar yang bisa dilampirkan.");
        continue;
      }
      try {
        const blob = await shrink(f);
        draftPhotos.push({ blob, url: URL.createObjectURL(blob) });
      } catch {
        showNote("Foto tidak bisa dibaca. Coba foto lain (JPG atau PNG).");
      }
    }
    renderDraft();
  }

  // Perkecil dan kompres di perangkat. Re-encode lewat canvas juga membuang
  // metadata EXIF (termasuk koordinat GPS tersembunyi di foto).
  async function shrink(file) {
    const bmp = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return new Promise((res, rej) =>
      c.toBlob(
        (b) => (b ? res(b) : rej(new Error("encode"))),
        "image/jpeg",
        0.8,
      ),
    );
  }

  /* ---------- Pratinjau lampiran ---------- */
  function renderDraft() {
    draftEl.replaceChildren();
    draftPhotos.forEach((p, i) => {
      const w = el("div", "thumb");
      const im = document.createElement("img");
      im.src = p.url;
      im.alt = "Foto " + (i + 1);
      const b = el("button", "", "✕");
      b.type = "button";
      b.setAttribute("aria-label", "Hapus foto " + (i + 1));
      b.addEventListener("click", () => {
        URL.revokeObjectURL(p.url);
        draftPhotos = draftPhotos.filter((x) => x !== p);
        renderDraft();
      });
      w.append(im, b);
      draftEl.appendChild(w);
    });
    if (draftLoc) {
      const c = el("div", "loc-chip");
      const b = el("button", "", "✕");
      b.type = "button";
      b.setAttribute("aria-label", "Hapus lokasi");
      b.addEventListener("click", () => {
        draftLoc = null;
        renderDraft();
      });
      c.append(el("span", "", "📍 " + draftLoc.text), b);
      draftEl.appendChild(c);
    }
    draftEl.hidden = !draftEl.children.length;
  }

  /* ---------- Lokasi ---------- */
  function setPanel(open) {
    locPanel.hidden = !open;
    btnLoc.setAttribute("aria-expanded", String(open));
    if (open) $("locText").focus();
  }
  btnLoc.addEventListener("click", () => setPanel(locPanel.hidden));

  function setLocation(loc) {
    draftLoc = loc;
    renderDraft();
    setPanel(false);
    closeMap();
    showNote("");
  }

  // 1) ketik manual
  $("locSave").addEventListener("click", () => {
    const t = $("locText").value.trim();
    if (!t) {
      showNote("Ketik alamat atau patokan lokasi dulu.");
      return;
    }
    setLocation({ text: t, lat: null, lng: null, source: "manual" });
    $("locText").value = "";
  });
  $("locText").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("locSave").click();
    }
  });

  // 2) lokasi pengguna saat ini
  function getPosition() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej({ code: 0 });
      navigator.geolocation.getCurrentPosition(res, rej, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      });
    });
  }

  function geoMessage(e) {
    if (e.code === 1)
      return "Izin lokasi ditolak. Aktifkan izin lokasi di browser, atau pilih lewat peta atau ketik manual.";
    if (e.code === 3)
      return "Pencarian lokasi terlalu lama. Coba lagi atau pilih lewat peta.";
    return "Lokasi tidak tersedia di perangkat ini. Coba pilih lewat peta atau ketik manual.";
  }

  async function reverseGeocode(lat, lng) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=id`,
      );
      if (!r.ok) throw new Error("http " + r.status);
      return (await r.json()).display_name || null;
    } catch {
      return null; // jatuh kembali ke koordinat
    }
  }

  async function setCoords(lat, lng, source) {
    const addr = await reverseGeocode(lat, lng);
    setLocation({
      text: addr || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      lat,
      lng,
      source,
    });
  }

  $("locGps").addEventListener("click", async () => {
    showNote("Mencari lokasimu...", 0);
    try {
      const p = await getPosition();
      await setCoords(p.coords.latitude, p.coords.longitude, "gps");
    } catch (e) {
      showNote(geoMessage(e), 8000);
    }
  });

  // 3) pilih di peta (Leaflet + OpenStreetMap, dimuat saat dibutuhkan)
  let leafletReady = null,
    map = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletReady) return leafletReady;
    leafletReady = new Promise((res, rej) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = LEAFLET + "/leaflet.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = LEAFLET + "/leaflet.js";
      s.onload = res;
      s.onerror = () => {
        leafletReady = null;
        rej(new Error("leaflet"));
      };
      document.head.appendChild(s);
    });
    return leafletReady;
  }

  async function openMap() {
    mapModal.hidden = false;
    mapHint.textContent = "Memuat peta...";
    try {
      await loadLeaflet();
    } catch {
      mapHint.textContent =
        "Peta gagal dimuat. Periksa koneksi, atau pakai opsi lain.";
      return;
    }
    if (!map) {
      map = L.map("chatMap").setView(DEFAULT_CENTER, 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
    }
    setTimeout(() => map.invalidateSize(), 0);
    if (draftLoc && draftLoc.lat != null)
      map.setView([draftLoc.lat, draftLoc.lng], 17);
    mapHint.textContent = "Geser peta, pin di tengah menandai lokasi.";
    $("mapLocate").focus();
  }

  function closeMap() {
    mapModal.hidden = true;
  }

  $("locMap").addEventListener("click", openMap);
  $("mapClose").addEventListener("click", closeMap);

  $("mapLocate").addEventListener("click", async () => {
    mapHint.textContent = "Mencari lokasimu...";
    try {
      const p = await getPosition();
      map.setView([p.coords.latitude, p.coords.longitude], 17);
      mapHint.textContent = "Geser peta, pin di tengah menandai lokasi.";
    } catch (e) {
      mapHint.textContent = geoMessage(e);
    }
  });

  mapConfirm.addEventListener("click", async () => {
    if (!map) return;
    const c = map.getCenter();
    mapConfirm.disabled = true;
    await setCoords(c.lat, c.lng, "map");
    mapConfirm.disabled = false;
  });

  /* ---------- Kirim ---------- */
  async function send(raw) {
    const text = raw.trim();
    const photos = draftPhotos,
      loc = draftLoc;
    if (!text && !photos.length && !loc) return;

    chips.hidden = true;
    addUserMessage(
      text,
      photos.map((p) => p.url),
      loc,
    );

    input.value = "";
    autoGrow();
    sendBtn.disabled = true;
    const typing = showTyping();

    let reply;
    try {
      const urls = await Promise.all(
        photos.map(async (p) => {
          if (!p.cloudUrl) p.cloudUrl = await uploadToCloudinary(p.blob);
          return p.cloudUrl;
        }),
      );

      draftPhotos = [];
      draftLoc = null;
      renderDraft();
      setPanel(false);

      reply = await getBotReply({ text, location: loc, photoUrls: urls });
    } catch (err) {
      console.error("Gagal kirim:", err);
      input.value = text;
      autoGrow();
      showNote("Gagal mengirim. Periksa koneksi lalu coba lagi.", 6000);
      reply = "Maaf, terjadi gangguan saat mengirim. Silakan coba kirim ulang.";
    }

    typing.remove();
    addMessage("bot", reply);
    sendBtn.disabled = false;
    input.focus();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(input.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }
  input.addEventListener("input", autoGrow);
  chips
    .querySelectorAll("button")
    .forEach((b) => b.addEventListener("click", () => send(b.textContent)));

  /* ---------- Hubungkan ke backend agent di sini ---------- */
  async function getBotReply({ text, location, photoUrls }) {
    const payload = {
      session_id: getSessionId(),
      message: text,
      latitude: location?.lat ?? null,
      longitude: location?.lng ?? null,
      manual_location: location?.source === "manual" ? location.text : null,
      photo_urls: photoUrls,
      time: new Date().toISOString(),
    };

    // Mode simulasi: backend belum ada
    if (!API_URL) {
      console.log("Payload yang akan dikirim ke backend:", payload);
      await new Promise((r) => setTimeout(r, 800));
      return "Laporan diterima (simulasi). Backend belum terhubung.";
    }

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Request gagal: " + res.status);
    return (await res.json()).reply;
  }
})();

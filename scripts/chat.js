(() => {
  "use strict";

  const MAX_PHOTOS = 3; // batas backend: maks 3 foto per aduan
  const MAX_SIDE = 1280; // sisi terpanjang foto setelah dikecilkan (px)
  const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4";
  const DEFAULT_CENTER = [-6.2088, 106.8456]; // titik awal peta (Jakarta)

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

      <div class="chat-emergency" id="chatEmergency" role="alert" hidden>🚨 Kondisi darurat? Segera hubungi <a href="tel:112">112</a>.</div>
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
  const overlay = $("chatOverlay"), messages = $("chatMessages"), form = $("chatForm");
  const input = $("chatInput"), chips = $("chatChips"), note = $("chatNote");
  const draftEl = $("chatDraft"), locPanel = $("locPanel"), btnLoc = $("btnLoc");
  const mapModal = $("mapModal"), mapHint = $("mapHint"), mapConfirm = $("mapConfirm");
  const sendBtn = form.querySelector(".chat-send");

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text; // aman dari XSS
    return n;
  }

  /* ---------- State ---------- */
  let draftPhotos = []; // {blob, url}
  let draftLoc = null;  // {text, lat, lng, source: "manual" | "gps" | "map"}
  let lastFocus = null, started = false, noteTimer = null;

  /* ---------- Buka / tutup ---------- */
  function openChat() {
    lastFocus = document.activeElement;
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("chat-open");
    if (!started) {
      started = true;
      addMessage("bot", "Halo! Saya asisten TanggapIn. Ceritakan apa yang terjadi, lalu tambahkan lokasi dan foto lewat tombol di bawah kolom pesan.");
    }
    setTimeout(() => input.focus(), 150);
    if (API.hasSession()) { startPolling(); poll(); }
  }

  function closeChat() {
    stopPolling();
    closeMap();
    setPanel(false);
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("chat-open");
    if (lastFocus) lastFocus.focus();
  }

  document.querySelectorAll("[data-open-chat]").forEach((a) =>
    a.addEventListener("click", (e) => { e.preventDefault(); openChat(); })
  );
  $("chatClose").addEventListener("click", closeChat);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeChat(); });

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
    const f = [...scope.querySelectorAll("button, textarea, input, [href]")]
      .filter((n) => !n.disabled && n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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
        im.src = u; im.alt = "Foto lampiran " + (i + 1);
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
    })
  );

  async function addPhotos(files) {
    for (const f of files) {
      if (draftPhotos.length >= MAX_PHOTOS) { showNote(`Maksimal ${MAX_PHOTOS} foto per laporan.`); break; }
      if (!f.type.startsWith("image/")) { showNote("Hanya file gambar yang bisa dilampirkan."); continue; }
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
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return new Promise((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.8)
    );
  }

  /* ---------- Pratinjau lampiran ---------- */
  function renderDraft() {
    draftEl.replaceChildren();
    draftPhotos.forEach((p, i) => {
      const w = el("div", "thumb");
      const im = document.createElement("img");
      im.src = p.url; im.alt = "Foto " + (i + 1);
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
      b.addEventListener("click", () => { draftLoc = null; renderDraft(); });
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
    if (!t) { showNote("Ketik alamat atau patokan lokasi dulu."); return; }
    setLocation({ text: t, lat: null, lng: null, source: "manual" });
    $("locText").value = "";
  });
  $("locText").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); $("locSave").click(); }
  });

  // 2) lokasi pengguna saat ini
  function getPosition() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej({ code: 0 });
      navigator.geolocation.getCurrentPosition(res, rej, {
        enableHighAccuracy: true, timeout: 10000, maximumAge: 30000,
      });
    });
  }

  function geoMessage(e) {
    if (e.code === 1) return "Izin lokasi ditolak. Aktifkan izin lokasi di browser, atau pilih lewat peta atau ketik manual.";
    if (e.code === 3) return "Pencarian lokasi terlalu lama. Coba lagi atau pilih lewat peta.";
    return "Lokasi tidak tersedia di perangkat ini. Coba pilih lewat peta atau ketik manual.";
  }

  async function reverseGeocode(lat, lng) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=id`
      );
      if (!r.ok) throw new Error("http " + r.status);
      return (await r.json()).display_name || null;
    } catch {
      return null; // jatuh kembali ke koordinat
    }
  }

  async function setCoords(lat, lng, source) {
    const addr = await reverseGeocode(lat, lng);
    setLocation({ text: addr || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng, source });
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
  let leafletReady = null, map = null;

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
      s.onerror = () => { leafletReady = null; rej(new Error("leaflet")); };
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
      mapHint.textContent = "Peta gagal dimuat. Periksa koneksi, atau pakai opsi lain.";
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
    if (draftLoc && draftLoc.lat != null) map.setView([draftLoc.lat, draftLoc.lng], 17);
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

  /* ---------- Kirim ke backend ---------- */
  let busy = false;
  let unsent = { urls: [], loc: null }; // foto/lokasi yang sudah siap tapi pesannya gagal terkirim

  function setBusy(b) {
    busy = b;
    input.disabled = b;
    sendBtn.disabled = b;
  }

  function errorText(e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") return "Respons terlalu lama. Coba kirim ulang pesanmu.";
    if (e.code) return e.message;
    return "Maaf, koneksi bermasalah. Coba kirim ulang pesanmu.";
  }

  async function send(raw) {
    const text = raw.trim();
    const photos = draftPhotos, loc = draftLoc;
    if (busy || (!text && !photos.length && !loc && !unsent.urls.length)) return;
    setBusy(true);

    // 1) unggah foto langsung ke Cloudinary; draft dipertahankan bila gagal
    let newUrls = [];
    if (photos.length) {
      showNote("Mengunggah foto...", 0);
      try {
        newUrls = await Promise.all(photos.map((p) => API.uploadFoto(p.blob)));
        showNote("");
      } catch (e) {
        showNote("Foto gagal diunggah. Periksa koneksi, lalu coba kirim lagi.", 8000);
        setBusy(false);
        return;
      }
    }

    const urls = unsent.urls.concat(newUrls);
    const locUsed = loc || unsent.loc;

    chips.hidden = true;
    addUserMessage(text, photos.map((p) => p.url), loc);
    draftPhotos = []; draftLoc = null;
    renderDraft();
    setPanel(false);
    input.value = "";
    autoGrow();

    // 2) kirim pesan; lokasi dan foto cukup dikirim sekali, backend menyimpannya
    const typing = showTyping();
    try {
      const res = await API.kirimPesan({
        message: text,
        lat: locUsed && locUsed.lat != null ? locUsed.lat : null,
        lng: locUsed && locUsed.lng != null ? locUsed.lng : null,
        label: locUsed ? locUsed.text : null,
        photoUrls: urls,
      });
      typing.remove();
      unsent = { urls: [], loc: null };
      addMessage("bot", res.reply);
      if (res.is_emergency) $("chatEmergency").hidden = false;
      if (res.status === "submitted") {
        addMessage("sys", "✅ Laporanmu sudah diteruskan ke petugas. Kamu bisa lanjut melaporkan hal lain.");
      }
    } catch (e) {
      typing.remove();
      unsent = { urls, loc: locUsed }; // ikut terkirim pada percobaan berikutnya
      input.value = text;
      autoGrow();
      addMessage("bot", errorText(e));
    }
    setBusy(false);
    input.focus();
    startPolling();
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }
  input.addEventListener("input", autoGrow);
  chips.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => send(b.textContent))
  );

  /* ---------- Polling status (tiap 30 detik selama chat terbuka) ---------- */
  let pollTimer = null, lastShown = null;
  try { lastShown = localStorage.getItem("aduan_last_notice"); } catch (e) { /* abaikan */ }

  function startPolling() {
    if (!pollTimer) pollTimer = setInterval(poll, 30000);
  }
  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  async function poll() {
    if (busy || !overlay.classList.contains("open")) return;
    try {
      const st = await API.getStatus();
      // notice tetap dikembalikan sampai warga mengirim pesan lagi: tampilkan sekali saja
      if (st.notice && st.last_submitted_at !== lastShown) {
        lastShown = st.last_submitted_at;
        try { localStorage.setItem("aduan_last_notice", String(lastShown)); } catch (e) { /* abaikan */ }
        addMessage("bot", st.notice);
      }
    } catch (e) { /* abaikan, coba lagi 30 detik berikutnya */ }
  }
})();
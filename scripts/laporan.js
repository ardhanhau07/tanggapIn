(() => {
  const STATUSES = [
    { key: "diterima", label: "Diterima" },
    { key: "ditangani", label: "Ditangani" },
    { key: "selesai", label: "Selesai" },
    { key: "ditolak", label: "Ditolak" },
  ];

  let REPORTS = []; // diisi dari backend lewat API.getLaporan()

  let active = "diterima";
  const filterEl = document.getElementById("filter");
  const listEl = document.getElementById("reportList");

  const countOf = (key) => REPORTS.filter((r) => r.status === key).length;

  function formatDate(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
      day: "numeric", month: "long", year: "numeric",
    });
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // aman dari XSS
    return node;
  }

  function renderFilter() {
    filterEl.replaceChildren();
    STATUSES.forEach(({ key, label }) => {
      const btn = el("button");
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(key === active));
      btn.append(label, el("span", "count", String(countOf(key))));
      btn.addEventListener("click", () => {
        active = key;
        render();
      });
      filterEl.appendChild(btn);
    });
  }

  function renderCard(r) {
    const label = STATUSES.find((s) => s.key === r.status).label;
    const card = el("article", "report-card");

    const top = el("div", "report-top");
    top.append(el("span", "report-code", r.kode), el("span", "badge " + r.status, label));

    card.append(
      top,
      el("h3", "", r.judul),
      el("p", "report-meta", formatDate(r.tanggal) + " · " + r.lokasi)
    );
    if (r.deskripsi) card.appendChild(el("p", "report-desc", r.deskripsi));
    if (r.catatan) card.appendChild(el("p", "report-note", r.catatan));
    return card;
  }

  function renderList() {
    const items = REPORTS
      .filter((r) => r.status === active)
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal));

    listEl.replaceChildren();
    if (!items.length) {
      listEl.appendChild(el("p", "empty", "Belum ada laporan dengan status ini."));
      return;
    }
    items.forEach((r) => listEl.appendChild(renderCard(r)));
  }

  function render() {
    renderFilter();
    renderList();
  }

  async function init() {
    renderFilter();
    listEl.replaceChildren(el("p", "empty", "Memuat laporan..."));
    try {
      const rows = await API.getLaporan();
      // hanya status yang dikenal halaman ini (gagal_diproses dsb. tidak ditampilkan)
      REPORTS = rows.map(API.toCard).filter((r) => STATUSES.some((s) => s.key === r.status));
    } catch (e) {
      console.error("Gagal memuat laporan:", e);
      listEl.replaceChildren(el("p", "empty", "Gagal memuat laporan. Coba lagi nanti."));
      return;
    }
    render();
  }

  init();
})();
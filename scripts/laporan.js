(() => {
  const STATUSES = [
    { key: "diterima", label: "Diterima" },
    { key: "ditangani", label: "Ditangani" },
    { key: "selesai", label: "Selesai" },
    { key: "ditolak", label: "Ditolak" },
  ];

  // DATA CONTOH: ganti dengan data dari backend (fetch ke API)
  const REPORTS = [
    {
      kode: "TG-2026-0101", status: "diterima",
      judul: "Jalan berlubang di depan sekolah",
      lokasi: "Jl. Merdeka, Kec. Sukajadi", tanggal: "2026-10-19",
      deskripsi: "Terdapat beberapa lubang besar yang membahayakan pengendara motor saat jam masuk sekolah.",
    },
    {
      kode: "TG-2026-0102", status: "diterima",
      judul: "Lampu penerangan jalan mati",
      lokasi: "Jl. Melati, Kec. Cicendo", tanggal: "2026-10-20",
      deskripsi: "Lampu jalan padam sepanjang kurang lebih 200 meter sejak tiga hari lalu.",
    },
    {
      kode: "TG-2026-0087", status: "ditangani",
      judul: "Sampah menumpuk di tepi sungai",
      lokasi: "Bantaran Sungai, Kec. Coblong", tanggal: "2026-10-12",
      deskripsi: "Tumpukan sampah rumah tangga menimbulkan bau dan menyumbat aliran air.",
      catatan: "Tim kebersihan dijadwalkan melakukan pengangkutan pada 22 Oktober 2026.",
    },
    {
      kode: "TG-2026-0091", status: "ditangani",
      judul: "Saluran drainase tersumbat",
      lokasi: "Jl. Kenanga, Kec. Bandung Wetan", tanggal: "2026-10-14",
      deskripsi: "Air meluap ke jalan setiap hujan karena saluran tertutup endapan.",
      catatan: "Survei lokasi sudah dilakukan, menunggu alat pengeruk.",
    },
    {
      kode: "TG-2026-0054", status: "selesai",
      judul: "Pohon tumbang menutup jalan",
      lokasi: "Jl. Dago, Kec. Coblong", tanggal: "2026-09-28",
      deskripsi: "Pohon besar tumbang dan menutup satu lajur jalan.",
      catatan: "Pohon telah dipotong dan dibersihkan, lalu lintas kembali normal.",
    },
    {
      kode: "TG-2026-0060", status: "selesai",
      judul: "Rambu lalu lintas rusak",
      lokasi: "Perempatan Jl. Riau, Kec. Sumur Bandung", tanggal: "2026-10-02",
      deskripsi: "Rambu larangan parkir miring dan tidak terbaca.",
      catatan: "Rambu sudah diganti dan dipasang ulang.",
    },
    {
      kode: "TG-2026-0033", status: "ditolak",
      judul: "Keluhan tarif parkir swasta",
      lokasi: "Pusat perbelanjaan, Kec. Lengkong", tanggal: "2026-09-15",
      deskripsi: "Tarif parkir di area pusat perbelanjaan dirasa terlalu mahal.",
      catatan: "Alasan penolakan: tarif parkir area swasta berada di luar kewenangan pemerintah kota.",
    },
  ];

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
      el("p", "report-meta", formatDate(r.tanggal) + " · " + r.lokasi),
      el("p", "report-desc", r.deskripsi)
    );
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

  render();
})();
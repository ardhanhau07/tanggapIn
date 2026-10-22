// Konfigurasi FE publik. Semua nilai di sini publik (terlihat di browser),
// jadi JANGAN menaruh SUPABASE_SERVICE_ROLE_KEY atau rahasia lain di file ini.
window.APP_CONFIG = {
  API_BASE_URL: "https://tanggapin-api-898936746412.asia-southeast1.run.app", // tanpa "/" di akhir; produksi: URL backend (Cloud Run)
  CLOUDINARY_CLOUD_NAME: "diwwapxhs",
  CLOUDINARY_UPLOAD_PRESET: "tanggapin",
};
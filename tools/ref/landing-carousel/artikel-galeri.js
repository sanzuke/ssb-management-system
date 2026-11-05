/**
 * artikel-galeri.js
 * Komponen carousel/header foto dengan thumbnail untuk artikel landing page.
 * Konsumsi data `galleryUrls` dari API publik SSB MS.
 *
 * Salin ke repo landing (ssb-family-united), misal assets/js/artikel-galeri.js
 */

class ArtikelGaleri {
  constructor({ containerId, galleryUrls = [], coverUrl = null, coverAlt = "Foto artikel" }) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`[ArtikelGaleri] Container #${containerId} tidak ditemukan`);
      return;
    }

    // Gabungkan coverUrl didepan jika belum ada di galleryUrls
    this.images = [];
    if (coverUrl && !galleryUrls.includes(coverUrl)) {
      this.images.push(coverUrl);
    }
    this.images.push(...galleryUrls.filter((u) => coverUrl !== u));

    this.coverAlt = coverAlt;
    this.activeIndex = 0;

    if (this.images.length === 0) {
      this.container.innerHTML = '<p class="kosong">Belum ada foto artikel.</p>';
      return;
    }

    this.render();
    this.bindEvents();
  }

  render() {
    const hasMany = this.images.length > 1;
    const escape = (t) => {
      const d = document.createElement("div");
      d.textContent = t;
      return d.innerHTML;
    };

    this.container.innerHTML = `
      <div class="artikel-galeri" role="region" aria-label="Galeri foto artikel">
        <div class="galeri-utama" aria-label="Foto utama">
          <img
            src="${escape(this.images[this.activeIndex])}"
            alt="${escape(this.coverAlt)}"
            class="foto-utama"
            loading="lazy"
            draggable="false"
          />
          ${
            hasMany
              ? `
            <button class="nav-prev" aria-label="Foto sebelumnya">&#9664;</button>
            <button class="nav-next" aria-label="Foto berikutnya">&#9654;</button>
            <div class="indikator" role="tablist" aria-label="Pilih foto">
              ${this.images
                .map(
                  (_, i) =>
                    `<button class="titik ${i === this.activeIndex ? "aktif" : ""}" role="tab" aria-selected="${i === this.activeIndex}" aria-label="Foto ${i + 1}"></button>`,
                )
                .join("")}
            </div>
          `
              : ""
          }
        </div>
        ${
          hasMany
            ? `
          <div class="thumbnail-bawah" aria-label="Thumbnail foto">
            ${this.images
              .map(
                (url, i) =>
                  `<button class="thumbnail ${i === this.activeIndex ? "aktif" : ""}" aria-label="Pilih foto ${i + 1}" data-index="${i}">
                <img src="${escape(url)}" class="thumbnail-img" alt="" loading="lazy">
              </button>`,
              )
              .join("")}
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  bindEvents() {
    const prev = this.container.querySelector(".nav-prev");
    const next = this.container.querySelector(".nav-next");
    const titiks = this.container.querySelectorAll(".titik");
    const thumbnails = this.container.querySelectorAll(".thumbnail");

    if (prev) {
      prev.addEventListener("click", () => this.prev());
    }
    if (next) {
      next.addEventListener("click", () => this.next());
    }

    titiks.forEach((t, i) => {
      t.addEventListener("click", () => this.goTo(i));
    });

    thumbnails.forEach((t) => {
      t.addEventListener("click", () => {
        const idx = parseInt(t.dataset.index, 10);
        if (!isNaN(idx)) this.goTo(idx);
      });
    });

    // Keyboard navigation
    this.container.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") this.prev();
      if (e.key === "ArrowRight") this.next();
    });
  }

  goTo(index) {
    if (index < 0 || index >= this.images.length) return;
    this.activeIndex = index;
    this.updateUI();
  }

  prev() {
    this.goTo(this.activeIndex === 0 ? this.images.length - 1 : this.activeIndex - 1);
  }

  next() {
    this.goTo(this.activeIndex === this.images.length - 1 ? 0 : this.activeIndex + 1);
  }

  updateUI() {
    const foto = this.container.querySelector(".foto-utama");
    const titiks = this.container.querySelectorAll(".titik");
    const thumbnails = this.container.querySelectorAll(".thumbnail");

    if (foto) {
      foto.src = this.images[this.activeIndex];
      foto.alt = this.coverAlt;
    }

    titiks.forEach((t, i) => {
      t.classList.toggle("aktif", i === this.activeIndex);
      t.setAttribute("aria-selected", i === this.activeIndex);
    });

    thumbnails.forEach((t) => {
      const isAktif = parseInt(t.dataset.index, 10) === this.activeIndex;
      t.classList.toggle("aktif", isAktif);
      t.setAttribute("aria-pressed", isAktif);
    });
  }

  /** Hapus dan buat ulang carousel (digunakan saat data artikel berubah, misal SPA) */
  destroy() {
    this.container.innerHTML = "";
  }

  /** Ganti daftar foto dan render ulang */
  setImages({ galleryUrls = [], coverUrl = null, coverAlt = "Foto artikel" }) {
    this.images = [];
    if (coverUrl && !galleryUrls.includes(coverUrl)) {
      this.images.push(coverUrl);
    }
    this.images.push(...galleryUrls.filter((u) => coverUrl !== u));
    this.coverAlt = coverAlt;
    this.activeIndex = 0;
    if (this.images.length === 0) {
      this.container.innerHTML = '<p class="kosong">Belum ada foto artikel.</p>';
      return;
    }
    this.render();
    this.bindEvents();
  }
}

// Auto-inisialisasi untuk elemen dengan data-atribut
document.addEventListener("DOMContentLoaded", () => {
  const els = document.querySelectorAll("[data-artikel-galeri]");
  els.forEach((el) => {
    try {
      const galleryUrls = JSON.parse(el.dataset.galleryUrls || "[]");
      new ArtikelGaleri({
        containerId: el.id,
        galleryUrls,
        coverUrl: el.dataset.coverUrl || null,
        coverAlt: el.dataset.coverAlt || "Foto artikel",
      });
    } catch (e) {
      console.error("[ArtikelGaleri] Gagal inisialisasi:", e);
    }
  });
});

// Ekspor untuk penggunaan manual
if (typeof window !== "undefined") {
  window.ArtikelGaleri = ArtikelGaleri;
}

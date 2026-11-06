/* ============================================================
   Centros de Estudios Renovación — comportamiento compartido del sitio
   (menú móvil, scroll suave, header, slider del inicio)
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".header");
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const mobileNav = document.getElementById("mobileNav");

  /* ---------- Menú móvil ---------- */
  if (mobileMenuBtn && mobileNav) {
    const closeMenu = () => {
      mobileMenuBtn.classList.remove("active");
      mobileNav.classList.remove("active");
    };

    mobileMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      mobileMenuBtn.classList.toggle("active");
      mobileNav.classList.toggle("active");
    });

    mobileNav.querySelectorAll(".nav-mobile-link").forEach((link) =>
      link.addEventListener("click", closeMenu)
    );

    document.addEventListener("click", (e) => {
      if (!mobileMenuBtn.contains(e.target) && !mobileNav.contains(e.target)) closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
  }

  /* ---------- Scroll suave para anclas internas ---------- */
  document.querySelectorAll('a[href*="#"]').forEach((link) => {
    link.addEventListener("click", function (e) {
      const url = this.getAttribute("href");
      const hash = url.slice(url.indexOf("#"));
      // Solo interceptar anclas de la página actual
      if (url.startsWith("#") || url.startsWith(location.pathname + "#")) {
        if (hash === "#" || hash.length < 2) return;
        const target = document.querySelector(hash);
        if (!target) return;
        e.preventDefault();
        const offset = (header ? header.offsetHeight : 0) + 16;
        window.scrollTo({ top: target.offsetTop - offset, behavior: "smooth" });
      }
    });
  });

  /* ---------- Header: ocultar al bajar, resaltar link activo ---------- */
  const sections = [...document.querySelectorAll("section[id]")];
  const navLinks = [...document.querySelectorAll(".nav-link, .nav-mobile-link")];
  let lastScroll = 0;
  let ticking = false;

  const onScroll = () => {
    const y = window.pageYOffset || document.documentElement.scrollTop;

    if (header) {
      header.classList.toggle("is-scrolled", y > 10);
      if (y > lastScroll && y > 160) header.classList.add("is-hidden");
      else header.classList.remove("is-hidden");
    }

    if (sections.length && navLinks.length) {
      let current = "";
      const probe = y + (header ? header.offsetHeight : 0) + 40;
      for (const s of sections) {
        if (probe >= s.offsetTop && probe < s.offsetTop + s.clientHeight) current = s.id;
      }
      navLinks.forEach((l) => {
        const href = l.getAttribute("href") || "";
        l.classList.toggle("active", href.endsWith("#" + current) && current !== "");
      });
    }

    lastScroll = y <= 0 ? 0 : y;
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        window.requestAnimationFrame(onScroll);
        ticking = true;
      }
    },
    { passive: true }
  );

  /* ---------- Animaciones al entrar en viewport ---------- */
  const animated = document.querySelectorAll(
    ".observatorio-card, .informe-card, .novedad-card, .eje-card, .miembro-card, .publicacion-card, .stat-item"
  );
  if ("IntersectionObserver" in window && animated.length) {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("fade-in-up");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    animated.forEach((el) => io.observe(el));
  }

  /* ---------- Imágenes lazy (data-src) ---------- */
  const lazyImgs = document.querySelectorAll("img[data-src]");
  if ("IntersectionObserver" in window && lazyImgs.length) {
    const imgIo = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute("data-src");
          obs.unobserve(img);
        }
      });
    });
    lazyImgs.forEach((img) => imgIo.observe(img));
  }

  /* ============================================================
     HERO SLIDER (solo si existe en la página)
     ============================================================ */
  const slider = document.querySelector(".hero-slider");
  if (!slider) return;

  const slides = [...slider.querySelectorAll(".slide")];
  if (!slides.length) return;

  const dotsContainer = slider.querySelector(".slider-dots");
  const prevBtn = slider.querySelector(".prev-btn");
  const nextBtn = slider.querySelector(".next-btn");
  let index = 0;
  let timer = null;

  // (Re)generar los puntos para que siempre coincidan con las slides
  let dots = [];
  if (dotsContainer) {
    dotsContainer.innerHTML = "";
    slides.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "dot" + (i === 0 ? " active" : "");
      dot.setAttribute("aria-label", `Ir a la diapositiva ${i + 1}`);
      dot.addEventListener("click", () => goTo(i));
      dotsContainer.appendChild(dot);
    });
    dots = [...dotsContainer.children];
  }

  const render = () => {
    slides.forEach((s, i) => s.classList.toggle("active", i === index));
    dots.forEach((d, i) => d.classList.toggle("active", i === index));
  };
  const goTo = (i) => {
    index = (i + slides.length) % slides.length;
    render();
    restart();
  };
  const next = () => goTo(index + 1);
  const prev = () => goTo(index - 1);
  const start = () => (timer = setInterval(next, 6000));
  const restart = () => {
    clearInterval(timer);
    start();
  };

  prevBtn && prevBtn.addEventListener("click", prev);
  nextBtn && nextBtn.addEventListener("click", next);
  slider.addEventListener("mouseenter", () => clearInterval(timer));
  slider.addEventListener("mouseleave", start);

  // Compatibilidad con onclick inline heredado
  window.currentSlide = (n) => goTo(n - 1);
  window.nextSlide = next;
  window.previousSlide = prev;

  render();
  start();
});

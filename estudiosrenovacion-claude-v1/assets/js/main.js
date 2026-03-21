// main.js (reemplazar todo el contenido por este)
document.addEventListener("DOMContentLoaded", () => {
  /* -----------------------
     MOBILE MENU
     ----------------------- */
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const mobileNav = document.getElementById("mobileNav");
  const mobileLinks = document.querySelectorAll(".nav-mobile-link");

  if (mobileMenuBtn && mobileNav) {
    mobileMenuBtn.addEventListener("click", () => {
      mobileMenuBtn.classList.toggle("active");
      mobileNav.classList.toggle("active");
    });

    mobileLinks.forEach((link) => {
      link.addEventListener("click", () => {
        mobileMenuBtn.classList.remove("active");
        mobileNav.classList.remove("active");
      });
    });

    // Close when clicking outside
    document.addEventListener("click", (event) => {
      if (!mobileMenuBtn.contains(event.target) && !mobileNav.contains(event.target)) {
        mobileMenuBtn.classList.remove("active");
        mobileNav.classList.remove("active");
      }
    });
  } else {
    console.warn("mobile menu elements not found");
  }

  /* -----------------------
     SMOOTH ANCHOR SCROLL
     ----------------------- */
  const anchorLinks = document.querySelectorAll('a[href^="#"]');
  anchorLinks.forEach((link) => {
    link.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (!href || href === "#") return;
      const targetSection = document.querySelector(href);
      if (targetSection) {
        e.preventDefault();
        const header = document.querySelector(".header");
        const headerHeight = header ? header.offsetHeight : 0;
        const targetPosition = targetSection.offsetTop - headerHeight - 20;
        window.scrollTo({ top: targetPosition, behavior: "smooth" });
      }
    });
  });

  /* -----------------------
     HEADER HIDE/SHOW ON SCROLL
     ----------------------- */
  let lastScrollTop = 0;
  const header = document.querySelector(".header");
  window.addEventListener("scroll", () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    if (header) {
      if (scrollTop > lastScrollTop && scrollTop > 100) header.style.transform = "translateY(-100%)";
      else header.style.transform = "translateY(0)";
    }
    lastScrollTop = scrollTop;
  });

  /* -----------------------
     CONTACT BUTTON
     ----------------------- */
  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("click", (e) => {
      e.preventDefault();
      const googleFormUrl = "https://forms.google.com/your-form-url";
      window.open(googleFormUrl, "_blank");
    });
  }

  /* -----------------------
     INTERSECTION OBSERVER (animaciones)
     ----------------------- */
  const observerOptions = { threshold: 0.1, rootMargin: "0px 0px -50px 0px" };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("fade-in-up");
    });
  }, observerOptions);

  const animatedElements = document.querySelectorAll(".observatorio-card, .informe-card, .novedad-card, .stat-item");
  animatedElements.forEach((el) => observer.observe(el));

  /* -----------------------
     ACTIVE NAV LINK ON SCROLL
     ----------------------- */
  const sections = document.querySelectorAll("section[id]");
  const navLinks = document.querySelectorAll(".nav-link, .nav-mobile-link");
  window.addEventListener("scroll", () => {
    let current = "";
    const scrollPosition = window.scrollY + 100;
    sections.forEach((section) => {
      const top = section.offsetTop;
      const height = section.clientHeight;
      if (scrollPosition >= top && scrollPosition < top + height) current = section.getAttribute("id");
    });
    navLinks.forEach((link) => {
      link.classList.remove("active");
      const href = link.getAttribute("href");
      if (href === `#${current}`) link.classList.add("active");
    });
  });

  /* -----------------------
     LAZY IMAGES
     ----------------------- */
  const lazyImgs = document.querySelectorAll("img[data-src]");
  if ("IntersectionObserver" in window && lazyImgs.length) {
    const imageObserver = new IntersectionObserver((entries, imgObserver) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.classList.remove("lazy");
          imgObserver.unobserve(img);
        }
      });
    });
    lazyImgs.forEach((img) => imageObserver.observe(img));
  }

  /* -----------------------
     KEYBOARD: ESC TO CLOSE MENU
     ----------------------- */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mobileMenuBtn && mobileNav) {
      mobileMenuBtn.classList.remove("active");
      mobileNav.classList.remove("active");
    }
  });

  /* =======================
     HERO SLIDER (robusto)
     ======================= */
  const slider = document.querySelector(".hero-slider");
  if (!slider) {
    console.warn("No hero slider found (.hero-slider)");
    console.log("[v0] Website initialized (no slider)");
    return;
  }

  const slides = slider.querySelectorAll(".slide");
  const dotsContainer = slider.querySelector(".slider-dots");
  const prevBtn = slider.querySelector(".prev-btn");
  const nextBtn = slider.querySelector(".next-btn");
  let currentSlideIndex = 0;
  let autoplayInterval = null;

  if (!slides || slides.length === 0) {
    console.error("No slides found inside .hero-slider");
    return;
  }

  // Ensure dots match slides: if dots missing or mismatch, recreate them
  if (dotsContainer) {
    if (dotsContainer.children.length !== slides.length) {
      dotsContainer.innerHTML = "";
      slides.forEach((_, i) => {
        const dot = document.createElement("span");
        dot.className = "dot";
        if (i === 0) dot.classList.add("active");
        dot.dataset.index = i;
        dot.setAttribute("aria-label", `Ir a la diapositiva ${i + 1}`);
        dot.addEventListener("click", () => goToSlide(i));
        dotsContainer.appendChild(dot);
      });
    }
  }

  const dots = slider.querySelectorAll(".dot");

  function updateSlides() {
    slides.forEach((s, idx) => s.classList.toggle("active", idx === currentSlideIndex));
    if (dots && dots.length) dots.forEach((d, idx) => d.classList.toggle("active", idx === currentSlideIndex));
  }

  function nextSlide() {
    currentSlideIndex = (currentSlideIndex + 1) % slides.length;
    updateSlides();
  }

  function previousSlide() {
    currentSlideIndex = (currentSlideIndex - 1 + slides.length) % slides.length;
    updateSlides();
  }

  function goToSlide(index) {
    if (index < 0 || index >= slides.length) return;
    currentSlideIndex = index;
    updateSlides();
    resetAutoplay();
  }

  // Attach controls
  if (prevBtn) prevBtn.addEventListener("click", () => { previousSlide(); resetAutoplay(); });
  if (nextBtn) nextBtn.addEventListener("click", () => { nextSlide(); resetAutoplay(); });

  // Expose for backward compatibility with inline onclick (optional)
  window.nextSlide = () => { nextSlide(); resetAutoplay(); };
  window.previousSlide = () => { previousSlide(); resetAutoplay(); };
  window.currentSlide = (n) => { goToSlide(n - 1); };

  // Initialize
  updateSlides();
  startAutoplay();

  function startAutoplay() {
    clearInterval(autoplayInterval);
    autoplayInterval = setInterval(nextSlide, 5000);
  }
  function resetAutoplay() {
    clearInterval(autoplayInterval);
    autoplayInterval = setInterval(nextSlide, 5000);
  }

  console.log("[v0] Website initialized successfully (slider OK)");
}); // end DOMContentLoaded

// small utils (global)
function isMobile() { return window.innerWidth <= 768; }
function isTablet() { return window.innerWidth > 768 && window.innerWidth <= 1024; }
function isDesktop() { return window.innerWidth > 1024; }
window.WebsiteUtils = { isMobile, isTablet, isDesktop };

/* Portfolio behaviour: language, theme, nav state, scroll reveal, inline viewer. */
(function () {
  "use strict";

  var root = document.documentElement;
  var body = document.body;

  // ---------------------------------------------------------------- language
  var langBtn = document.getElementById("lang-toggle");

  function setLang(lang) {
    root.setAttribute("data-lang", lang);
    root.setAttribute("lang", lang);
    langBtn.textContent = lang === "th" ? "EN" : "ไทย"; // shows what you switch TO
    try { localStorage.setItem("portfolio-lang", lang); } catch (e) {}
    retitleViewer();
  }

  var savedLang = null;
  try { savedLang = localStorage.getItem("portfolio-lang"); } catch (e) {}
  if (!savedLang) {
    savedLang = (navigator.language || "").toLowerCase().indexOf("th") === 0 ? "th" : "en";
  }
  setLang(savedLang);

  langBtn.addEventListener("click", function () {
    setLang(root.getAttribute("data-lang") === "th" ? "en" : "th");
  });

  // ------------------------------------------------------------------- theme
  var themeBtn = document.getElementById("theme-toggle");

  function setTheme(theme) {
    if (theme) {
      root.setAttribute("data-theme", theme);
      try { localStorage.setItem("portfolio-theme", theme); } catch (e) {}
    } else {
      root.removeAttribute("data-theme");
      try { localStorage.removeItem("portfolio-theme"); } catch (e) {}
    }
  }

  try {
    var savedTheme = localStorage.getItem("portfolio-theme");
    if (savedTheme) setTheme(savedTheme);
  } catch (e) {}

  themeBtn.addEventListener("click", function () {
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var current = root.getAttribute("data-theme") || (prefersDark ? "dark" : "light");
    setTheme(current === "dark" ? "light" : "dark");
  });

  // --------------------------------------------------------------- nav state
  var nav = document.getElementById("nav");
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav-links a"));
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute("href")); })
    .filter(Boolean);

  function onScroll() {
    nav.classList.toggle("stuck", window.scrollY > 8);

    // The section whose top has most recently passed under the navbar wins.
    var line = window.scrollY + parseInt(getComputedStyle(root).getPropertyValue("--nav-h"), 10) + 40;
    var active = null;
    sections.forEach(function (s) {
      if (s.offsetTop <= line) active = s;
    });
    navLinks.forEach(function (a) {
      a.classList.toggle("active", !!active && a.getAttribute("href") === "#" + active.id);
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ----------------------------------------------------------- scroll reveal
  var revealables = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    Array.prototype.forEach.call(revealables, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(revealables, function (el) { el.classList.add("in"); });
  }

  // ----------------------------------------------------------- inline viewer
  var viewer = document.getElementById("viewer");
  var vTitle = document.getElementById("viewer-title");
  var vBody = document.getElementById("viewer-body");
  var vOpen = document.getElementById("viewer-open");
  var vDl = document.getElementById("viewer-dl");
  var lastFocus = null;
  var current = null; // {src, type, preview, titleTh, titleEn}

  function retitleViewer() {
    if (!current) return;
    var th = root.getAttribute("data-lang") === "th";
    vTitle.textContent = (th ? current.titleTh : current.titleEn) || current.src;
  }

  // Mobile browsers commonly refuse to render a PDF inline and offer a download
  // instead — exactly what we are trying to avoid. On narrow screens go straight
  // to the rendered first page plus an explicit "open" action.
  function wantsFallback(item) {
    return item.type === "pdf" && item.preview &&
           window.matchMedia("(max-width: 900px)").matches;
  }

  // Rendered page 1 plus an escape hatch, used both as the mobile path and as
  // <object>'s built-in fallback when a browser cannot display the PDF at all.
  function buildFallback(item) {
    var frag = document.createDocumentFragment();
    if (item.preview) {
      var shot = document.createElement("img");
      shot.src = item.preview;
      shot.alt = "";
      frag.appendChild(shot);
    }
    var hint = document.createElement("a");
    hint.className = "btn primary";
    hint.href = item.src;
    hint.target = "_blank";
    hint.rel = "noopener";
    hint.textContent = root.getAttribute("data-lang") === "th"
      ? "เปิดเอกสารฉบับเต็ม" : "Open the full document";
    frag.appendChild(hint);
    return frag;
  }

  function openViewer(item) {
    current = item;
    lastFocus = document.activeElement;

    vBody.innerHTML = "";
    vBody.className = "viewer-body";

    if (item.type === "img") {
      var img = document.createElement("img");
      img.src = item.src;
      img.alt = "";
      vBody.appendChild(img);
    } else if (wantsFallback(item)) {
      vBody.className = "viewer-body viewer-fallback";
      vBody.appendChild(buildFallback(item));
    } else {
      // <object> shows its own children when the PDF cannot be rendered, so the
      // fallback needs no feature detection on our side.
      var obj = document.createElement("object");
      obj.data = item.src + "#view=FitH";
      obj.type = "application/pdf";
      obj.setAttribute("aria-label", item.titleEn || "document");
      obj.appendChild(buildFallback(item));
      vBody.appendChild(obj);
    }

    vOpen.href = item.src;
    vDl.href = item.src;

    viewer.hidden = false;
    body.classList.add("locked");
    retitleViewer();
    viewer.querySelector(".close").focus();
  }

  function closeViewer() {
    viewer.hidden = true;
    vBody.innerHTML = "";      // stop the PDF/iframe from rendering in the background
    body.classList.remove("locked");
    current = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-view]");
    if (trigger) {
      e.preventDefault();
      openViewer({
        src: trigger.getAttribute("data-view"),
        type: trigger.getAttribute("data-type") || "pdf",
        preview: trigger.getAttribute("data-preview"),
        titleTh: trigger.getAttribute("data-title-th"),
        titleEn: trigger.getAttribute("data-title-en")
      });
      return;
    }
    if (e.target.closest("[data-close]")) closeViewer();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !viewer.hidden) closeViewer();
  });
})();

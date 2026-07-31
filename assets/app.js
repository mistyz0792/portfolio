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

  var progressBar = document.getElementById("progress-bar");

  function onScroll() {
    nav.classList.toggle("stuck", window.scrollY > 8);

    var scrollable = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.width = (scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0) + "%";

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

  /* ====================================================================
     Decoration below this line. Everything here is skipped outright when
     the visitor has asked for reduced motion.
     ==================================================================== */

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // -------------------------------------------------------- stat counters
  var counters = document.querySelectorAll(".stats b[data-count]");

  function runCount(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
    var plain = el.hasAttribute("data-plain");   // years must not get separators
    var duration = 1100;
    var start = performance.now();

    function frame(now) {
      var t = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      var value = target * eased;
      el.textContent = plain
        ? String(Math.round(value))
        : value.toLocaleString(undefined, {
            minimumFractionDigits: decimals, maximumFractionDigits: decimals
          });
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (!reduced && "IntersectionObserver" in window) {
    var countIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          runCount(entry.target);
          countIo.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    Array.prototype.forEach.call(counters, function (el) { countIo.observe(el); });
  }

  if (reduced) return;

  // --------------------------------------------- cursor glow + card lights
  var glow = document.getElementById("cursor-glow");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var lit = document.querySelectorAll(".card, .mini, .skills > div");

  if (finePointer) {
    window.addEventListener("pointermove", function (e) {
      glow.classList.add("on");
      glow.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
    }, { passive: true });

    Array.prototype.forEach.call(lit, function (el) {
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty("--mx", (e.clientX - r.left) + "px");
        el.style.setProperty("--my", (e.clientY - r.top) + "px");

        // Gentle parallax tilt — big enough to notice, small enough to read.
        var rx = ((e.clientY - r.top) / r.height - 0.5) * -3.2;
        var ry = ((e.clientX - r.left) / r.width - 0.5) * 3.2;
        el.style.transform = "perspective(900px) rotateX(" + rx + "deg) rotateY(" + ry + "deg) translateY(-3px)";
      }, { passive: true });

      el.addEventListener("pointerleave", function () { el.style.transform = ""; });
    });
  }

  // ------------------------------------------------------- hero constellation
  var canvas = document.getElementById("fx");
  var ctx = canvas.getContext && canvas.getContext("2d");
  var hero = document.querySelector(".hero");

  if (ctx) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var nodes = [];
    var w = 0, h = 0;
    var sweep = 0;
    var LINK = 132;          // px within which two nodes are wired together

    function resize() {
      w = hero.clientWidth;
      h = hero.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var count = Math.min(78, Math.round((w * h) / 15000));
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: Math.random() * 1.6 + 0.7
        });
      }
    }

    function palette() {
      var s = getComputedStyle(document.documentElement);
      return {
        accent: s.getPropertyValue("--accent").trim() || "#5aa2ff",
        second: s.getPropertyValue("--accent-2").trim() || "#2ad4c9"
      };
    }

    var colors = palette();

    function draw() {
      ctx.clearRect(0, 0, w, h);

      // Radar sweep anchored near the portrait.
      var cx = w * 0.16, cy = h * 0.46;
      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.55);
      grad.addColorStop(0, colors.accent);
      grad.addColorStop(1, "transparent");
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.translate(cx, cy);
      ctx.rotate(sweep);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, Math.max(w, h) * 0.55, -0.42, 0);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
      sweep = (sweep + 0.0045) % (Math.PI * 2);

      // Wire up neighbouring nodes; closer pairs draw brighter.
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        a.x += a.vx; a.y += a.vy;
        if (a.x < 0 || a.x > w) a.vx *= -1;
        if (a.y < 0 || a.y > h) a.vy *= -1;

        for (var j = i + 1; j < nodes.length; j++) {
          var b = nodes[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK) {
            ctx.globalAlpha = (1 - d / LINK) * 0.22;
            ctx.strokeStyle = colors.accent;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }

        ctx.globalAlpha = 0.55;
        ctx.fillStyle = i % 7 === 0 ? colors.second : colors.accent;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    var running = true;
    function loop() {
      if (running) draw();
      requestAnimationFrame(loop);
    }

    resize();
    loop();

    window.addEventListener("resize", resize);
    themeBtn.addEventListener("click", function () { colors = palette(); });

    // Stop burning frames once the hero has scrolled away.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        running = entries[0].isIntersecting;
      }, { threshold: 0 }).observe(hero);
    }
  }

  // ------------------------------------------------- hero title scramble
  var title = document.querySelector("[data-scramble]");
  if (title) {
    var final = title.getAttribute("data-scramble");
    var glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ<>/\\[]{}=+*#%01";
    var step = 0;
    var scrambleTimer = setInterval(function () {
      var out = "";
      for (var i = 0; i < final.length; i++) {
        if (final[i] === " ") { out += " "; continue; }
        out += i < step ? final[i] : glyphs[Math.floor(Math.random() * glyphs.length)];
      }
      title.textContent = out;
      step += 0.5;
      if (step > final.length) {
        clearInterval(scrambleTimer);
        title.textContent = final;
      }
    }, 34);
  }
})();

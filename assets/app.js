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
    // Only remember the page element we came from, not the arrows we just used
    // to page within an already-open viewer.
    if (viewer.hidden) lastFocus = document.activeElement;

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

  // ------------------------------------------------- viewer gallery paging
  var vNav = document.getElementById("viewer-nav");
  var vPrev = document.getElementById("viewer-prev");
  var vNext = document.getElementById("viewer-next");
  var vCounter = document.getElementById("viewer-counter");
  var group = [];
  var index = 0;

  function itemFrom(el) {
    return {
      src: el.getAttribute("data-view"),
      type: el.getAttribute("data-type") || "pdf",
      preview: el.getAttribute("data-preview"),
      titleTh: el.getAttribute("data-title-th"),
      titleEn: el.getAttribute("data-title-en")
    };
  }

  function show(i) {
    index = (i + group.length) % group.length;
    openViewer(itemFrom(group[index]));
    vNav.classList.toggle("solo", group.length < 2);
    vCounter.textContent = (index + 1) + " / " + group.length;
    vPrev.disabled = vNext.disabled = group.length < 2;
  }

  vPrev.addEventListener("click", function () { show(index - 1); });
  vNext.addEventListener("click", function () { show(index + 1); });

  document.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-view]");
    if (trigger) {
      e.preventDefault();
      // Everything viewable inside the same project card becomes one gallery,
      // so the arrows page through that project's documents rather than dead-end.
      var scope = trigger.closest(".card, .mini");
      group = scope
        ? Array.prototype.slice.call(scope.querySelectorAll("[data-view]"))
        : [trigger];
      show(group.indexOf(trigger));
      return;
    }
    if (e.target.closest("[data-close]")) closeViewer();
  });

  document.addEventListener("keydown", function (e) {
    if (viewer.hidden) return;
    if (e.key === "Escape") closeViewer();
    if (e.key === "ArrowLeft" && group.length > 1) show(index - 1);
    if (e.key === "ArrowRight" && group.length > 1) show(index + 1);
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
      // rAF hands back the frame's start time, which can predate the
      // performance.now() captured just above — clamp or t goes negative and
      // the counter briefly renders "-14".
      var t = Math.min(Math.max((now - start) / duration, 0), 1);
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

  /* ====================================================================
     Interaction features. These are usability, not decoration, so they run
     even when the visitor has asked for reduced motion.
     ==================================================================== */

  var isTh = function () { return root.getAttribute("data-lang") === "th"; };

  // Headings carry both languages as sibling spans and CSS hides one of them,
  // so textContent would return "เกี่ยวกับผมAbout me". Strip the inactive one.
  function langText(node) {
    if (!node) return "";
    var clone = node.cloneNode(true);
    clone.querySelectorAll(isTh() ? ".en" : ".th").forEach(function (n) { n.remove(); });
    var num = clone.querySelector(".num");
    if (num) num.remove();
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  // ------------------------------------------------------------- toasts
  var toasts = document.getElementById("toasts");

  function toast(message) {
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = '<span class="ok">✓</span>';
    el.appendChild(document.createTextNode(message));
    toasts.appendChild(el);
    setTimeout(function () {
      el.classList.add("out");
      setTimeout(function () { el.remove(); }, 260);
    }, 2200);
  }

  // ------------------------------------------------ copy to clipboard
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".copy");
    if (!btn) return;
    e.preventDefault();
    var text = btn.getAttribute("data-copy");
    var label = isTh() ? btn.getAttribute("data-label-th") : btn.getAttribute("data-label-en");

    function done() { toast(label + " — " + text); }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }

    // execCommand is deprecated but is the only path on insecure origins.
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (err) {}
      ta.remove();
    }
  });

  // ------------------------------------------------------- section rail
  var rail = document.getElementById("rail");
  sections.forEach(function (s) {
    var link = document.createElement("a");
    link.href = "#" + s.id;

    // Copy the heading's own .th/.en spans across so the existing CSS keeps the
    // rail label in sync when the visitor switches language.
    var span = document.createElement("span");
    var heading = s.querySelector("h2");
    if (heading) {
      heading.querySelectorAll(".th, .en").forEach(function (n) {
        span.appendChild(n.cloneNode(true));
      });
    }
    if (!span.childNodes.length) span.textContent = s.id;

    link.appendChild(span);
    link.setAttribute("aria-label", langText(heading) || s.id);
    rail.appendChild(link);
  });
  var railLinks = Array.prototype.slice.call(rail.children);

  // ------------------------------------------------------ back to top
  var fab = document.getElementById("fab");
  fab.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  });

  window.addEventListener("scroll", function () {
    fab.classList.toggle("on", window.scrollY > 700);
    var active = null;
    sections.forEach(function (s) {
      if (s.offsetTop <= window.scrollY + 160) active = s;
    });
    railLinks.forEach(function (a) {
      a.classList.toggle("on", !!active && a.getAttribute("href") === "#" + active.id);
    });
  }, { passive: true });

  // ---------------------------------------------------- project filters
  var filterBar = document.getElementById("filters");
  var projectCards = Array.prototype.slice.call(
    document.querySelectorAll("#projects .card, #projects .mini")
  );
  var subhead = document.getElementById("subhead-smaller");
  var filterEmpty = document.getElementById("filter-empty");

  filterBar.addEventListener("click", function (e) {
    var chip = e.target.closest(".chip");
    if (!chip) return;
    var want = chip.getAttribute("data-filter");

    filterBar.querySelectorAll(".chip").forEach(function (c) {
      c.classList.toggle("active", c === chip);
    });

    var shown = 0;
    var miniShown = 0;
    projectCards.forEach(function (card) {
      var tags = (card.getAttribute("data-filters") || "").split(" ");
      var match = want === "all" || tags.indexOf(want) !== -1;
      card.classList.toggle("hide", !match);
      if (match) {
        shown++;
        if (card.classList.contains("mini")) miniShown++;
        card.classList.remove("fade-in");
        void card.offsetWidth;             // restart the entrance animation
        card.classList.add("fade-in");
      }
    });

    subhead.hidden = miniShown === 0;
    filterEmpty.hidden = shown !== 0;
  });

  // ------------------------------------------------- command palette
  var palette = document.getElementById("palette");
  var paletteQ = document.getElementById("palette-q");
  var paletteResults = document.getElementById("palette-results");
  var isMac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
  document.getElementById("cmdk-hint").textContent = isMac ? "⌘ K" : "Ctrl K";

  // Built from the DOM so it can never drift out of sync with the page.
  function buildCommands() {
    var list = [];

    sections.forEach(function (s) {
      var h = s.querySelector("h2");
      var num = h && h.querySelector(".num");
      list.push({
        group: isTh() ? "ไปยังส่วน" : "Jump to",
        icon: num ? num.textContent.trim() : "#",
        title: langText(h) || s.id,
        sub: "#" + s.id,
        run: function () {
          document.getElementById(s.id).scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
        }
      });
    });

    projectCards.forEach(function (card) {
      var pill = card.querySelector(".pill");
      list.push({
        group: isTh() ? "ผลงาน" : "Projects",
        icon: pill ? pill.textContent.trim() : "•",
        title: card.getAttribute("data-name") || langText(card.querySelector("h3")),
        sub: langText(card.querySelector("h3")),
        run: function () {
          card.classList.remove("hide");
          card.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
        }
      });
    });

    document.querySelectorAll("[data-view]").forEach(function (el) {
      if (el.classList.contains("shot")) return;   // thumbnails duplicate their card
      var scope = el.closest(".card, .mini");
      list.push({
        group: isTh() ? "เอกสาร" : "Documents",
        icon: el.getAttribute("data-type") === "img" ? "IMG" : "PDF",
        title: (isTh() ? el.getAttribute("data-title-th") : el.getAttribute("data-title-en")) || el.getAttribute("data-view"),
        sub: scope ? (scope.getAttribute("data-name") || "") : "Résumé",
        run: function () { el.click(); }
      });
    });

    return list;
  }

  var commands = [];
  var results = [];
  var selected = 0;

  function score(item, q) {
    if (!q) return 1;
    var hay = (item.title + " " + item.sub + " " + item.group).toLowerCase();
    if (hay.indexOf(q) !== -1) return 3;
    // Subsequence match, so "scr" still finds "SCARA Robot".
    var i = 0;
    for (var c = 0; c < hay.length && i < q.length; c++) {
      if (hay[c] === q[i]) i++;
    }
    return i === q.length ? 1 : 0;
  }

  function renderPalette() {
    var q = paletteQ.value.trim().toLowerCase();
    results = commands
      .map(function (item) { return { item: item, s: score(item, q) }; })
      .filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .map(function (r) { return r.item; });

    paletteResults.innerHTML = "";
    if (!results.length) {
      var none = document.createElement("p");
      none.className = "palette-empty";
      none.textContent = isTh() ? "ไม่พบสิ่งที่ค้นหา" : "No matches";
      paletteResults.appendChild(none);
      return;
    }

    selected = Math.min(selected, results.length - 1);
    var lastGroup = null;
    results.forEach(function (item, i) {
      if (item.group !== lastGroup) {
        var g = document.createElement("div");
        g.className = "palette-group";
        g.textContent = item.group;
        paletteResults.appendChild(g);
        lastGroup = item.group;
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "palette-item" + (i === selected ? " sel" : "");
      btn.innerHTML =
        '<span class="ico"></span><span class="txt"><b></b><small></small></span>';
      btn.querySelector(".ico").textContent = item.icon;
      btn.querySelector("b").textContent = item.title;
      btn.querySelector("small").textContent = item.sub;
      btn.addEventListener("click", function () { closePalette(); item.run(); });
      btn.addEventListener("pointerenter", function () {
        selected = i;
        paletteResults.querySelectorAll(".palette-item").forEach(function (n, k) {
          n.classList.toggle("sel", k === i);
        });
      });
      paletteResults.appendChild(btn);
    });
  }

  function openPalette() {
    commands = buildCommands();
    paletteQ.value = "";
    paletteQ.placeholder = isTh()
      ? "ค้นหาผลงาน เอกสาร หรือหัวข้อ…"
      : "Search projects, documents or sections…";
    selected = 0;
    renderPalette();
    palette.hidden = false;
    body.classList.add("locked");
    paletteQ.focus();
  }

  function closePalette() {
    palette.hidden = true;
    if (viewer.hidden) body.classList.remove("locked");
  }

  document.getElementById("cmdk-open").addEventListener("click", openPalette);
  palette.addEventListener("click", function (e) {
    if (e.target.closest("[data-palette-close]")) closePalette();
  });
  paletteQ.addEventListener("input", function () { selected = 0; renderPalette(); });

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      palette.hidden ? openPalette() : closePalette();
      return;
    }
    if (palette.hidden) return;

    if (e.key === "Escape") { e.preventDefault(); closePalette(); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      selected = (selected + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      renderPalette();
      var sel = paletteResults.querySelector(".sel");
      if (sel) sel.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter" && results[selected]) {
      e.preventDefault();
      var run = results[selected].run;
      closePalette();
      run();
    }
  });

  // ------------------------------------------------------- boot screen
  var boot = document.getElementById("boot");
  var bootBar = document.getElementById("boot-bar");
  var bootStatus = document.getElementById("boot-status");
  var steps = ["INITIALISING", "LOADING PROJECTS", "RENDERING", "READY"];
  var pct = 0;
  var bootTimer = setInterval(function () {
    pct = Math.min(pct + 8 + Math.random() * 14, 100);
    bootBar.style.width = pct + "%";
    bootStatus.textContent = steps[Math.min(Math.floor(pct / 26), steps.length - 1)];
    if (pct >= 100) {
      clearInterval(bootTimer);
      setTimeout(function () { boot.classList.add("done"); }, 220);
    }
  }, 110);
  // Never let a stalled timer trap the visitor behind the boot screen.
  setTimeout(function () { clearInterval(bootTimer); boot.classList.add("done"); }, 3500);

  if (reduced) return;

  // ------------------------------------------------ contextual cursor label
  var cursorLabel = document.getElementById("cursor-label");
  document.querySelectorAll("[data-view]").forEach(function (el) {
    el.addEventListener("pointerenter", function () {
      cursorLabel.textContent = el.getAttribute("data-type") === "img"
        ? (isTh() ? "ดูรูป" : "VIEW")
        : (isTh() ? "เปิดอ่าน" : "READ");
      cursorLabel.classList.add("on");
    });
    el.addEventListener("pointerleave", function () { cursorLabel.classList.remove("on"); });
  });
  window.addEventListener("pointermove", function (e) {
    cursorLabel.style.transform = "translate(" + (e.clientX + 34) + "px," + (e.clientY - 26) + "px) translate(-50%,-50%)";
  }, { passive: true });

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

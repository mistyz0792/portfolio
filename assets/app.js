/* Language and theme toggles. Both persist in localStorage. */
(function () {
  "use strict";

  var root = document.documentElement;
  var langBtn = document.getElementById("lang-toggle");
  var themeBtn = document.getElementById("theme-toggle");

  // --- language ---------------------------------------------------------
  function setLang(lang) {
    root.setAttribute("data-lang", lang);
    root.setAttribute("lang", lang);
    // The button shows the language you can switch TO.
    langBtn.textContent = lang === "th" ? "EN" : "ไทย";
    try { localStorage.setItem("portfolio-lang", lang); } catch (e) {}
  }

  var savedLang;
  try { savedLang = localStorage.getItem("portfolio-lang"); } catch (e) {}
  if (!savedLang) {
    savedLang = (navigator.language || "").toLowerCase().indexOf("th") === 0 ? "th" : "en";
  }
  setLang(savedLang);

  langBtn.addEventListener("click", function () {
    setLang(root.getAttribute("data-lang") === "th" ? "en" : "th");
  });

  // --- theme ------------------------------------------------------------
  function setTheme(theme) {
    if (theme) {
      root.setAttribute("data-theme", theme);
      try { localStorage.setItem("portfolio-theme", theme); } catch (e) {}
    } else {
      root.removeAttribute("data-theme");
      try { localStorage.removeItem("portfolio-theme"); } catch (e) {}
    }
  }

  var savedTheme;
  try { savedTheme = localStorage.getItem("portfolio-theme"); } catch (e) {}
  if (savedTheme) setTheme(savedTheme);

  themeBtn.addEventListener("click", function () {
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var current = root.getAttribute("data-theme") || (prefersDark ? "dark" : "light");
    setTheme(current === "dark" ? "light" : "dark");
  });
})();

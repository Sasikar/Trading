(function () {
  function $(id) { return document.getElementById(id); }
  function show(on) {
    var p = $("etf-live-panel");
    if (!p) return;
    if (!on) {
      p.style.display = "none";
      p.classList.remove("on");
      return;
    }
    document.querySelectorAll(".trend-panel, .struct-trend-panel").forEach(function (el) {
      if (el.id === "etf-live-panel") return;
      el.style.display = "none";
      el.classList.remove("on");
    });
    ["tf-panels", "memegate-panel", "coin-panel", "antifomo-panel", "signal-panel"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.style.display = "none";
      el.classList.add("hidden");
    });
    p.style.display = "block";
    p.classList.add("on");
    var frame = $("etf-live-frame");
    if (frame && (!frame.getAttribute("src") || frame.getAttribute("src") === "about:blank")) {
      frame.setAttribute("src", "pulse.html?view=etf");
    }
    if (p.scrollIntoView) p.scrollIntoView({ block: "start" });
  }
  window.showEtfLive = show;
  var tabs = $("tf-tabs");
  if (tabs) tabs.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest && ev.target.closest("[data-tf]");
    if (!b || b.getAttribute("data-tf") === "etflive") return;
    show(false);
  }, true);
})();

/* SOFT SKILL ZONE — small shared UI helpers */
(function () {
  function toast(message, type) {
    var el = document.createElement("div");
    el.className = "toast " + (type || "");
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("show"); });
    setTimeout(function () {
      el.classList.remove("show");
      setTimeout(function () { el.remove(); }, 350);
    }, type === "err" ? 4200 : 2800);
  }

  function inr(n) {
    n = Number(n) || 0;
    return "₹" + n.toLocaleString("en-IN");
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // reveal-on-scroll
  function initReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (e) { e.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function (e) { io.observe(e); });
  }

  window.UI = { toast: toast, inr: inr, esc: esc, initReveal: initReveal };
})();

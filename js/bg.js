/* SOFT SKILL ZONE — animated particle-network background
 * Cyan/gold dots drifting on navy, connected by lines, with subtle
 * mouse interaction. Dependency-free, performance-aware.
 */
(function () {
  var canvas = document.getElementById("bg-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var w, h, particles, mouse = { x: -9999, y: -9999 };

  // brand colours for dots
  var COLORS = ["52,200,232", "52,200,232", "52,200,232", "232,176,75"]; // mostly cyan, some gold

  function count() {
    var area = window.innerWidth * window.innerHeight;
    var n = Math.round(area / 14000);          // density
    return Math.max(28, Math.min(n, 110));     // clamp
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  function makeParticles() {
    particles = [];
    var n = count();
    for (var i = 0; i < n; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: rand(-0.25, 0.25),
        vy: rand(-0.25, 0.25),
        r: rand(1, 2.4),
        c: COLORS[Math.floor(Math.random() * COLORS.length)]
      });
    }
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * DPR;
    canvas.height = h * DPR;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    makeParticles();
  }

  var LINK = 130;        // max distance to draw a link
  var LINK2 = LINK * LINK;
  var MOUSE = 170;
  var MOUSE2 = MOUSE * MOUSE;

  function frame() {
    ctx.clearRect(0, 0, w, h);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy;
      // wrap around edges
      if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;

      // dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + p.c + ",0.65)";
      ctx.fill();

      // link to mouse
      var mdx = p.x - mouse.x, mdy = p.y - mouse.y;
      var md2 = mdx * mdx + mdy * mdy;
      if (md2 < MOUSE2) {
        var ma = (1 - md2 / MOUSE2) * 0.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y);
        ctx.strokeStyle = "rgba(52,200,232," + ma.toFixed(3) + ")";
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      // links to neighbours
      for (var j = i + 1; j < particles.length; j++) {
        var q = particles[j];
        var dx = p.x - q.x, dy = p.y - q.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < LINK2) {
          var a = (1 - d2 / LINK2) * 0.22;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = "rgba(120,180,230," + a.toFixed(3) + ")";
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(frame);
  }

  // respect reduced-motion preference
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    resize();
    // draw a single static frame
    ctx.clearRect(0, 0, w, h);
    particles.forEach(function (p) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + p.c + ",0.5)"; ctx.fill();
    });
    return;
  }

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("mousemove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  window.addEventListener("mouseleave", function () { mouse.x = -9999; mouse.y = -9999; });

  resize();
  requestAnimationFrame(frame);
})();

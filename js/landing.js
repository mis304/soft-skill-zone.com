/* SOFT SKILL ZONE — landing page logic */
(function () {
  document.getElementById("year").textContent = new Date().getFullYear();
  document.getElementById("workshopBtn").href = (window.CONFIG && CONFIG.WORKSHOP_URL) || "#";

  // mobile nav
  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");
  toggle.addEventListener("click", function () { links.classList.toggle("open"); });
  links.addEventListener("click", function (e) {
    if (e.target.tagName === "A") links.classList.remove("open");
  });

  UI.initReveal();

  var FEATURED_WORKSHOP_ID = 8; // shown separately as featured card

  function courseCard(c) {
    return (
      '<div class="course-card reveal">' +
        '<span class="course-badge">' + UI.esc(c.category) + "</span>" +
        "<h3>" + UI.esc(c.name) + "</h3>" +
        '<p class="course-outcome">' + UI.esc(c.outcome) + "</p>" +
        '<div class="course-meta">' +
          '<span class="course-dur">⏱ ' + UI.esc(c.duration) + "</span>" +
          '<span class="course-fee">' + UI.inr(c.fee) + "</span>" +
        "</div>" +
        '<a href="#contact" class="course-btn enquire-btn" data-course="' + UI.esc(c.name) + '">Enquire →</a>' +
      "</div>"
    );
  }

  function fillCourseSelect(courses) {
    var sel = document.getElementById("enqCourse");
    courses.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.name; o.textContent = c.name;
      sel.appendChild(o);
    });
  }

  async function loadCourses() {
    var grid = document.getElementById("coursesGrid");
    try {
      var courses = await api("listCourses");
      fillCourseSelect(courses);
      var listed = courses.filter(function (c) { return Number(c.courseId) !== FEATURED_WORKSHOP_ID; });
      if (!listed.length) { grid.innerHTML = '<div class="empty">No courses available right now.</div>'; return; }
      grid.innerHTML = listed.map(courseCard).join("");
      UI.initReveal();
      grid.querySelectorAll(".enquire-btn").forEach(function (b) {
        b.addEventListener("click", function () {
          document.getElementById("enqCourse").value = b.getAttribute("data-course");
        });
      });
    } catch (err) {
      grid.innerHTML = '<div class="empty">Could not load courses.<br><span class="muted">' + UI.esc(err.message) + "</span></div>";
    }
  }

  function initEnquiry() {
    var form = document.getElementById("enquiryForm");
    var btn = document.getElementById("enqSubmit");
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var name = document.getElementById("enqName").value.trim();
      var phone = document.getElementById("enqPhone").value.trim();
      var course = document.getElementById("enqCourse").value;
      if (!name || !phone) { UI.toast("Name and phone are required", "err"); return; }
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Sending…';
      try {
        await api("submitEnquiry", { name: name, phone: phone, course: course });
        UI.toast("Enquiry submitted! We'll call you back. 🎉", "ok");
        form.reset();
      } catch (err) {
        UI.toast(err.message || "Could not submit enquiry", "err");
      } finally {
        btn.disabled = false; btn.textContent = "Submit Enquiry";
      }
    });
  }

  loadCourses();
  initEnquiry();
})();

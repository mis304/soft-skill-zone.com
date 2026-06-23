/* SOFT SKILL ZONE — admin dashboard */
(function () {
  if (!Auth.require("admin")) return;

  document.getElementById("hello").textContent = "Logged in as " + Auth.getName();

  var coursesCache = [];          // active courses for dropdowns
  var currentStudentCode = null;  // student in the detail/payment context

  /* ---------- navigation ---------- */
  var sidebar = document.getElementById("sidebar");
  var backdrop = document.getElementById("backdrop");
  function closeSidebar() { sidebar.classList.remove("open"); backdrop.classList.remove("show"); }
  document.getElementById("menuBtn").addEventListener("click", function () {
    sidebar.classList.toggle("open"); backdrop.classList.toggle("show");
  });
  backdrop.addEventListener("click", closeSidebar);

  var titles = { dashboard: "Dashboard", students: "Students", courses: "Courses" };
  function showView(view) {
    ["dashboard", "students", "courses"].forEach(function (v) {
      document.getElementById("view-" + v).classList.toggle("hide", v !== view);
    });
    document.querySelectorAll(".side-link[data-view]").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-view") === view);
    });
    document.getElementById("viewTitle").textContent = titles[view];
    closeSidebar();
    if (view === "dashboard") loadDashboard();
    if (view === "students") loadStudents("");
    if (view === "courses") loadCourses();
  }
  document.querySelectorAll(".side-link[data-view]").forEach(function (el) {
    el.addEventListener("click", function () { showView(el.getAttribute("data-view")); });
  });
  document.getElementById("sideLogout").addEventListener("click", function () {
    Auth.logout(); location.href = "login.html";
  });

  /* ---------- generic modal close ---------- */
  document.querySelectorAll(".modal-backdrop").forEach(function (m) {
    m.addEventListener("click", function (e) {
      if (e.target === m || e.target.hasAttribute("data-close")) m.classList.remove("show");
    });
  });
  function openModal(id) { document.getElementById(id).classList.add("show"); }
  function closeModal(id) { document.getElementById(id).classList.remove("show"); }

  function apiError(err) {
    if (/session|authenticat|expired/i.test(err.message)) { Auth.logout(); location.href = "login.html"; return; }
    UI.toast(err.message || "Something went wrong", "err");
  }

  /* ===================== DASHBOARD ===================== */
  async function loadDashboard() {
    var grid = document.getElementById("statGrid");
    grid.innerHTML = '<div class="loading"><span class="spinner"></span> Loading…</div>';
    try {
      var d = await api("adminDashboard");
      grid.innerHTML =
        stat("Total Students", d.totalStudents, "cyan") +
        stat("Fee Collected", UI.inr(d.totalCollected), "green") +
        stat("Fee Pending", UI.inr(d.totalPending), "red") +
        stat("Active Courses", d.activeCourses, "gold");
      renderChart(d.studentsPerCourse || []);
    } catch (err) {
      grid.innerHTML = '<div class="empty">' + UI.esc(err.message) + "</div>";
      apiError(err);
    }
  }
  function stat(label, value, cls) {
    return '<div class="stat ' + cls + '"><div class="label">' + label + '</div><div class="value">' + UI.esc(value) + "</div></div>";
  }
  function renderChart(rows) {
    var chart = document.getElementById("chart");
    if (!rows.length) { chart.innerHTML = '<div class="empty">No students enrolled yet.</div>'; return; }
    var max = Math.max.apply(null, rows.map(function (r) { return r.students; }));
    chart.innerHTML = rows.map(function (r) {
      var w = max ? Math.round((r.students / max) * 100) : 0;
      return '<div class="bar-row">' +
        '<span class="lbl" title="' + UI.esc(r.name) + '">' + UI.esc(r.name) + "</span>" +
        '<div class="bar-track"><div class="bar-fill" style="width:' + w + '%"></div></div>' +
        '<span class="cnt">' + r.students + "</span>" +
      "</div>";
    }).join("");
  }

  /* ===================== STUDENTS ===================== */
  var searchTimer = null;
  document.getElementById("searchBox").addEventListener("input", function (e) {
    clearTimeout(searchTimer);
    var q = e.target.value;
    searchTimer = setTimeout(function () { loadStudents(q); }, 300);
  });

  async function loadStudents(query) {
    var body = document.getElementById("studentsBody");
    body.innerHTML = '<tr><td colspan="8" class="loading"><span class="spinner"></span> Loading…</td></tr>';
    try {
      var list = await api("searchStudents", { query: query || "" });
      if (!list.length) { body.innerHTML = '<tr><td colspan="8" class="empty">No students found.</td></tr>'; return; }
      body.innerHTML = list.map(function (s) {
        var pill = s.status === "Paid" ? '<span class="pill paid">Paid</span>' : '<span class="pill pending">Pending</span>';
        return '<tr class="clickable" data-code="' + UI.esc(s.studentCode) + '">' +
          "<td>" + UI.esc(s.studentCode) + "</td>" +
          "<td>" + UI.esc(s.fullName) + "</td>" +
          "<td>" + UI.esc(s.phone) + "</td>" +
          "<td>" + UI.esc(s.course) + "</td>" +
          "<td>" + UI.inr(s.total) + "</td>" +
          "<td>" + UI.inr(s.paid) + "</td>" +
          "<td>" + UI.inr(s.pending) + "</td>" +
          "<td>" + pill + "</td>" +
        "</tr>";
      }).join("");
      body.querySelectorAll("tr.clickable").forEach(function (tr) {
        tr.addEventListener("click", function () { openDetail(tr.getAttribute("data-code")); });
      });
    } catch (err) {
      body.innerHTML = '<tr><td colspan="8" class="empty">' + UI.esc(err.message) + "</td></tr>";
      apiError(err);
    }
  }

  /* ---------- Add Student ---------- */
  document.getElementById("addStudentBtn").addEventListener("click", async function () {
    await ensureCourses();
    var sel = document.getElementById("asCourse");
    sel.innerHTML = coursesCache.map(function (c) {
      return '<option value="' + c.courseId + '" data-fee="' + c.fee + '">' + UI.esc(c.name) + "</option>";
    }).join("");
    syncFee();
    openModal("addStudentModal");
  });
  function syncFee() {
    var sel = document.getElementById("asCourse");
    var opt = sel.options[sel.selectedIndex];
    if (opt) document.getElementById("asFee").value = opt.getAttribute("data-fee") || "";
  }
  document.getElementById("asCourse").addEventListener("change", syncFee);

  document.getElementById("addStudentForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = document.getElementById("asSubmit");
    var payload = {
      fullName: document.getElementById("asName").value.trim(),
      email: document.getElementById("asEmail").value.trim(),
      phone: document.getElementById("asPhone").value.trim(),
      courseId: document.getElementById("asCourse").value,
      totalFee: document.getElementById("asFee").value,
      joinDate: document.getElementById("asDate").value
    };
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Creating…';
    try {
      var res = await api("addStudent", payload);
      UI.toast("Student created: " + res.studentCode + " (email sent)", "ok");
      closeModal("addStudentModal");
      document.getElementById("addStudentForm").reset();
      loadStudents("");
    } catch (err) {
      apiError(err);
    } finally {
      btn.disabled = false; btn.textContent = "Create Student & Send Email";
    }
  });

  /* ---------- Student Detail + ledger ---------- */
  async function openDetail(code) {
    currentStudentCode = code;
    openModal("detailModal");
    var box = document.getElementById("detailBody");
    box.innerHTML = '<div class="loading"><span class="spinner"></span> Loading…</div>';
    try {
      var d = await api("studentDetail", { studentCode: code });
      var pendingClear = d.fee.pending <= 0;
      var ledger = d.payments.length
        ? d.payments.map(function (p) {
            return "<tr><td>" + UI.esc(p.date) + "</td><td>" + UI.inr(p.amount) + "</td><td>" + UI.esc(p.mode) + "</td><td>" + UI.esc(p.receiptNo) + "</td></tr>";
          }).join("")
        : '<tr><td colspan="4" class="empty">No payments yet.</td></tr>';

      box.innerHTML =
        '<h2 style="margin-bottom:4px;">' + UI.esc(d.fullName) + '</h2>' +
        '<p class="muted" style="margin-bottom:16px;">' + UI.esc(d.studentCode) + " · " + UI.esc(d.course.name || "—") + "</p>" +
        '<div class="stat-grid" style="margin-bottom:18px;">' +
          '<div class="stat"><div class="label">Email</div><div class="value" style="font-size:14px;">' + UI.esc(d.email || "—") + '</div></div>' +
          '<div class="stat"><div class="label">Phone</div><div class="value" style="font-size:16px;">' + UI.esc(d.phone || "—") + '</div></div>' +
        '</div>' +
        '<div class="fee-summary" style="margin-bottom:18px;">' +
          '<div class="fee-box total"><div class="l">Total</div><div class="v">' + UI.inr(d.fee.total) + '</div></div>' +
          '<div class="fee-box paid"><div class="l">Paid</div><div class="v">' + UI.inr(d.fee.paid) + '</div></div>' +
          '<div class="fee-box pending ' + (pendingClear ? "clear" : "") + '"><div class="l">Pending</div><div class="v">' + (pendingClear ? "₹0 ✓" : UI.inr(d.fee.pending)) + '</div></div>' +
        '</div>' +
        '<div class="table-wrap"><table class="data" style="min-width:0;">' +
          '<thead><tr><th>Date</th><th>Amount</th><th>Mode</th><th>Receipt</th></tr></thead>' +
          "<tbody>" + ledger + "</tbody></table></div>" +
        '<button class="btn btn-gold btn-block mt2" id="openPayBtn">+ Record Payment</button>';

      document.getElementById("openPayBtn").addEventListener("click", function () {
        document.getElementById("payFor").textContent = d.fullName + " · Pending: " + (pendingClear ? "₹0" : UI.inr(d.fee.pending));
        document.getElementById("payAmount").value = pendingClear ? "" : d.fee.pending;
        closeModal("detailModal");
        openModal("payModal");
      });
    } catch (err) {
      box.innerHTML = '<div class="empty">' + UI.esc(err.message) + "</div>";
      apiError(err);
    }
  }

  /* ---------- Record Payment ---------- */
  document.getElementById("payForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = document.getElementById("paySubmit");
    var payload = {
      studentCode: currentStudentCode,
      amount: document.getElementById("payAmount").value,
      mode: document.getElementById("payMode").value,
      date: document.getElementById("payDate").value
    };
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Recording…';
    try {
      var res = await api("recordPayment", payload);
      UI.toast("Payment recorded · Receipt " + res.receiptNo + " (email sent)", "ok");
      closeModal("payModal");
      document.getElementById("payForm").reset();
      loadStudents(document.getElementById("searchBox").value);
      openDetail(currentStudentCode);
    } catch (err) {
      apiError(err);
    } finally {
      btn.disabled = false; btn.textContent = "Record & Email Receipt";
    }
  });

  /* ===================== COURSES ===================== */
  async function ensureCourses() {
    var active = await api("listCourses");
    coursesCache = active;
    return active;
  }

  async function loadCourses() {
    var body = document.getElementById("coursesBody");
    body.innerHTML = '<tr><td colspan="7" class="loading"><span class="spinner"></span> Loading…</td></tr>';
    try {
      var list = await api("listCoursesAdmin");
      body.innerHTML = list.map(function (c) {
        var pill = c.active ? '<span class="pill paid">Active</span>' : '<span class="pill pending">Inactive</span>';
        return "<tr>" +
          "<td>" + UI.esc(c.courseId) + "</td>" +
          "<td>" + UI.esc(c.name) + "</td>" +
          "<td>" + UI.esc(c.category) + "</td>" +
          "<td>" + UI.esc(c.duration) + "</td>" +
          "<td>" + UI.inr(c.fee) + "</td>" +
          "<td>" + pill + "</td>" +
          '<td><button class="btn btn-ghost btn-sm edit-course" data-id="' + c.courseId + '">Edit</button></td>' +
        "</tr>";
      }).join("");
      body.querySelectorAll(".edit-course").forEach(function (b) {
        b.addEventListener("click", function () {
          var c = list.filter(function (x) { return String(x.courseId) === b.getAttribute("data-id"); })[0];
          openCourseForm(c);
        });
      });
    } catch (err) {
      body.innerHTML = '<tr><td colspan="7" class="empty">' + UI.esc(err.message) + "</td></tr>";
      apiError(err);
    }
  }

  document.getElementById("addCourseBtn").addEventListener("click", function () { openCourseForm(null); });

  function openCourseForm(c) {
    document.getElementById("courseModalTitle").textContent = c ? "Edit Course" : "Add Course";
    document.getElementById("cId").value = c ? c.courseId : "";
    document.getElementById("cName").value = c ? c.name : "";
    document.getElementById("cCategory").value = c ? c.category : "";
    document.getElementById("cOutcome").value = c ? c.outcome : "";
    document.getElementById("cDuration").value = c ? c.duration : "";
    document.getElementById("cFee").value = c ? c.fee : "";
    document.getElementById("cActive").checked = c ? !!c.active : true;
    openModal("courseModal");
  }

  document.getElementById("courseForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = document.getElementById("cSubmit");
    var payload = {
      courseId: document.getElementById("cId").value || "",
      name: document.getElementById("cName").value.trim(),
      category: document.getElementById("cCategory").value.trim(),
      outcome: document.getElementById("cOutcome").value.trim(),
      duration: document.getElementById("cDuration").value.trim(),
      fee: document.getElementById("cFee").value,
      active: document.getElementById("cActive").checked
    };
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
    try {
      await api("saveCourse", payload);
      UI.toast("Course saved ✓", "ok");
      closeModal("courseModal");
      loadCourses();
    } catch (err) {
      apiError(err);
    } finally {
      btn.disabled = false; btn.textContent = "Save Course";
    }
  });

  /* ---------- boot ---------- */
  showView("dashboard");
})();

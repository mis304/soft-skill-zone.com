/* SOFT SKILL ZONE — student dashboard */
(function () {
  if (!Auth.require("student")) return;

  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("logoutMobile").addEventListener("click", logout);
  function logout() { Auth.logout(); location.href = "login.html"; }

  function paymentRows(payments) {
    if (!payments.length) {
      return '<tr><td colspan="4" class="empty">No payments recorded yet.</td></tr>';
    }
    return payments.map(function (p) {
      return "<tr>" +
        "<td>" + UI.esc(p.date) + "</td>" +
        "<td>" + UI.inr(p.amount) + "</td>" +
        "<td>" + UI.esc(p.mode) + "</td>" +
        "<td>" + UI.esc(p.receiptNo) + "</td>" +
      "</tr>";
    }).join("");
  }

  function render(d) {
    document.getElementById("hello").textContent =
      "Welcome, " + d.fullName + " · " + d.studentCode;

    var pendingClear = d.fee.pending <= 0;
    var html =
      '<div class="stat-grid">' +
        '<div class="stat"><div class="label">Student ID</div><div class="value" style="font-size:22px;">' + UI.esc(d.studentCode) + '</div></div>' +
        '<div class="stat cyan"><div class="label">Enrolled Course</div><div class="value" style="font-size:18px;">' + UI.esc(d.course.name || "—") + '</div><div class="muted" style="font-size:13px;">' + UI.esc(d.course.duration || "") + '</div></div>' +
        '<div class="stat gold"><div class="label">Join Date</div><div class="value" style="font-size:20px;">' + UI.esc(d.joinDate || "—") + '</div></div>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>Fee Summary</h2>' +
        '<div class="fee-summary">' +
          '<div class="fee-box total"><div class="l">Total Fee</div><div class="v">' + UI.inr(d.fee.total) + '</div></div>' +
          '<div class="fee-box paid"><div class="l">Paid</div><div class="v">' + UI.inr(d.fee.paid) + '</div></div>' +
          '<div class="fee-box pending ' + (pendingClear ? "clear" : "") + '"><div class="l">Pending</div><div class="v">' + (pendingClear ? "₹0 ✓" : UI.inr(d.fee.pending)) + '</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>Payment History</h2>' +
        '<div class="table-wrap"><table class="data">' +
          '<thead><tr><th>Date</th><th>Amount</th><th>Mode</th><th>Receipt No</th></tr></thead>' +
          '<tbody>' + paymentRows(d.payments) + '</tbody>' +
        '</table></div>' +
      '</div>';

    document.getElementById("content").innerHTML = html;
  }

  async function load() {
    try {
      var data = await api("myData");
      render(data);
    } catch (err) {
      if (/session|authenticat/i.test(err.message)) { Auth.logout(); location.href = "login.html"; return; }
      document.getElementById("content").innerHTML =
        '<div class="empty">Could not load your dashboard.<br><span class="muted">' + UI.esc(err.message) + "</span></div>";
    }
  }

  // ---- change password modal ----
  var modal = document.getElementById("pwModal");
  document.getElementById("changePwBtn").addEventListener("click", function () { modal.classList.add("show"); });
  modal.addEventListener("click", function (e) {
    if (e.target === modal || e.target.hasAttribute("data-close")) modal.classList.remove("show");
  });
  document.getElementById("pwForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = document.getElementById("pwSubmit");
    var oldP = document.getElementById("oldPw").value;
    var newP = document.getElementById("newPw").value;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Updating…';
    try {
      await api("changePassword", { oldPassword: oldP, newPassword: newP });
      UI.toast("Password updated ✓", "ok");
      modal.classList.remove("show");
      document.getElementById("pwForm").reset();
    } catch (err) {
      UI.toast(err.message || "Could not change password", "err");
    } finally {
      btn.disabled = false; btn.textContent = "Update Password";
    }
  });

  load();
})();

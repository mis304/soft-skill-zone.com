/* SOFT SKILL ZONE — client-side session helpers (localStorage)
 * The token is the only thing the server trusts; role/name/studentCode here
 * are just for UI convenience and are re-derived server-side on every call.
 */
(function () {
  var KEY = "ssz_session";

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }

  var Auth = {
    save: function (session) {
      localStorage.setItem(KEY, JSON.stringify({
        token: session.token,
        role: session.role,
        name: session.name,
        studentCode: session.studentCode
      }));
    },
    getToken: function () { return read().token || null; },
    getRole: function () { return read().role || null; },
    getName: function () { return read().name || ""; },
    getStudentCode: function () { return read().studentCode || ""; },
    isLoggedIn: function () { return !!read().token; },
    logout: function () { localStorage.removeItem(KEY); },

    // Guard a page: redirect to login if not allowed. role = 'admin' | 'student'
    require: function (role) {
      if (!this.isLoggedIn()) { location.href = "login.html"; return false; }
      if (role && this.getRole() !== role) {
        location.href = this.getRole() === "admin" ? "admin.html" : "student.html";
        return false;
      }
      return true;
    }
  };

  window.Auth = Auth;
})();

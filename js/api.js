/* SOFT SKILL ZONE — API client
 * CORS-safe calling convention for Apps Script Web Apps:
 *   fetch(POST) with Content-Type "text/plain;charset=utf-8" and a JSON string
 *   body (no custom headers → no CORS preflight). The token, if present, is
 *   attached automatically so the server can resolve identity + role.
 */
(function () {
  function apiUrl() {
    var url = window.CONFIG && window.CONFIG.API_URL;
    if (!url || url.indexOf("REPLACE_WITH") === 0) {
      throw new Error("API_URL not configured. Set it in js/config.js (see README).");
    }
    return url;
  }

  async function api(action, payload) {
    payload = payload || {};
    var token = window.Auth ? window.Auth.getToken() : null;
    var body = JSON.stringify(Object.assign({ action: action, token: token }, payload));

    var res = await fetch(apiUrl(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body,
      redirect: "follow"
    });

    var json;
    try {
      json = await res.json();
    } catch (e) {
      throw new Error("Server did not return valid JSON. Check the deployment URL.");
    }
    if (!json.ok) {
      var err = new Error(json.error || "Request failed");
      err.apiError = true;
      throw err;
    }
    return json.data;
  }

  window.api = api;
})();

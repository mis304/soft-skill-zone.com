/**
 * SOFT SKILL ZONE — Backend API (Google Apps Script Web App)
 * ----------------------------------------------------------
 * One Apps Script project bound to the spreadsheet, deployed as a Web App.
 * A single router (doPost/doGet) dispatches every action and returns JSON.
 *
 * Database = Google Sheets. One tab per "table" (see README §Schema):
 *   Courses      : CourseID | Name | Category | Outcome | Duration | Fee | Active
 *   Students     : StudentCode | FullName | Email | Phone | JoinDate | CourseID | TotalFee
 *   FeePayments  : ReceiptNo | StudentCode | Amount | Mode | PaidOn | RecordedBy
 *   Logins       : Email | PasswordHash | Salt | Role | StudentCode | CreatedAt
 *   Sessions     : Token | Email | Role | StudentCode | Expiry
 *   Enquiries    : Timestamp | Name | Phone | CourseInterest
 *
 * Security: passwords are SHA-256 + per-user salt. Every sensitive action is
 * gated by a session token; identity & role are derived SERVER-SIDE from the
 * token (never trusted from the client).
 */

/* ============================ CONFIG ============================ */

var INSTITUTE = {
  name: 'SOFT SKILL ZONE',
  tagline: 'Learn AI.. Lead Future.',
  phone: '6202856897',
  address: 'Near Gym Town, Mission Road Pakri, Ara, Bihar',
  // Where students log in (your deployed site). Update after deploy.
  loginUrl: 'https://YOUR-SITE.netlify.app/login.html'
};

var SESSION_DAYS = 7;        // session token validity
var YEAR_PREFIX  = 'SSZ2026'; // Student ID prefix, e.g. SSZ2026001

/* ============================ ROUTER ============================ */

function doGet(e) {
  // Public read actions can be served over GET so the landing page loads
  // without a token (e.g. listCourses).
  try {
    var action = (e && e.parameter && e.parameter.action) || 'ping';
    if (action === 'listCourses') return jsonOut(ok(handleListCourses()));
    if (action === 'ping')        return jsonOut(ok({ service: INSTITUTE.name, status: 'up' }));
    return jsonOut(fail('Unknown GET action: ' + action));
  } catch (err) {
    return jsonOut(fail(err.message || String(err)));
  }
}

function doPost(e) {
  try {
    var req = parseBody(e);
    var action = req.action;
    if (!action) return jsonOut(fail('Missing action'));

    switch (action) {
      /* ---- public ---- */
      case 'login':         return jsonOut(ok(handleLogin(req)));
      case 'listCourses':   return jsonOut(ok(handleListCourses()));
      case 'submitEnquiry': return jsonOut(ok(handleSubmitEnquiry(req)));

      /* ---- admin only ---- */
      case 'addStudent':     return jsonOut(ok(handleAddStudent(req)));
      case 'recordPayment':  return jsonOut(ok(handleRecordPayment(req)));
      case 'adminDashboard': return jsonOut(ok(handleAdminDashboard(req)));
      case 'searchStudents': return jsonOut(ok(handleSearchStudents(req)));
      case 'studentDetail':  return jsonOut(ok(handleStudentDetail(req)));
      case 'listCoursesAdmin': return jsonOut(ok(handleListCoursesAdmin(req)));
      case 'saveCourse':     return jsonOut(ok(handleSaveCourse(req)));

      /* ---- student (own data) ---- */
      case 'myData':         return jsonOut(ok(handleMyData(req)));

      /* ---- student or admin ---- */
      case 'changePassword': return jsonOut(ok(handleChangePassword(req)));

      default: return jsonOut(fail('Unknown action: ' + action));
    }
  } catch (err) {
    return jsonOut(fail(err.message || String(err)));
  }
}

/* ====================== REQUEST / RESPONSE ====================== */

function parseBody(e) {
  // CORS-safe convention: frontend posts text/plain with a JSON string body.
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (x) { /* fall through */ }
  }
  if (e && e.parameter) return e.parameter; // form-encoded fallback
  return {};
}

function ok(data)    { return { ok: true,  data: data === undefined ? null : data }; }
function fail(msg)   { return { ok: false, error: msg }; }

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ========================= SHEET HELPERS ======================= */

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet(name) {
  var sh = ss().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet tab: ' + name);
  return sh;
}

// Read a tab into an array of objects keyed by header row.
function readTable(name) {
  var values = sheet(name).getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    var blank = true;
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = values[r][c];
      if (values[r][c] !== '' && values[r][c] !== null) blank = false;
    }
    obj._row = r + 1; // 1-based sheet row number
    if (!blank) rows.push(obj);
  }
  return rows;
}

function headersOf(name) { return sheet(name).getRange(1, 1, 1, sheet(name).getLastColumn()).getValues()[0]; }

// Append an object as a row, mapping keys to the tab's header order.
function appendRow(name, obj) {
  var headers = headersOf(name);
  var row = headers.map(function (h) { return (obj[h] !== undefined && obj[h] !== null) ? obj[h] : ''; });
  sheet(name).appendRow(row);
}

/* =========================== AUTH ============================== */

function hashPassword(password, salt) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password) + String(salt));
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function newSalt()  { return Utilities.getUuid().replace(/-/g, ''); }
function newToken() { return Utilities.getUuid(); }

function findLogin(email) {
  var logins = readTable('Logins');
  email = String(email || '').trim().toLowerCase();
  for (var i = 0; i < logins.length; i++) {
    if (String(logins[i].Email).trim().toLowerCase() === email) return logins[i];
  }
  return null;
}

function createSession(login) {
  var token = newToken();
  var expiry = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  appendRow('Sessions', {
    Token: token,
    Email: login.Email,
    Role: login.Role,
    StudentCode: login.StudentCode || '',
    Expiry: expiry
  });
  return token;
}

// Resolve identity & role from the token ONLY. Returns the session or throws.
function requireSession(req) {
  var token = req && req.token;
  if (!token) throw new Error('Not authenticated');
  var sessions = readTable('Sessions');
  for (var i = 0; i < sessions.length; i++) {
    if (String(sessions[i].Token) === String(token)) {
      var exp = new Date(sessions[i].Expiry);
      if (exp.getTime() < Date.now()) throw new Error('Session expired, please log in again');
      return sessions[i];
    }
  }
  throw new Error('Invalid session');
}

function requireAdmin(req) {
  var s = requireSession(req);
  if (String(s.Role) !== 'admin') throw new Error('Admin access required');
  return s;
}

/* ========================= HANDLERS ============================ */

// --- public: login ---
function handleLogin(req) {
  var email = String(req.email || '').trim();
  var password = String(req.password || '');
  if (!email || !password) throw new Error('Email and password are required');

  var login = findLogin(email);
  if (!login) throw new Error('Invalid email or password');

  var computed = hashPassword(password, login.Salt);
  if (computed !== String(login.PasswordHash)) throw new Error('Invalid email or password');

  var token = createSession(login);
  var name = '';
  if (login.StudentCode) {
    var st = findStudent(login.StudentCode);
    name = st ? st.FullName : '';
  } else {
    name = 'Admin';
  }
  return { token: token, role: login.Role, studentCode: login.StudentCode || '', name: name };
}

// --- public: listCourses (active only, for landing page) ---
function handleListCourses() {
  var courses = readTable('Courses');
  return courses
    .filter(function (c) { return isTrue(c.Active); })
    .map(function (c) {
      return {
        courseId: c.CourseID,
        name: c.Name,
        category: c.Category,
        outcome: c.Outcome,
        duration: c.Duration,
        fee: Number(c.Fee) || 0
      };
    });
}

// --- admin: all courses incl. inactive ---
function handleListCoursesAdmin(req) {
  requireAdmin(req);
  return readTable('Courses').map(function (c) {
    return {
      courseId: c.CourseID,
      name: c.Name,
      category: c.Category,
      outcome: c.Outcome,
      duration: c.Duration,
      fee: Number(c.Fee) || 0,
      active: isTrue(c.Active),
      _row: c._row
    };
  });
}

// --- admin: add or edit a course ---
function handleSaveCourse(req) {
  requireAdmin(req);
  var name = String(req.name || '').trim();
  if (!name) throw new Error('Course name is required');
  var sh = sheet('Courses');

  if (req.courseId) {
    // edit existing
    var courses = readTable('Courses');
    for (var i = 0; i < courses.length; i++) {
      if (String(courses[i].CourseID) === String(req.courseId)) {
        var r = courses[i]._row;
        sh.getRange(r, 1, 1, 7).setValues([[
          req.courseId, name, req.category || '', req.outcome || '',
          req.duration || '', Number(req.fee) || 0, isTrue(req.active)
        ]]);
        return { courseId: req.courseId, updated: true };
      }
    }
    throw new Error('Course not found: ' + req.courseId);
  }

  // add new — next CourseID
  var maxId = 0;
  readTable('Courses').forEach(function (c) { var n = Number(c.CourseID) || 0; if (n > maxId) maxId = n; });
  var newId = maxId + 1;
  appendRow('Courses', {
    CourseID: newId, Name: name, Category: req.category || '', Outcome: req.outcome || '',
    Duration: req.duration || '', Fee: Number(req.fee) || 0,
    Active: (req.active === undefined) ? true : isTrue(req.active)
  });
  return { courseId: newId, created: true };
}

// --- public: submitEnquiry ---
function handleSubmitEnquiry(req) {
  var name = String(req.name || '').trim();
  var phone = String(req.phone || '').trim();
  var course = String(req.course || '').trim();
  if (!name || !phone) throw new Error('Name and phone are required');
  appendRow('Enquiries', {
    Timestamp: new Date(), Name: name, Phone: phone, CourseInterest: course
  });
  return { received: true };
}

// --- admin: addStudent ---
function handleAddStudent(req) {
  requireAdmin(req);
  var fullName = String(req.fullName || '').trim();
  var email = String(req.email || '').trim();
  var phone = String(req.phone || '').trim();
  var courseId = req.courseId;
  if (!fullName || !email || !courseId) throw new Error('Name, email and course are required');
  if (findLogin(email)) throw new Error('A login already exists for this email');

  var course = findCourse(courseId);
  if (!course) throw new Error('Invalid course');
  var totalFee = (req.totalFee !== undefined && req.totalFee !== '') ? Number(req.totalFee) : Number(course.Fee) || 0;
  var joinDate = req.joinDate ? new Date(req.joinDate) : new Date();

  var studentCode = nextStudentCode();
  var tempPassword = generatePassword();
  var salt = newSalt();
  var hash = hashPassword(tempPassword, salt);

  appendRow('Students', {
    StudentCode: studentCode, FullName: fullName, Email: email, Phone: phone,
    JoinDate: joinDate, CourseID: courseId, TotalFee: totalFee
  });
  appendRow('Logins', {
    Email: email, PasswordHash: hash, Salt: salt, Role: 'student',
    StudentCode: studentCode, CreatedAt: new Date()
  });

  sendWelcomeEmail(email, fullName, studentCode, tempPassword, course.Name, totalFee);
  return { studentCode: studentCode };
}

// --- admin: recordPayment ---
function handleRecordPayment(req) {
  var session = requireAdmin(req);
  var studentCode = String(req.studentCode || '').trim();
  var amount = Number(req.amount);
  var mode = String(req.mode || '').trim();
  if (!studentCode || !amount || amount <= 0) throw new Error('Student and a valid amount are required');

  var student = findStudent(studentCode);
  if (!student) throw new Error('Student not found');

  var paidOn = req.date ? new Date(req.date) : new Date();
  var receiptNo = nextReceiptNo();
  appendRow('FeePayments', {
    ReceiptNo: receiptNo, StudentCode: studentCode, Amount: amount,
    Mode: mode, PaidOn: paidOn, RecordedBy: session.Email
  });

  var newPaid = sumPaid(studentCode);
  var newPending = (Number(student.TotalFee) || 0) - newPaid;
  sendReceiptEmail(student.Email, student.FullName, receiptNo, amount, mode, paidOn, newPaid, newPending);
  return { receiptNo: receiptNo, newPaid: newPaid, newPending: newPending };
}

// --- admin: adminDashboard ---
function handleAdminDashboard(req) {
  requireAdmin(req);
  var students = readTable('Students');
  var courses = readTable('Courses');
  var payments = readTable('FeePayments');

  var totalCollected = 0;
  payments.forEach(function (p) { totalCollected += Number(p.Amount) || 0; });

  var totalFee = 0;
  students.forEach(function (s) { totalFee += Number(s.TotalFee) || 0; });
  var totalPending = totalFee - totalCollected;

  var courseName = {};
  courses.forEach(function (c) { courseName[String(c.CourseID)] = c.Name; });

  var perCourse = {};
  students.forEach(function (s) {
    var key = String(s.CourseID);
    perCourse[key] = (perCourse[key] || 0) + 1;
  });
  var byCourse = Object.keys(perCourse).map(function (cid) {
    return { courseId: cid, name: courseName[cid] || ('Course ' + cid), students: perCourse[cid] };
  });

  return {
    totalStudents: students.length,
    totalCollected: totalCollected,
    totalPending: totalPending < 0 ? 0 : totalPending,
    activeCourses: courses.filter(function (c) { return isTrue(c.Active); }).length,
    studentsPerCourse: byCourse
  };
}

// --- admin: searchStudents ---
function handleSearchStudents(req) {
  requireAdmin(req);
  var q = String(req.query || '').trim().toLowerCase();
  var students = readTable('Students');
  var courses = courseMap();

  var matched = students.filter(function (s) {
    if (!q) return true;
    return String(s.StudentCode).toLowerCase().indexOf(q) >= 0 ||
           String(s.FullName).toLowerCase().indexOf(q) >= 0 ||
           String(s.Phone).toLowerCase().indexOf(q) >= 0 ||
           String(s.Email).toLowerCase().indexOf(q) >= 0;
  });

  return matched.map(function (s) {
    var total = Number(s.TotalFee) || 0;
    var paid = sumPaid(s.StudentCode);
    var pending = total - paid;
    return {
      studentCode: s.StudentCode, fullName: s.FullName, email: s.Email, phone: s.Phone,
      course: courses[String(s.CourseID)] || '', total: total, paid: paid,
      pending: pending < 0 ? 0 : pending, status: pending <= 0 ? 'Paid' : 'Pending'
    };
  });
}

// --- admin: studentDetail ---
function handleStudentDetail(req) {
  requireAdmin(req);
  var code = String(req.studentCode || '').trim();
  var student = findStudent(code);
  if (!student) throw new Error('Student not found');
  return buildStudentView(student);
}

// --- student: myData (identity from token only) ---
function handleMyData(req) {
  var session = requireSession(req);
  if (!session.StudentCode) throw new Error('No student profile for this account');
  var student = findStudent(session.StudentCode);
  if (!student) throw new Error('Student record not found');
  return buildStudentView(student);
}

// --- student/admin: changePassword ---
function handleChangePassword(req) {
  var session = requireSession(req);
  var oldP = String(req.oldPassword || '');
  var newP = String(req.newPassword || '');
  if (!newP || newP.length < 6) throw new Error('New password must be at least 6 characters');

  var login = findLogin(session.Email);
  if (!login) throw new Error('Login not found');
  if (hashPassword(oldP, login.Salt) !== String(login.PasswordHash)) throw new Error('Current password is incorrect');

  var salt = newSalt();
  var hash = hashPassword(newP, salt);
  var sh = sheet('Logins');
  // PasswordHash = col 2, Salt = col 3 (per schema)
  sh.getRange(login._row, 2).setValue(hash);
  sh.getRange(login._row, 3).setValue(salt);
  return { changed: true };
}

/* ====================== DOMAIN HELPERS ======================== */

function buildStudentView(student) {
  var courses = courseMap();
  var courseDetail = findCourse(student.CourseID);
  var total = Number(student.TotalFee) || 0;
  var payments = readTable('FeePayments')
    .filter(function (p) { return String(p.StudentCode) === String(student.StudentCode); })
    .sort(function (a, b) { return new Date(a.PaidOn) - new Date(b.PaidOn); })
    .map(function (p) {
      return {
        receiptNo: p.ReceiptNo, amount: Number(p.Amount) || 0, mode: p.Mode,
        date: fmtDate(p.PaidOn)
      };
    });
  var paid = payments.reduce(function (sum, p) { return sum + p.amount; }, 0);
  var pending = total - paid;

  return {
    studentCode: student.StudentCode,
    fullName: student.FullName,
    email: student.Email,
    phone: student.Phone,
    joinDate: fmtDate(student.JoinDate),
    course: {
      name: courses[String(student.CourseID)] || '',
      duration: courseDetail ? courseDetail.Duration : ''
    },
    fee: { total: total, paid: paid, pending: pending < 0 ? 0 : pending },
    payments: payments
  };
}

function findStudent(code) {
  var students = readTable('Students');
  for (var i = 0; i < students.length; i++) {
    if (String(students[i].StudentCode) === String(code)) return students[i];
  }
  return null;
}

function findCourse(id) {
  var courses = readTable('Courses');
  for (var i = 0; i < courses.length; i++) {
    if (String(courses[i].CourseID) === String(id)) return courses[i];
  }
  return null;
}

function courseMap() {
  var m = {};
  readTable('Courses').forEach(function (c) { m[String(c.CourseID)] = c.Name; });
  return m;
}

function sumPaid(studentCode) {
  var total = 0;
  readTable('FeePayments').forEach(function (p) {
    if (String(p.StudentCode) === String(studentCode)) total += Number(p.Amount) || 0;
  });
  return total;
}

function nextStudentCode() {
  var max = 0;
  readTable('Students').forEach(function (s) {
    var code = String(s.StudentCode);
    if (code.indexOf(YEAR_PREFIX) === 0) {
      var n = parseInt(code.substring(YEAR_PREFIX.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return YEAR_PREFIX + ('00' + (max + 1)).slice(-3);
}

function nextReceiptNo() {
  var max = 0;
  readTable('FeePayments').forEach(function (p) {
    var n = parseInt(String(p.ReceiptNo).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return 'RCPT' + ('000' + (max + 1)).slice(-4);
}

function generatePassword() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var pw = '';
  for (var i = 0; i < 10; i++) pw += chars.charAt(Math.floor(Math.random() * chars.length));
  return pw;
}

function isTrue(v) {
  if (v === true) return true;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y';
}

function fmtDate(d) {
  if (!d) return '';
  var dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return Utilities.formatDate(dt, Session.getScriptTimeZone(), 'dd MMM yyyy');
}

function inr(n) { return '₹' + (Number(n) || 0).toLocaleString('en-IN'); }

/* ========================== EMAILS ============================ */

function emailShell(title, innerHtml) {
  return '' +
  '<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">' +
    '<div style="background:linear-gradient(135deg,#0A1F44,#0D2B57);padding:24px 28px">' +
      '<div style="color:#E8B04B;font-size:22px;font-weight:700;letter-spacing:.5px">' + INSTITUTE.name + '</div>' +
      '<div style="color:#cbd5e1;font-size:13px;margin-top:2px">' + INSTITUTE.tagline + '</div>' +
    '</div>' +
    '<div style="padding:28px;color:#1f2937;font-size:14px;line-height:1.6">' +
      '<h2 style="margin:0 0 16px;color:#0A1F44;font-size:18px">' + title + '</h2>' +
      innerHtml +
    '</div>' +
    '<div style="background:#0A1F44;padding:16px 28px;color:#94a3b8;font-size:12px">' +
      INSTITUTE.name + ' &middot; ' + INSTITUTE.address + '<br>Phone: ' + INSTITUTE.phone +
    '</div>' +
  '</div>';
}

function sendWelcomeEmail(to, name, studentCode, tempPassword, courseName, totalFee) {
  var inner =
    '<p>Hi ' + name + ',</p>' +
    '<p>Welcome to <b>' + INSTITUTE.name + '</b>! Your student account has been created. Here are your login details:</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:12px 0">' +
      row('Student ID', studentCode) +
      row('Login Email', to) +
      row('Temporary Password', '<b>' + tempPassword + '</b>') +
      row('Course', courseName) +
      row('Total Fee', inr(totalFee)) +
    '</table>' +
    '<p><a href="' + INSTITUTE.loginUrl + '" style="display:inline-block;background:#E8B04B;color:#0A1F44;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px">Login Now</a></p>' +
    '<p style="color:#6b7280">Please log in and change your password from the dashboard. For any help, call ' + INSTITUTE.phone + '.</p>';
  MailApp.sendEmail({
    to: to,
    subject: 'Welcome to ' + INSTITUTE.name + ' — Your Login Details',
    htmlBody: emailShell('Your Login Details', inner)
  });
}

function sendReceiptEmail(to, name, receiptNo, amount, mode, paidOn, newPaid, newPending) {
  var inner =
    '<p>Hi ' + name + ',</p>' +
    '<p>We have received your fee payment. Thank you!</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:12px 0">' +
      row('Receipt No', receiptNo) +
      row('Amount Paid', inr(amount)) +
      row('Mode', mode) +
      row('Date', fmtDate(paidOn)) +
      row('Total Paid', inr(newPaid)) +
      row('Pending', newPending <= 0 ? 'No dues — fully paid 🎉' : inr(newPending)) +
    '</table>' +
    '<p style="color:#6b7280">For any query, call ' + INSTITUTE.phone + '.</p>';
  MailApp.sendEmail({
    to: to,
    subject: 'Payment Received — ' + INSTITUTE.name,
    htmlBody: emailShell('Payment Received', inner)
  });
}

function row(label, value) {
  return '<tr>' +
    '<td style="padding:6px 0;color:#6b7280">' + label + '</td>' +
    '<td style="padding:6px 0;text-align:right;color:#0A1F44">' + value + '</td>' +
  '</tr>';
}

/* ================== ONE-TIME SETUP HELPERS ==================== */
/**
 * Run ONCE from the Apps Script editor to create the first admin login.
 * 1) Edit ADMIN_EMAIL and ADMIN_PASSWORD below.
 * 2) Select createFirstAdmin and click Run, authorize when asked.
 * 3) Delete or change the password after it runs.
 */
function createFirstAdmin() {
  var ADMIN_EMAIL = 'admin@softskillzone.com'; // <-- change me
  var ADMIN_PASSWORD = 'ChangeMe@123';         // <-- change me

  if (findLogin(ADMIN_EMAIL)) { Logger.log('Admin already exists.'); return; }
  var salt = newSalt();
  var hash = hashPassword(ADMIN_PASSWORD, salt);
  appendRow('Logins', {
    Email: ADMIN_EMAIL, PasswordHash: hash, Salt: salt, Role: 'admin',
    StudentCode: '', CreatedAt: new Date()
  });
  Logger.log('Admin created: ' + ADMIN_EMAIL);
}

/**
 * Run ONCE to create all tabs with correct headers and seed the 8 courses.
 * Safe to run on an empty spreadsheet.
 */
function setupSpreadsheet() {
  var defs = {
    Courses:     ['CourseID', 'Name', 'Category', 'Outcome', 'Duration', 'Fee', 'Active'],
    Students:    ['StudentCode', 'FullName', 'Email', 'Phone', 'JoinDate', 'CourseID', 'TotalFee'],
    FeePayments: ['ReceiptNo', 'StudentCode', 'Amount', 'Mode', 'PaidOn', 'RecordedBy'],
    Logins:      ['Email', 'PasswordHash', 'Salt', 'Role', 'StudentCode', 'CreatedAt'],
    Sessions:    ['Token', 'Email', 'Role', 'StudentCode', 'Expiry'],
    Enquiries:   ['Timestamp', 'Name', 'Phone', 'CourseInterest']
  };
  var book = ss();
  Object.keys(defs).forEach(function (name) {
    var sh = book.getSheetByName(name) || book.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(defs[name]);
  });

  // Seed courses only if Courses tab has just the header
  if (sheet('Courses').getLastRow() <= 1) {
    var courses = [
      [1, 'DCA – AI + Office',        'Foundation Level',          'Computer Basics & MS Office',     '4 Months',  5500,  true],
      [2, 'ADCA with AI',            'Diploma Level',             'Advanced Computer Skills & AI',   '12 Months', 15500, true],
      [3, 'Prompt Engineering',      'Core AI Skill',             'Use AI Tools Efficiently',        '4 Months',  5500,  true],
      [4, 'AI Video Creator & Editor','Creative Skill',           'Freelancing & Content Creation',  '4 Months',  5500,  true],
      [5, 'AI Data Analyst',         'Corporate Skill',           'Data Analysis & Visualization',   '4 Months',  5500,  true],
      [6, 'AI Consultant',           'Advanced AI Skill',         'Automation & Business Systems',   '5 Months',  6500,  true],
      [7, 'Tally Prime + AI Tools',  'Accounting Skill',          'Smart Accountant & GST Return',   '4 Months',  5500,  true],
      [8, 'Google Cloud & AI Workshop','Workshop (by Chandan Kumar)','Cloud + AI hands-on',          '—',         6499,  true]
    ];
    sheet('Courses').getRange(2, 1, courses.length, 7).setValues(courses);
  }
  Logger.log('Spreadsheet setup complete.');
}

/**
 * Optional: clear expired sessions. Add a time-based trigger to run daily.
 */
function purgeExpiredSessions() {
  var sh = sheet('Sessions');
  var values = sh.getDataRange().getValues();
  for (var r = values.length - 1; r >= 1; r--) {
    var exp = new Date(values[r][4]); // Expiry = col 5
    if (exp.getTime() < Date.now()) sh.deleteRow(r + 1);
  }
}

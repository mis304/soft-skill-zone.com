# SOFT SKILL ZONE — Website + Fee Management System

A professional, mobile-responsive website **and** login-protected fee management
system for **SOFT SKILL ZONE** (computer & AI training institute, Ara, Bihar).

- **Frontend:** plain HTML / CSS / JavaScript (no build step) → host on **Netlify**.
- **Backend / Database:** **Google Sheets** via a **Google Apps Script Web App** that
  exposes a JSON API. Emails are sent directly by Apps Script (Gmail).
- **Auth:** custom — SHA-256 + per-user salt password hashing, token-based sessions.

> The frontend is a static site that talks to the Apps Script API using a
> **CORS-safe** convention (`POST` with `Content-Type: text/plain` and a JSON
> string body). The Web App URL is **not a secret** — every sensitive action is
> gated by a session token that the server validates.

---

## 📁 Project structure

```
soft-skill-zone/
├── index.html          # Public landing page
├── login.html          # Login (email + password)
├── student.html        # Student dashboard (read-only fee status)
├── admin.html          # Admin dashboard (students, payments, courses)
├── css/styles.css      # All styling (navy + gold brand)
├── js/
│   ├── config.js       # ← put your Web App URL here (API_URL)
│   ├── config.example.js
│   ├── api.js          # CORS-safe API client
│   ├── auth.js         # session storage helpers (localStorage)
│   ├── ui.js           # toast / format helpers
│   ├── landing.js      # landing page logic
│   ├── student.js      # student dashboard logic
│   └── admin.js        # admin dashboard logic
├── public/pankaj.jpg   # Teacher photo
├── Code.gs             # ← THE BACKEND: paste into Apps Script
├── netlify.toml        # Netlify config (static, no build)
└── README.md
```

---

## 🗄️ Database schema (Google Sheets)

One spreadsheet, **one tab per table**, row 1 = headers (exact names):

| Tab | Columns |
|-----|---------|
| **Courses** | CourseID · Name · Category · Outcome · Duration · Fee · Active |
| **Students** | StudentCode · FullName · Email · Phone · JoinDate · CourseID · TotalFee |
| **FeePayments** | ReceiptNo · StudentCode · Amount · Mode · PaidOn · RecordedBy |
| **Logins** | Email · PasswordHash · Salt · Role · StudentCode · CreatedAt |
| **Sessions** | Token · Email · Role · StudentCode · Expiry |
| **Enquiries** | Timestamp · Name · Phone · CourseInterest |

**Fee logic** (computed in Apps Script):
`paid = SUM(FeePayments.Amount where StudentCode = X)` · `pending = TotalFee − paid`.
`Role` is `admin` or `student`. One active course per student (CourseID on the row).

> 💡 You don't have to create the tabs by hand — `setupSpreadsheet()` in `Code.gs`
> creates every tab with the right headers and seeds the 8 courses for you.

---

## 🔌 API actions

| action | access | purpose |
|--------|--------|---------|
| `login` | public | `{email,password}` → verify hash → session → `{token, role, studentCode, name}` |
| `listCourses` | public | active courses for the landing page |
| `submitEnquiry` | public | `{name,phone,course}` → append to Enquiries |
| `addStudent` | admin | create Student + Login (generated password) + welcome email → `{studentCode}` |
| `recordPayment` | admin | append FeePayment + email receipt → `{receiptNo,newPaid,newPending}` |
| `adminDashboard` | admin | totals + students-per-course |
| `searchStudents` | admin | `{query}` → matching students with fee summary |
| `studentDetail` | admin | `{studentCode}` → full profile + payment ledger |
| `listCoursesAdmin` / `saveCourse` | admin | manage courses (add / edit / activate) |
| `myData` | student | own profile + fee summary + history (from token, **not** a client-sent id) |
| `changePassword` | student/admin | `{oldPassword,newPassword}` |

---

## 🚀 Deployment

### Step 1 — Create the spreadsheet + backend
1. Create a new **Google Spreadsheet** (any name, e.g. *SOFT SKILL ZONE DB*).
2. **Extensions → Apps Script**. Delete the default code, paste the entire
   contents of **`Code.gs`**, and **Save**.
3. In the editor, open `Code.gs`, select the function **`setupSpreadsheet`** from
   the dropdown and click **Run**. Authorize when prompted. This creates all tabs
   + seeds the 8 courses.
4. Edit `createFirstAdmin()` (top of the function): set your admin **email** and a
   **password**. Select **`createFirstAdmin`** and **Run**. This adds your admin
   login (hashed). *(Change the password later from the dashboard.)*
5. *(Optional)* Edit the `INSTITUTE.loginUrl` constant near the top of `Code.gs`
   to your Netlify URL so the welcome email links to the right login page.

### Step 2 — Deploy the Web App
1. In Apps Script: **Deploy → New deployment**.
2. Type: **Web app**. **Execute as: Me**. **Who has access: Anyone**. → **Deploy**
   → authorize.
3. Copy the **Web App URL** (ends in `/exec`).

### Step 3 — Configure the frontend
1. Open **`js/config.js`** and paste the URL into `API_URL`.
2. *(Optional)* Update `WORKSHOP_URL`, phone, address.

### Step 4 — Deploy the frontend to Netlify
- **Easiest:** drag-and-drop the whole `soft-skill-zone` folder onto
  [app.netlify.com/drop](https://app.netlify.com/drop).
- **Or via Git:** push to GitHub → *New site from Git* → no build command,
  publish directory `.` (already set in `netlify.toml`).

After it goes live, copy your Netlify URL back into `INSTITUTE.loginUrl` in
`Code.gs` (Step 1.5) and re-deploy the Web App (**Deploy → Manage deployments →
Edit → New version**) so welcome/receipt emails link correctly.

---

## 🔐 Security notes
- Passwords are never stored in plaintext — `SHA-256(password + perUserSalt)`.
- The Web App is "Anyone"-accessible, so the URL is treated as public; only
  `login`, `listCourses`, `submitEnquiry` work **without** a token.
- Identity & role are derived **server-side from the session token only**; the
  server ignores any role/studentCode sent by the client. `myData` returns data
  for the token's own student only.
- Sessions expire after 7 days. Run `purgeExpiredSessions()` (optionally on a
  daily time-based trigger) to clean the Sessions tab.
- Email quota: `MailApp` ≈ 100/day (consumer Gmail) or up to 1500/day (Workspace).

---

## 🧪 Local testing
Open `index.html` directly in a browser, or run a quick static server.
The landing page loads courses; login/dashboards need the API_URL set and the
backend deployed. (A simple way: VS Code "Live Server" extension.)

## 👤 Roles
- **Public visitor** — landing page only.
- **Student** — logs in, sees own profile, course, fee status + history. Read-only.
- **Admin** — adds students, records payments, manages courses, dashboard stats,
  searches any student.

---
© SOFT SKILL ZONE — *Learn AI.. Lead Future.*

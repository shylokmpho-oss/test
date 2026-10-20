// =====================================================================
// Shared config, session control, routing and API helpers.
// Included by every page (home, login, register, and all three dashboards).
// =====================================================================

// Same origin when served by the C# API (http://localhost:5000); otherwise
// (VS Code Live Server, or opening the file directly) call the API on port 5000.
const API_BASE = location.port === "5000" ? "/api" : "http://localhost:5000/api";

const DASHBOARDS = {
  Patient: "patient-dashboard.html",
  Doctor: "doctor-dashboard.html",
  Receptionist: "receptionist-dashboard.html",
};

// This page's file name plus its #panel, e.g. "patient-dashboard.html#mine".
function currentPage() {
  return (location.pathname.split("/").pop() || "index.html") + location.hash;
}

const Session = {
  save(token, role, id, name, mustChangePassword = false) {
    localStorage.setItem("hbqms_token", token);
    localStorage.setItem("hbqms_role", role);
    localStorage.setItem("hbqms_id", id);
    localStorage.setItem("hbqms_name", name || "");
    localStorage.setItem("hbqms_must_change", mustChangePassword ? "1" : "");
  },
  token() { return localStorage.getItem("hbqms_token"); },
  role() { return localStorage.getItem("hbqms_role"); },
  id() { return localStorage.getItem("hbqms_id"); },
  name() { return localStorage.getItem("hbqms_name"); },
  // Logged in with a temporary password from reception that must be changed first.
  mustChangePassword() { return !!localStorage.getItem("hbqms_must_change"); },
  clear() {
    localStorage.removeItem("hbqms_token");
    localStorage.removeItem("hbqms_role");
    localStorage.removeItem("hbqms_id");
    localStorage.removeItem("hbqms_name");
    localStorage.removeItem("hbqms_must_change");
  },
  // Logged in with a token that has not expired yet (JWT "exp" is in seconds).
  isLoggedIn() {
    const token = this.token();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        this.clear();
        return false;
      }
    } catch (_) { /* not a JWT we can read: let the server decide */ }
    return true;
  },
  dashboard() { return DASHBOARDS[this.role()] || "login.html"; },
  // Call at the top of every dashboard page.
  //  - not logged in -> login page, which returns here after logging in
  //  - logged in with another role -> that role's own dashboard
  //  - logged in with a temporary password -> change it first, then come back
  requireRole(expectedRole) {
    if (!this.isLoggedIn()) {
      location.replace(`login.html?next=${encodeURIComponent(currentPage())}`);
    } else if (this.mustChangePassword()) {
      location.replace(`change-password.html?next=${encodeURIComponent(currentPage())}`);
    } else if (this.role() !== expectedRole) {
      location.replace(this.dashboard());
    }
  },
  logout() {
    this.clear();
    location.href = "login.html?loggedout=1";
  },
};

function sessionExpired() {
  Session.clear();
  location.href = `login.html?expired=1&next=${encodeURIComponent(currentPage())}`;
  throw new Error("Your session has expired. Please log in again.");
}

// Wrapper around fetch(): attaches the JWT automatically, parses JSON,
// and if the server says the token is invalid/expired, sends the person
// back to the login page immediately.
async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = Session.token();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }

  // Only treat 401 as "session expired" when we actually sent a token -
  // a wrong password on the login page is also a 401 and must show its message.
  if (res.status === 401 && token) sessionExpired();

  // Temporary password not changed yet: the API allows nothing else until it is.
  if (res.status === 403 && data && data.must_change_password) {
    localStorage.setItem("hbqms_must_change", "1");
    location.href = `change-password.html?next=${encodeURIComponent(currentPage())}`;
    throw new Error(data.error);
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

// Downloads a report (PDF / CSV) from the API and saves it with the server's file name.
async function apiDownload(path, fallbackName = "report") {
  const token = Session.token();
  const res = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (res.status === 401 && token) sessionExpired();
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch (_) { /* no body */ }
    throw new Error((data && data.error) || `Download failed (${res.status})`);
  }

  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/i) || disposition.match(/filename="?([^";]+)"?/i);
  const fileName = match ? decodeURIComponent(match[1]) : fallbackName;

  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Runs a download from a button, showing "Preparing..." and any error in the banner.
async function downloadReport(button, path, banner) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Preparing...";
  try {
    await apiDownload(path);
  } catch (err) {
    if (banner) showBanner(banner, err.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// ---------- Dashboard routing ----------
// Sidebar items are links like <a class="nav-item" href="#mine" data-panel="mine">, so each
// menu page has its own URL: refresh, back/forward and bookmarks all work.
// onShow(name) runs every time a panel is shown (to load its data).
function initPanels(defaultPanel, onShow) {
  const navItems = document.querySelectorAll(".nav-item[data-panel]");
  const exists = (name) => !!document.getElementById(`panel-${name}`);
  const current = () => {
    const name = decodeURIComponent(location.hash.slice(1));
    return exists(name) ? name : defaultPanel;
  };

  function show(name) {
    navItems.forEach((n) => n.classList.toggle("active", n.dataset.panel === name));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${name}`));
    window.scrollTo(0, 0);
    if (onShow) onShow(name);
  }

  navItems.forEach((item) =>
    item.addEventListener("click", () => {
      const banner = document.getElementById("banner");
      if (banner) hideBanner(banner);
      // Clicking the menu item you are already on reloads it.
      if (current() === item.dataset.panel) show(item.dataset.panel);
    })
  );
  window.addEventListener("hashchange", () => show(current()));
  show(current());

  return {
    current,
    // Go to another panel (e.g. after booking -> My Appointments).
    go(name) {
      if (current() === name) show(name);
      else location.hash = name;
    },
  };
}

// ---------- Messages ----------
function showBanner(el, message, type) {
  el.textContent = message;
  el.className = `banner show ${type}`;
  el.scrollIntoView({ block: "nearest" });
}
function hideBanner(el) {
  el.className = "banner";
}

// ---------- Compulsory fields ----------
// Every input/select/textarea marked `required` gets a red * on its label.
function markRequiredFields(root = document) {
  root.querySelectorAll(".field").forEach((field) => {
    const label = field.querySelector("label");
    const required = field.querySelector("input[required], select[required], textarea[required]");
    if (label) label.classList.toggle("required", !!required);
  });
}

function setFieldInvalid(idOrField, invalid) {
  const el = typeof idOrField === "string" ? document.getElementById(idOrField) : idOrField;
  const field = el.classList.contains("field") ? el : el.closest(".field");
  field.classList.toggle("invalid", invalid);
  return !invalid;
}

// ---------- Formatting ----------
// Escape values from the database before putting them into innerHTML
// (SDS 2.4 - protects against cross-site scripting).
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDate(d) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
}
function fmtDateTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtTime(t) {
  if (!t) return "";
  // TIME columns come back as "HH:MM:SS" - trim to "HH:MM"
  return t.toString().slice(0, 5);
}
function statusBadge(status) {
  return `<span class="badge-status badge-${esc(status)}">${esc(status.replace("_", " "))}</span>`;
}
function todayIso(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthStartIso() {
  return todayIso().slice(0, 8) + "01";
}
function reasonCell(b) {
  return `${esc(b.Reason || "-")}${b.Reason_notes ? `<span class="reason-notes">${esc(b.Reason_notes)}</span>` : ""}`;
}
function ratingText(value) {
  return value == null ? "-" : `${Number(value).toFixed(1)} / 5`;
}
function stars(value) {
  const n = Math.round(value || 0);
  return `<span class="rating" title="${n} out of 5">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
}
function statCard(label, value, sub = "", extraClass = "") {
  return `<div class="stat ${extraClass}"><div class="label">${esc(label)}</div>
    <div class="value">${esc(value)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>`;
}

// Patient details + appointment history table (UC-10), shared by the
// receptionist and doctor dashboards.
// options.manageLogin (reception): show the online-login status with a button to set it up.
function renderPatientHistory(patient, history, options = {}) {
  const login = options.manageLogin
    ? `<br><span style="font-size:13px;">Online login: <b>${patient.Has_login ? "Yes" : "No"}</b></span>`
    : "";
  const header = `
    <div style="margin-bottom:14px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
      <div>
        <b>${esc(patient.Surname)}, ${esc(patient.First_Name)} ${esc(patient.Last_name)}</b><br>
        <span style="color:var(--muted);font-size:13px;">
          ID: ${esc(patient.id_number_Patient)} &nbsp;|&nbsp; ${esc(patient.mobile_number)}${patient.email ? " &nbsp;|&nbsp; " + esc(patient.email) : ""}
        </span>${login}
      </div>
      <div class="btn-row">
        ${options.manageLogin ? `<button class="btn btn-secondary btn-small" data-login-patient="${patient.Patient_id}">🔑 ${patient.Has_login ? "Reset password" : "Allow online login"}</button>` : ""}
        <button class="btn btn-secondary btn-small" data-history-download="pdf" data-patient="${patient.Patient_id}">⬇ PDF</button>
        <button class="btn btn-secondary btn-small" data-history-download="csv" data-patient="${patient.Patient_id}">⬇ Excel (CSV)</button>
      </div>
    </div>`;

  if (history.length === 0) {
    return header + `<div class="empty-state">No appointments found for this patient.</div>`;
  }

  const rows = history
    .map(
      (h) => `
      <tr>
        <td>${esc(h.DoctorSurname)}, ${esc(h.DoctorFirstName)}</td>
        <td>${esc(h.Specialty || "-")}</td>
        <td>${fmtDate(h.Appointment_date)}</td>
        <td>${fmtTime(h.Time_Slot)}</td>
        <td>${reasonCell(h)}</td>
        <td>${statusBadge(h.Status)}</td>
      </tr>`
    )
    .join("");

  return header + `<table>
      <thead><tr><th>Doctor</th><th>Specialty</th><th>Date</th><th>Time</th><th>Reason for visit</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Wires the PDF / CSV buttons rendered by renderPatientHistory inside `container`.
function wireHistoryDownloads(container, banner) {
  container.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-history-download]");
    if (!btn) return;
    downloadReport(btn, `/reports/patients/${btn.dataset.patient}/history?format=${btn.dataset.historyDownload}`, banner);
  });
}

// Fills a doctor <select> from GET /doctors.
function doctorOptions(doctors) {
  return doctors
    .map((d) => `<option value="${d.Doctor_id}">${esc(d.Surname)}, ${esc(d.First_Name)} - ${esc(d.Specialty || "General")}</option>`)
    .join("");
}

// ---------- Reason for visit ----------
let visitReasons = [];
async function loadVisitReasons(...selects) {
  visitReasons = await apiFetch("/visit-reasons");
  const options = visitReasons.map((r) => `<option value="${r.Reason_id}">${esc(r.Reason_name)}</option>`).join("");
  selects.forEach((s) => { s.innerHTML = `<option value="">Choose a reason</option>${options}`; });
}
// "Other" needs a description: make the notes box compulsory only for that reason.
function syncReasonNotes(select, notes) {
  const reason = visitReasons.find((r) => String(r.Reason_id) === select.value);
  const needsNotes = !!(reason && reason.Requires_notes);
  notes.required = needsNotes;
  notes.placeholder = needsNotes ? "Please describe the reason for your visit" : "Optional - anything the doctor should know";
  markRequiredFields(notes.closest("form"));
}
// Validates reason + notes; returns { reason_id, reason_notes } or null.
function readReason(select, notes) {
  const reasonOk = setFieldInvalid(select, !select.value);
  const notesOk = setFieldInvalid(notes, notes.required && !notes.value.trim());
  if (!reasonOk || !notesOk) return null;
  return { reason_id: Number(select.value), reason_notes: notes.value.trim() || null };
}

// Keeps a time-slot <select> in sync with the chosen doctor and date, using
// GET /doctors/availability so only free 20-minute slots can be picked.
// keepSlot (optional) is a slot to keep selectable, e.g. a booking's current time.
async function loadSlots(doctorSelect, dateInput, slotSelect, keepSlot) {
  const doctorId = doctorSelect.value;
  const date = dateInput.value;
  if (!doctorId || !date) {
    slotSelect.innerHTML = `<option value="">Choose a doctor and date first</option>`;
    return;
  }
  slotSelect.innerHTML = `<option value="">Loading times...</option>`;
  try {
    const slots = await apiFetch(`/doctors/availability?doctorId=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`);
    if (keepSlot && !slots.includes(keepSlot)) slots.unshift(keepSlot);
    slotSelect.innerHTML = slots.length
      ? `<option value="">Choose a time</option>` + slots.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")
      : `<option value="">No free times on this day</option>`;
    if (keepSlot) slotSelect.value = keepSlot;
  } catch (err) {
    slotSelect.innerHTML = `<option value="">${esc(err.message)}</option>`;
  }
}

// A readable temporary password for reception to give a patient, e.g. "Kite-4827-Rq".
function generateTempPassword() {
  const words = ["Sun", "Kite", "River", "Maple", "Tiger", "Cloud", "Lemon", "Ocean", "Star", "Hill", "Zebra", "Baobab"];
  const rand = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  return `${words[rand(words.length)]}-${1000 + rand(9000)}-${letters[rand(letters.length)]}${letters[rand(letters.length)]}`;
}

// Scripts are loaded at the end of <body>, so the page's fields exist already.
markRequiredFields();

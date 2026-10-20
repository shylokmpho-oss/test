Session.requireRole("Receptionist");

document.getElementById("whoName").textContent = Session.name() || `Receptionist #${Session.id()}`;
document.getElementById("logoutBtn").addEventListener("click", () => Session.logout());

const banner = document.getElementById("banner");
let bookings = [];
let doctors = [];

// ---------- Overview ----------
async function loadOverview() {
  document.getElementById("todayLabel").textContent =
    new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  try {
    const s = await apiFetch("/dashboard");
    const t = s.Today;
    document.getElementById("receptionStats").innerHTML =
      (s.OpenSos ? `<a href="#sos" style="text-decoration:none;">${statCard("Open SOS alerts", s.OpenSos, "Needs attention now", "alert")}</a>` : "") +
      statCard("Bookings today", t.TOTAL, `${t.CANCELLED} cancelled`) +
      statCard("Waiting to check in", t.BOOKED) +
      statCard("Checked in", t.CHECKED_IN) +
      statCard("With doctor", t.WITH_DOCTOR) +
      statCard("Completed", t.COMPLETED) +
      statCard("Next 7 days", s.UpcomingWeek, "bookings") +
      statCard("Active doctors", s.ActiveDoctors) +
      statCard("Registered patients", s.Patients);
    const r = s.Ratings;
    document.getElementById("satisfaction").innerHTML = r.Count
      ? `<dl class="detail-list">
          <dt>Overall</dt><dd>${stars(r.Overall)} ${ratingText(r.Overall)}</dd>
          <dt>Doctors</dt><dd>${stars(r.Doctor)} ${ratingText(r.Doctor)}</dd>
          <dt>Waiting time</dt><dd>${stars(r.Waiting)} ${ratingText(r.Waiting)}</dd>
          <dt>Reception</dt><dd>${stars(r.Staff)} ${ratingText(r.Staff)}</dd>
          <dt>Would recommend</dt><dd>${r.RecommendPercent}%</dd>
          <dt>Responses</dt><dd>${r.Count} - <a href="#surveys">see all</a></dd>
        </dl>`
      : `<div class="empty-state">No survey responses in the last 30 days.</div>`;
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

// ---------- SOS alerts (checked every 15 seconds on every panel) ----------
const sosBar = document.getElementById("sosBar");
const sosBadge = document.getElementById("sosBadge");

function sosLocation(a) {
  if (a.Latitude == null || a.Longitude == null) return `<span class="muted">Not shared</span>`;
  return `<a href="https://www.google.com/maps?q=${a.Latitude},${a.Longitude}" target="_blank" rel="noopener">📍 Open map</a>`;
}

async function loadSos() {
  try {
    const all = document.getElementById("sosShowAll").checked;
    const alerts = await apiFetch(`/sos${all ? "?all=true" : ""}`);
    const open = alerts.filter((a) => a.Status === "OPEN").length;
    sosBadge.textContent = open;
    sosBadge.classList.toggle("show", open > 0);
    sosBar.classList.toggle("show", open > 0 && panels.current() !== "sos");
    document.getElementById("sosBarText").textContent =
      open === 1 ? "1 open SOS alert from a patient" : `${open} open SOS alerts from patients`;

    if (panels.current() !== "sos") return;
    document.getElementById("sosEmpty").style.display = alerts.length ? "none" : "block";
    document.getElementById("sosBody").innerHTML = alerts
      .map(
        (a) => `
        <tr>
          <td>${fmtDateTime(a.Created_at)}</td>
          <td><b>${esc(a.PatientName)}</b><span class="reason-notes">ID ${esc(a.PatientIdNumber)}</span>
              ${a.PatientPhone ? `<a href="tel:${esc(a.PatientPhone.replace(/\s/g, ""))}">📞 ${esc(a.PatientPhone)}</a>` : ""}</td>
          <td>${esc(a.Message || "-")}</td>
          <td>${sosLocation(a)}</td>
          <td><span class="badge-status badge-${esc(a.Status)}">${esc(a.Status)}</span>
              ${a.HandledBy ? `<span class="reason-notes">by ${esc(a.HandledBy)} ${fmtDateTime(a.Handled_at)}</span>` : ""}</td>
          <td class="actions-cell">
            ${a.Status === "OPEN" ? `<button class="btn btn-primary btn-small" onclick="updateSos(${a.Alert_id}, 'ACKNOWLEDGED')">Acknowledge</button>` : ""}
            ${a.Status !== "RESOLVED" ? `<button class="btn btn-secondary btn-small" onclick="updateSos(${a.Alert_id}, 'RESOLVED')">Resolve</button>` : ""}
          </td>
        </tr>`
      )
      .join("");
  } catch (err) {
    if (panels.current() === "sos") showBanner(banner, err.message, "error");
  }
}

async function updateSos(id, status) {
  try {
    await apiFetch(`/sos/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    showBanner(banner, status === "RESOLVED" ? "Alert resolved." : "Alert acknowledged - the patient can see that you are on the way.", "success");
    loadSos();
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}
document.getElementById("sosShowAll").addEventListener("change", loadSos);
setInterval(loadSos, 15000);

// ---------- Doctors and reasons for the dropdowns ----------
async function loadDoctors() {
  try {
    doctors = await apiFetch("/doctors");
    const options = doctorOptions(doctors);
    document.getElementById("new_doctor_id").innerHTML = `<option value="">Choose a doctor</option>${options}`;
    document.getElementById("edit_doctor_id").innerHTML = options;
    document.getElementById("repDoctor").innerHTML = `<option value="">All doctors</option>${options}`;
    document.getElementById("surveyDoctor").innerHTML = `<option value="">All doctors</option>${options}`;
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

// ---------- Manage bookings (search, check-in, edit, cancel) ----------
const searchInput = document.getElementById("searchInput");
const manageDate = document.getElementById("manageDate");

async function loadBookings() {
  const tbody = document.getElementById("bookingsBody");
  const empty = document.getElementById("bookingsEmpty");
  try {
    const query = new URLSearchParams();
    if (searchInput.value.trim()) query.set("search", searchInput.value.trim());
    if (manageDate.value) query.set("date", manageDate.value);
    bookings = await apiFetch(`/receptionist/bookings${query.toString() ? "?" + query : ""}`);
    if (bookings.length === 0) {
      tbody.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    tbody.innerHTML = bookings
      .map(
        (b) => `
        <tr>
          <td>${esc(b.PatientSurname)}, ${esc(b.PatientFirstName)}</td>
          <td>${esc(b.DoctorSurname)}, ${esc(b.DoctorFirstName)}</td>
          <td>${fmtDate(b.Appointment_date)}</td>
          <td>${fmtTime(b.Time_Slot)}</td>
          <td>${reasonCell(b)}</td>
          <td>${statusBadge(b.Status)}</td>
          <td>${b.Position != null ? `#${b.Position}` : "-"}</td>
          <td class="actions-cell">
            ${
              b.Status === "BOOKED"
                ? `<button class="btn btn-primary btn-small" onclick="setStatus(${b.Booking_id}, 'CHECKED_IN')">Check-in</button>
                   <button class="btn btn-secondary btn-small" onclick="openEdit(${b.Booking_id})">Edit</button>
                   <button class="btn btn-danger btn-small" onclick="cancelBooking(${b.Booking_id})">Cancel</button>`
                : "-"
            }
          </td>
        </tr>`
      )
      .join("");
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

document.getElementById("searchBtn").addEventListener("click", loadBookings);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); loadBookings(); }
});
manageDate.addEventListener("change", loadBookings);
document.getElementById("clearSearchBtn").addEventListener("click", () => {
  searchInput.value = "";
  manageDate.value = "";
  loadBookings();
});

// ---------- New Booking (Create) ----------
// The receptionist enters the patient's ID number and presses Find. A registered patient is
// confirmed by name; otherwise the "New patient" section opens and the patient is added
// (optionally with an online login and a temporary password) together with the booking.
const newBookingForm = document.getElementById("newBookingForm");
const newBookingBtn = document.getElementById("newBookingBtn");
const newDoctor = document.getElementById("new_doctor_id");
const newDate = document.getElementById("new_date");
const newTime = document.getElementById("new_time");
const newReason = document.getElementById("new_reason_id");
const newReasonNotes = document.getElementById("new_reason_notes");
const patientIdInput = document.getElementById("patient_id_number");
const patientLookup = document.getElementById("patientLookup");
const newPatientSection = document.getElementById("newPatientSection");
const npAllowLogin = document.getElementById("np_allow_login");
const npLoginFields = document.getElementById("npLoginFields");
const npTempPassword = document.getElementById("np_temp_password");
const LOOKUP_HINT = "Enter the ID number and press Find (or Tab).";

// "found" (existing patient), "new" (not registered - add them) or null (not looked up yet)
let patientState = null;
let lookedUpId = "";

newDate.min = todayIso();
const refreshNewSlots = () => loadSlots(newDoctor, newDate, newTime);
newDoctor.addEventListener("change", refreshNewSlots);
newDate.addEventListener("change", refreshNewSlots);
newReason.addEventListener("change", () => syncReasonNotes(newReason, newReasonNotes));

const ID_PATTERN = /^(\d{13}|[A-Za-z][A-Za-z0-9]{5,19})$/;

function showNewPatient(show) {
  newPatientSection.style.display = show ? "block" : "none";
  ["np_first", "np_last", "np_surname", "np_mobile", "np_channel"].forEach((id) => (document.getElementById(id).required = show));
  npTempPassword.required = show && npAllowLogin.checked;
  markRequiredFields(newBookingForm);
}

npAllowLogin.addEventListener("change", () => {
  npLoginFields.style.display = npAllowLogin.checked ? "block" : "none";
  if (npAllowLogin.checked && !npTempPassword.value) npTempPassword.value = generateTempPassword();
  showNewPatient(true);
});
document.getElementById("npGenerateBtn").addEventListener("click", () => (npTempPassword.value = generateTempPassword()));

async function findPatient() {
  const idNumber = patientIdInput.value.trim();
  if (idNumber === lookedUpId && patientState) return patientState;
  lookedUpId = idNumber;
  patientState = null;
  showNewPatient(false);
  if (!setFieldInvalid("f-patient", !ID_PATTERN.test(idNumber))) {
    patientLookup.textContent = LOOKUP_HINT;
    return null;
  }

  patientLookup.textContent = "Looking up...";
  try {
    const p = await apiFetch(`/patients/by-id-number/${encodeURIComponent(idNumber)}`);
    patientState = "found";
    patientLookup.innerHTML = `✅ <b>${esc(p.First_Name)} ${esc(p.Last_name)} ${esc(p.Surname)}</b> - ${esc(p.mobile_number)}` +
      (p.Has_login ? "" : ` <span class="muted">(no online login)</span>`);
  } catch (err) {
    if (!/no patient/i.test(err.message)) {
      patientLookup.textContent = err.message;
      return null;
    }
    patientState = "new";
    patientLookup.textContent = "ℹ️ No patient with this ID number - add their details below.";
    showNewPatient(true);
    document.getElementById("np_first").focus();
  }
  return patientState;
}

document.getElementById("findPatientBtn").addEventListener("click", findPatient);
patientIdInput.addEventListener("change", findPatient);
patientIdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); findPatient(); }
});

// Validates the new-patient fields; returns the request body for POST /patients, or null.
function readNewPatient() {
  const val = (id) => document.getElementById(id).value.trim();
  const ok = [
    setFieldInvalid("np_first", !val("np_first")),
    setFieldInvalid("np_last", !val("np_last")),
    setFieldInvalid("np_surname", !val("np_surname")),
    setFieldInvalid("np_mobile", !/^[0-9+ ]{7,15}$/.test(val("np_mobile"))),
    setFieldInvalid("np_email", !!val("np_email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val("np_email"))),
    setFieldInvalid("np_temp_password", npAllowLogin.checked && npTempPassword.value.length < 8),
  ];
  if (ok.includes(false)) return null;
  return {
    id_number: patientIdInput.value.trim(),
    First_Name: val("np_first"),
    Last_name: val("np_last"),
    Surname: val("np_surname"),
    mobile_number: val("np_mobile"),
    email: val("np_email") || null,
    preferred_channel: val("np_channel"),
    allow_login: npAllowLogin.checked,
    temp_password: npAllowLogin.checked ? npTempPassword.value : null,
    send_login_details: npAllowLogin.checked && document.getElementById("np_send_login").checked,
  };
}

function resetNewBooking() {
  newBookingForm.reset();
  patientState = null;
  lookedUpId = "";
  patientLookup.textContent = LOOKUP_HINT;
  npLoginFields.style.display = "none";
  showNewPatient(false);
  syncReasonNotes(newReason, newReasonNotes);
  refreshNewSlots();
}

newBookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideBanner(banner);

  const state = await findPatient();
  const patient_id_number = patientIdInput.value.trim();
  const doctor_id = newDoctor.value;
  const appointment_date = newDate.value;
  const time_slot = newTime.value;

  const newPatient = state === "new" ? readNewPatient() : null;
  const doctorOk = setFieldInvalid("f-doctor", !doctor_id);
  const dateOk = setFieldInvalid("f-date", !appointment_date);
  const timeOk = setFieldInvalid("f-time", !time_slot);
  const reason = readReason(newReason, newReasonNotes);
  if (!state || (state === "new" && !newPatient) || !doctorOk || !dateOk || !timeOk || !reason) return;

  newBookingBtn.disabled = true;
  let patientNote = "";
  try {
    // 1. Add the patient first (if new). If the booking then fails, the patient stays registered.
    if (newPatient) {
      newBookingBtn.textContent = "Adding patient...";
      const added = await apiFetch("/patients", { method: "POST", body: JSON.stringify(newPatient) });
      patientState = "found";
      showNewPatient(false);
      patientLookup.innerHTML = `✅ <b>${esc(added.patient.First_Name)} ${esc(added.patient.Surname)}</b> added`;
      patientNote = newPatient.allow_login
        ? ` New patient added with online login (temporary password: ${newPatient.temp_password}` +
          (added.login_details_sent ? ", also sent to their phone)." : ").")
        : " New patient added (no online login).";
    }

    // 2. Create the booking.
    newBookingBtn.textContent = "Creating booking...";
    const booking = await apiFetch("/bookings", {
      method: "POST",
      body: JSON.stringify({ patient_id_number, doctor_id, appointment_date, time_slot, ...reason }),
    });
    resetNewBooking();
    // Redirect to Manage Bookings, showing the new booking's day.
    searchInput.value = booking.PatientSurname;
    manageDate.value = booking.Appointment_date;
    panels.go("manage");
    showBanner(banner, `Booking created for ${booking.PatientFirstName} ${booking.PatientSurname} on ` +
      `${fmtDate(booking.Appointment_date)} at ${fmtTime(booking.Time_Slot)}. The patient has been sent a confirmation.` + patientNote, "success");
  } catch (err) {
    showBanner(banner, (patientNote ? patientNote.trim() + " But the booking failed: " : "") + err.message, "error");
    refreshNewSlots();
  } finally {
    newBookingBtn.disabled = false;
    newBookingBtn.textContent = "Create Booking";
  }
});

// ---------- Update (status + edit) ----------
async function setStatus(id, status) {
  try {
    await apiFetch(`/bookings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    showBanner(banner, "Patient checked in.", "success");
    loadBookings();
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

// Cancelling keeps the booking for history (status CANCELLED) - SDS 3.3.
async function cancelBooking(id) {
  if (!confirm("Cancel this booking? The patient will be sent a message.")) return;
  try {
    await apiFetch(`/bookings/${id}`, { method: "DELETE" });
    showBanner(banner, "Booking cancelled.", "success");
    loadBookings();
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

const editModal = document.getElementById("editModal");
const editForm = document.getElementById("editForm");
const editDoctor = document.getElementById("edit_doctor_id");
const editDate = document.getElementById("edit_date");
const editTime = document.getElementById("edit_time");
let editing = null;

// Keep the booking's own current slot selectable while doctor and date are unchanged.
function refreshEditSlots() {
  const unchanged = editing && editDoctor.value == editing.Doctor_id && editDate.value === editing.Appointment_date;
  loadSlots(editDoctor, editDate, editTime, unchanged ? fmtTime(editing.Time_Slot) : null);
}
editDoctor.addEventListener("change", refreshEditSlots);
editDate.addEventListener("change", refreshEditSlots);
editDate.min = todayIso();

function openEdit(id) {
  editing = bookings.find((b) => b.Booking_id === id);
  document.getElementById("edit_booking_id").value = id;
  editDoctor.value = editing.Doctor_id;
  editDate.value = editing.Appointment_date;
  setFieldInvalid("f-edit-time", false);
  refreshEditSlots();
  editModal.classList.add("show");
}
document.getElementById("editCancelBtn").addEventListener("click", () => editModal.classList.remove("show"));

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("edit_booking_id").value;
  if (!setFieldInvalid("f-edit-time", !editTime.value)) return;

  try {
    await apiFetch(`/bookings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ doctor_id: editDoctor.value, appointment_date: editDate.value, time_slot: editTime.value }),
    });
    editModal.classList.remove("show");
    showBanner(banner, "Booking updated. The patient has been sent the new time.", "success");
    loadBookings();
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
});

// ---------- Patient History (searchable by patient ID number) ----------
const historyResultBox = document.getElementById("historySearchResult");
const historySearchInput = document.getElementById("historySearchInput");
const historySearchBtn = document.getElementById("historySearchBtn");
wireHistoryDownloads(historyResultBox, banner);

async function searchPatientHistory() {
  const idNumber = historySearchInput.value.trim();
  if (!/^\d{13}$/.test(idNumber)) {
    historyResultBox.innerHTML = "";
    showBanner(banner, "Please enter a valid 13-digit ID number.", "error");
    return;
  }
  hideBanner(banner);
  historyResultBox.innerHTML = `<div class="empty-state">Searching...</div>`;

  try {
    const patient = await apiFetch(`/patients/by-id-number/${idNumber}`);
    const history = await apiFetch(`/patients/${patient.Patient_id}/history`);
    historyResultBox.innerHTML = renderPatientHistory(patient, history, { manageLogin: true });
  } catch (err) {
    historyResultBox.innerHTML = "";
    showBanner(banner, err.message, "error");
  }
}

historySearchBtn.addEventListener("click", searchPatientHistory);
historySearchInput.addEventListener("input", () => {
  historySearchInput.value = historySearchInput.value.replace(/\D/g, "").slice(0, 13);
});
historySearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchPatientHistory();
});

// ---------- Online login for an existing patient ----------
const loginModal = document.getElementById("loginModal");
const loginTemp = document.getElementById("login_temp_password");
let loginPatient = null;

historyResultBox.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-login-patient]");
  if (!btn) return;
  try {
    loginPatient = await apiFetch(`/patients/${btn.dataset.loginPatient}`);
  } catch (err) {
    showBanner(banner, err.message, "error");
    return;
  }
  document.getElementById("loginModalTitle").textContent = loginPatient.Has_login ? "Set a new temporary password" : "Allow online login";
  document.getElementById("loginModalText").textContent =
    `${loginPatient.First_Name} ${loginPatient.Surname} will log in as a patient with ID number ${loginPatient.id_number_Patient}.`;
  loginTemp.value = generateTempPassword();
  setFieldInvalid("f-login-temp", false);
  loginModal.classList.add("show");
});
document.getElementById("loginGenerateBtn").addEventListener("click", () => (loginTemp.value = generateTempPassword()));
document.getElementById("loginCancelBtn").addEventListener("click", () => loginModal.classList.remove("show"));

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!setFieldInvalid("f-login-temp", loginTemp.value.length < 8)) return;
  const saveBtn = document.getElementById("loginSaveBtn");
  saveBtn.disabled = true;
  try {
    const result = await apiFetch(`/patients/${loginPatient.Patient_id}/login`, {
      method: "POST",
      body: JSON.stringify({ temp_password: loginTemp.value, send_login_details: document.getElementById("login_send").checked }),
    });
    loginModal.classList.remove("show");
    showBanner(banner, `Online login set for ${loginPatient.First_Name} ${loginPatient.Surname}. Temporary password: ${loginTemp.value}` +
      (result.login_details_sent ? " (also sent to their phone)." : "."), "success");
    searchPatientHistory();
  } catch (err) {
    showBanner(banner, err.message, "error");
  } finally {
    saveBtn.disabled = false;
  }
});

// ---------- Staff list ----------
async function loadStaff() {
  try {
    const staff = await apiFetch("/staff");
    document.getElementById("staffBody").innerHTML = staff
      .map(
        (s) => `
        <tr>
          <td><b>${s.Role === "Doctor" ? "Dr. " : ""}${esc(s.First_Name)} ${esc(s.Surname)}</b></td>
          <td>${esc(s.Role)}</td>
          <td>${esc(s.id_number)}</td>
          <td>${esc(s.Email || "")}<span class="reason-notes">${esc(s.Phone_number || "")}</span></td>
          <td>${s.Role === "Doctor" ? `${esc(s.Specialty || "-")}<span class="reason-notes">${esc(s.Working_Hours)}</span>` : "-"}</td>
          <td><span class="badge-status ${s.Is_Active ? "badge-active" : "badge-inactive"}">${s.Is_Active ? "Active" : "Inactive"}</span></td>
          <td><button class="btn btn-${s.Is_Active ? "danger" : "secondary"} btn-small"
                onclick="setStaffActive(${s.User_id}, ${!s.Is_Active})">${s.Is_Active ? "Deactivate" : "Activate"}</button></td>
        </tr>`
      )
      .join("");
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

async function setStaffActive(userId, isActive) {
  if (!isActive && !confirm("Deactivate this account? They will no longer be able to log in.")) return;
  try {
    await apiFetch(`/staff/${userId}/active`, { method: "PATCH", body: JSON.stringify({ is_active: isActive }) });
    showBanner(banner, isActive ? "Account activated." : "Account deactivated.", "success");
    loadStaff();
    loadDoctors();
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

// ---------- Register doctor / receptionist ----------
const staffForm = document.getElementById("staffForm");
const staffSubmitBtn = document.getElementById("staffSubmitBtn");
const doctorFields = document.getElementById("doctorFields");
const staffRoleButtons = document.querySelectorAll("[data-staff-role]");
let staffRole = "Doctor";

staffRoleButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    staffRoleButtons.forEach((b) => b.classList.toggle("active", b === btn));
    staffRole = btn.dataset.staffRole;
    const isDoctor = staffRole === "Doctor";
    doctorFields.style.display = isDoctor ? "block" : "none";
    doctorFields.querySelectorAll("input").forEach((i) => (i.required = isDoctor));
    staffSubmitBtn.textContent = isDoctor ? "Register Doctor" : "Register Receptionist";
    staffForm.querySelectorAll(".field").forEach((f) => f.classList.remove("invalid"));
  })
);

staffForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideBanner(banner);
  const val = (id) => document.getElementById(id).value.trim();
  const isDoctor = staffRole === "Doctor";
  const password = document.getElementById("staff_password").value;

  const checks = [
    setFieldInvalid("staff_first", !val("staff_first")),
    setFieldInvalid("staff_surname", !val("staff_surname")),
    setFieldInvalid("staff_id", !/^(\d{13}|[A-Za-z][A-Za-z0-9]{5,19})$/.test(val("staff_id"))),
    setFieldInvalid("staff_email", !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val("staff_email"))),
    setFieldInvalid("staff_phone", !/^[0-9+ ]{7,15}$/.test(val("staff_phone"))),
    setFieldInvalid("staff_password", password.length < 8),
    setFieldInvalid("staff_confirm", !password || document.getElementById("staff_confirm").value !== password),
  ];
  if (isDoctor) {
    checks.push(setFieldInvalid("staff_specialty", !val("staff_specialty")));
    checks.push(setFieldInvalid("staff_start", !val("staff_start") || !val("staff_end") || val("staff_end") <= val("staff_start")));
  }
  if (checks.includes(false)) return;

  const body = {
    First_Name: val("staff_first"),
    Surname: val("staff_surname"),
    id_number: val("staff_id"),
    Email: val("staff_email"),
    Phone_number: val("staff_phone"),
    password,
  };
  if (isDoctor) {
    body.Specialty = val("staff_specialty");
    body.Working_Hours = `${val("staff_start")}-${val("staff_end")}`;
  }

  staffSubmitBtn.disabled = true;
  try {
    const result = await apiFetch(`/staff/${isDoctor ? "doctors" : "receptionists"}`, { method: "POST", body: JSON.stringify(body) });
    staffForm.reset();
    loadDoctors();
    // Redirect to the staff list, where the new account now appears.
    panels.go("staff");
    showBanner(banner, result.message, "success");
  } catch (err) {
    showBanner(banner, err.message, "error");
  } finally {
    staffSubmitBtn.disabled = false;
  }
});

// ---------- Patient surveys ----------
const surveyFrom = document.getElementById("surveyFrom");
const surveyTo = document.getElementById("surveyTo");
const surveyDoctor = document.getElementById("surveyDoctor");
surveyFrom.value = monthStartIso();
surveyTo.value = todayIso();

function surveyQuery(format) {
  const q = new URLSearchParams({ from: surveyFrom.value, to: surveyTo.value });
  if (surveyDoctor.value) q.set("doctorId", surveyDoctor.value);
  if (format) q.set("format", format);
  return q.toString();
}

async function loadSurveys() {
  try {
    const r = await apiFetch(`/surveys?${surveyQuery()}`);
    const s = r.Summary;
    document.getElementById("surveyStats").innerHTML =
      statCard("Responses", s.Count) +
      statCard("Overall", ratingText(s.Overall)) +
      statCard("Doctor", ratingText(s.Doctor)) +
      statCard("Waiting time", ratingText(s.Waiting)) +
      statCard("Reception staff", ratingText(s.Staff)) +
      statCard("Would recommend", s.RecommendPercent == null ? "-" : `${s.RecommendPercent}%`);
    document.getElementById("surveyByDoctor").innerHTML = r.ByDoctor.length
      ? r.ByDoctor.map((d) => `
          <tr><td>${esc(d.Doctor)}</td><td>${d.Summary.Count}</td><td>${stars(d.Summary.Overall)} ${ratingText(d.Summary.Overall)}</td>
          <td>${ratingText(d.Summary.Doctor)}</td><td>${ratingText(d.Summary.Waiting)}</td><td>${ratingText(d.Summary.Staff)}</td>
          <td>${d.Summary.RecommendPercent}%</td></tr>`).join("")
      : `<tr><td colspan="7" class="muted">-</td></tr>`;
    document.getElementById("surveyEmpty").style.display = r.Items.length ? "none" : "block";
    document.getElementById("surveyItems").innerHTML = r.Items
      .map((i) => `
        <tr><td>${fmtDate(i.Appointment_date)}</td><td>${esc(i.Patient)}</td><td>${esc(i.Doctor)}</td>
        <td>${stars(i.Overall_rating)}</td><td>${i.Would_recommend ? "Yes" : "No"}</td><td>${esc(i.Comments || "-")}</td></tr>`)
      .join("");
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}
document.getElementById("surveyLoadBtn").addEventListener("click", loadSurveys);
document.getElementById("surveyPdfBtn").addEventListener("click", (e) =>
  downloadReport(e.currentTarget, `/reports/surveys?${surveyQuery("pdf")}`, banner));
document.getElementById("surveyCsvBtn").addEventListener("click", (e) =>
  downloadReport(e.currentTarget, `/reports/surveys?${surveyQuery("csv")}`, banner));

// ---------- Reports ----------
const repFrom = document.getElementById("repFrom");
const repTo = document.getElementById("repTo");
repFrom.value = monthStartIso();
repTo.value = todayIso(30);

function bookingsReport(button, format) {
  const q = new URLSearchParams({ from: repFrom.value, to: repTo.value, format });
  const doctor = document.getElementById("repDoctor").value;
  const status = document.getElementById("repStatus").value;
  if (doctor) q.set("doctorId", doctor);
  if (status) q.set("status", status);
  downloadReport(button, `/reports/bookings?${q}`, banner);
}
document.getElementById("repPdfBtn").addEventListener("click", (e) => bookingsReport(e.currentTarget, "pdf"));
document.getElementById("repCsvBtn").addEventListener("click", (e) => bookingsReport(e.currentTarget, "csv"));
document.getElementById("repSurveyPdfBtn").addEventListener("click", (e) =>
  downloadReport(e.currentTarget, `/reports/surveys?${surveyQuery("pdf")}`, banner));
document.getElementById("repSurveyCsvBtn").addEventListener("click", (e) =>
  downloadReport(e.currentTarget, `/reports/surveys?${surveyQuery("csv")}`, banner));

loadDoctors();
loadVisitReasons(newReason).catch((err) => showBanner(banner, err.message, "error"));

// ---------- Routing: each menu item has its own URL (#overview, #manage, #sos, ...) ----------
// Started last, so everything a panel needs is defined before its first load.
const panels = initPanels("overview", (name) => {
  loadSos();   // the SOS list, and the SOS badge / alert bar shown on every other panel
  if (name === "overview") loadOverview();
  if (name === "manage") loadBookings();
  if (name === "staff") loadStaff();
  if (name === "surveys") loadSurveys();
});

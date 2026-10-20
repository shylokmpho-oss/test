Session.requireRole("Patient");

document.getElementById("whoName").textContent = Session.name() || `Patient #${Session.id()}`;
document.getElementById("welcomeName").textContent = (Session.name() || "Patient").split(" ")[0];
document.getElementById("logoutBtn").addEventListener("click", () => Session.logout());

const banner = document.getElementById("banner");
let myBookings = [];
let doctors = [];

// ---------- Overview ----------
async function loadOverview() {
  try {
    const s = await apiFetch("/dashboard");
    document.getElementById("patientStats").innerHTML =
      statCard("Upcoming", s.Upcoming, "appointments") +
      statCard("Completed", s.Completed, "visits") +
      statCard("Cancelled", s.Cancelled) +
      statCard("Visits to rate", s.PendingSurveys, s.PendingSurveys ? "We'd love your feedback" : "All rated", s.PendingSurveys ? "alert" : "");
    updateSurveyBadge(s.PendingSurveys);

    const box = document.getElementById("nextAppointment");
    const n = s.Next;
    if (!n) {
      box.innerHTML = `<div class="empty-state">No upcoming appointments. <a href="#book">Book one now</a>.</div>`;
      return;
    }
    box.innerHTML = `
      <dl class="detail-list">
        <dt>Doctor</dt><dd><button class="link-btn" onclick="showDoctor(${n.Doctor_id}, ${n.Booking_id})">Dr. ${esc(n.DoctorFirstName)} ${esc(n.DoctorSurname)}</button>
          <span class="muted">${esc(n.Specialty || "")}</span></dd>
        <dt>When</dt><dd>${fmtDate(n.Appointment_date)} at ${fmtTime(n.Time_Slot)}</dd>
        <dt>Reason</dt><dd>${reasonCell(n)}</dd>
        <dt>Status</dt><dd>${statusBadge(n.Status)}</dd>
        <dt>Queue</dt><dd>${queueCell(n)}</dd>
      </dl>`;
    myBookings = myBookings.some((b) => b.Booking_id === n.Booking_id) ? myBookings : [...myBookings, n];
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

function updateSurveyBadge(count) {
  const badge = document.getElementById("surveyBadge");
  badge.textContent = count;
  badge.classList.toggle("show", count > 0);
}

// ---------- Load doctors and reasons for the dropdowns ----------
async function loadDoctors() {
  try {
    doctors = await apiFetch("/doctors");
    const options = doctorOptions(doctors);
    document.getElementById("doctor_id").innerHTML = `<option value="">Choose a doctor</option>${options}`;
    document.getElementById("edit_doctor_id").innerHTML = options;
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

// ---------- Book Appointment (Create) ----------
const bookForm = document.getElementById("bookForm");
const bookSubmitBtn = document.getElementById("bookSubmitBtn");
const doctorSelect = document.getElementById("doctor_id");
const dateInput = document.getElementById("appointment_date");
const slotSelect = document.getElementById("time_slot");
const reasonSelect = document.getElementById("reason_id");
const reasonNotes = document.getElementById("reason_notes");

dateInput.min = todayIso();
const refreshSlots = () => loadSlots(doctorSelect, dateInput, slotSelect);
doctorSelect.addEventListener("change", () => {
  const d = doctors.find((x) => String(x.Doctor_id) === doctorSelect.value);
  document.getElementById("doctorHint").textContent = d ? `${d.Specialty || "General"} - works ${d.Working_Hours}` : "";
  refreshSlots();
});
dateInput.addEventListener("change", refreshSlots);
reasonSelect.addEventListener("change", () => syncReasonNotes(reasonSelect, reasonNotes));

bookForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideBanner(banner);

  const doctor_id = doctorSelect.value;
  const appointment_date = dateInput.value;
  const time_slot = slotSelect.value;

  const doctorOk = setFieldInvalid("f-doctor", !doctor_id);
  const dateOk = setFieldInvalid("f-date", !appointment_date || appointment_date < todayIso());
  const timeOk = setFieldInvalid("f-time", !time_slot);
  const reason = readReason(reasonSelect, reasonNotes);
  if (!doctorOk || !dateOk || !timeOk || !reason) return;

  bookSubmitBtn.disabled = true;
  bookSubmitBtn.textContent = "Booking...";
  try {
    const booking = await apiFetch("/bookings", {
      method: "POST",
      body: JSON.stringify({ doctor_id, appointment_date, time_slot, ...reason }),
    });
    bookForm.reset();
    syncReasonNotes(reasonSelect, reasonNotes);
    document.getElementById("doctorHint").textContent = "";
    refreshSlots();
    // Redirect to My Appointments, where the new booking is listed.
    panels.go("mine");
    showBanner(banner, `Appointment booked for ${fmtDate(booking.Appointment_date)} at ${fmtTime(booking.Time_Slot)}. ` +
      `You are number ${booking.Position} in the queue for that day. A confirmation has been sent to your phone.`, "success");
  } catch (err) {
    showBanner(banner, err.message, "error");
    refreshSlots();
  } finally {
    bookSubmitBtn.disabled = false;
    bookSubmitBtn.textContent = "Book Appointment";
  }
});

// ---------- My Appointments (Read / Update / Delete) ----------
function queueCell(b) {
  if (b.Position == null) return "-";
  if (b.Status === "WITH_DOCTOR") return "Now";
  const wait = b.EstimatedWaitMinutes ? ` (~${b.EstimatedWaitMinutes} min)` : "";
  return `#${b.Position}${wait}`;
}

function actionsFor(b) {
  if (b.Status === "BOOKED") {
    return `<button class="btn btn-secondary btn-small" onclick="openEdit(${b.Booking_id})">Edit</button>
            <button class="btn btn-danger btn-small" onclick="cancelBooking(${b.Booking_id})">Cancel</button>`;
  }
  if (b.Status === "COMPLETED" && !b.Has_survey) {
    return `<button class="btn btn-primary btn-small" onclick="openSurvey(${b.Booking_id})">⭐ Rate visit</button>`;
  }
  if (b.Status === "COMPLETED") return `<span class="muted">Rated - thank you</span>`;
  return "-";
}

async function loadMyBookings() {
  const tbody = document.getElementById("myBookingsBody");
  const empty = document.getElementById("myBookingsEmpty");
  try {
    myBookings = await apiFetch("/bookings/mine");
    if (myBookings.length === 0) {
      tbody.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    tbody.innerHTML = myBookings
      .map(
        (b) => `
        <tr>
          <td><button class="link-btn" onclick="showDoctor(${b.Doctor_id}, ${b.Booking_id})" title="View doctor details">
                Dr. ${esc(b.DoctorFirstName)} ${esc(b.DoctorSurname)}</button>
              <span class="reason-notes">${esc(b.Specialty || "")}</span></td>
          <td>${fmtDate(b.Appointment_date)}</td>
          <td>${fmtTime(b.Time_Slot)}</td>
          <td>${reasonCell(b)}</td>
          <td>${statusBadge(b.Status)}</td>
          <td>${queueCell(b)}</td>
          <td class="actions-cell">
            <button class="btn btn-secondary btn-small" onclick="showDoctor(${b.Doctor_id}, ${b.Booking_id})">Details</button>
            ${actionsFor(b)}
          </td>
        </tr>`
      )
      .join("");
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

// Session position auto-refresh (SDS 5.3): every 30 seconds while My Appointments is open.
setInterval(() => {
  if (panels.current() === "mine" && !document.querySelector(".modal-overlay.show")) {
    loadMyBookings();
  }
}, 30000);

async function cancelBooking(id) {
  if (!confirm("Cancel this appointment?")) return;
  try {
    await apiFetch(`/bookings/${id}`, { method: "DELETE" });
    showBanner(banner, "Appointment cancelled. A message has been sent to your phone.", "success");
    loadMyBookings();
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

document.getElementById("historyPdfBtn").addEventListener("click", (e) =>
  downloadReport(e.currentTarget, "/reports/my-history?format=pdf", banner));
document.getElementById("historyCsvBtn").addEventListener("click", (e) =>
  downloadReport(e.currentTarget, "/reports/my-history?format=csv", banner));

// ---------- Doctor details on an appointment ----------
const doctorModal = document.getElementById("doctorModal");
document.getElementById("doctorModalClose").addEventListener("click", () => doctorModal.classList.remove("show"));

async function showDoctor(doctorId, bookingId) {
  const body = document.getElementById("doctorModalBody");
  body.innerHTML = `<div class="empty-state">Loading...</div>`;
  doctorModal.classList.add("show");
  try {
    const d = await apiFetch(`/doctors/${doctorId}`);
    const b = myBookings.find((x) => x.Booking_id === bookingId);
    document.getElementById("doctorModalTitle").textContent = `Dr. ${d.First_Name} ${d.Surname}`;
    body.innerHTML = `
      <dl class="detail-list">
        <dt>Specialty</dt><dd>${esc(d.Specialty || "General Practice")}</dd>
        <dt>Working hours</dt><dd>${esc(d.Working_Hours)}</dd>
        <dt>Email</dt><dd>${d.Email ? `<a href="mailto:${esc(d.Email)}">${esc(d.Email)}</a>` : "-"}</dd>
        <dt>Phone</dt><dd>${d.Phone_number ? `<a href="tel:${esc(d.Phone_number.replace(/\s/g, ""))}">${esc(d.Phone_number)}</a>` : "-"}</dd>
      </dl>
      ${b ? `
      <div class="divider">Your appointment</div>
      <dl class="detail-list">
        <dt>Date</dt><dd>${fmtDate(b.Appointment_date)}</dd>
        <dt>Time</dt><dd>${fmtTime(b.Time_Slot)}</dd>
        <dt>Reason</dt><dd>${reasonCell(b)}</dd>
        <dt>Status</dt><dd>${statusBadge(b.Status)}</dd>
        <dt>Queue</dt><dd>${queueCell(b)}</dd>
      </dl>` : ""}`;
  } catch (err) {
    body.innerHTML = `<div class="banner show error">${esc(err.message)}</div>`;
  }
}

// ---------- Edit (reschedule) modal ----------
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
  editing = myBookings.find((b) => b.Booking_id === id);
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
    showBanner(banner, "Appointment updated. A message has been sent to your phone.", "success");
    loadMyBookings();
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
});

// ---------- Patient experience survey ----------
const surveyModal = document.getElementById("surveyModal");
const surveyForm = document.getElementById("surveyForm");
let surveyBookingId = null;

// Star pickers: 5 buttons each, the value is kept in the field's hidden input.
surveyForm.querySelectorAll("[data-rating]").forEach((field) => {
  const starsBox = field.querySelector(".stars");
  const hidden = field.querySelector("input[type=hidden]");
  starsBox.innerHTML = [1, 2, 3, 4, 5]
    .map((n) => `<button type="button" data-value="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`)
    .join("");
  starsBox.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    hidden.value = btn.dataset.value;
    starsBox.querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.value <= +hidden.value));
    field.classList.remove("invalid");
  });
});

async function loadToRate() {
  const tbody = document.getElementById("toRateBody");
  const empty = document.getElementById("toRateEmpty");
  try {
    myBookings = await apiFetch("/bookings/mine");
    const toRate = myBookings.filter((b) => b.Status === "COMPLETED" && !b.Has_survey);
    updateSurveyBadge(toRate.length);
    empty.style.display = toRate.length ? "none" : "block";
    tbody.innerHTML = toRate
      .map(
        (b) => `
        <tr>
          <td>Dr. ${esc(b.DoctorFirstName)} ${esc(b.DoctorSurname)}</td>
          <td>${fmtDate(b.Appointment_date)}</td>
          <td>${reasonCell(b)}</td>
          <td><button class="btn btn-primary btn-small" onclick="openSurvey(${b.Booking_id})">⭐ Rate visit</button></td>
        </tr>`
      )
      .join("");
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

function openSurvey(bookingId) {
  const b = myBookings.find((x) => x.Booking_id === bookingId);
  surveyBookingId = bookingId;
  surveyForm.reset();
  surveyForm.querySelectorAll("input[type=hidden]").forEach((h) => (h.value = ""));
  surveyForm.querySelectorAll(".stars button").forEach((s) => s.classList.remove("on"));
  surveyForm.querySelectorAll(".field").forEach((f) => f.classList.remove("invalid"));
  document.getElementById("surveyFor").textContent = b
    ? `Your visit to Dr. ${b.DoctorFirstName} ${b.DoctorSurname} on ${fmtDate(b.Appointment_date)}`
    : "";
  surveyModal.classList.add("show");
}
document.getElementById("surveyCancelBtn").addEventListener("click", () => surveyModal.classList.remove("show"));

surveyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = { booking_id: surveyBookingId, comments: document.getElementById("survey_comments").value.trim() || null };

  let ok = true;
  surveyForm.querySelectorAll("[data-rating]").forEach((field) => {
    const value = field.querySelector("input[type=hidden]").value;
    ok = setFieldInvalid(field, !value) && ok;
    body[field.dataset.rating] = Number(value);
  });
  const recommend = surveyForm.querySelector("input[name=would_recommend]:checked");
  ok = setFieldInvalid("f-recommend", !recommend) && ok;
  if (!ok) return;
  body.would_recommend = recommend.value === "true";

  const btn = document.getElementById("surveySubmitBtn");
  btn.disabled = true;
  try {
    const result = await apiFetch("/surveys", { method: "POST", body: JSON.stringify(body) });
    surveyModal.classList.remove("show");
    showBanner(banner, result.message, "success");
    if (panels.current() === "feedback") loadToRate();
    else loadMyBookings();
  } catch (err) {
    showBanner(banner, err.message, "error");
    surveyModal.classList.remove("show");
  } finally {
    btn.disabled = false;
  }
});
surveyForm.querySelectorAll("input[name=would_recommend]").forEach((r) =>
  r.addEventListener("change", () => setFieldInvalid("f-recommend", false)));

loadDoctors();
loadVisitReasons(reasonSelect).catch((err) => showBanner(banner, err.message, "error"));

// ---------- Routing: each menu item has its own URL (#overview, #book, #mine, #feedback) ----------
// Started last, so everything a panel needs is defined before its first load.
const panels = initPanels("overview", (name) => {
  if (name === "overview") loadOverview();
  if (name === "mine") loadMyBookings();
  if (name === "feedback") loadToRate();
});

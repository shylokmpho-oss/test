Session.requireRole("Doctor");

document.getElementById("whoName").textContent = Session.name() || `Dr. #${Session.id()}`;
document.getElementById("welcomeName").textContent = Session.name() || "Doctor";
document.getElementById("logoutBtn").addEventListener("click", () => Session.logout());

const banner = document.getElementById("banner");

// ---------- Overview ----------
async function loadOverview() {
  document.getElementById("todayLabel").textContent =
    new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  try {
    const s = await apiFetch("/dashboard");
    const t = s.Today;
    document.getElementById("doctorStats").innerHTML =
      statCard("Patients today", t.TOTAL) +
      statCard("Checked in - waiting", t.CHECKED_IN, "", t.CHECKED_IN ? "alert" : "") +
      statCard("Not arrived yet", t.BOOKED) +
      statCard("Seen today", t.COMPLETED) +
      statCard("Next 7 days", s.UpcomingWeek, "bookings");

    const n = s.Next;
    document.getElementById("nextPatient").innerHTML = n
      ? `<dl class="detail-list">
          <dt>Patient</dt><dd><b>${esc(n.PatientFirstName)} ${esc(n.PatientSurname)}</b></dd>
          <dt>Time</dt><dd>${fmtTime(n.Time_Slot)}</dd>
          <dt>Reason</dt><dd>${reasonCell(n)}</dd>
          <dt>Status</dt><dd>${statusBadge(n.Status)}</dd>
        </dl>
        <div class="actions-cell" style="margin-top:14px;">${actionsFor(n)}
          <button class="btn btn-secondary btn-small" onclick="viewHistoryByPatientId(${n.Patient_id})">History</button></div>`
      : `<div class="empty-state">No more patients waiting today.</div>`;

    const r = s.Ratings;
    document.getElementById("myRatings").innerHTML = r.Count
      ? `<dl class="detail-list">
          <dt>Overall</dt><dd>${stars(r.Overall)} ${ratingText(r.Overall)}</dd>
          <dt>You (doctor)</dt><dd>${stars(r.Doctor)} ${ratingText(r.Doctor)}</dd>
          <dt>Waiting time</dt><dd>${stars(r.Waiting)} ${ratingText(r.Waiting)}</dd>
          <dt>Would recommend</dt><dd>${r.RecommendPercent}%</dd>
          <dt>Responses</dt><dd>${r.Count} - <a href="#feedback">see comments</a></dd>
        </dl>`
      : `<div class="empty-state">No patient feedback yet.</div>`;
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

// ---------- My Bookings ----------
function actionsFor(b) {
  switch (b.Status) {
    case "CHECKED_IN":
      return `<button class="btn btn-secondary btn-small" onclick="setStatus(${b.Booking_id}, 'WITH_DOCTOR')">Start Consultation</button>
              <button class="btn btn-primary btn-small" onclick="setStatus(${b.Booking_id}, 'COMPLETED')">Mark Complete</button>`;
    case "WITH_DOCTOR":
      return `<button class="btn btn-primary btn-small" onclick="setStatus(${b.Booking_id}, 'COMPLETED')">Mark Complete</button>`;
    case "BOOKED":
      return `<span style="color:#9aa1b3;font-size:13px;">Awaiting check-in</span>`;
    default:
      return "";
  }
}

const bookingsDate = document.getElementById("bookingsDate");
bookingsDate.addEventListener("change", loadBookings);
document.getElementById("bookingsTodayBtn").addEventListener("click", () => { bookingsDate.value = todayIso(); loadBookings(); });
document.getElementById("bookingsAllBtn").addEventListener("click", () => { bookingsDate.value = ""; loadBookings(); });

async function loadBookings() {
  const tbody = document.getElementById("bookingsBody");
  const empty = document.getElementById("bookingsEmpty");
  try {
    const query = bookingsDate.value ? `?date=${bookingsDate.value}` : "";
    const bookings = await apiFetch(`/doctors/${Session.id()}/bookings${query}`);
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
          <td>${fmtDate(b.Appointment_date)}</td>
          <td>${fmtTime(b.Time_Slot)}</td>
          <td>${reasonCell(b)}</td>
          <td>${statusBadge(b.Status)}</td>
          <td class="actions-cell">
            ${actionsFor(b)}
            <button class="btn btn-secondary btn-small" onclick="viewHistoryByPatientId(${b.Patient_id})">History</button>
          </td>
        </tr>`
      )
      .join("");
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

// UC-09: checked-in -> with doctor -> completed
async function setStatus(id, status) {
  try {
    await apiFetch(`/bookings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    showBanner(banner, status === "COMPLETED" ? "Marked as complete." : "Consultation started.", "success");
    if (panels.current() === "overview") loadOverview();
    else loadBookings();
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}

// ---------- Patient History (searchable by patient ID number) ----------
const resultBox = document.getElementById("historySearchResult");
const searchInput = document.getElementById("historySearchInput");
const searchBtn = document.getElementById("historySearchBtn");
wireHistoryDownloads(resultBox, banner);

// Used by the "History" button on a booking row - we already know the
// internal patient id, so skip straight to fetching their history.
async function viewHistoryByPatientId(patientId) {
  panels.go("history");
  resultBox.innerHTML = `<div class="empty-state">Loading...</div>`;
  try {
    const [patient, history] = await Promise.all([
      apiFetch(`/patients/${patientId}`),
      apiFetch(`/patients/${patientId}/history`),
    ]);
    resultBox.innerHTML = renderPatientHistory(patient, history);
  } catch (err) {
    resultBox.innerHTML = "";
    showBanner(banner, err.message, "error");
  }
}

// Used by the search box - staff types the patient's real-world ID number.
async function searchHistory() {
  const idNumber = searchInput.value.trim();
  if (!/^\d{13}$/.test(idNumber)) {
    resultBox.innerHTML = "";
    showBanner(banner, "Please enter a valid 13-digit ID number.", "error");
    return;
  }
  hideBanner(banner);
  resultBox.innerHTML = `<div class="empty-state">Searching...</div>`;

  try {
    const patient = await apiFetch(`/patients/by-id-number/${idNumber}`);
    const history = await apiFetch(`/patients/${patient.Patient_id}/history`);
    resultBox.innerHTML = renderPatientHistory(patient, history);
  } catch (err) {
    resultBox.innerHTML = "";
    showBanner(banner, err.message, "error");
  }
}

searchBtn.addEventListener("click", searchHistory);
searchInput.addEventListener("input", () => {
  searchInput.value = searchInput.value.replace(/\D/g, "").slice(0, 13);
});
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchHistory();
});

// ---------- My patient feedback (anonymous) ----------
const fbFrom = document.getElementById("fbFrom");
const fbTo = document.getElementById("fbTo");
fbFrom.value = todayIso(-90);
fbTo.value = todayIso();
const feedbackQuery = (format) =>
  new URLSearchParams({ from: fbFrom.value, to: fbTo.value, ...(format ? { format } : {}) }).toString();

async function loadFeedback() {
  try {
    const r = await apiFetch(`/surveys?${feedbackQuery()}`);
    const s = r.Summary;
    document.getElementById("fbStats").innerHTML =
      statCard("Responses", s.Count) +
      statCard("Overall", ratingText(s.Overall)) +
      statCard("You (doctor)", ratingText(s.Doctor)) +
      statCard("Waiting time", ratingText(s.Waiting)) +
      statCard("Would recommend", s.RecommendPercent == null ? "-" : `${s.RecommendPercent}%`);
    document.getElementById("fbEmpty").style.display = r.Items.length ? "none" : "block";
    document.getElementById("fbItems").innerHTML = r.Items
      .map((i) => `
        <tr><td>${fmtDate(i.Appointment_date)}</td><td>${stars(i.Overall_rating)}</td><td>${stars(i.Doctor_rating)}</td>
        <td>${stars(i.Waiting_rating)}</td><td>${i.Would_recommend ? "Yes" : "No"}</td><td>${esc(i.Comments || "-")}</td></tr>`)
      .join("");
  } catch (err) {
    showBanner(banner, err.message, "error");
  }
}
document.getElementById("fbLoadBtn").addEventListener("click", loadFeedback);

// ---------- Reports ----------
const repFrom = document.getElementById("repFrom");
const repTo = document.getElementById("repTo");
repFrom.value = monthStartIso();
repTo.value = todayIso(30);

function bookingsReport(button, format) {
  const q = new URLSearchParams({ from: repFrom.value, to: repTo.value, format });
  const status = document.getElementById("repStatus").value;
  if (status) q.set("status", status);
  downloadReport(button, `/reports/bookings?${q}`, banner);
}
document.getElementById("repPdfBtn").addEventListener("click", (e) => bookingsReport(e.currentTarget, "pdf"));
document.getElementById("repCsvBtn").addEventListener("click", (e) => bookingsReport(e.currentTarget, "csv"));
document.getElementById("repFbPdfBtn").addEventListener("click", (e) =>
  downloadReport(e.currentTarget, `/reports/surveys?${feedbackQuery("pdf")}`, banner));
document.getElementById("repFbCsvBtn").addEventListener("click", (e) =>
  downloadReport(e.currentTarget, `/reports/surveys?${feedbackQuery("csv")}`, banner));

// ---------- Routing: each menu item has its own URL (#overview, #today, #history, ...) ----------
// Started last, so everything a panel needs is defined before its first load.
const panels = initPanels("overview", (name) => {
  if (name === "overview") loadOverview();
  if (name === "today") loadBookings();
  if (name === "feedback") loadFeedback();
});

// =====================================================================
// SOS (emergency) button. Include after api.js on any page.
//  - Everyone: one-tap calls to emergency numbers.
//  - Logged-in patients: also send an SOS alert to hospital reception
//    (optionally with their location) and see when reception responds.
// =====================================================================
(function () {
  const EMERGENCY_NUMBERS = [
    { label: "Ambulance (national)", number: "10177" },
    { label: "Emergency from any cellphone", number: "112" },
    { label: "Hospital reception", number: "012 345 6789" },
  ];

  const isPatient = () => Session.isLoggedIn() && Session.role() === "Patient";

  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "sos-fab";
  fab.textContent = "SOS";
  fab.title = "Emergency - SOS";
  fab.setAttribute("aria-label", "SOS emergency help");

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "sosModal";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-labelledby="sosTitle">
      <h3 id="sosTitle" style="color:#b42318;">🚨 Emergency</h3>
      <p class="muted" style="margin-bottom:12px;">If this is a life-threatening emergency, call now:</p>
      ${EMERGENCY_NUMBERS.map((n) => `
        <a class="sos-call" href="tel:${n.number.replace(/\s/g, "")}">
          <span>📞 ${esc(n.label)}</span><span class="num">${esc(n.number)}</span>
        </a>`).join("")}
      <div id="sosPatientSection"></div>
      <div class="modal-actions" style="margin-top:14px;">
        <button type="button" class="btn btn-secondary" id="sosCloseBtn">Close</button>
      </div>
    </div>`;

  document.body.appendChild(fab);
  document.body.appendChild(overlay);

  const section = overlay.querySelector("#sosPatientSection");
  let pollTimer = null;

  function renderPatientSection() {
    if (!isPatient()) {
      section.innerHTML = `
        <div class="divider">Hospital patients</div>
        <p class="muted"><a href="login.html?next=patient-dashboard.html">Log in</a> to send an SOS alert straight to hospital reception.</p>`;
      return;
    }
    section.innerHTML = `
      <div class="divider">Alert hospital reception</div>
      <div id="sosBanner" class="banner"></div>
      <div class="field">
        <label for="sosMessage">What is happening? (optional)</label>
        <textarea id="sosMessage" maxlength="250" placeholder="e.g. Chest pain, I am in the waiting area"></textarea>
      </div>
      <div class="field">
        <label style="display:flex;gap:8px;align-items:center;font-weight:400;">
          <input type="checkbox" id="sosLocation" style="width:auto;" checked> Share my location with reception
        </label>
      </div>
      <button type="button" class="btn btn-sos" id="sosSendBtn">Send SOS alert to reception</button>
      <div id="sosStatus" class="muted" style="margin-top:10px;"></div>`;
    section.querySelector("#sosSendBtn").addEventListener("click", sendAlert);
    refreshStatus();
  }

  function getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: +pos.coords.latitude.toFixed(6), longitude: +pos.coords.longitude.toFixed(6) }),
        () => resolve(null),
        { timeout: 6000, maximumAge: 60000 }
      );
    });
  }

  async function sendAlert() {
    const btn = section.querySelector("#sosSendBtn");
    const banner = section.querySelector("#sosBanner");
    btn.disabled = true;
    btn.textContent = "Sending...";
    try {
      const coords = section.querySelector("#sosLocation").checked ? await getLocation() : null;
      const result = await apiFetch("/sos", {
        method: "POST",
        body: JSON.stringify({ message: section.querySelector("#sosMessage").value.trim() || null, ...(coords || {}) }),
      });
      showBanner(banner, result.message, "success");
      refreshStatus();
    } catch (err) {
      showBanner(banner, err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Send SOS alert to reception";
    }
  }

  // Shows the latest alert's status, so the patient knows reception has seen it.
  async function refreshStatus() {
    const status = section.querySelector("#sosStatus");
    if (!status) return;
    try {
      const alert = await apiFetch("/sos/mine");
      if (!alert) { status.textContent = ""; return; }
      const text = {
        OPEN: "⏳ Your alert has been sent - waiting for reception to respond.",
        ACKNOWLEDGED: `✅ Reception${alert.HandledBy ? ` (${alert.HandledBy})` : ""} has seen your alert and is on the way.`,
        RESOLVED: "Your last alert was resolved.",
      }[alert.Status];
      status.textContent = `${text} (${fmtDateTime(alert.Created_at)})`;
    } catch (_) { /* keep the modal usable even if this fails */ }
  }

  function open() {
    renderPatientSection();
    overlay.classList.add("show");
    clearInterval(pollTimer);
    if (isPatient()) pollTimer = setInterval(refreshStatus, 10000);
  }
  function close() {
    overlay.classList.remove("show");
    clearInterval(pollTimer);
  }

  fab.addEventListener("click", open);
  overlay.querySelector("#sosCloseBtn").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("show")) close(); });
})();

const params = new URLSearchParams(location.search);

// Only return to a page of the role that just logged in (never an outside URL).
function redirectAfterLogin(role) {
  const dashboard = DASHBOARDS[role] || "login.html";
  const next = params.get("next") || "";
  const target = next.split("#")[0] === dashboard ? next : dashboard;
  // A temporary password from reception must be replaced before anything else.
  location.href = Session.mustChangePassword() ? `change-password.html?next=${encodeURIComponent(target)}` : target;
}

// If already logged in, skip straight to the right dashboard.
if (Session.isLoggedIn()) {
  redirectAfterLogin(Session.role());
}

let selectedRole = "Patient";

const roleButtons = document.querySelectorAll(".role-btn");
const registerDivider = document.getElementById("registerDivider");
const registerLink = document.getElementById("registerLink");
const forgotLink = document.getElementById("forgotLink");

function selectRole(role) {
  const btn = [...roleButtons].find((b) => b.dataset.role === role);
  if (!btn) return;
  roleButtons.forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  selectedRole = role;
  // Only patients can self-register
  const showRegister = selectedRole === "Patient";
  registerDivider.style.display = showRegister ? "flex" : "none";
  registerLink.style.display = showRegister ? "block" : "none";
  forgotLink.href = `forgot-password.html?role=${encodeURIComponent(role)}`;
}
roleButtons.forEach((btn) => btn.addEventListener("click", () => selectRole(btn.dataset.role)));

const form = document.getElementById("loginForm");
const banner = document.getElementById("banner");
const submitBtn = document.getElementById("submitBtn");

// Messages for the pages that redirect here.
const notices = {
  registered: ["Account created! Please log in with your ID number and password.", "success"],
  reset: ["Your password has been changed. Please log in with your new password.", "success"],
  expired: ["Your session has expired. Please log in again.", "error"],
  loggedout: ["You have been logged out.", "success"],
};
for (const [key, [message, type]] of Object.entries(notices)) {
  if (params.has(key)) showBanner(banner, message, type);
}
if (params.get("next")) {
  const role = Object.keys(DASHBOARDS).find((r) => params.get("next").startsWith(DASHBOARDS[r]));
  if (role) selectRole(role);
}
if (params.get("role")) selectRole(params.get("role"));
if (params.get("id")) document.getElementById("id_number").value = params.get("id");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideBanner(banner);

  const id_number = document.getElementById("id_number").value.trim();
  const password = document.getElementById("password").value;

  const idOk = setFieldInvalid("id_number", id_number.length === 0);
  const pwOk = setFieldInvalid("password", password.length === 0);
  if (!idOk || !pwOk) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Logging in...";

  try {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ role: selectedRole, id_number, password }),
    });
    Session.save(data.token, data.role, data.id, data.name, data.must_change_password);
    redirectAfterLogin(data.role);
  } catch (err) {
    showBanner(banner, err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Log In";
  }
});

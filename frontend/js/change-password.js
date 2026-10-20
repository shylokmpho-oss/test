// Shown after logging in with a temporary password from reception (and usable any time
// while logged in). Afterwards the person continues to the page they were going to.
if (!Session.isLoggedIn()) location.replace("login.html");

const params = new URLSearchParams(location.search);
const banner = document.getElementById("banner");
const temporary = Session.mustChangePassword();

document.getElementById("logoutBtn").addEventListener("click", () => Session.logout());
document.getElementById("intro").textContent = temporary
  ? `Welcome${Session.name() ? ", " + Session.name() : ""}! You logged in with a temporary password. Please choose your own password to continue.`
  : "Enter your current password and choose a new one.";
if (!temporary) document.getElementById("currentLabel").textContent = "Current password";

// Only continue to this role's own dashboard (never an outside URL).
function nextPage() {
  const dashboard = Session.dashboard();
  const next = params.get("next") || "";
  return next.split("#")[0] === dashboard ? next : dashboard;
}

document.getElementById("changeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideBanner(banner);

  const current_password = document.getElementById("current_password").value;
  const new_password = document.getElementById("new_password").value;
  const confirm = document.getElementById("confirm_password").value;

  const ok = [
    setFieldInvalid("current_password", !current_password),
    setFieldInvalid("new_password", new_password.length < 8 || new_password === current_password),
    setFieldInvalid("confirm_password", !confirm || confirm !== new_password),
  ];
  if (ok.includes(false)) return;

  const btn = document.getElementById("saveBtn");
  btn.disabled = true;
  btn.textContent = "Saving...";
  try {
    // The API returns a fresh token without the temporary-password restriction.
    const data = await apiFetch("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    });
    Session.save(data.token, data.role, data.id, data.name, false);
    showBanner(banner, "Password saved! Taking you to your dashboard...", "success");
    setTimeout(() => (location.href = nextPage()), 900);
  } catch (err) {
    showBanner(banner, err.message, "error");
    btn.disabled = false;
    btn.textContent = "Save Password";
  }
});

const banner = document.getElementById("banner");
const devNote = document.getElementById("devNote");
const requestForm = document.getElementById("requestForm");
const resetForm = document.getElementById("resetForm");
const requestBtn = document.getElementById("requestBtn");
const resetBtn = document.getElementById("resetBtn");
const idInput = document.getElementById("id_number");
const codeInput = document.getElementById("code");

let selectedRole = "Patient";
const roleButtons = document.querySelectorAll(".role-btn");
function selectRole(role) {
  const btn = [...roleButtons].find((b) => b.dataset.role === role);
  if (!btn) return;
  roleButtons.forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  selectedRole = role;
}
roleButtons.forEach((btn) => btn.addEventListener("click", () => selectRole(btn.dataset.role)));
selectRole(new URLSearchParams(location.search).get("role") || "Patient");

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
});

// Step 1: ask the API to send a code by SMS or WhatsApp.
async function requestCode() {
  hideBanner(banner);
  const id_number = idInput.value.trim();
  if (!setFieldInvalid(idInput, id_number.length === 0)) return false;
  const channel = document.querySelector("input[name=channel]:checked").value;

  requestBtn.disabled = true;
  requestBtn.textContent = "Sending...";
  try {
    const result = await apiFetch("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ role: selectedRole, id_number, channel }),
    });
    showBanner(banner, result.message, "success");
    // Development only (no Twilio keys configured): the API returns the code so the flow can be tested.
    if (result.dev_code) {
      devNote.textContent = `Development mode - SMS/WhatsApp is not configured, so here is the code: ${result.dev_code}`;
      devNote.style.display = "block";
    } else {
      devNote.style.display = "none";
    }
    requestForm.style.display = "none";
    resetForm.style.display = "block";
    codeInput.focus();
    return true;
  } catch (err) {
    showBanner(banner, err.message, "error");
    return false;
  } finally {
    requestBtn.disabled = false;
    requestBtn.textContent = "Send Code";
  }
}

requestForm.addEventListener("submit", (e) => {
  e.preventDefault();
  requestCode();
});

document.getElementById("resendBtn").addEventListener("click", () => {
  resetForm.style.display = "none";
  requestForm.style.display = "block";
  devNote.style.display = "none";
  hideBanner(banner);
});

// Step 2: check the code and set the new password, then go to the login page.
resetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideBanner(banner);

  const code = codeInput.value.trim();
  const new_password = document.getElementById("new_password").value;
  const confirm = document.getElementById("confirm_password").value;

  const codeOk = setFieldInvalid(codeInput, !/^\d{6}$/.test(code));
  const pwOk = setFieldInvalid("new_password", new_password.length < 8);
  const confirmOk = setFieldInvalid("confirm_password", confirm.length === 0 || confirm !== new_password);
  if (!codeOk || !pwOk || !confirmOk) return;

  resetBtn.disabled = true;
  resetBtn.textContent = "Saving...";
  try {
    await apiFetch("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ role: selectedRole, id_number: idInput.value.trim(), code, new_password }),
    });
    location.href = `login.html?reset=1&role=${encodeURIComponent(selectedRole)}&id=${encodeURIComponent(idInput.value.trim())}`;
  } catch (err) {
    showBanner(banner, err.message, "error");
  } finally {
    resetBtn.disabled = false;
    resetBtn.textContent = "Change Password";
  }
});

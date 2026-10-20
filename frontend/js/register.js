const form = document.getElementById("registerForm");
const banner = document.getElementById("banner");
const submitBtn = document.getElementById("submitBtn");

// Strip anything that isn't a digit as the person types, and hard-cap at 13
// characters, so it's impossible to enter letters or an ID number that's
// too long in the first place.
const idNumberInput = document.getElementById("id_number");
idNumberInput.addEventListener("input", () => {
  idNumberInput.value = idNumberInput.value.replace(/\D/g, "").slice(0, 13);
});

function setInvalid(id, invalid) {
  document.getElementById(id).closest(".field").classList.toggle("invalid", invalid);
}

function validate() {
  const first_name = document.getElementById("first_name").value.trim();
  const last_name = document.getElementById("last_name").value.trim();
  const surname = document.getElementById("surname").value.trim();
  const id_number = document.getElementById("id_number").value.trim();
  const mobile_number = document.getElementById("mobile_number").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirm_password = document.getElementById("confirm_password").value;

  const firstOk = first_name.length > 0;
  const lastOk = last_name.length > 0;
  const surnameOk = surname.length > 0;
  const idOk = /^\d{13}$/.test(id_number);
  const mobileOk = /^[0-9+ ]{7,15}$/.test(mobile_number);
  const emailOk = email.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordOk = password.length >= 8;
  const confirmOk = confirm_password.length > 0 && confirm_password === password;

  setInvalid("first_name", !firstOk);
  setInvalid("last_name", !lastOk);
  setInvalid("surname", !surnameOk);
  setInvalid("id_number", !idOk);
  setInvalid("mobile_number", !mobileOk);
  setInvalid("email", !emailOk);
  setInvalid("password", !passwordOk);
  setInvalid("confirm_password", !confirmOk);

  return {
    valid: firstOk && lastOk && surnameOk && idOk && mobileOk && emailOk && passwordOk && confirmOk,
    values: { first_name, last_name, surname, id_number, mobile_number, email, password },
  };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideBanner(banner);

  const { valid, values } = validate();
  if (!valid) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Creating account...";

  try {
    await apiFetch("/patients/register", {
      method: "POST",
      body: JSON.stringify({
        Surname: values.surname,
        First_Name: values.first_name,
        Last_name: values.last_name,
        id_number: values.id_number,
        mobile_number: values.mobile_number,
        email: values.email || null,
        preferred_channel: document.getElementById("preferred_channel").value,
        password: values.password,
      }),
    });
    showBanner(banner, "Account created! Taking you to the login page...", "success");
    setTimeout(() => {
      location.href = `login.html?registered=1&role=Patient&id=${encodeURIComponent(values.id_number)}`;
    }, 1200);
  } catch (err) {
    showBanner(banner, err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Account";
  }
});

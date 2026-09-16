const bookingForm = document.querySelector("#booking-form");
const pickupDate = document.querySelector("#pickupDate");
const returnDate = document.querySelector("#returnDate");
const carCategory = document.querySelector("#carCategory");
const formStatus = document.querySelector("#form-status");
const submitButton = bookingForm?.querySelector("button[type='submit']");

document.querySelector("#year").textContent = new Date().getFullYear();

const today = new Date();
const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
  .toISOString()
  .split("T")[0];

pickupDate.min = localToday;
returnDate.min = localToday;

pickupDate.addEventListener("change", () => {
  returnDate.min = pickupDate.value || localToday;
  if (returnDate.value && returnDate.value <= pickupDate.value) {
    returnDate.value = "";
  }
});

document.querySelectorAll(".choose-car").forEach((button) => {
  button.addEventListener("click", () => {
    carCategory.value = button.dataset.car;
    document.querySelector("#booking").scrollIntoView({ behavior: "smooth" });
    window.setTimeout(() => document.querySelector("#fullName").focus({ preventScroll: true }), 650);
  });
});

const showStatus = (type, message) => {
  formStatus.className = `form-status full-field ${type}`;
  formStatus.textContent = message;
};

const params = new URLSearchParams(window.location.search);
if (params.get("submitted") === "1") {
  showStatus("success", "Το αίτημά σου καταχωρίστηκε. Θα επικοινωνήσουμε μαζί σου σύντομα.");
}

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!bookingForm.reportValidity()) return;

  if (returnDate.value <= pickupDate.value) {
    showStatus("error", "Η ημερομηνία επιστροφής πρέπει να είναι μετά την ημερομηνία παραλαβής.");
    returnDate.focus();
    return;
  }

  const originalLabel = submitButton.querySelector("span").textContent;
  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "Αποστολή…";
  formStatus.className = "form-status full-field";

  try {
    const payload = Object.fromEntries(new FormData(bookingForm).entries());
    if (payload._honey) {
      bookingForm.reset();
      showStatus("success", "Το αίτημά σου καταχωρίστηκε.");
      return;
    }

    const response = await fetch(bookingForm.dataset.emailEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    const providerRejected = String(data.success).toLowerCase() === "false";
    if (!response.ok || providerRejected) throw new Error(data.message || "Δεν ήταν δυνατή η αποστολή.");

    bookingForm.reset();
    returnDate.min = localToday;
    showStatus("success", "Το αίτημά σου στάλθηκε. Θα επικοινωνήσουμε μαζί σου σύντομα.");
    formStatus.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    showStatus("error", `${error.message} Μπορείς επίσης να μας καλέσεις στο +30 22420 12345.`);
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = originalLabel;
  }
});

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

const carGrid = document.querySelector(".car-grid");
const carCards = [...document.querySelectorAll(".car-grid .car-card")];
const carPrevious = document.querySelector("#car-prev");
const carNext = document.querySelector("#car-next");
const carCurrent = document.querySelector("#car-current");
const carTotal = document.querySelector("#car-total");

if (carGrid && carCards.length) {
  carTotal.textContent = carCards.length;

  const getCardStep = () => {
    if (carCards.length < 2) return carGrid.clientWidth;
    return carCards[1].offsetLeft - carCards[0].offsetLeft;
  };

  const updateCarousel = () => {
    const activeIndex = Math.max(
      0,
      Math.min(carCards.length - 1, Math.round(carGrid.scrollLeft / getCardStep())),
    );

    carCurrent.textContent = activeIndex + 1;
    carPrevious.disabled = activeIndex === 0;
    carNext.disabled = activeIndex === carCards.length - 1;
    return activeIndex;
  };

  const goToCar = (direction) => {
    const activeIndex = updateCarousel();
    const nextIndex = Math.max(0, Math.min(carCards.length - 1, activeIndex + direction));
    carGrid.scrollTo({ left: nextIndex * getCardStep(), behavior: "smooth" });
  };

  carPrevious.addEventListener("click", () => goToCar(-1));
  carNext.addEventListener("click", () => goToCar(1));

  let scrollFrame;
  carGrid.addEventListener("scroll", () => {
    window.cancelAnimationFrame(scrollFrame);
    scrollFrame = window.requestAnimationFrame(updateCarousel);
  }, { passive: true });

  window.addEventListener("resize", updateCarousel, { passive: true });
  updateCarousel();
}

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

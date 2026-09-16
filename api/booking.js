import { randomUUID } from "node:crypto";

const bookingEmail = process.env.BOOKING_EMAIL || "kas11paok@gmail.com";
const publicSiteUrl = process.env.PUBLIC_SITE_URL || "https://rent-seven-bay.vercel.app/";
const categories = new Set([
  "Mini — Toyota Aygo ή παρόμοιο",
  "Compact — Peugeot 208 ή παρόμοιο",
  "Mini Automatic — Hyundai i10 ή παρόμοιο",
  "SUV — Peugeot 2008 ή παρόμοιο",
]);

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Booking-Version": "gmail-referer-v1",
    },
  });

const validIsoDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const validateBooking = (body) => {
  const fullName = String(body.fullName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const pickupDate = String(body.pickupDate || "");
  const returnDate = String(body.returnDate || "");
  const carCategory = String(body.carCategory || "");

  if (body.website) return { spam: true };
  if (fullName.length < 2 || fullName.length > 100) return { error: "Συμπλήρωσε το ονοματεπώνυμό σου." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) return { error: "Συμπλήρωσε ένα έγκυρο email." };

  const today = new Date().toISOString().slice(0, 10);
  if (!validIsoDate(pickupDate) || !validIsoDate(returnDate) || pickupDate < today || returnDate <= pickupDate) {
    return { error: "Έλεγξε τις ημερομηνίες παραλαβής και επιστροφής." };
  }
  if (!categories.has(carCategory)) return { error: "Επίλεξε κατηγορία αυτοκινήτου." };

  return { value: { fullName, email, pickupDate, returnDate, carCategory } };
};

const parseBody = async (request) => {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 20_000) throw new Error("PAYLOAD_TOO_LARGE");

  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json();
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(await request.text()));
  }
  throw new Error("UNSUPPORTED_CONTENT_TYPE");
};

const sendBookingEmail = async (record) => {
  const response = await fetch(`https://formsubmit.co/ajax/${bookingEmail}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Referer: publicSiteUrl,
    },
    body: JSON.stringify({
      _subject: `Νέο αίτημα κράτησης — ${record.fullName}`,
      _template: "table",
      _captcha: "false",
      _replyto: record.email,
      "Ονοματεπώνυμο": record.fullName,
      "Email πελάτη": record.email,
      "Ημερομηνία παραλαβής": record.pickupDate,
      "Ημερομηνία επιστροφής": record.returnDate,
      "Κατηγορία αυτοκινήτου": record.carCategory,
      "Κωδικός αιτήματος": record.id,
      "Ημερομηνία υποβολής": record.receivedAt,
    }),
    signal: AbortSignal.timeout(8000),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || String(result.success).toLowerCase() === "false") {
    throw new Error(result.message || `FormSubmit returned ${response.status}`);
  }
};

export async function POST(request) {
  let body;
  try {
    body = await parseBody(request);
  } catch (error) {
    const status = error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400;
    return json({ message: "Το αίτημα δεν μπόρεσε να διαβαστεί." }, status);
  }

  const result = validateBooking(body);
  if (result.spam) return json({ ok: true });
  if (result.error) return json({ message: result.error }, 422);

  const record = {
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    ...result.value,
  };

  try {
    await sendBookingEmail(record);
  } catch (error) {
    console.error("Booking email failed:", error.message);
    const needsActivation = /needs activation/i.test(error.message);
    return json(
      {
        ok: false,
        requestId: record.id,
        code: needsActivation ? "EMAIL_NOT_ACTIVATED" : "EMAIL_PROVIDER_ERROR",
        message: needsActivation
          ? "Η υπηρεσία email δεν έχει ενεργοποιηθεί ακόμη για αυτή τη σελίδα."
          : "Δεν ήταν δυνατή η αποστολή του email. Δοκίμασε ξανά ή επικοινώνησε τηλεφωνικά.",
      },
      502,
    );
  }

  if ((request.headers.get("accept") || "").includes("application/json")) {
    return json({ ok: true, requestId: record.id }, 201);
  }

  return Response.redirect(new URL("/?submitted=1#booking", request.url), 303);
}

export function GET() {
  return json({ message: "Method not allowed" }, 405);
}

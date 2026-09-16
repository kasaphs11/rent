import { createServer } from "node:http";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const root = resolve(process.cwd());
const assetsDir = join(root, "assets");
const dataDir = join(root, "data");
const requestsFile = join(dataDir, "booking-requests.jsonl");
const webhookUrl = process.env.BOOKING_WEBHOOK_URL;
const bookingEmail = process.env.BOOKING_EMAIL || "kas11paok@gmail.com";
const publicSiteUrl = process.env.PUBLIC_SITE_URL || "https://rent-seven-bay.vercel.app/";
const categories = new Set([
  "Mini — Toyota Aygo ή παρόμοιο",
  "Compact — Peugeot 208 ή παρόμοιο",
  "Mini Automatic — Hyundai i10 ή παρόμοιο",
  "SUV — Peugeot 2008 ή παρόμοιο",
]);
const rateLimits = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
};

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const sendJson = (response, status, body) => {
  response.writeHead(status, { ...securityHeaders, "Content-Type": mimeTypes[".json"] });
  response.end(JSON.stringify(body));
};

const readBody = async (request) => {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20_000) throw new Error("PAYLOAD_TOO_LARGE");
  }
  const type = request.headers["content-type"] || "";
  if (type.includes("application/json")) return JSON.parse(body || "{}");
  return Object.fromEntries(new URLSearchParams(body));
};

const validIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

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
  if (!validIsoDate(pickupDate) || !validIsoDate(returnDate) || pickupDate < today || returnDate <= pickupDate) return { error: "Έλεγξε τις ημερομηνίες παραλαβής και επιστροφής." };
  if (!categories.has(carCategory)) return { error: "Επίλεξε κατηγορία αυτοκινήτου." };
  return { value: { fullName, email, pickupDate, returnDate, carCategory } };
};

const isRateLimited = (key) => {
  const now = Date.now();
  const recent = (rateLimits.get(key) || []).filter((time) => now - time < 15 * 60 * 1000);
  recent.push(now);
  rateLimits.set(key, recent);
  return recent.length > 5;
};

const forwardToWebhook = async (record) => {
  if (!webhookUrl) return;
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.error(`Booking webhook returned ${response.status}`);
  } catch (error) {
    console.error("Booking webhook failed:", error.message);
  }
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

  const responseBody = await response.json().catch(() => ({}));
  const providerRejected = String(responseBody.success).toLowerCase() === "false";
  if (!response.ok || providerRejected) {
    throw new Error(responseBody.message || `FormSubmit returned ${response.status}`);
  }
};

const handleBooking = async (request, response) => {
  const clientKey = String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "local").split(",")[0];
  if (isRateLimited(clientKey)) return sendJson(response, 429, { message: "Πολλά αιτήματα. Δοκίμασε ξανά σε λίγα λεπτά." });

  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    const status = error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400;
    return sendJson(response, status, { message: "Το αίτημα δεν μπόρεσε να διαβαστεί." });
  }

  const result = validateBooking(body);
  if (result.spam) return sendJson(response, 200, { ok: true });
  if (result.error) return sendJson(response, 422, { message: result.error });

  const record = { id: randomUUID(), receivedAt: new Date().toISOString(), ...result.value };
  await mkdir(dataDir, { recursive: true });
  await appendFile(requestsFile, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });

  try {
    await sendBookingEmail(record);
  } catch (error) {
    console.error("Booking email failed:", error.message);
    return sendJson(response, 502, {
      ok: false,
      saved: true,
      requestId: record.id,
      message: "Το αίτημα αποθηκεύτηκε, αλλά δεν ήταν δυνατή η αποστολή του email. Δοκίμασε ξανά ή επικοινώνησε τηλεφωνικά.",
    });
  }

  await forwardToWebhook(record);

  if ((request.headers.accept || "").includes("application/json")) {
    return sendJson(response, 201, { ok: true, requestId: record.id });
  }
  response.writeHead(303, { ...securityHeaders, Location: "/?submitted=1#booking" });
  response.end();
};

const serveStatic = async (request, response, pathname) => {
  const publicFiles = new Map([
    ["/", join(root, "index.html")],
    ["/index.html", join(root, "index.html")],
    ["/styles.css", join(root, "styles.css")],
  ]);
  let filePath = publicFiles.get(pathname);

  if (!filePath && pathname.startsWith("/assets/")) {
    filePath = resolve(root, `.${pathname}`);
    const assetRelativePath = relative(assetsDir, filePath);
    if (assetRelativePath.startsWith("..") || isAbsolute(assetRelativePath)) filePath = undefined;
  }

  if (!filePath) {
    response.writeHead(404, { ...securityHeaders, "Content-Type": "text/plain; charset=utf-8" });
    return response.end("Not found");
  }

  if (filePath === root) {
    response.writeHead(403, securityHeaders);
    return response.end("Forbidden");
  }

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) throw new Error("NOT_FILE");
    const content = await readFile(filePath);
    const extension = extname(filePath).toLowerCase();
    const immutable = pathname.startsWith("/assets/");
    response.writeHead(200, {
      ...securityHeaders,
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    });
    response.end(content);
  } catch {
    response.writeHead(404, { ...securityHeaders, "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "POST" && url.pathname === "/api/booking") {
    try {
      return await handleBooking(request, response);
    } catch (error) {
      console.error("Booking request failed:", error);
      return sendJson(response, 500, { message: "Παρουσιάστηκε προσωρινό πρόβλημα. Δοκίμασε ξανά." });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/health") return sendJson(response, 200, { ok: true });
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { ...securityHeaders, Allow: "GET, HEAD, POST" });
    return response.end();
  }
  return serveStatic(request, response, decodeURIComponent(url.pathname));
});

server.listen(port, host, () => {
  console.log(`Meltemi Rentals is running at http://${host}:${port}`);
  console.log(`Booking requests are stored in ${requestsFile}`);
  console.log(`Booking emails are sent to ${bookingEmail}`);
  if (!webhookUrl) console.log("Optional: set BOOKING_WEBHOOK_URL to forward each request to email/CRM automation.");
});

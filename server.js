// server.js — SOCIAL BOST PayHero Backend
// Deploy this to Render as a "Web Service" (Node)

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

// ============================================================
// CREDENTIALS — set in Render > Environment Variables
// ============================================================
const PAYHERO_USERNAME  = process.env.PAYHERO_USERNAME;
const PAYHERO_PASSWORD  = process.env.PAYHERO_PASSWORD;
const PAYHERO_CHANNEL_ID = process.env.PAYHERO_CHANNEL_ID;
const APP_URL           = process.env.APP_URL || "https://social-bost.onrender.com";
const PORT              = process.env.PORT || 3000;

// ============================================================
// STARTUP CHECK — print env status so you can see in Render logs
// ============================================================
console.log("=== SOCIAL BOST SERVER STARTING ===");
console.log("PORT:", PORT);
console.log("APP_URL:", APP_URL);
console.log("PAYHERO_USERNAME set?", !!PAYHERO_USERNAME, PAYHERO_USERNAME ? `(value: ${PAYHERO_USERNAME})` : "(MISSING!)");
console.log("PAYHERO_PASSWORD set?", !!PAYHERO_PASSWORD, PAYHERO_PASSWORD ? "(hidden)" : "(MISSING!)");
console.log("PAYHERO_CHANNEL_ID set?", !!PAYHERO_CHANNEL_ID, PAYHERO_CHANNEL_ID ? `(value: ${PAYHERO_CHANNEL_ID})` : "(MISSING!)");
console.log("===================================");

// ============================================================
// MIME TYPES
// ============================================================
const MIME = {
  ".html": "text/html",
  ".css":  "text/css",
  ".js":   "application/javascript",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
};

// ============================================================
// HELPERS
// ============================================================
function sendJSON(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "text/plain";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.log("Static file not found:", filePath);
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("<h2>404 – File not found: " + filePath + "</h2>");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function readBody(req, callback) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1e6) req.destroy();
  });
  req.on("end", () => {
    try {
      callback(null, JSON.parse(body));
    } catch (e) {
      callback(new Error("Invalid JSON body: " + body));
    }
  });
}

// ============================================================
// PAYHERO STK PUSH
// ============================================================
function payHeroSTKPush({ amount, phone, reference, customerName }, callback) {

  // Check credentials exist before trying
  if (!PAYHERO_USERNAME || !PAYHERO_PASSWORD || !PAYHERO_CHANNEL_ID) {
    const missing = [];
    if (!PAYHERO_USERNAME)  missing.push("PAYHERO_USERNAME");
    if (!PAYHERO_PASSWORD)  missing.push("PAYHERO_PASSWORD");
    if (!PAYHERO_CHANNEL_ID) missing.push("PAYHERO_CHANNEL_ID");
    return callback(new Error("Missing environment variables: " + missing.join(", ")));
  }

  const credentials = Buffer.from(`${PAYHERO_USERNAME}:${PAYHERO_PASSWORD}`).toString("base64");

  const payload = JSON.stringify({
    amount: parseFloat(amount),
    phone_number: phone,
    channel_id: parseInt(PAYHERO_CHANNEL_ID),
    provider: "m-pesa",
    external_reference: reference,
    customer_name: customerName || "Customer",
    callback_url: `${APP_URL}/payhero-callback`,
  });

  console.log("--- PayHero STK Request ---");
  console.log("Endpoint: POST https://backend.payhero.co.ke/api/v2/payments");
  console.log("Payload:", payload);
  console.log("Auth header: Basic " + credentials.substring(0, 8) + "...(hidden)");

  const options = {
    hostname: "backend.payhero.co.ke",
    path: "/api/v2/payments",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${credentials}`,
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  const req = https.request(options, (payheroRes) => {
    let body = "";
    console.log("PayHero HTTP status:", payheroRes.statusCode);
    payheroRes.on("data", (chunk) => (body += chunk));
    payheroRes.on("end", () => {
      console.log("PayHero raw response:", body);
      try {
        const parsed = JSON.parse(body);
        callback(null, parsed);
      } catch (e) {
        callback(new Error("PayHero returned non-JSON: " + body));
      }
    });
  });

  req.on("error", (err) => {
    console.error("PayHero network error:", err.message);
    callback(err);
  });

  req.write(payload);
  req.end();
}

// ============================================================
// HTTP SERVER
// ============================================================
const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  console.log(`[${new Date().toISOString()}] ${req.method} ${url}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    });
    res.end();
    return;
  }

  // ============================================================
  // POST /pay — called by checkout.html
  // ============================================================
  if (req.method === "POST" && url === "/pay") {
    readBody(req, (err, body) => {
      if (err) {
        console.error("Body parse error:", err.message);
        return sendJSON(res, 400, { success: false, message: "Bad request: " + err.message });
      }

      console.log("Received /pay body:", JSON.stringify(body));

      const { amount, phone, reference, customerName } = body;

      if (!amount || !phone || !reference) {
        const msg = "Missing fields. Got: " + JSON.stringify({ amount, phone, reference });
        console.error(msg);
        return sendJSON(res, 400, { success: false, message: msg });
      }

      payHeroSTKPush({ amount, phone, reference, customerName }, (err, result) => {
        if (err) {
          console.error("PayHero call failed:", err.message);
          return sendJSON(res, 500, { success: false, message: "PayHero error: " + err.message });
        }

        console.log("PayHero parsed result:", JSON.stringify(result, null, 2));

        // PayHero returns success in different shapes — handle all of them
        const isSuccess =
          result.success === true ||
          result.status === "queued" ||
          result.status === "pending" ||
          result.ResponseCode === "0" ||
          result.CheckoutRequestID ||
          result.reference;

        if (isSuccess) {
          console.log("STK push SUCCESS for reference:", reference);
          return sendJSON(res, 200, { success: true, data: result });
        } else {
          const errMsg = result.message || result.errorMessage || result.ResponseDescription || "STK push failed – check your credentials and channel ID";
          console.error("STK push FAILED:", errMsg, "Full result:", JSON.stringify(result));
          return sendJSON(res, 400, { success: false, message: errMsg });
        }
      });
    });
    return;
  }

  // ============================================================
  // POST /payhero-callback — PayHero calls this after customer pays
  // ============================================================
  if (req.method === "POST" && url === "/payhero-callback") {
    readBody(req, (err, body) => {
      if (err) { res.writeHead(400); res.end(); return; }
      console.log("=== PayHero CALLBACK received ===");
      console.log(JSON.stringify(body, null, 2));
      console.log("=================================");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ received: true }));
    });
    return;
  }

  // ============================================================
  // GET /health — quick check that server + env vars are OK
  // ============================================================
  if (req.method === "GET" && url === "/health") {
    sendJSON(res, 200, {
      status: "ok",
      env: {
        PAYHERO_USERNAME:   PAYHERO_USERNAME  ? "set" : "MISSING",
        PAYHERO_PASSWORD:   PAYHERO_PASSWORD  ? "set" : "MISSING",
        PAYHERO_CHANNEL_ID: PAYHERO_CHANNEL_ID ? `set (${PAYHERO_CHANNEL_ID})` : "MISSING",
        APP_URL,
      }
    });
    return;
  }

  // ============================================================
  // Serve static HTML/CSS/JS files
  // ============================================================
  let filePath = "." + url;
  if (url === "/" || url === "") filePath = "./index.html";

  // Auto-add .html if no extension
  if (!path.extname(filePath)) filePath += ".html";

  serveStatic(res, filePath);
});

server.listen(PORT, () => {
  console.log(`SOCIAL BOST server live on port ${PORT}`);
  console.log(`Health check: ${APP_URL}/health`);
});

// server.js — SOCIAL BOST PayHero Backend
// Deploy this to Render as a "Web Service" (Node)

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

// ============================================================
// YOUR PAYHERO CREDENTIALS — set these in Render > Environment
// ============================================================
const PAYHERO_USERNAME = process.env.PAYHERO_USERNAME;
const PAYHERO_PASSWORD = process.env.PAYHERO_PASSWORD;
const PAYHERO_CHANNEL_ID = process.env.PAYHERO_CHANNEL_ID;

// The public URL of your Render app (no trailing slash)
// e.g. https://social-bost.onrender.com
const APP_URL = process.env.APP_URL || "https://your-app.onrender.com";

const PORT = process.env.PORT || 3000;

// ============================================================
// MIME TYPES for serving static files
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
// HELPER: send JSON response
// ============================================================
function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

// ============================================================
// HELPER: serve static files from current directory
// ============================================================
function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "text/plain";
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

// ============================================================
// PAYHERO STK PUSH
// ============================================================
function payHeroSTKPush({ amount, phone, reference, customerName }, callback) {
  const credentials = Buffer.from(`${PAYHERO_USERNAME}:${PAYHERO_PASSWORD}`).toString("base64");

  const payload = JSON.stringify({
    amount: parseFloat(amount),
    phone_number: phone,
    channel_id: parseInt(PAYHERO_CHANNEL_ID),
    provider: "m-pesa",
    external_reference: reference,
    customer_name: customerName,
    callback_url: `${APP_URL}/payhero-callback`,
  });

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
    payheroRes.on("data", (chunk) => (body += chunk));
    payheroRes.on("end", () => {
      try { callback(null, JSON.parse(body)); }
      catch (e) { callback(new Error("Invalid PayHero response")); }
    });
  });

  req.on("error", callback);
  req.write(payload);
  req.end();
}

// ============================================================
// HELPER: read request body
// ============================================================
function readBody(req, callback) {
  let body = "";
  req.on("data", (chunk) => { body += chunk; if (body.length > 1e6) req.destroy(); });
  req.on("end", () => {
    try { callback(null, JSON.parse(body)); }
    catch (e) { callback(new Error("Invalid JSON")); }
  });
}

// ============================================================
// HTTP SERVER
// ============================================================
const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  // -- CORS preflight --
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" });
    res.end();
    return;
  }

  // ============================================================
  // POST /pay  — called by checkout.html
  // Body: { amount, phone, reference, customerName }
  // ============================================================
  if (req.method === "POST" && url === "/pay") {
    readBody(req, (err, body) => {
      if (err) return sendJSON(res, 400, { success: false, message: "Bad request" });

      const { amount, phone, reference, customerName } = body;

      // Basic validation
      if (!amount || !phone || !reference) {
        return sendJSON(res, 400, { success: false, message: "amount, phone, and reference are required" });
      }

      payHeroSTKPush({ amount, phone, reference, customerName }, (err, result) => {
        if (err) {
          console.error("PayHero error:", err);
          return sendJSON(res, 500, { success: false, message: "Payment service error" });
        }

        console.log("PayHero response:", result);

        if (result.success || result.status === "queued" || result.CheckoutRequestID) {
          return sendJSON(res, 200, { success: true, data: result });
        } else {
          return sendJSON(res, 400, { success: false, message: result.message || "STK push failed" });
        }
      });
    });
    return;
  }

  // ============================================================
  // POST /payhero-callback — PayHero calls this after payment
  // ============================================================
  if (req.method === "POST" && url === "/payhero-callback") {
    readBody(req, (err, body) => {
      if (err) { res.writeHead(400); res.end(); return; }
      console.log("PayHero callback received:", JSON.stringify(body, null, 2));
      // You can store result in a DB here, or trigger email, etc.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ received: true }));
    });
    return;
  }

  // ============================================================
  // GET static files — serve your HTML/CSS/JS frontend
  // ============================================================
  let filePath = "." + url;
  if (url === "/" || url === "") filePath = "./index.html";
  if (!path.extname(filePath)) filePath += ".html";

  serveStatic(res, filePath);
});

server.listen(PORT, () => {
  console.log(`SOCIAL BOST server running on port ${PORT}`);
});

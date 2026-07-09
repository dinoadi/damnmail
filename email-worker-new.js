export default {
  async email(message, env, ctx) {
    const to = message.to || message.headers.get("to") || "recipient@unknown";
    const from = message.from;
    const headers = message.headers;
    const raw = await new Response(message.raw).text();
    const subject = headers.get("subject") || "(No Subject)";

    let text = "";
    let html = "";
    const ct = headers.get("content-type") || "";
    if (ct.includes("multipart")) {
      const m = ct.match(/boundary="?([^";\s]+)"?/);
      if (m) {
        const b = m[1];
        for (const p of raw.split("--" + b)) {
          if (p.includes("text/plain")) {
            const s = p.indexOf("\r\n\r\n") || p.indexOf("\n\n");
            if (s > -1) text = p.substring(s + 4).replace(/--$/, "").trim();
          } else if (p.includes("text/html")) {
            const s = p.indexOf("\r\n\r\n") || p.indexOf("\n\n");
            if (s > -1) html = p.substring(s + 4).replace(/--$/, "").trim();
          }
        }
      }
    } else if (ct.includes("text/plain")) {
      text = raw;
    } else if (ct.includes("text/html")) {
      html = raw;
    }

    const payload = { to, from, subject, text, html, raw };
    let lastError = null;

    // Mode 1: Call Appwrite function execution API langsung
    if (env.APPWRITE_API_KEY) {
      const endpoint = env.APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1";
      const functionId = env.APPWRITE_FUNCTION_ID || "process-email";
      const url = `${endpoint}/functions/${functionId}/executions`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Appwrite-Project": "damnmail",
            "X-Appwrite-Key": env.APPWRITE_API_KEY,
          },
          body: JSON.stringify({ body: JSON.stringify(payload) }),
        });
        if (res.ok) {
          console.log(`[EMAIL-WORKER] Email ${subject} sent to Appwrite OK`);
          return;
        }
        lastError = `Appwrite API returned ${res.status}: ${await res.text()}`;
        console.error(`[EMAIL-WORKER] ${lastError}`);
      } catch (e) {
        lastError = `Appwrite API fetch failed: ${e.message}`;
        console.error(`[EMAIL-WORKER] ${lastError}`);
      }
    }

    // Mode 2: Fallback ke WEBHOOK_URL (untuk backward compatibility)
    if (env.WEBHOOK_URL) {
      try {
        const res = await fetch(env.WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          console.log(`[EMAIL-WORKER] Email ${subject} sent to WEBHOOK_URL OK`);
          return;
        }
        lastError = `WEBHOOK_URL returned ${res.status}: ${await res.text()}`;
        console.error(`[EMAIL-WORKER] ${lastError}`);
      } catch (e) {
        lastError = `WEBHOOK_URL fetch failed: ${e.message}`;
        console.error(`[EMAIL-WORKER] ${lastError}`);
      }
    }

    // Mode 3: Coba hosting domain (jika domain aktif)
    if (env.DOMAIN_WEBHOOK_URL) {
      try {
        const res = await fetch(env.DOMAIN_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          console.log(`[EMAIL-WORKER] Email ${subject} sent to DOMAIN_WEBHOOK_URL OK`);
          return;
        }
        lastError = `DOMAIN_WEBHOOK_URL returned ${res.status}: ${await res.text()}`;
        console.error(`[EMAIL-WORKER] ${lastError}`);
      } catch (e) {
        lastError = `DOMAIN_WEBHOOK_URL fetch failed: ${e.message}`;
        console.error(`[EMAIL-WORKER] ${lastError}`);
      }
    }

    console.error(`[EMAIL-WORKER] ALL DELIVERY FAILED for ${subject} to ${to}. Last error: ${lastError}`);
  },
};

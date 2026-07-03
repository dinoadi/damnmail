export default {
  async email(message, env, ctx) {
    const to = message.to;
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

    await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, from, subject, text, html, raw }),
    });
  },
};

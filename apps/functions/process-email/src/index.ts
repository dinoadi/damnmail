import { simpleParser } from 'mailparser';
import { Client, Databases, Storage, ID, Query } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

const DB_ID = 'damnmail';
const COLL_INBOXES = 'inboxes';
const COLL_EMAILS = 'emails';

const BUCKET_ATTACHMENTS = 'attachments';

export default async ({ req, res, log, error }: any) => {
  try {
    // Parse incoming data
    const rawData = req.bodyText || req.bodyRaw || '';
    if (!rawData) {
      return res.json({ success: false, error: 'No email data' }, 400);
    }

    let envelopeFrom = '';
    let envelopeTo = '';
    let jsonSubject = '';
    let jsonHtml = '';
    let jsonText = '';
    let mimeContent = '';
    // Try MIME parsing first
    let parsed = await simpleParser(rawData).catch(() => null);

    // If simpleParser didn't extract To/From (e.g., JSON input), try JSON
    if (!parsed?.to?.text && !parsed?.from?.text) {
      try {
        const jsonData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        envelopeFrom = jsonData.envelope_from || jsonData.from || '';
        envelopeTo = jsonData.envelope_to || jsonData.to || '';
        jsonSubject = jsonData.subject || '';
        jsonHtml = jsonData.html || '';
        jsonText = jsonData.text || '';

        // Handle nested body wrapper (from Netlify webhook proxy)
        if (typeof jsonData.body === 'string') {
          try {
            const innerBody = JSON.parse(jsonData.body);
            envelopeFrom = envelopeFrom || innerBody.envelope_from || innerBody.from || '';
            envelopeTo = envelopeTo || innerBody.envelope_to || innerBody.to || '';
            jsonSubject = jsonSubject || innerBody.subject || '';
            jsonHtml = jsonHtml || innerBody.html || '';
            jsonText = jsonText || innerBody.text || '';
          } catch {}
        }

        if (jsonData.mime || jsonData.raw) {
          const reParsed = await simpleParser(jsonData.mime || jsonData.raw).catch(() => null);
          if (reParsed) {
            // Merge re-parsed MIME result with parsed
            parsed = reParsed;
          }
        }
      } catch {
        error('Failed to parse JSON email data');
      }
    }

    if (!parsed && !envelopeTo) {
      return res.json({ success: false, error: 'Failed to parse email' }, 400);
    }

    const from = parsed?.from?.text || envelopeFrom || 'unknown';
    const to = parsed?.to?.text || envelopeTo || 'unknown';
    const subject = parsed?.subject || jsonSubject || '(No Subject)';
    const html = parsed?.html || jsonHtml || '';
    const text = parsed?.text || jsonText || '';
    const snippet = (text || html?.replace(/<[^>]+>/g, '') || '').substring(0, 200);

    // Determine inbox address (the "to" address)
    let inboxAddress = to;
    // Clean the address
    if (inboxAddress.includes('<')) {
      const match = inboxAddress.match(/<([^>]+)>/);
      if (match) inboxAddress = match[1];
    }
    inboxAddress = inboxAddress.toLowerCase().trim();

    // If inboxAddress doesn't contain '@', use fallback
    if (!inboxAddress.includes('@')) {
      const domain = (process.env.DOMAINS || 'readyonbooking.app').split(',')[0].trim();
      inboxAddress = `unparsed@${domain}`;
      log(`Invalid recipient address, falling back to ${inboxAddress}`);
    }

    // Check if inbox exists in Appwrite Database
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || '')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || '')
      .setKey(req.headers['x-appwrite-key'] || process.env.APPWRITE_FUNCTION_API_KEY || '')
    const databases = new Databases(client);
    const storage = new Storage(client);

    let inboxDoc: any;
    let inboxCreated = false;

    // Cari inbox berdasarkan address field (bukan document ID)
    const existingInboxes = await databases.listDocuments(DB_ID, COLL_INBOXES, [
      Query.equal('address', inboxAddress),
      Query.limit(1),
    ]);

    if (existingInboxes.documents.length > 0) {
      inboxDoc = existingInboxes.documents[0];
      log(`Found existing inbox ${inboxAddress}`);
    } else {
      log(`No existing inbox for ${inboxAddress}, auto-creating...`);
      const [localPart, domainName] = inboxAddress.split('@');
      const ttlHours = parseInt(process.env.EMAIL_TTL_HOURS || '720', 10);
      inboxDoc = await databases.createDocument(DB_ID, COLL_INBOXES, 'unique()', {
        username: localPart,
        domain: domainName,
        address: inboxAddress,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString(),
      });
      inboxCreated = true;
      log(`Auto-created inbox ${inboxAddress}`);
    }

    // Check if expired
    const expiresAt = new Date(inboxDoc.expiresAt || inboxDoc.expiresAt);
    if (expiresAt < new Date()) {
      log(`Inbox ${inboxAddress} has expired, storing anyway.`);
    }

    // Process attachments
    const attachments: any[] = [];
    if (parsed.attachments && parsed.attachments.length > 0) {
      for (const att of parsed.attachments) {
        try {
          const filename = att.filename || 'unnamed';
          let fileId = undefined;
          if (att.content) {
            const file = InputFile.fromBuffer(att.content, filename);
            const uploaded = await storage.createFile(BUCKET_ATTACHMENTS, ID.unique(), file);
            fileId = uploaded.$id;
          }
          attachments.push({
            filename: filename,
            contentType: att.contentType || 'application/octet-stream',
            size: att.size || 0,
            contentId: att.contentId || undefined,
            fileId: fileId,
          });
        } catch (e: any) {
          log(`Failed to upload attachment ${att.filename}: ${e.message}`);
        }
      }
    }

    // Store email in Appwrite Database
    const emailDoc = await databases.createDocument(DB_ID, COLL_EMAILS, ID.unique(), {
      inboxAddress: inboxDoc.address || inboxAddress,
      envelopeFrom: envelopeFrom || from,
      from,
      to,
      subject,
      snippet,
      html,
      text,
      attachments: JSON.stringify(attachments),
      createdAt: new Date().toISOString(),
    });

    log(`Email stored: ${subject} -> ${inboxAddress}`);

    // ─── SEND TELEGRAM NOTIFICATION ────────────────────────
    const chatId = inboxDoc.telegramChatId;
    const token = process.env.TELEGRAM_BOT_TOKEN || '';

    // Kirim ke owner inbox (jika chatId terhubung)
    if (chatId && token) {
      try {
        const msg = formatTelegramMessage(from, subject, snippet, inboxAddress);
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: parseInt(chatId, 10),
            text: msg,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          }),
        });
      } catch (err: any) {
        error(`Failed to send Telegram notification: ${err.message}`);
      }
    }

    // Kirim ke admin dengan format SAMA (rich notification + link)
    const adminChatIds = (process.env.TELEGRAM_ADMIN_CHAT_IDS || '').split(',').filter(Boolean);
    if (adminChatIds.length > 0 && token) {
      const adminMsg = formatTelegramMessage(from, subject, snippet, inboxAddress);
      for (const adminId of adminChatIds) {
        if (adminId !== chatId) {
          // Don't double-notify if admin is also the inbox owner
          try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: parseInt(adminId, 10),
                text: adminMsg,
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
              }),
            });
          } catch { }
        }
      }
    }

    return res.json({ success: true, data: { id: emailDoc.$id } });
  } catch (err: any) {
    error(`Process email error: ${err.message}`);
    return res.json({ success: false, error: err.message }, 500);
  }
};

function formatTelegramMessage(from: string, subject: string, snippet: string, address: string): string {
  return (
    `📬 *New Email Received!*\n\n` +
    `📧 *To:* \`${address}\`\n` +
    `👤 *From:* \`${from}\`\n` +
    `📰 *Subject:* ${escapeMarkdown(subject)}\n\n` +
    `${snippet ? `📝 *Preview:* ${escapeMarkdown(snippet.substring(0, 300))}\n\n` : ''}` +
    `🔗 [Open Dashboard](https://readyonbooking.app/?inbox=${encodeURIComponent(address)})`
  );
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

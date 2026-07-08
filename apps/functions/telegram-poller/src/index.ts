import { Client, Databases, ID, Query } from 'node-appwrite'

const DB_ID = 'damnmail'
const COLL_EMAILS = 'emails'
const STATE_DOC_ID = 'telegram-offset'

export default async ({ req, res, log, error }: any) => {
  const token = process.env.TELEGRAM_BOT_TOKEN || ''
  if (!token) {
    return res.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not set' }, 500)
  }

  const adminChatIds = (process.env.TELEGRAM_ADMIN_CHAT_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  const endpoint =
    process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || ''
  const projectId =
    process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || ''
  const apiKey = req.headers['x-appwrite-key'] || ''

  if (!endpoint || !projectId || !apiKey) {
    return res.json({ ok: false, error: 'Appwrite config missing' }, 500)
  }

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
  const databases = new Databases(client)

  // ─── WEBHOOK MODE ────────────────────────────────────────────
  // Telegram bot uses webhook (telegram-bot function).
  // This poller skipped getUpdates to avoid conflict with webhook.
  // We only check for new emails as a fallback notification layer.
  // ─────────────────────────────────────────────────────────────

  await checkNewEmails(databases, token, adminChatIds, log, error)

  return res.json({ ok: true, processed: 0 })
}

// ---- Helpers ----

async function notifyAdmins(
  token: string,
  chatIds: string[],
  text: string,
  log: any,
  error: any,
): Promise<void> {
  if (chatIds.length === 0) return
  for (const id of chatIds) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: parseInt(id), text, parse_mode: 'Markdown' }),
      })
    } catch (e: any) {
      error(`notify admin ${id}: ${e.message}`)
    }
  }
}

async function checkNewEmails(
  databases: Databases,
  token: string,
  adminChatIds: string[],
  log: any,
  error: any,
): Promise<void> {
  if (!token || adminChatIds.length === 0) return

  // Read last notified email createdAt timestamp
  let lastNotifAt = ''
  try {
    const state = await databases.getDocument(DB_ID, COLL_EMAILS, STATE_DOC_ID)
    lastNotifAt = state.lastEmailNotif || ''
  } catch {
    // No state doc yet — use current time to avoid dumping all historical emails
  }

  if (!lastNotifAt) {
    lastNotifAt = new Date().toISOString()
  }

  const queries: any[] = [Query.limit(20), Query.greaterThan('createdAt', lastNotifAt)]

  let newEmails: any[] = []
  try {
    const result = await databases.listDocuments(DB_ID, COLL_EMAILS, queries)
    newEmails = result.documents
      .filter((d: any) => d.inboxAddress !== '__internal__' && d.$id !== STATE_DOC_ID)
  } catch (e: any) {
    error(`Email check query error: ${e.message}`)
    return
  }

  if (newEmails.length === 0) return

  log(`Sending ${newEmails.length} email notification(s) to admins`)

  for (const email of newEmails) {
    const adminMsg = [
      '📨 *New email*',
      `To: \`${email.inboxAddress}\``,
      `From: \`${email.from}\``,
      `Subject: ${email.subject || '(no subject)'}`,
    ].join('\n')
    await notifyAdmins(token, adminChatIds, adminMsg, log, error)
  }

  // Update last notified timestamp
  const latestTime = newEmails[newEmails.length - 1].createdAt || new Date().toISOString()
  try {
    await databases.updateDocument(DB_ID, COLL_EMAILS, STATE_DOC_ID, {
      lastEmailNotif: latestTime,
    })
  } catch (e: any) {
    error(`Failed to save lastEmailNotif: ${e.message}`)
  }
}

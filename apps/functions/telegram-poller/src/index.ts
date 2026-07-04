import { Client, Databases, ID, Query } from 'node-appwrite'

const DB_ID = 'damnmail'
const COLL_DOMAINS = 'domains'
const COLL_INBOXES = 'inboxes'
const COLL_EMAILS = 'emails'
const STATE_DOC_ID = 'telegram-offset'
const TG_API = 'https://api.telegram.org/bot'

export default async ({ req, res, log, error }: any) => {
  const token = process.env.TELEGRAM_BOT_TOKEN || ''
  if (!token) {
    return res.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not set' }, 500)
  }

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

  // Read stored offset from a pseudo-document in the emails collection
  let offset = 0
  try {
    const state = await databases.getDocument(DB_ID, COLL_EMAILS, STATE_DOC_ID)
    offset = parseInt(state.snippet || '0', 10)
  } catch {
    // First run — offset stays 0
  }

  // Fetch pending updates from Telegram
  const updatesUrl = `${TG_API}${token}/getUpdates?offset=${offset + 1}&timeout=5`
  let updatesResponse
  try {
    updatesResponse = await fetch(updatesUrl)
  } catch (fetchError: any) {
    error(`getUpdates fetch error: ${fetchError.message}`)
    return res.json({ ok: false, error: fetchError.message }, 500)
  }

  let updatesData: any
  try {
    updatesData = await updatesResponse.json()
  } catch {
    error('getUpdates: invalid JSON response')
    return res.json({ ok: false, error: 'Invalid response from Telegram' }, 500)
  }

  if (!updatesData.ok) {
    error(`getUpdates error: ${JSON.stringify(updatesData)}`)
    return res.json({ ok: false, error: 'Telegram API error' }, 500)
  }

  const updates = updatesData.result || []
  if (updates.length === 0) {
    return res.json({ ok: true, processed: 0 })
  }

  log(`Processing ${updates.length} update(s)`)

  for (const update of updates) {
    try {
      const userId = update.message?.from?.id || update.callback_query?.from?.id
      const userFirst = update.message?.from?.first_name || update.callback_query?.from?.first_name || 'User'
      const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id

      if (!chatId) {
        log(`Skipping update ${update.update_id}: no chatId`)
        continue
      }

      // Handle inline keyboard callback
      const callbackData = update.callback_query?.data
      if (callbackData) {
        const match = callbackData.match(/^create:(.+):(.+)$/)
        if (match) {
          const [, username, domain] = match
          log(`Callback: creating ${username}@${domain} for ${userId}`)
          await createInbox(databases, username, domain, String(chatId), token, log, error)
        }
        continue
      }

      const text = update.message?.text || ''

    if (text === '/start') {
      await sendMessage(token, chatId,
        `👋 Hello *${userFirst}!*

Welcome to *DamnMail* — Multi-domain Temporary Email.

📧 \`/generate\` — Get a random email address
✏️ \`/create <username>\` — Create custom address

Your temporary inbox will expire automatically.`
      )
      } else if (text === '/generate') {
        const domains = await getActiveDomains(databases)
        if (domains.length === 0) {
          await sendMessage(token, chatId, '❌ No active domains available.')
          continue
        }
        const username = generateUsername()
        await createInbox(databases, username, domains[0], String(chatId), token, log, error)
      } else if (text.startsWith('/create ')) {
        const parts = text.split(/\s+/)
        if (parts.length < 2) {
          await sendMessage(token, chatId, 'Usage: `/create <username>`')
          continue
        }
        const username = parts.slice(1).join('').trim()
        if (!username || !/^[a-zA-Z0-9._-]{1,64}$/.test(username)) {
          await sendMessage(token, chatId,
            '❌ Invalid username.\\!\\!\nAllowed: letters, numbers, dots, hyphens, underscores (max 64 chars)',
          )
          continue
        }
        const domains = await getActiveDomains(databases)
        if (domains.length === 0) {
          await sendMessage(token, chatId, '❌ No active domains available.')
          continue
        }
        await createInbox(databases, username, domains[0], String(chatId), token, log, error)
      }
    } catch (processError: any) {
      error(`Process update ${update.update_id}: ${processError.message}`)
    }

    offset = update.update_id
  }

  // Persist offset
  try {
    await databases.updateDocument(DB_ID, COLL_EMAILS, STATE_DOC_ID, {
      snippet: String(offset),
    })
  } catch {
    try {
      await databases.createDocument(DB_ID, COLL_EMAILS, STATE_DOC_ID, {
        inboxAddress: '__internal__',
        envelopeFrom: '__internal__',
        from: '__internal__',
        to: '__internal__',
        subject: '__internal__',
        snippet: String(offset),
        text: '',
        attachments: '',
        createdAt: new Date(offset > 0 ? Date.now() : Date.now()).toISOString(),
      })
    } catch (createError: any) {
      error(`Failed to persist offset: ${createError.message}`)
    }
  }

  return res.json({ ok: true, processed: updates.length })
}

// ---- Helpers ----

async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  await fetch(`${TG_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
}

function generateUsername(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

async function getActiveDomains(databases: Databases): Promise<string[]> {
  try {
    const result = await databases.listDocuments(DB_ID, COLL_DOMAINS, [
      Query.equal('isActive', true),
    ])
    return result.documents.map((d: any) => d.name)
  } catch {
    return []
  }
}

async function createInbox(
  databases: Databases,
  username: string,
  domain: string,
  chatId: string,
  token: string,
  log: any,
  error: any,
): Promise<void> {
  const address = `${username}@${domain}`

  // Check for existing inbox by address attribute
  try {
    const existing = await databases.listDocuments(DB_ID, COLL_INBOXES, [
      Query.equal('address', address),
      Query.limit(1),
    ])
    if (existing.documents.length > 0) {
      await sendMessage(token, parseInt(chatId), `⚠️ Address \`${address}\` already exists!`)
      return
    }
  } catch {}

  const ttlHours = parseInt(process.env.EMAIL_TTL_HOURS || '720', 10)
  const now = Date.now()
  const expiresAt = new Date(now + ttlHours * 60 * 60 * 1000).toISOString()

  try {
    await databases.createDocument(DB_ID, COLL_INBOXES, ID.unique(), {
      username,
      address,
      domain,
      telegramChatId: chatId,
      createdAt: new Date(now).toISOString(),
      expiresAt,
    })

    await sendMessage(
      token,
      parseInt(chatId),
      `✅ *Inbox created!*

📧 \`${address}\`

⏳ Expires in ${ttlHours}h

📨 Send emails — you'll get notified here!

🌐 https://readyonbooking.app/?inbox=${encodeURIComponent(address)}`
    )
  } catch (err: any) {
    error(`Create inbox error: ${err.message}`)
    await sendMessage(token, parseInt(chatId), `❌ Failed: ${err.message}`)
  }
}

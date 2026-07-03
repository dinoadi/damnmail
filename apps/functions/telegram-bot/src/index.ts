import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { Client, Databases, ID, Query } from 'node-appwrite';

const DB_ID = 'damnmail';
const COLL_DOMAINS = 'domains';
const COLL_INBOXES = 'inboxes';
const COLL_EMAILS = 'emails';

export default async ({ req, res, log, error }: any) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!token) {
      return res.json({ success: false, error: 'Bot not configured' }, 500);
    }

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || '')
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || '')
      .setKey(req.headers['x-appwrite-key'] || '');
    const databases = new Databases(client);

    const bot = new Bot(token);

    // ─── COMMAND: /start ──────────────────────────────────
    bot.command('start', async (ctx) => {
      const username = ctx.from?.first_name || 'there';
      await ctx.reply(
        `👋 Hello *${username}!*\n\n` +
        `Welcome to *DamnMail* — Multi-domain Temporary Email.\n\n` +
        `📧 \`/generate\` — Get a random email address\n` +
        `✏️ \`/create <username>\` — Create custom address\n\n` +
        `Your temporary inbox will expire automatically.`,
        { parse_mode: 'Markdown' }
      );
    });

    // ─── COMMAND: /generate ───────────────────────────────
    bot.command('generate', async (ctx) => {
      try {
        const domains = await getActiveDomains(databases);
        if (domains.length === 0) {
          await ctx.reply('❌ No active domains available. Contact admin.');
          return;
        }

        const randomUsername = generateUsername();

        if (domains.length === 1) {
          // Only one domain, generate immediately
          await createInbox(databases, randomUsername, domains[0], String(ctx.chat?.id || ''), ctx, error);
          return;
        }

        // Multiple domains — ask user to pick
        const keyboard = new InlineKeyboard();
        for (const domain of domains) {
          keyboard.text(domain, `create:${randomUsername}:${domain}`).row();
        }

        await ctx.reply('📧 Generate a random email for which domain?', {
          reply_markup: keyboard,
        });
      } catch (err: any) {
        error(`Generate error: ${err.message}`);
        await ctx.reply('❌ Something went wrong. Try again later.');
      }
    });

    // ─── COMMAND: /create <username> ──────────────────────
    bot.command('create', async (ctx) => {
      const text = ctx.message?.text || '';
      const parts = text.split(' ');
      const username = parts.slice(1).join('').trim();

      if (!username || !/^[a-zA-Z0-9._-]{1,64}$/.test(username)) {
        await ctx.reply(
          '❌ Invalid username.\n' +
          'Usage: \`/create <username>\`\n' +
          'Example: \`/create mymail\`\n' +
          'Allowed: letters, numbers, dots, hyphens, underscores (max 64 chars)',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      try {
        const domains = await getActiveDomains(databases);
        if (domains.length === 0) {
          await ctx.reply('❌ No active domains available.');
          return;
        }

        if (domains.length === 1) {
          await createInbox(databases, username, domains[0], String(ctx.chat?.id || ''), ctx, error);
          return;
        }

        // Multiple domains — pick one
        const keyboard = new InlineKeyboard();
        for (const domain of domains) {
          keyboard.text(domain, `create:${username}:${domain}`).row();
        }

        await ctx.reply(`✏️ Create "${username}@" on which domain?`, {
          reply_markup: keyboard,
        });
      } catch (err: any) {
        error(`Create error: ${err.message}`);
        await ctx.reply('❌ Something went wrong.');
      }
    });

    // ─── CALLBACK: create:username:domain ─────────────────
    bot.callbackQuery(/^create:(.+):(.+)$/, async (ctx) => {
      const match = ctx.callbackQuery.data.match(/^create:(.+):(.+)$/);
      if (!match) return;
      const [, username, domain] = match;
      const chatId = String(ctx.chat?.id || '');

      await createInbox(databases, username, domain, chatId, ctx, error);
      await ctx.answerCallbackQuery();
    });

    // ─── CALLBACK: fallback ───────────────────────────────
    bot.callbackQuery(/.*/, async (ctx) => {
      await ctx.answerCallbackQuery('Processing...');
    });

    // ─── HANDLE WEBHOOK UPDATE ────────────────────────────
    const update = req.bodyJson || req.bodyText || req.body;

    // Parse update
    let parsedUpdate: any;
    if (typeof update === 'object' && update?.update_id !== undefined) {
      parsedUpdate = update;
    } else if (typeof update === 'string') {
      try { parsedUpdate = JSON.parse(update); } catch { }
    }

    if (parsedUpdate) {
      try { await bot.init(); } catch (e) { log(`Bot init warning: ${e}`); }
      await bot.handleUpdate(parsedUpdate);
    } else {
      log('No valid Telegram update received');
    }

    return res.json({ ok: true });
  } catch (err: any) {
    error(`Telegram bot error: ${err.message}`);
    return res.json({ ok: false, error: err.message }, 500);
  }
};

// ─── HELPERS ───────────────────────────────────────────

function generateUsername(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function getActiveDomains(databases: Databases): Promise<string[]> {
  try {
    const result = await databases.listDocuments(DB_ID, COLL_DOMAINS, [
      Query.equal('isActive', true),
    ]);
    return result.documents.map((d: any) => d.name);
  } catch {
    return [];
  }
}

async function createInbox(
  databases: Databases,
  username: string,
  domain: string,
  chatId: string,
  ctx: any,
  error: any
) {
  try {
    const address = `${username}@${domain}`;
    const ttlHours = parseInt(process.env.EMAIL_TTL_HOURS || '168', 10);
    const now = Date.now();
    const expiresAt = new Date(now + ttlHours * 60 * 60 * 1000).toISOString();

    // Check if already exists
    try {
      await databases.getDocument(DB_ID, COLL_INBOXES, address);
      await ctx.reply(`⚠️ Address \`${address}\` already exists!`, { parse_mode: 'Markdown' });
      return;
    } catch {
      // OK, doesn't exist
    }

    await databases.createDocument(DB_ID, COLL_INBOXES, address, {
      username,
      address,
      domain,
      telegramChatId: chatId,
      createdAt: new Date(now).toISOString(),
      expiresAt,
    });

    const minutes = ttlHours * 60;

    await ctx.reply(
      `✅ *Inbox created!*\n\n📧 \`${address}\`\n\n` +
      `⏳ Expires in ${ttlHours}h\n` +
      `📨 Send emails to this address — you\'ll get notified here!\n\n` +
      `🌐 https://readyonbooking.app/?inbox=${encodeURIComponent(address)}`,
      { parse_mode: 'Markdown' }
    );
  } catch (err: any) {
    error(`Create inbox error: ${err.message}`);
    await ctx.reply(`❌ Failed to create inbox: ${err.message}`);
  }
}

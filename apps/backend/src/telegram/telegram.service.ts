import { Bot, InlineKeyboard } from 'grammy'
import type { InboxEventBus } from '../events/inbox-event-bus'
import type { DomainService } from '../domains/domain.service'
import type { InboxService } from '../inbox/inbox.service'
import { TELEGRAM_SNIPPET_MAX_LENGTH } from '@damnmail/shared'

interface TelegramBotServiceOptions {
  token?: string
  adminChatIds: string[]
  domainService: DomainService
  inboxService: InboxService
  eventBus: InboxEventBus
  defaultTtlHours: number
}

function shortenSnippet(snippet: string): string {
  return snippet.length <= TELEGRAM_SNIPPET_MAX_LENGTH
    ? snippet
    : `${snippet.slice(0, TELEGRAM_SNIPPET_MAX_LENGTH)}...`
}

export class TelegramBotService {
  private readonly bot?: Bot

  constructor(private readonly options: TelegramBotServiceOptions) {
    if (!options.token) {
      return
    }

    this.bot = new Bot(options.token)
    this.registerCommands()
    this.registerRealtimeForwarding()
  }

  start(): void {
    if (!this.bot) {
      return
    }

    void this.bot.start()
  }

  private registerCommands(): void {
    if (!this.bot) {
      return
    }

    this.bot.command('start', async (context) => {
      await context.reply('DamnMail ready. Use /generate for random inbox or /create <username> for custom inbox.')
    })

    this.bot.command('generate', async (context) => {
      const keyboard = new InlineKeyboard()
      for (const domain of this.options.domainService.listActiveDomains()) {
        keyboard.text(domain.name, `create:random:${domain.name}`).row()
      }

      await context.reply('Pick domain for random inbox.', { reply_markup: keyboard })
    })

    this.bot.command('create', async (context) => {
      const customUsername = context.match?.toString().trim()
      if (!customUsername) {
        await context.reply('Use /create <username>')
        return
      }

      const keyboard = new InlineKeyboard()
      for (const domain of this.options.domainService.listActiveDomains()) {
        keyboard.text(domain.name, `create:${customUsername}:${domain.name}`).row()
      }

      await context.reply(`Pick domain for ${customUsername}.`, { reply_markup: keyboard })
    })

    this.bot.on('callback_query:data', async (context) => {
      const [action, username, domain] = context.callbackQuery.data.split(':')
      if (action !== 'create') {
        await context.answerCallbackQuery()
        return
      }

      const inbox = await this.options.inboxService.createInbox({
        username: username === 'random' ? undefined : username,
        domain,
        ttlHours: this.options.defaultTtlHours,
        telegramChatId: String(context.chatId)
      })

      await context.answerCallbackQuery({ text: 'Inbox created' })
      await context.reply(`Inbox active: ${inbox.address}\nExpires: ${inbox.expiresAt}`)
    })
  }

  private registerRealtimeForwarding(): void {
    this.options.eventBus.subscribe((event) => {
      const adminMessage = [
        '📨 DamnMail inbound log',
        `To: ${event.message.to}`,
        `From: ${event.message.from}`,
        `Subject: ${event.message.subject}`,
        `Snippet: ${shortenSnippet(event.message.snippet)}`
      ].join('\n')

      for (const adminChatId of this.options.adminChatIds) {
        void this.bot?.api.sendMessage(adminChatId, adminMessage)
      }

      void this.options.inboxService.getInbox(event.inboxAddress).then((inbox) => {
        if (!inbox?.telegramChatId) {
          return
        }

        const userMessage = [
          'New email received',
          `Inbox: ${event.inboxAddress}`,
          `From: ${event.message.from}`,
          `Subject: ${event.message.subject}`,
          `Snippet: ${shortenSnippet(event.message.snippet)}`
        ].join('\n')

        void this.bot?.api.sendMessage(inbox.telegramChatId, userMessage)
      })
    })
  }
}

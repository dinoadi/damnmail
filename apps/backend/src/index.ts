import { join } from 'path'
import { config as loadDotEnv } from 'dotenv'
import { loadEnv } from './config/env'
import { DomainService } from './domains/domain.service'
import { InboxService } from './inbox/inbox.service'
import { normalizeDomain } from '@damnmail/shared'
import { InboxEventBus } from './events/inbox-event-bus'
import { buildApiServer } from './api/server'
import { buildSmtpServer } from './mail/smtp-server'
import { TelegramBotService } from './telegram/telegram.service'
import { createStorageAdapter } from './storage'

loadDotEnv()
loadDotEnv({ path: join(process.cwd(), '../../.env') })

async function startApplication(): Promise<void> {
  const env = loadEnv()
  const storage = await createStorageAdapter(env)
  const domainService = new DomainService(env.domains)
  domainService.syncDomains(await storage.listActiveDomains())

  const inboxService = new InboxService(storage, env.EMAIL_TTL_HOURS)

  // Ensure catch-all inbox exists at startup
  const catchAllAddress = env.CATCH_ALL_ADDRESS || `all@${env.domains[0]}`
  const existingCatchAll = await inboxService.getInbox(catchAllAddress)
  if (!existingCatchAll) {
    const [localPart, domain] = catchAllAddress.split('@')
    await inboxService.createInbox({
      username: localPart,
      domain: normalizeDomain(domain)
    })
    console.log(`[Startup] Catch-all inbox created: ${catchAllAddress}`)
  } else {
    console.log(`[Startup] Catch-all inbox exists: ${catchAllAddress}`)
  }

  const eventBus = new InboxEventBus()
  const telegramBotService = new TelegramBotService({
    token: env.TELEGRAM_BOT_TOKEN,
    adminChatIds: env.telegramAdminChatIds,
    domainService,
    inboxService,
    eventBus,
    defaultTtlHours: env.EMAIL_TTL_HOURS
  })

  const apiServer = await buildApiServer({ env, domainService, inboxService, eventBus, storage })
  const smtpServer = buildSmtpServer({ env, domainService, inboxService, eventBus })

  setInterval(() => {
    void inboxService.cleanupExpired()
  }, 60_000)

  telegramBotService.start()
  await apiServer.listen({ host: '127.0.0.1', port: env.API_PORT })
  smtpServer.listen(env.SMTP_PORT, '0.0.0.0')
}

void startApplication()

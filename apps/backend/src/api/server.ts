import fastify from 'fastify'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import type { AppEnv } from '../config/env'
import type { DomainService } from '../domains/domain.service'
import type { InboxService } from '../inbox/inbox.service'
import type { InboxEventBus } from '../events/inbox-event-bus'
import type { StorageAdapter } from '../storage/storage.types'
import { createInboxSchema, upsertDomainSchema } from './schemas'
import { streamInboxEvents } from '../realtime/sse'
import { buildHealthCheck } from '../health/health.service'
import { normalizeDomain } from '@damnmail/shared'
import { extractAdminApiKey, sendAttachmentFile, formatBytes } from './helpers'

interface BuildApiServerOptions {
  env: AppEnv
  domainService: DomainService
  inboxService: InboxService
  eventBus: InboxEventBus
  storage: StorageAdapter
}

export async function buildApiServer(options: BuildApiServerOptions) {
  const app = fastify({ logger: true })
  const allowedOrigins = [options.env.FRONTEND_URL, options.env.NEXT_PUBLIC_API_BASE_URL].filter(
    (origin): origin is string => Boolean(origin)
  )

  await app.register(cors, { origin: allowedOrigins })
  await app.register(sensible)

  // Wrap all successful responses with { success, data }
  app.addHook('preSerialization', async (request, _reply, payload) => {
    if (request.url.includes('/stream') || request.url.includes('/attachment')) return payload
    if (payload !== null && typeof payload === 'object' && !('success' in payload)) {
      return { success: true, data: payload }
    }
    return payload
  })

  // ─── Public API ──────────────────────────────────────

  app.get('/api/domains', async () => {
    const domains = await options.storage.listActiveDomains()
    options.domainService.syncDomains(domains)
    return domains
  })

  app.post('/api/inboxes', async (request, reply) => {
    const parsedBody = createInboxSchema.parse(request.body)
    const domain = normalizeDomain(parsedBody.domain)

    if (!options.domainService.isAllowedDomain(domain)) {
      return reply.badRequest('Requested domain is not active')
    }

    const inbox = await options.inboxService.createInbox({
      username: parsedBody.username,
      domain,
      telegramChatId: parsedBody.telegramChatId
    })

    return {
      inbox,
      domains: await options.storage.listActiveDomains()
    }
  })

  app.get('/api/inboxes/:address/messages', async (request) => {
    const params = request.params as { address: string }
    const query = request.query as { limit?: string; offset?: string }
    const limit = query.limit ? parseInt(query.limit, 10) : 50
    const offset = query.offset ? parseInt(query.offset, 10) : 0
    return options.inboxService.listMessages(params.address, { limit, offset })
  })

  app.get('/api/inboxes/:address/stats', async (request) => {
    const address = (request.params as { address: string }).address
    const totalEmails = await options.inboxService.countMessages(address)
    const storageLimit = 2 * 1024 * 1024 * 1024

    return {
      inboxAddress: address,
      totalEmails,
      totalAttachments: 0,
      storageUsedBytes: 0,
      storageLimit,
      storageUsedFormatted: '0 B',
      storageLimitFormatted: '2 GB',
      usagePercent: 0
    }
  })

  app.get('/api/inboxes/:address/stream', async (request, reply) => {
    const address = (request.params as { address: string }).address
    streamInboxEvents(reply, address, options.eventBus)
    return reply
  })

  app.delete('/api/messages/:messageId', async (request, reply) => {
    const messageId = (request.params as { messageId: string }).messageId
    const deleted = await options.storage.deleteMessage(messageId)
    if (!deleted) {
      return reply.notFound('Message not found')
    }
    return { deleted: true }
  })

  app.get('/api/messages/:messageId', async (request, reply) => {
    const messageId = (request.params as { messageId: string }).messageId
    const message = await options.inboxService.getMessage(messageId)
    if (!message) {
      return reply.notFound('Message not found')
    }
    return message
  })

  app.get('/api/attachments/:attachmentId', async (request, reply) => {
    const attachmentId = (request.params as { attachmentId: string }).attachmentId
    const attachment = await options.storage.getAttachment(attachmentId)

    if (!attachment) {
      return reply.notFound('Attachment not found')
    }

    await sendAttachmentFile(reply, attachment.storagePath, attachment.filename, attachment.contentType)
  })

  // ─── Admin API ───────────────────────────────────────

  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/admin')) {
      return
    }

    const apiKey = extractAdminApiKey(request)
    if (apiKey === options.env.ADMIN_API_KEY) {
      return
    }

    return reply.unauthorized('Invalid admin API key')
  })

  app.get('/api/admin/health', async () => buildHealthCheck(options.domainService))

  app.post('/api/admin/domains', async (request) => {
    const parsedBody = upsertDomainSchema.parse(request.body)
    const domain = await options.storage.upsertDomain(normalizeDomain(parsedBody.domain), parsedBody.isActive)
    options.domainService.upsertDomain(domain.name, domain.isActive)
    return { domain }
  })

  app.post('/api/admin/test-inbound', async (request, reply) => {
    const { domain } = request.body as { domain: string }
    const normalizedDomain = normalizeDomain(domain)

    if (!options.domainService.isAllowedDomain(normalizedDomain)) {
      return reply.badRequest('Domain is not active')
    }

    return {
      status: 'ACTIVE',
      message: `SMTP listener accepts recipients on ${normalizedDomain}`
    }
  })

  return app
}

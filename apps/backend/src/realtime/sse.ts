import type { FastifyReply } from 'fastify'
import { SSE_RETRY_INTERVAL_MS } from '@damnmail/shared'
import type { InboxEventBus } from '../events/inbox-event-bus'

export function streamInboxEvents(reply: FastifyReply, inboxAddress: string, eventBus: InboxEventBus): void {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  })

  reply.raw.write(`retry: ${SSE_RETRY_INTERVAL_MS}\n\n`)

  const unsubscribe = eventBus.subscribe((event) => {
    if (event.inboxAddress !== inboxAddress) {
      return
    }

    reply.raw.write(`event: ${event.type}\n`)
    reply.raw.write(`data: ${JSON.stringify(event.message)}\n\n`)
  })

  reply.raw.on('close', () => {
    unsubscribe()
    reply.raw.end()
  })
}

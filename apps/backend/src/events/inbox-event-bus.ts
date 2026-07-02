import type { EmailMessage } from '@damnmail/shared'

export type InboxEvent = {
  type: 'email-received'
  inboxAddress: string
  message: EmailMessage
}

export class InboxEventBus {
  private readonly listeners = new Set<(event: InboxEvent) => void>()

  subscribe(listener: (event: InboxEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  publish(event: InboxEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}

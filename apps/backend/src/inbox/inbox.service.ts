import type { EmailMessage, InboxAddress } from '@damnmail/shared'
import { buildEmailAddress, generateRandomUsername, normalizeDomain, normalizeUsername } from '@damnmail/shared'
import type { StorageAdapter } from '../storage/storage.types'

export class InboxService {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly defaultTtlHours: number
  ) {}

  async createInbox(input: {
    username?: string
    domain: string
    ttlHours?: number
    telegramChatId?: string
  }): Promise<InboxAddress> {
    const username = input.username ? normalizeUsername(input.username) : generateRandomUsername()
    const domain = normalizeDomain(input.domain)
    const address = buildEmailAddress(username, domain)

    return this.storage.createInbox({
      username,
      domain,
      address,
      ttlHours: input.ttlHours ?? this.defaultTtlHours,
      telegramChatId: input.telegramChatId
    })
  }

  async getInbox(address: string): Promise<InboxAddress | undefined> {
    return this.storage.getInbox(address)
  }

  async listMessages(address: string): Promise<EmailMessage[]> {
    return this.storage.listMessages(address)
  }

  async addMessage(
    address: string,
    message: Omit<EmailMessage, 'id' | 'snippet'>,
    attachments: Array<{ id: string; filename: string; contentType: string; size: number; storagePath: string }>
  ): Promise<EmailMessage> {
    return this.storage.addMessage(address, message, attachments)
  }

  async cleanupExpired(): Promise<void> {
    await this.storage.cleanupExpired()
  }
}

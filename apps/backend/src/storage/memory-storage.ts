import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Domain, EmailMessage, InboxAddress } from '@damnmail/shared'
import { createId, createSnippet } from '@damnmail/shared'
import type { StorageAdapter } from './storage.types'

interface MemoryAttachmentRecord {
  id: string
  filename: string
  contentType: string
  size: number
  storagePath: string
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly domains = new Map<string, Domain>()
  private readonly inboxes = new Map<string, InboxAddress>()
  private readonly messages = new Map<string, EmailMessage[]>()
  private readonly attachments = new Map<string, MemoryAttachmentRecord>()

  constructor(domainNames: string[]) {
    const now = new Date().toISOString()
    for (const domainName of domainNames) {
      this.domains.set(domainName, {
        id: createId('dom'),
        name: domainName,
        isActive: true,
        createdAt: now,
        updatedAt: now
      })
    }
  }

  async listActiveDomains(): Promise<Domain[]> {
    return Array.from(this.domains.values()).filter((domain) => domain.isActive)
  }

  async upsertDomain(name: string, isActive: boolean): Promise<Domain> {
    const now = new Date().toISOString()
    const existingDomain = this.domains.get(name)
    const domain: Domain = existingDomain
      ? { ...existingDomain, isActive, updatedAt: now }
      : { id: createId('dom'), name, isActive, createdAt: now, updatedAt: now }

    this.domains.set(name, domain)
    return domain
  }

  async createInbox(input: {
    username: string
    domain: string
    address: string
    ttlHours: number
    telegramChatId?: string
  }): Promise<InboxAddress> {
    const now = Date.now()
    const inbox: InboxAddress = {
      id: createId('inbox'),
      username: input.username,
      domain: input.domain,
      address: input.address,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + input.ttlHours * 60 * 60 * 1000).toISOString(),
      telegramChatId: input.telegramChatId
    }

    this.inboxes.set(input.address, inbox)
    if (!this.messages.has(input.address)) {
      this.messages.set(input.address, [])
    }

    return inbox
  }

  async getInbox(address: string): Promise<InboxAddress | undefined> {
    return this.inboxes.get(address)
  }

  async listMessages(address: string): Promise<EmailMessage[]> {
    return this.messages.get(address) ?? []
  }

  async addMessage(
    address: string,
    message: Omit<EmailMessage, 'id' | 'snippet'>,
    attachments: MemoryAttachmentRecord[]
  ): Promise<EmailMessage> {
    const createdMessage: EmailMessage = {
      ...message,
      id: createId('msg'),
      snippet: createSnippet(message.text ?? message.html),
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        size: attachment.size,
        downloadUrl: `/api/attachments/${attachment.id}`
      }))
    }

    for (const attachment of attachments) {
      this.attachments.set(attachment.id, attachment)
    }

    const existingMessages = this.messages.get(address) ?? []
    this.messages.set(address, [createdMessage, ...existingMessages])
    return createdMessage
  }

  async getAttachment(attachmentId: string): Promise<MemoryAttachmentRecord | undefined> {
    return this.attachments.get(attachmentId)
  }

  async cleanupExpired(): Promise<void> {
    const now = Date.now()
    for (const [address, inbox] of this.inboxes.entries()) {
      if (new Date(inbox.expiresAt).getTime() > now) {
        continue
      }

      this.inboxes.delete(address)
      this.messages.delete(address)
    }
  }
}

export async function writeAttachmentToDisk(baseDirectory: string, filename: string, content: Buffer): Promise<string> {
  const safeFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  await fs.mkdir(baseDirectory, { recursive: true })
  const targetPath = path.join(baseDirectory, safeFilename)
  await fs.writeFile(targetPath, content)
  return targetPath
}

import { PrismaClient } from '@prisma/client'
import type { Domain, EmailMessage, InboxAddress } from '@damnmail/shared'
import { createSnippet } from '@damnmail/shared'
import type { StorageAdapter } from './storage.types'

function mapDomain(domain: { id: string; name: string; isActive: boolean; createdAt: Date; updatedAt: Date }): Domain {
  return {
    id: domain.id,
    name: domain.name,
    isActive: domain.isActive,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString()
  }
}

export class PrismaStorageAdapter implements StorageAdapter {
  constructor(private readonly prisma: PrismaClient) {}

  async listActiveDomains(): Promise<Domain[]> {
    const domains = await this.prisma.domain.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
    return domains.map(mapDomain)
  }

  async upsertDomain(name: string, isActive: boolean): Promise<Domain> {
    const domain = await this.prisma.domain.upsert({
      where: { name },
      update: { isActive },
      create: { name, isActive }
    })

    return mapDomain(domain)
  }

  async createInbox(input: { username: string; domain: string; address: string; ttlHours: number; telegramChatId?: string }): Promise<InboxAddress> {
    const domain = await this.prisma.domain.upsert({
      where: { name: input.domain },
      update: { isActive: true },
      create: { name: input.domain, isActive: true }
    })

    const now = Date.now()
    const inbox = await this.prisma.inbox.upsert({
      where: { address: input.address },
      update: {
        username: input.username,
        expiresAt: new Date(now + input.ttlHours * 60 * 60 * 1000),
        telegramChatId: input.telegramChatId,
        domainId: domain.id
      },
      create: {
        username: input.username,
        address: input.address,
        expiresAt: new Date(now + input.ttlHours * 60 * 60 * 1000),
        telegramChatId: input.telegramChatId,
        domainId: domain.id
      }
    })

    return {
      id: inbox.id,
      username: inbox.username,
      domain: input.domain,
      address: inbox.address,
      createdAt: inbox.createdAt.toISOString(),
      expiresAt: inbox.expiresAt.toISOString(),
      telegramChatId: inbox.telegramChatId ?? undefined
    }
  }

  async getInbox(address: string): Promise<InboxAddress | undefined> {
    const inbox = await this.prisma.inbox.findUnique({ where: { address }, include: { domain: true } })
    if (!inbox) {
      return undefined
    }

    return {
      id: inbox.id,
      username: inbox.username,
      domain: inbox.domain.name,
      address: inbox.address,
      createdAt: inbox.createdAt.toISOString(),
      expiresAt: inbox.expiresAt.toISOString(),
      telegramChatId: inbox.telegramChatId ?? undefined
    }
  }

  async listMessages(address: string, options?: { limit?: number; offset?: number }): Promise<EmailMessage[]> {
  const { limit = 1000, offset = 0 } = options || {}

  const inbox = await this.prisma.inbox.findUnique({
    where: { address },
    include: {
      emails: {
        ...(options ? { skip: offset, take: limit } : {}),
        include: { attachments: true },
        orderBy: { receivedAt: 'desc' }
      }
    }
  })

  if (!inbox) {
    return []
  }

  return inbox.emails.map((email) => ({
    id: email.id,
    inboxAddress: inbox.address,
    from: email.from,
    to: email.to,
    subject: email.subject,
    html: undefined,
    text: email.text ?? undefined,
    snippet: email.snippet,
    receivedAt: email.receivedAt.toISOString(),
    attachments: email.attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      downloadUrl: `/api/attachments/${attachment.id}`
    }))
  }))
}

  async countMessages(address: string): Promise<number> {
    return this.prisma.email.count({
      where: { inbox: { address } }
    })
  }

  async countAttachments(address: string): Promise<number> {
    const inbox = await this.prisma.inbox.findUnique({
      where: { address },
      include: {
        emails: {
          include: { _count: { select: { attachments: true } } }
        }
      }
    })
    if (!inbox) return 0
    return inbox.emails.reduce((sum, e) => sum + e._count.attachments, 0)
  }

  async getStorageUsedBytes(address: string): Promise<number> {
    const inbox = await this.prisma.inbox.findUnique({
      where: { address },
      include: {
        emails: {
          include: { attachments: true }
        }
      }
    })
    if (!inbox) return 0
    let bytes = 0
    for (const email of inbox.emails) {
      bytes += (email.text?.length ?? 0) + (email.html?.length ?? 0)
      for (const att of email.attachments) {
        bytes += att.size
      }
    }
    return bytes
  }

async getMessage(messageId: string): Promise<EmailMessage | undefined> {
  const email = await this.prisma.email.findUnique({
    where: { id: messageId },
    include: { attachments: true, inbox: true }
  })

  if (!email) {
    return undefined
  }

  return {
    id: email.id,
    inboxAddress: email.inbox.address,
    from: email.from,
    to: email.to,
    subject: email.subject,
    html: email.html ?? undefined,
    text: email.text ?? undefined,
    snippet: email.snippet,
    receivedAt: email.receivedAt.toISOString(),
    attachments: email.attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      downloadUrl: `/api/attachments/${attachment.id}`
    }))
  }
}



  async addMessage(
    address: string,
    message: Omit<EmailMessage, 'id' | 'snippet'>,
    attachments: Array<{ id: string; filename: string; contentType: string; size: number; storagePath: string }>
  ): Promise<EmailMessage> {
    const inbox = await this.prisma.inbox.findUnique({ where: { address } })
    if (!inbox) {
      throw new Error(`Inbox not found for ${address}`)
    }

    const email = await this.prisma.email.create({
      data: {
        inboxId: inbox.id,
        envelopeFrom: message.from,
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        snippet: createSnippet(message.text ?? message.html),
        receivedAt: new Date(message.receivedAt),
        attachments: {
          create: attachments.map((attachment) => ({
            id: attachment.id,
            filename: attachment.filename,
            contentType: attachment.contentType,
            size: attachment.size,
            storagePath: attachment.storagePath
          }))
        }
      },
      include: { attachments: true }
    })

    return {
      id: email.id,
      inboxAddress: address,
      from: email.from,
      to: email.to,
      subject: email.subject,
      html: email.html ?? undefined,
      text: email.text ?? undefined,
      snippet: email.snippet,
      receivedAt: email.receivedAt.toISOString(),
      attachments: email.attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        size: attachment.size,
        downloadUrl: `/api/attachments/${attachment.id}`
      }))
    }
  }

  async getAttachment(attachmentId: string): Promise<{ id: string; filename: string; contentType: string; size: number; storagePath: string } | undefined> {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } })
    return attachment ?? undefined
  }
  async cleanupExpired(): Promise<void> {
    // Unlimited - no expiration
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    try {
      await this.prisma.email.delete({ where: { id: messageId } })
      return true
    } catch {
      return false
    }
  }
}

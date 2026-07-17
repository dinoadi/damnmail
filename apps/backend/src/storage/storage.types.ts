import type { Domain, EmailMessage, InboxAddress } from '@damnmail/shared'

export interface StorageAdapter {
  listActiveDomains(): Promise<Domain[]>
  upsertDomain(name: string, isActive: boolean): Promise<Domain>
  createInbox(input: {
    username: string
    domain: string
    address: string
    ttlHours: number
    telegramChatId?: string
  }): Promise<InboxAddress>
  getInbox(address: string): Promise<InboxAddress | undefined>
  listMessages(address: string, options?: { limit?: number; offset?: number }): Promise<EmailMessage[]>
  countMessages(address: string): Promise<number>
  addMessage(
    address: string,
    message: Omit<EmailMessage, 'id' | 'snippet'>,
    attachments: Array<{ id: string; filename: string; contentType: string; size: number; storagePath: string }>
  ): Promise<EmailMessage>
  getAttachment(attachmentId: string): Promise<{
    id: string
    filename: string
    contentType: string
    size: number
    storagePath: string
  } | undefined>
  cleanupExpired(): Promise<void>
  deleteMessage(messageId: string): Promise<boolean>
  getMessage(messageId: string): Promise<EmailMessage | undefined>
}
}

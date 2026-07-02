export interface DomainViewModel {
  id: string
  name: string
  isActive: boolean
}

export interface InboxViewModel {
  id: string
  username: string
  domain: string
  address: string
  expiresAt: string
}

export interface AttachmentViewModel {
  id: string
  filename: string
  contentType: string
  size: number
  downloadUrl: string
}

export interface EmailViewModel {
  id: string
  inboxAddress: string
  from: string
  to: string
  subject: string
  html?: string
  text?: string
  snippet: string
  receivedAt: string
  attachments: AttachmentViewModel[]
}

export interface Domain {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface InboxAddress {
  id: string
  username: string
  domain: string
  address: string
  expiresAt: string
  createdAt: string
  telegramChatId?: string
}

export interface EmailAttachment {
  id: string
  filename: string
  contentType: string
  size: number
  downloadUrl: string
}

export interface EmailMessage {
  id: string
  inboxAddress: string
  from: string
  to: string
  subject: string
  html?: string
  text?: string
  snippet: string
  receivedAt: string
  attachments: EmailAttachment[]
}

export interface GenerateInboxInput {
  username?: string
  domain: string
  telegramChatId?: string
}

export interface GenerateInboxResponse {
  inbox: InboxAddress
  domains: Domain[]
}

export interface HealthCheckDomain {
  domain: string
  isActive: boolean
  mxConfigured: boolean
  smtpReachable: boolean
  status: 'ACTIVE' | 'INACTIVE'
  message: string
}

export interface HealthCheckResponse {
  service: 'damnmail'
  checkedAt: string
  domains: HealthCheckDomain[]
}

export interface IncomingEmailPayload {
  envelopeFrom: string
  envelopeTo: string[]
  sourceIp?: string
  raw: Buffer
}

import { simpleParser } from 'mailparser'
import type { AddressObject, Attachment, ParsedMail } from 'mailparser'
import type { EmailAttachment } from '@damnmail/shared'
import { createId, createSnippet } from '@damnmail/shared'

export interface ParsedEmailContent {
  from: string
  to: string
  subject: string
  html?: string
  text?: string
  snippet: string
  attachments: Array<EmailAttachment & { content: Buffer }>
}

function formatAddress(address?: AddressObject | AddressObject[]): string {
  if (!address) {
    return 'Unknown'
  }

  return Array.isArray(address)
    ? address.flatMap((entry) => entry.value.map((value) => value.address ?? value.name ?? 'Unknown')).join(', ')
    : address.text
}

function convertAttachment(attachment: Attachment): EmailAttachment & { content: Buffer } {
  return {
    id: createId('att'),
    filename: attachment.filename ?? 'attachment.bin',
    contentType: attachment.contentType,
    size: attachment.size,
    downloadUrl: `/api/attachments/${createId('dl')}`,
    content: attachment.content
  }
}

export async function parseIncomingEmail(raw: Buffer): Promise<ParsedEmailContent> {
  const parsedMail: ParsedMail = await simpleParser(raw)
  const from = formatAddress(parsedMail.from)
  const to = formatAddress(parsedMail.to)
  const subject = parsedMail.subject?.trim() || '(No subject)'
  const html = typeof parsedMail.html === 'string' ? parsedMail.html : undefined
  const text = parsedMail.text?.trim() || undefined
  const attachments = parsedMail.attachments.map(convertAttachment)

  return {
    from,
    to,
    subject,
    html,
    text,
    snippet: createSnippet(text ?? html),
    attachments
  }
}

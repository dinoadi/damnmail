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
  let html = typeof parsedMail.html === 'string' ? parsedMail.html : undefined
  let text = parsedMail.text?.trim() || undefined
  const attachments = parsedMail.attachments.map(convertAttachment)

  // If no html/text content found, try extracting from nested message/rfc822 attachments
  // (e.g., bounce reports, forwarded emails where content is in the attached original message)
  if (!html && !text) {
    for (const att of parsedMail.attachments) {
      if (att.contentType === 'message/rfc822' && att.content.length > 0) {
        try {
          const nestedMail = await simpleParser(att.content)
          if (!html && typeof nestedMail.html === 'string') {
            html = nestedMail.html
          }
          if (!text && nestedMail.text?.trim()) {
            text = nestedMail.text.trim()
          }
          if (html || text) break
        } catch {
          // Skip unparseable nested messages
        }
      }
    }
  }

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

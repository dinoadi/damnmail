import { SMTPServer } from 'smtp-server'
import type { AppEnv } from '../config/env'
import type { DomainService } from '../domains/domain.service'
import type { InboxService } from '../inbox/inbox.service'
import type { InboxEventBus } from '../events/inbox-event-bus'
import { parseIncomingEmail } from './parser'
import { sanitizeEmailHtml } from './sanitize'
import { createId, normalizeDomain } from '@damnmail/shared'
import { writeAttachmentToDisk } from '../storage/memory-storage'

interface BuildSmtpServerOptions {
  env: AppEnv
  domainService: DomainService
  inboxService: InboxService
  eventBus: InboxEventBus
}

export function buildSmtpServer(options: BuildSmtpServerOptions): SMTPServer {
  return new SMTPServer({
    disabledCommands: ['AUTH', 'STARTTLS'],
    banner: 'DamnMail SMTP ready',
    onRcptTo(address, _session, callback) {
      const domain = normalizeDomain(address.address.split('@')[1] ?? '')
      if (!options.domainService.isAllowedDomain(domain)) {
        callback(new Error(`Domain ${domain} is not active`))
        return
      }

      callback()
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', async () => {
        try {
          const rawEmail = Buffer.concat(chunks)
          const parsedEmail = await parseIncomingEmail(rawEmail)
          const recipients = session.envelope.rcptTo.map((recipient) => recipient.address)

          for (const recipient of recipients) {
            let inbox = await options.inboxService.getInbox(recipient)
            if (!inbox) {
              const [localPart, domain] = recipient.split('@')
              inbox = await options.inboxService.createInbox({
                username: localPart,
                domain: normalizeDomain(domain)
              })
            }

            const storedAttachments = [] as Array<{ id: string; filename: string; contentType: string; size: number; storagePath: string }>
            for (const attachment of parsedEmail.attachments) {
              const storagePath = await writeAttachmentToDisk(options.env.ATTACHMENT_STORAGE_DIR, attachment.filename, attachment.content)
              storedAttachments.push({
                id: createId('att'),
                filename: attachment.filename,
                contentType: attachment.contentType,
                size: attachment.size,
                storagePath
              })
            }

            const createdMessage = await options.inboxService.addMessage(
              recipient,
              {
                inboxAddress: recipient,
                from: parsedEmail.from,
                to: parsedEmail.to,
                subject: parsedEmail.subject,
                html: sanitizeEmailHtml(parsedEmail.html),
                text: parsedEmail.text,
                receivedAt: new Date().toISOString(),
                attachments: []
              },
              storedAttachments
            )

            options.eventBus.publish({
              type: 'email-received',
              inboxAddress: recipient,
              message: createdMessage
            })
          }

          callback()
        } catch (error) {
          callback(error instanceof Error ? error : new Error('Failed to process email'))
        }
      })
      stream.on('error', callback)
    }
  })
}

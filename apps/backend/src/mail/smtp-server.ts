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
  const log = (msg: string) => console.log(`[SMTP] ${msg}`)
  const logError = (msg: string) => console.error(`[SMTP] ${msg}`)

  return new SMTPServer({
    disabledCommands: ['AUTH', 'STARTTLS'],
    name: 'mail.readyonbooking.app',
    banner: 'DamnMail SMTP ready',
    logger: (line: string) => log(line),
    onConnect(session, callback) {
      log(`Connection from ${session.remoteAddress || 'unknown'}`)
      callback()
    },
    onRcptTo(address, _session, callback) {
      const domain = normalizeDomain(address.address.split('@')[1] ?? '')
      if (!options.domainService.isAllowedDomain(domain)) {
        logError(`Rejected RCPT: ${address.address} (domain ${domain} not active)`)
        callback(new Error(`Domain ${domain} is not active`))
        return
      }
      log(`Accepted RCPT: ${address.address}`)
      callback()
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', async () => {
        try {
          const rawEmail = Buffer.concat(chunks)
          log(`Processing email (${rawEmail.length} bytes)`)
          const parsedEmail = await parseIncomingEmail(rawEmail)
          const primaryDomain = options.env.domains[0]
          const catchAllAddress = options.env.CATCH_ALL_ADDRESS || `all@${primaryDomain}`
          let catchAllInbox = await options.inboxService.getInbox(catchAllAddress)
          if (!catchAllInbox) {
            const [localPart, domain] = catchAllAddress.split('@')
            catchAllInbox = await options.inboxService.createInbox({
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
            catchAllAddress,
            {
              inboxAddress: catchAllAddress,
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
            inboxAddress: catchAllAddress,
            message: createdMessage
          })
          log(`Email stored: ${parsedEmail.subject || '(no subject)'}`)
          callback()
        } catch (error) {
          logError(`Failed to process email: ${error instanceof Error ? error.message : 'Unknown error'}`)
          callback(error instanceof Error ? error : new Error('Failed to process email'))
        }
      })
      stream.on('error', (err) => {
        logError(`Stream error: ${err.message}`)
        callback(err)
      })
    }
  })
}

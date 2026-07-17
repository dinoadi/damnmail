import { z } from 'zod'
import { DEFAULT_EMAIL_TTL_HOURS, normalizeDomain } from '@damnmail/shared'

const envSchema = z.object({
  DOMAINS: z.string().min(1),
  EMAIL_TTL_HOURS: z.coerce.number().int().positive().default(DEFAULT_EMAIL_TTL_HOURS),
  CATCH_ALL_ADDRESS: z.string().optional(),
  API_PORT: z.coerce.number().int().positive().default(3004),
  SMTP_PORT: z.coerce.number().int().positive().default(2525),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_CHAT_IDS: z.string().default(''),
  SMTP_HOSTNAME: z.string().default('mail.damnmail.local'),
  MAIL_STORAGE_MODE: z.enum(['memory', 'database']).default('memory'),
  ADMIN_API_KEY: z.string().default('change-me'),
  ATTACHMENT_STORAGE_DIR: z.string().default('./data/attachments'),
  NEXT_PUBLIC_API_BASE_URL: z.string().url().optional()
})

export type AppEnv = z.infer<typeof envSchema> & {
  domains: string[]
  telegramAdminChatIds: string[]
}

export function loadEnv(): AppEnv {
  const parsedEnv = envSchema.parse(process.env)

  const domains = parsedEnv.DOMAINS.split(',')
    .map(normalizeDomain)
    .filter(Boolean)

  return {
    ...parsedEnv,
    domains,
    telegramAdminChatIds: parsedEnv.TELEGRAM_ADMIN_CHAT_IDS.split(',')
      .map((chatId) => chatId.trim())
      .filter(Boolean)
  }
}

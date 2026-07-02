import { z } from 'zod'

export const createInboxSchema = z.object({
  username: z.string().min(1).max(64).optional(),
  domain: z.string().min(1),
  telegramChatId: z.string().optional()
})

export const upsertDomainSchema = z.object({
  domain: z.string().min(1),
  isActive: z.boolean().default(true)
})

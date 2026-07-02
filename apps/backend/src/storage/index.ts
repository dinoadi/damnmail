import { PrismaClient } from '@prisma/client'
import type { AppEnv } from '../config/env'
import { MemoryStorageAdapter } from './memory-storage'
import { PrismaStorageAdapter } from './prisma-storage'
import type { StorageAdapter } from './storage.types'

export async function createStorageAdapter(env: AppEnv): Promise<StorageAdapter> {
  if (env.MAIL_STORAGE_MODE === 'database' && env.DATABASE_URL) {
    const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL })
    await prisma.$connect()

    const storage = new PrismaStorageAdapter(prisma)
    for (const domain of env.domains) {
      await storage.upsertDomain(domain, true)
    }

    return storage
  }

  return new MemoryStorageAdapter(env.domains)
}

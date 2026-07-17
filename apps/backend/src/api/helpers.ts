import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { FastifyReply, FastifyRequest } from 'fastify'

export async function sendAttachmentFile(reply: FastifyReply, filePath: string, filename: string, contentType: string): Promise<void> {
  const fileBuffer = await fs.readFile(filePath)
  reply.header('Content-Type', contentType)
  reply.header('Content-Disposition', `attachment; filename="${filename}"`)
  reply.send(fileBuffer)
}

export function resolveAttachmentDirectory(baseDirectory: string): string {
  return path.resolve(baseDirectory)
}

export function extractAdminApiKey(request: FastifyRequest): string | undefined {
  const headerValue = request.headers['x-admin-api-key']
  return typeof headerValue === 'string' ? headerValue : undefined
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`
}

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

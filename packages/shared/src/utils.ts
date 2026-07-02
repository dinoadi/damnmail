import { RANDOM_USERNAME_LENGTH, SNIPPET_MAX_LENGTH } from './constants'

export function generateRandomUsername(): string {
  return Math.random().toString(36).slice(2, 2 + RANDOM_USERNAME_LENGTH)
}

export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase()
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
}

export function buildEmailAddress(username: string, domain: string): string {
  return `${normalizeUsername(username)}@${normalizeDomain(domain)}`
}

export function createSnippet(content?: string): string {
  if (!content) {
    return 'No preview available'
  }

  const normalizedContent = content.replace(/\s+/g, ' ').trim()
  if (normalizedContent.length <= SNIPPET_MAX_LENGTH) {
    return normalizedContent
  }

  return `${normalizedContent.slice(0, SNIPPET_MAX_LENGTH)}...`
}

export function createId(prefix: string): string {
  const randomPart = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${randomPart}`
}

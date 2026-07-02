import type { Domain } from '@damnmail/shared'
import { createId } from '@damnmail/shared'

export class DomainService {
  private readonly domains = new Map<string, Domain>()

  constructor(initialDomains: string[]) {
    const now = new Date().toISOString()
    for (const name of initialDomains) {
      this.domains.set(name, {
        id: createId('dom'),
        name,
        isActive: true,
        createdAt: now,
        updatedAt: now
      })
    }
  }

  listActiveDomains(): Domain[] {
    return Array.from(this.domains.values()).filter((domain) => domain.isActive)
  }

  isAllowedDomain(domainName: string): boolean {
    const domain = this.domains.get(domainName)
    return Boolean(domain?.isActive)
  }

  upsertDomain(name: string, isActive = true): Domain {
    const now = new Date().toISOString()
    const existingDomain = this.domains.get(name)

    const domain: Domain = existingDomain
      ? { ...existingDomain, isActive, updatedAt: now }
      : { id: createId('dom'), name, isActive, createdAt: now, updatedAt: now }

    this.domains.set(name, domain)
    return domain
  }

  syncDomains(domains: Domain[]): void {
    this.domains.clear()
    for (const domain of domains) {
      this.domains.set(domain.name, domain)
    }
  }
}

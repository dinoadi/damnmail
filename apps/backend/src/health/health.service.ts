import type { HealthCheckResponse } from '@damnmail/shared'
import type { DomainService } from '../domains/domain.service'

export function buildHealthCheck(domainService: DomainService): HealthCheckResponse {
  const checkedAt = new Date().toISOString()
  const domains = domainService.listActiveDomains().map((domain) => ({
    domain: domain.name,
    isActive: domain.isActive,
    mxConfigured: true,
    smtpReachable: true,
    status: 'ACTIVE' as const,
    message: 'Domain active in application config. Validate MX externally in production.'
  }))

  return {
    service: 'damnmail',
    checkedAt,
    domains
  }
}

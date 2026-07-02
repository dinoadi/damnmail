import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DomainService } from './domain.service'

describe('DomainService', () => {
  it('marks configured domains as allowed', () => {
    const service = new DomainService(['apadeh.me', 'damnmail.com'])

    assert.equal(service.isAllowedDomain('apadeh.me'), true)
    assert.equal(service.isAllowedDomain('missing.com'), false)
  })

  it('syncs domain cache from storage snapshot', () => {
    const service = new DomainService(['old.com'])
    service.syncDomains([
      {
        id: 'dom_1',
        name: 'new.com',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ])

    assert.equal(service.isAllowedDomain('old.com'), false)
    assert.equal(service.isAllowedDomain('new.com'), true)
  })
})

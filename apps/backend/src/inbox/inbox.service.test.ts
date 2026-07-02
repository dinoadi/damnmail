import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryStorageAdapter } from '../storage/memory-storage'
import { InboxService } from './inbox.service'

describe('InboxService', () => {
  it('creates normalized inbox addresses', async () => {
    const storage = new MemoryStorageAdapter(['apadeh.me'])
    const service = new InboxService(storage, 24)

    const inbox = await service.createInbox({
      username: 'Rahasia+Drop',
      domain: 'APADEH.ME'
    })

    assert.equal(inbox.address, 'rahasiadrop@apadeh.me')
  })

  it('stores new messages at top of inbox list', async () => {
    const storage = new MemoryStorageAdapter(['apadeh.me'])
    const service = new InboxService(storage, 24)
    const inbox = await service.createInbox({ username: 'demo', domain: 'apadeh.me' })

    await service.addMessage(
      inbox.address,
      {
        inboxAddress: inbox.address,
        from: 'sender@example.com',
        to: inbox.address,
        subject: 'Test',
        html: '<b>Hello</b>',
        text: 'Hello',
        receivedAt: new Date().toISOString(),
        attachments: []
      },
      []
    )

    const messages = await service.listMessages(inbox.address)
    assert.equal(messages.length, 1)
    assert.equal(messages[0]?.subject, 'Test')
  })
})

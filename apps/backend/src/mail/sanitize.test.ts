import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeEmailHtml } from './sanitize'

describe('sanitizeEmailHtml', () => {
  it('removes script tags from HTML email body', () => {
    const result = sanitizeEmailHtml('<div>Hello</div><script>alert(1)</script>')

    assert.equal(result?.includes('<script>'), false)
    assert.equal(result?.includes('Hello'), true)
  })
})

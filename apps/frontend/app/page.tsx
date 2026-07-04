'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'

// Dark mode CSS override — injected after email HTML to beat embedded email styles
const EMAIL_DARK_CSS = '.email-content *:not(img):not(svg):not(video):not(iframe):not(canvas){color:rgb(var(--ink))!important;background-color:transparent!important}.email-content img{max-width:100%!important;height:auto!important;border-radius:6px}.dark .email-content img{filter:brightness(0.9) contrast(1.15)}'
const INBOX_ADDRESS = 'all@readyonbooking.app'
const POLL_INTERVAL = 5000
const STATS_INTERVAL = 30000

// ─── Types ────────────────────────────────────────

interface Attachment {
  id: string
  filename: string
  contentType: string
  size: number
  downloadUrl: string
}

interface Email {
  id: string
  inboxAddress: string
  from: string
  to: string
  subject: string
  html?: string
  text?: string
  snippet: string
  receivedAt: string
  attachments: Attachment[]
}

interface StorageStats {
  inboxAddress: string
  totalEmails: number
  totalAttachments: number
  storageUsedBytes: number
  storageLimit: number
  storageUsedFormatted: string
  storageLimitFormatted: string
  usagePercent: number
}

// ─── Helpers ──────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Baru saja'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}j`
    if (diffDays < 7) return `${diffDays}h`
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  } catch {
    return dateStr
  }
}

function formatDateFull(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

function getFileIcon(contentType: string): string {
  if (!contentType) return '📎'
  if (contentType.startsWith('image/')) return '🖼️'
  if (contentType.startsWith('video/')) return '🎬'
  if (contentType.startsWith('audio/')) return '🎵'
  if (contentType.includes('pdf')) return '📄'
  if (contentType.includes('zip') || contentType.includes('rar') || contentType.includes('tar')) return '📦'
  if (contentType.includes('word') || contentType.includes('document')) return '📝'
  if (contentType.includes('sheet') || contentType.includes('excel') || contentType.includes('spreadsheet')) return '📊'
  return '📎'
}

function extractName(email: string): string {
  const match = email.match(/^"?(.+?)"?\s*<(.+@.+)>$/)
  if (match) return match[1].trim()
  return email
}

function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
  }
}

// ─── Components ───────────────────────────────────

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() === 'ZHAMBALA99') {
      onUnlock()
      if (typeof window !== 'undefined') {
        localStorage.setItem('damnmail_unlocked', 'true')
      }
    } else {
      setError(true)
      setTimeout(() => setError(false), 2000)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-canvas z-50">
      <form
        onSubmit={handleSubmit}
        className="animate-fade-in flex flex-col items-center gap-6 px-8 py-12 rounded-2xl bg-panel-light shadow-elevated border border-line max-w-sm w-full mx-4"
      >
        <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center text-2xl">
          ✉️
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold text-ink">DamnMail</h1>
          <p className="text-sm text-ink-secondary mt-1">Masukkan password untuk melanjutkan</p>
        </div>
        <input
          ref={ref}
          type="password"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Password"
          className={`w-full px-4 py-2.5 rounded-xl border text-sm bg-panel-light text-ink placeholder-ink-secondary/50 outline-none transition-colors ${
            error ? 'border-danger ring-2 ring-danger/20' : 'border-line focus:border-accent focus:ring-2 focus:ring-accent/20'
          }`}
        />
        {error && <p className="text-xs text-danger -mt-3">Password salah</p>}
        <button
          type="submit"
          className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark active:scale-[0.98] transition-all"
        >
          Masuk
        </button>
      </form>
    </div>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = stored ? stored === 'dark' : prefersDark
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <button
      onClick={toggle}
      className="w-9 h-9 rounded-xl bg-panel-dark hover:bg-line flex items-center justify-center transition-colors text-lg"
      aria-label="Toggle theme"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}

function StorageBar({ stats }: { stats: StorageStats | null }) {
  if (!stats) return null
  const pct = Math.min(stats.usagePercent, 100)

  return (
    <div className="flex items-center gap-2.5 text-xs text-ink-secondary">
      <div className="w-28 h-1.5 rounded-full bg-line overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: pct > 80
              ? 'rgb(var(--danger))'
              : pct > 60
              ? 'rgb(var(--warning))'
              : 'rgb(var(--accent))',
          }}
        />
      </div>
      <span className="whitespace-nowrap">
        {stats.storageUsedFormatted} / {stats.storageLimitFormatted}
      </span>
    </div>
  )
}

function MessageSkeleton() {
  return (
    <div className="px-4 py-3.5 flex flex-col gap-2 border-b border-line">
      <div className="flex items-center gap-2">
        <div className="skeleton h-4 w-32 rounded-md" />
        <div className="skeleton h-3 w-12 rounded-md ml-auto" />
      </div>
      <div className="skeleton h-5 w-48 rounded-md" />
      <div className="skeleton h-3 w-64 rounded-md" />
    </div>
  )
}

function AttachmentCard({ att }: { att: Attachment }) {
  const icon = getFileIcon(att.contentType)

  return (
    <a
      href={att.downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-line bg-panel-dark hover:border-accent/40 hover:bg-panel-light transition-all"
    >
      <span className="text-lg flex-shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink truncate">{att.filename || 'unnamed'}</p>
        <p className="text-[10px] text-ink-secondary mt-0.5">{formatBytes(att.size)}</p>
      </div>
      <svg className="w-4 h-4 text-ink-secondary/40 group-hover:text-accent transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </a>
  )
}

function EmailDetail({
  email,
  onClose,
}: {
  email: Email
  onClose: () => void
}) {
  const hasAttachments = email.attachments && email.attachments.length > 0

  // Inject dark mode style override after email HTML renders
  useEffect(() => {
    if (!email?.html) return;
    const s = document.createElement('style');
    s.id = 'email-dark-override';
    s.textContent = EMAIL_DARK_CSS;
    document.body.appendChild(s);
    return () => {
      const el = document.getElementById('email-dark-override');
      if (el) el.remove();
    };
  }, [email?.id]);

  return (
    <div className="animate-slide-in h-full flex flex-col bg-panel-light border-l border-line">
      {/* Close button for mobile */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line md:hidden">
        <button
          onClick={onClose}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-panel-dark transition-colors text-ink-secondary"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium text-ink-secondary">Detail Email</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Email Header */}
        <div className="px-5 pt-5 pb-4 space-y-3">
          <h2 className="text-lg font-semibold text-ink leading-snug">
            {email.subject || '(Tanpa subjek)'}
          </h2>

          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-ink-secondary w-14 flex-shrink-0 text-xs font-medium uppercase tracking-wider">Dari</span>
              <div>
                <span className="text-ink font-medium">{extractName(email.from)}</span>
                <span className="text-ink-secondary ml-1 text-xs">&lt;{email.from.replace(/^"?(.+?)"?\s*</, '').replace(/>$/, '') || email.from}&gt;</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-ink-secondary w-14 flex-shrink-0 text-xs font-medium uppercase tracking-wider">Ke</span>
              <span className="text-ink text-xs">{email.to}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-ink-secondary w-14 flex-shrink-0 text-xs font-medium uppercase tracking-wider">Waktu</span>
              <span className="text-ink-secondary text-xs">{formatDateFull(email.receivedAt)}</span>
            </div>
          </div>
        </div>

        {/* Attachments */}
        {hasAttachments && (
          <div className="px-5 pb-4">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-xs font-medium text-ink-secondary uppercase tracking-wider">Lampiran</span>
              <span className="text-[10px] text-ink-secondary/60">({email.attachments.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {email.attachments.map((att) => (
                <AttachmentCard key={att.id} att={att} />
              ))}
            </div>
          </div>
        )}

        {/* Separator */}
        <div className="px-5 pb-1">
          <div className="border-t border-line" />
        </div>

        {/* Email Body */}
        <div className="px-5 pb-8">
          {email.html ? (
            <div
              className="email-content text-sm"
              dangerouslySetInnerHTML={{ __html: email.html }}
            />
          ) : (
            <pre className="text-sm whitespace-pre-wrap font-sans text-ink leading-relaxed">
              {email.text || 'Tidak ada konten'}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center px-6 py-12 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-accent/5 flex items-center justify-center text-3xl mx-auto mb-4">
          📭
        </div>
        <h3 className="text-lg font-semibold text-ink mb-1">Inbox Kosong</h3>
        <p className="text-sm text-ink-secondary max-w-xs mx-auto">
          Belum ada email yang masuk ke <span className="font-medium text-ink">{INBOX_ADDRESS}</span>
        </p>
        <p className="text-xs text-ink-secondary/60 mt-3">
          Email yang masuk akan muncul secara otomatis
        </p>
      </div>
    </div>
  )
}

function NoEmailSelected() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center bg-panel-light border-l border-line">
      <div className="text-center px-6 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-accent/5 flex items-center justify-center text-3xl mx-auto mb-4">
          💬
        </div>
        <h3 className="text-base font-semibold text-ink">Pilih Email</h3>
        <p className="text-sm text-ink-secondary mt-1">Klik email di samping untuk membaca</p>
      </div>
    </div>
  )
}

function MobileMessageList({ messages, selectedId, onSelect, loading }: {
  messages: Email[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading: boolean
}) {
  return (
    <div className="md:hidden h-full flex flex-col">
      <div className="flex-1 overflow-y-auto divide-y divide-line">
        {loading && messages.length === 0 ? (
          <>
            <MessageSkeleton />
            <MessageSkeleton />
            <MessageSkeleton />
            <MessageSkeleton />
            <MessageSkeleton />
          </>
        ) : messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((msg) => (
            <button
              key={msg.id}
              onClick={() => onSelect(msg.id)}
              className={`message-item w-full text-left px-4 py-3.5 transition-colors ${
                selectedId === msg.id ? 'active' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-sm font-medium text-ink truncate">
                  {extractName(msg.from) || msg.from}
                </span>
                <span className="text-[10px] text-ink-secondary whitespace-nowrap flex-shrink-0 mt-0.5">
                  {formatRelativeTime(msg.receivedAt)}
                </span>
              </div>
              <p className="text-sm text-ink font-semibold truncate mb-0.5">
                {msg.subject || '(Tanpa subjek)'}
              </p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-ink-secondary truncate flex-1">
                  {msg.snippet || '...'}
                </p>
                {msg.attachments && msg.attachments.length > 0 && (
                  <span className="badge-attachment flex-shrink-0">
                    📎 {msg.attachments.length}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ─── API ──────────────────────────────────────────

async function callApi(path: string, method: string = 'GET', body?: any): Promise<any> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/proxy'
  const payload: any = { method, path }
  if (body) payload.body = body

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

async function fetchMessages(): Promise<Email[]> {
  try {
    const result = await callApi('GET', `/inboxes/${encodeURIComponent(INBOX_ADDRESS)}/messages`)
    if (result?.success && Array.isArray(result.data)) {
      return result.data
    }
    return []
  } catch {
    return []
  }
}

async function fetchStats(): Promise<StorageStats | null> {
  try {
    const result = await callApi('GET', `/inboxes/${encodeURIComponent(INBOX_ADDRESS)}/stats`)
    if (result?.success && result.data) {
      return result.data
    }
    return null
  } catch {
    return null
  }
}

// ─── Main Page ────────────────────────────────────

export default function Home() {
  const [locked, setLocked] = useState(true)
  const [messages, setMessages] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [copied, setCopied] = useState(false)
  const selectedEmail = messages.find((m) => m.id === selectedId) || null

  // Unlock check
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('damnmail_unlocked') === 'true') {
      setLocked(false)
    }
  }, [])

  // Poll messages
  useEffect(() => {
    if (locked) return

    const poll = async () => {
      const data = await fetchMessages()
      setMessages(data)
      setLoading(false)
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [locked])

  // Poll stats
  useEffect(() => {
    if (locked) return

    const poll = async () => {
      const data = await fetchStats()
      setStats(data)
    }

    poll()
    const interval = setInterval(poll, STATS_INTERVAL)
    return () => clearInterval(interval)
  }, [locked])

  const handleUnlock = useCallback(() => {
    setLocked(false)
  }, [])

  const handleSelectMessage = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id))
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSelectedId(null)
  }, [])

  const handleCopy = async () => {
    await copyToClipboard(INBOX_ADDRESS)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isMobileDetailOpen = selectedId !== null

  return (
    <>
      {locked && <PasswordGate onUnlock={handleUnlock} />}

      <div className="h-screen flex flex-col bg-canvas">
        {/* ─── Header ────────────────────────── */}
        <header className="flex-shrink-0 flex items-center gap-3 px-4 md:px-6 py-3 bg-panel-light/80 backdrop-blur-lg border-b border-line sticky top-0 z-20">
          <div className="flex items-center gap-2.5 mr-2">
            <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-white text-sm font-bold">
              D
            </div>
            <h1 className="text-base font-bold text-ink hidden sm:block">DamnMail</h1>
          </div>

          <div className="flex-1 min-w-0">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel-dark hover:bg-line transition-colors text-xs font-mono text-ink-secondary truncate max-w-[240px]"
              title="Klik untuk copy"
            >
              <span className="truncate">{INBOX_ADDRESS}</span>
              {copied ? (
                <span className="text-accent font-medium flex-shrink-0">Tersalin!</span>
              ) : (
                <svg className="w-3.5 h-3.5 flex-shrink-0 text-ink-secondary/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center">
            <StorageBar stats={stats} />
          </div>

          <ThemeToggle />

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-panel-dark text-xs text-ink-secondary">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span>Live</span>
          </div>
        </header>

        {/* ─── Main Content ──────────────────── */}
        <div className="flex-1 flex overflow-hidden">
          {/* Message List - hidden on mobile when detail is open */}
          <div className={`w-full md:w-[380px] lg:w-[420px] flex-shrink-0 border-r border-line bg-panel-light/50 flex flex-col ${
            isMobileDetailOpen ? 'hidden md:flex' : 'flex'
          }`}>
            {/* Messages count */}
            {!loading && messages.length > 0 && (
              <div className="flex-shrink-0 px-4 py-2.5 border-b border-line">
                <p className="text-xs font-medium text-ink-secondary">
                  {messages.length} pesan
                </p>
              </div>
            )}

            {/* Mobile list */}
            <MobileMessageList
              messages={messages}
              selectedId={selectedId}
              onSelect={handleSelectMessage}
              loading={loading}
            />

            {/* Desktop list */}
            <div className="hidden md:flex flex-1 flex-col overflow-y-auto divide-y divide-line">
              {loading && messages.length === 0 ? (
                <>
                  <MessageSkeleton />
                  <MessageSkeleton />
                  <MessageSkeleton />
                  <MessageSkeleton />
                  <MessageSkeleton />
                  <MessageSkeleton />
                </>
              ) : messages.length === 0 ? (
                <EmptyState />
              ) : (
                messages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => handleSelectMessage(msg.id)}
                    className={`message-item w-full text-left px-4 py-3.5 transition-colors ${
                      selectedId === msg.id ? 'active' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-ink truncate">
                        {extractName(msg.from) || msg.from}
                      </span>
                      <span className="text-[10px] text-ink-secondary whitespace-nowrap flex-shrink-0 mt-[3px]">
                        {formatRelativeTime(msg.receivedAt)}
                      </span>
                    </div>
                    <p className="text-sm text-ink truncate mb-0.5">
                      {msg.subject || '(Tanpa subjek)'}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-ink-secondary truncate flex-1">
                        {msg.snippet || '...'}
                      </p>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <span className="text-xs text-ink-secondary/60 flex-shrink-0">
                          📎 {msg.attachments.length}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Email Detail / No Selection */}
          {selectedEmail ? (
            <div className="flex-1 min-w-0 overflow-hidden">
              <EmailDetail email={selectedEmail} onClose={handleCloseDetail} />
            </div>
          ) : (
            <NoEmailSelected />
          )}
        </div>
      </div>
    </>
  )
}

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'

// Dark mode CSS override — injected after email HTML to beat embedded email styles
const EMAIL_DARK_CSS = '.dark .email-content *:not(img):not(svg):not(video):not(iframe):not(canvas){color:rgb(var(--ink))!important;background-color:transparent!important}.email-content img{max-width:100%!important;height:auto!important;border-radius:6px}.dark .email-content img{filter:brightness(0.9) contrast(1.15)}'
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
  contentId?: string
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

function renderEmailHtml(email: Email): string {
  if (!email.html) return ''
  // Replace CID inline image references with actual attachment URLs
  const cidMap = new Map<string, string>();
  if (email.attachments) {
    for (const att of email.attachments) {
      if (att.contentId && att.downloadUrl) {
        const cid = att.contentId.replace(/^<|>$/g, '');
        cidMap.set(cid, att.downloadUrl);
      }
    }
  }
  let htmlContent = email.html || '';
  if (cidMap.size > 0) {
    htmlContent = htmlContent.replace(/src=["']cid:([^"']+)["']/gi, (match, cid) => {
      const url = cidMap.get(cid);
      return url ? `src="${url}"` : match;
    });
  }
  return htmlContent;
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
    <div className="fixed inset-0 flex items-center justify-center z-50"
      style={{
        background: 'radial-gradient(ellipse at top, #12121e 0%, #0a0a12 50%, #06060e 100%)',
      }}
    >
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
      >
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full opacity-[0.03]" style={{background: 'radial-gradient(circle, #6060ff 0%, transparent 70%)'}} />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full opacity-[0.03]" style={{background: 'radial-gradient(circle, #40b0ff 0%, transparent 70%)'}} />
      </div>
      <form
        onSubmit={handleSubmit}
        className="relative animate-fade-in flex flex-col items-center gap-6 px-10 py-14 rounded-3xl mx-4"
        style={{
          background: 'linear-gradient(160deg, rgba(22,22,40,0.92) 0%, rgba(14,14,28,0.96) 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
          maxWidth: '380px',
          width: '100%',
        }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
          style={{
            background: 'linear-gradient(135deg, rgba(100,120,255,0.18) 0%, rgba(80,200,255,0.08) 100%)',
            border: '1px solid rgba(100,140,255,0.12)',
          }}
        >
          <span role="img" aria-label="mail">✉️</span>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#e8e8f0' }}>DamnMail</h1>
          <p className="text-sm mt-2 font-light" style={{ color: '#7878a0' }}>Masukkan password untuk melanjutkan</p>
        </div>
        <input
          ref={ref}
          type="password"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Password"
          className="w-full px-4 py-3 rounded-2xl text-sm outline-none transition-all duration-200"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: error ? '1px solid rgba(255,80,80,0.5)' : '1px solid rgba(255,255,255,0.07)',
            color: '#d0d0e8',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(100,140,255,0.4)'; e.target.style.background = 'rgba(255,255,255,0.06)' }}
          onBlur={e => { e.target.style.borderColor = error ? 'rgba(255,80,80,0.5)' : 'rgba(255,255,255,0.07)'; e.target.style.background = 'rgba(255,255,255,0.04)' }}
        />
        {error && <p className="text-xs -mt-3" style={{ color: '#ff6060' }}>Password salah</p>}
        <button
          type="submit"
          className="w-full py-3 rounded-2xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.97]"
          style={{
            background: 'linear-gradient(135deg, rgba(80,130,255,0.7) 0%, rgba(120,80,255,0.6) 100%)',
            color: '#e8e8ff',
            border: '1px solid rgba(100,130,255,0.15)',
          }}
          onMouseEnter={e => e.target.style.background = 'linear-gradient(135deg, rgba(100,150,255,0.8) 0%, rgba(140,100,255,0.7) 100%)'}
          onMouseLeave={e => e.target.style.background = 'linear-gradient(135deg, rgba(80,130,255,0.7) 0%, rgba(120,80,255,0.6) 100%)'}
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
    const stored = localStorage.getItem('damnmail-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = stored ? stored === 'dark' : prefersDark
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('damnmail-theme', next ? 'dark' : 'light');
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
  if (!stats) {
    return (
      <div className="flex items-center gap-2.5 text-[11px] text-ink-secondary/60">
        <div className="w-20 sm:w-28 h-1.5 rounded-full bg-line/60 overflow-hidden">
          <div className="w-0 h-full rounded-full bg-accent/40 animate-pulse" />
        </div>
      </div>
    )
  }
  const pct = stats.storageLimit > 0 ? Math.min((stats.storageUsedBytes / stats.storageLimit) * 100, 100) : 0
  const used = stats.storageUsedFormatted || formatBytes(stats.storageUsedBytes)
  const total = stats.storageLimitFormatted || formatBytes(stats.storageLimit)
  return (
    <div className="flex items-center gap-2.5 group cursor-default" title={`${used} / ${total} digunakan`}>
      <svg className="w-3.5 h-3.5 text-ink-secondary/40 group-hover:text-accent transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
      <div className="w-16 sm:w-28 h-1.5 rounded-full bg-line/60 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
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
      <span className="text-[11px] text-ink-secondary/70 group-hover:text-ink-secondary transition-colors whitespace-nowrap tabular-nums">
        {used}
        <span className="text-ink-secondary/50 mx-0.5">/</span>
        {total}
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
  const icon = getFileIcon(att.contentType);
  const isImage = att.contentType.startsWith('image/');

  return (
    <a
      href={att.downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-line bg-panel-dark hover:border-accent/40 hover:bg-panel-light transition-all"
    >
      {isImage ? (
        <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-panel-light">
          <img
            src={att.downloadUrl}
            alt={att.filename || 'attachment'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <div className="absolute inset-0 ring-1 ring-inset ring-black/5 dark:ring-white/10 rounded-lg"></div>
        </div>
      ) : (
        <span className="text-lg flex-shrink-0">{icon}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink truncate">{att.filename || 'unnamed'}</p>
        <p className="text-[10px] text-ink-secondary mt-0.5">{formatBytes(att.size)}{isImage ? ' · Gambar' : ''}</p>
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
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-sm font-semibold text-accent flex-shrink-0 mt-0.5">
                {(extractName(email.from) || email.from || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-ink">{extractName(email.from) || email.from}</span>
                  <span className="text-xs text-ink-secondary truncate">&lt;{email.from.replace(/^.*<(.+)>$/, '$1') || email.from}&gt;</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-ink-secondary">
                  <span>kepada {email.to}</span>
                  <span className="text-ink-secondary/50">·</span>
                  <span>{formatDateFull(email.receivedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        {hasAttachments && (
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-3.5 h-3.5 text-ink-secondary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
              <span className="text-xs font-medium text-ink-secondary uppercase tracking-wider">Lampiran</span>
              <span className="text-[10px] text-ink-secondary/60 bg-panel-dark px-1.5 py-0.5 rounded-md">{email.attachments.length}</span>
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
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-line" />
            <svg className="w-3 h-3 text-ink-secondary/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6h16.5" />
            </svg>
            <div className="flex-1 border-t border-line" />
          </div>
        </div>

        {/* Email Body */}
        <div className="px-5 pb-8">
          {email.html ? (
            <div
              className="email-content text-sm"
              dangerouslySetInnerHTML={{ __html: renderEmailHtml(email) }}
            />
          ) : (
            <pre className="text-sm whitespace-pre-wrap font-sans text-ink leading-relaxed">{email.text || 'Tidak ada konten'}</pre>
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
          messages.map((msg, idx) => (
            <button
              key={msg.id}
              onClick={() => onSelect(msg.id)}
              className={`message-item w-full text-left px-4 py-3 transition-colors animate-fade-in ${
                selectedId === msg.id ? 'active' : ''
              }`}
              style={{ animationDelay: `${idx * 30}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/8 flex items-center justify-center text-xs font-semibold text-accent flex-shrink-0 mt-0.5">
                  {(extractName(msg.from) || msg.from || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-0.5">
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
                </div>
              </div>
            </button>
          ))
          )}
        </div>
      </div>
    );
  }

// ─── API (Direct HTTP — via Appwrite hosting proxy) ──

async function callApi<T = any>(method: string, path: string, body?: any): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ''
  const url = `${baseUrl.replace(/\/+$/, '')}/api${path}`
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body)
  }

  const res = await fetch(url, options)
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }

  const result = await res.json()
  if (!result.success) {
    throw new Error(result.error || 'API error')
  }

  return result.data as T
}

async function fetchMessages(): Promise<Email[]> {
  try {
    const data = await callApi<Email[]>('GET', `/inboxes/${encodeURIComponent(INBOX_ADDRESS)}/messages`)
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.warn('fetchMessages failed:', e)
    return []
  }
}

async function fetchStats(): Promise<StorageStats | null> {
  try {
    const data = await callApi<StorageStats>('GET', `/inboxes/${encodeURIComponent(INBOX_ADDRESS)}/stats`)
    return data || null
  } catch (e) {
    console.warn('fetchStats failed:', e)
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


          <ThemeToggle />

          <div className="flex items-center gap-2.5">
            <StorageBar stats={stats} />
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-panel-dark text-[11px] text-ink-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span>{messages.length}</span>
            </span>
          </div>
        </header>

        {/* ─── Main Content ──────────────────── */}
        <div className="flex-1 flex overflow-hidden">
          {/* Message List - hidden on mobile when detail is open */}
          <div className={`w-full md:w-[380px] lg:w-[420px] flex-shrink-0 border-r border-line bg-panel-light/50 flex flex-col ${
            isMobileDetailOpen ? 'hidden md:flex' : 'flex'
          }`}>

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

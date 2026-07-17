'use client'

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react'

const EMAIL_DARK_CSS = '.dark .email-content *:not(img):not(svg):not(video):not(iframe):not(canvas){color:rgb(var(--ink))!important;background-color:transparent!important}.email-content img{max-width:100%!important;height:auto!important;border-radius:8px}.dark .email-content img{filter:brightness(0.9) contrast(1.15)}'
const PASSWORD = process.env.NEXT_PUBLIC_SITE_PASSWORD || ''
let INBOX_ADDRESS = 'all@readyonbooking.app' // will be set from URL param in component
function getInboxParam(): string {
  if (typeof window !== 'undefined') {
    try {
      const p = new URLSearchParams(window.location.search)
      const v = p.get('inbox')
      if (v && v.includes('@')) return v.trim().toLowerCase()
    } catch {}
  }
  return 'all@readyonbooking.app'
}
const POLL_INTERVAL = 60000  // 1 menit
const STATS_INTERVAL = 120000 // 2 menit

// ─── Types ────────────────────────────────────────

interface Attachment {
  id: string; filename: string; contentType: string
  size: number; downloadUrl: string; contentId?: string
}

interface Email {
  id: string; inboxAddress: string; from: string; to: string
  subject: string; html?: string; text?: string; snippet: string
  receivedAt: string; attachments: Attachment[]
}

interface StorageStats {
  inboxAddress: string; totalEmails: number; totalAttachments: number
  storageUsedBytes: number; storageLimit: number
  storageUsedFormatted: string; storageLimitFormatted: string; usagePercent: number
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
    const date = new Date(dateStr); const now = new Date()
    const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000)
    const diffHours = Math.floor(diffMins / 60); const diffDays = Math.floor(diffHours / 24)
    if (diffMins < 1) return 'Baru saja'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}j`
    if (diffDays < 7) return `${diffDays}h`
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  } catch { return dateStr }
}

function formatDateFull(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return dateStr }
}

function getFileIcon(ct: string): string {
  if (!ct) return '📎'
  if (ct.startsWith('image/')) return '🖼️'
  if (ct.startsWith('video/')) return '🎬'
  if (ct.startsWith('audio/')) return '🎵'
  if (ct.includes('pdf')) return '📄'
  if (ct.includes('zip') || ct.includes('rar') || ct.includes('tar')) return '📦'
  if (ct.includes('word') || ct.includes('document')) return '📝'
  if (ct.includes('sheet') || ct.includes('excel') || ct.includes('spreadsheet')) return '📊'
  return '📎'
}

function extractName(email: string): string {
  const match = email.match(/^"?(.+?)"?\s*<(.+@.+)>$/)
  return match ? match[1].trim() : email
}

function renderEmailHtml(email: Email): string {
  if (!email.html) return ''
  const cidMap = new Map<string, string>()
  if (email.attachments) {
    for (const att of email.attachments) {
      if (att.contentId && att.downloadUrl) {
        cidMap.set(att.contentId.replace(/^<|>$/g, ''), att.downloadUrl)
      }
    }
  }
  let html = email.html || ''
  if (cidMap.size > 0) {
    html = html.replace(/src=["']cid:([^"']+)["']/gi, (_, cid) => {
      const url = cidMap.get(cid)
      return url ? `src="${url}"` : _
    })
  }
  return html
}

function stripHtmlToText(html: string): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function highlightText(text: string, query: string): ReactNode {
  const q = query.trim()
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent/30 text-inherit rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
  } else {
    fallbackCopy(text)
  }
}

function fallbackCopy(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

// ─── Decorative Background ────────────────────────

function SkyBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      <div className="absolute top-10 right-[15%] w-24 h-24 rounded-full bg-gradient-to-br from-accent/20 to-transparent blur-3xl dark:from-accent/10" />
      <div className="absolute top-20 right-[20%] w-12 h-12 rounded-full bg-white/20 dark:bg-white/5 blur-2xl" />
      <div className="absolute top-[15%] left-[5%] text-6xl opacity-[0.04] dark:opacity-[0.02] select-none animate-drift">☁️</div>
      <div className="absolute top-[30%] right-[10%] text-5xl opacity-[0.03] dark:opacity-[0.015] select-none animate-float" style={{ animationDelay: '-2s' }}>☁️</div>
      <div className="absolute bottom-[20%] left-[15%] text-4xl opacity-[0.025] dark:opacity-[0.01] select-none animate-drift" style={{ animationDelay: '-4s' }}>☁️</div>
      <div className="absolute top-[8%] left-[8%] text-3xl opacity-[0.03] dark:opacity-[0.015] select-none animate-float rotate-45" style={{ animationDuration: '6s' }}>✈️</div>
    </div>
  )
}

// ─── Components ───────────────────────────────────

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() === PASSWORD || !PASSWORD) {
      onUnlock()
      if (typeof window !== 'undefined') localStorage.setItem('damnmail_unlocked', 'true')
    } else {
      setError(true)
      setTimeout(() => setError(false), 2000)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 safe-bottom">
      <SkyBackground />
      <form onSubmit={handleSubmit} className="animate-fade-in relative flex flex-col items-center gap-6 px-8 py-12 sm:px-10 sm:py-14 rounded-3xl mx-4 max-w-[360px] w-full glass-strong">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
          style={{
            background: 'linear-gradient(135deg, rgb(var(--accent) / 0.2), rgb(var(--accent-dark) / 0.1))',
            border: '1px solid rgb(var(--accent) / 0.15)'
          }}
        >
          <span role="img" aria-label="mail">✈️</span>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgb(var(--ink))' }}>DamnMail</h1>
          <p className="text-sm mt-1.5 font-light" style={{ color: 'rgb(var(--ink-secondary) / 0.8)' }}>
            Masukkan password untuk melanjutkan
          </p>
        </div>
        <input
          ref={ref}
          type="password"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Password"
          className="w-full px-4 py-3 rounded-2xl text-sm outline-none transition-all duration-200"
          style={{
            background: 'rgb(var(--accent) / 0.06)',
            border: error ? '1px solid rgb(var(--danger) / 0.5)' : '1px solid rgb(var(--line) / 0.3)',
            color: 'rgb(var(--ink))',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgb(var(--accent) / 0.4)'; e.target.style.background = 'rgb(var(--accent) / 0.08)' }}
          onBlur={e => { e.target.style.borderColor = error ? 'rgb(var(--danger) / 0.5)' : 'rgb(var(--line) / 0.3)'; e.target.style.background = 'rgb(var(--accent) / 0.06)' }}
        />
        {error && <p className="text-xs -mt-3" style={{ color: 'rgb(var(--danger))' }}>Password salah</p>}
        <button
          type="submit"
          className="w-full py-3 rounded-2xl text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.97] text-white"
          style={{
            background: 'linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-dark)))',
          }}
        >
          Masuk
        </button>
        <p className="text-[10px] font-light" style={{ color: 'rgb(var(--ink-secondary) / 0.4)' }}>
          ✈️ Penerbangan menuju inbox Anda
        </p>
      </form>
    </div>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('damnmail-theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = stored ? stored === 'dark' : prefersDark
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('damnmail-theme', next ? 'dark' : 'light')
  }

  return (
    <button
      onClick={toggle}
      className="w-9 h-9 rounded-xl flex items-center justify-center transition-all text-lg"
      style={{
        background: 'rgb(var(--accent) / 0.08)',
        border: '1px solid rgb(var(--accent) / 0.1)',
      }}
      aria-label="Toggle theme"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}

function StorageBar({ stats }: { stats: StorageStats | null }) {
  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'rgb(var(--ink-secondary) / 0.5)' }}>
        <div className="w-20 sm:w-28 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgb(var(--line) / 0.3)' }}>
          <div className="w-0 h-full rounded-full" style={{ background: 'rgb(var(--accent) / 0.3)' }} />
        </div>
      </div>
    )
  }
  const pct = stats.storageLimit > 0 ? Math.min((stats.storageUsedBytes / stats.storageLimit) * 100, 100) : 0
  const used = stats.storageUsedFormatted || formatBytes(stats.storageUsedBytes)
  const total = stats.storageLimitFormatted || formatBytes(stats.storageLimit)
  const barColor = pct > 80 ? 'rgb(var(--danger))' : pct > 60 ? 'rgb(var(--warning))' : 'rgb(var(--accent))'

  return (
    <div className="flex items-center gap-2 group cursor-default" title={`${used} / ${total} digunakan`}>
      <svg className="w-3.5 h-3.5 flex-shrink-0 transition-colors" style={{ color: 'rgb(var(--ink-secondary) / 0.4)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
      <div className="w-16 sm:w-28 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgb(var(--line) / 0.3)' }}>
        <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className="text-[11px] whitespace-nowrap tabular-nums transition-colors" style={{ color: 'rgb(var(--ink-secondary) / 0.7)' }}>
        {used}
        <span style={{ color: 'rgb(var(--ink-secondary) / 0.3)' }} className="mx-0.5">/</span>
        {total}
      </span>
    </div>
  )
}

function MessageSkeleton() {
  return (
    <div className="px-4 py-3.5 flex flex-col gap-2 border-b" style={{ borderColor: 'rgb(var(--line) / 0.3)' }}>
      <div className="flex items-center gap-2">
        <div className="skeleton h-4 w-32 rounded-md" />
        <div className="skeleton h-3 w-12 rounded-md ml-auto" />
      </div>
      <div className="skeleton h-5 w-48 rounded-md" />
      <div className="skeleton h-3 w-56 rounded-md" />
    </div>
  )
}

function AttachmentCard({ att }: { att: Attachment }) {
  const icon = getFileIcon(att.contentType)
  const isImage = att.contentType.startsWith('image/')

  return (
    <a
      href={att.downloadUrl} target="_blank" rel="noopener noreferrer"
      className="group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all"
      style={{
        border: '1px solid rgb(var(--line) / 0.3)',
        background: 'rgb(var(--accent) / 0.03)',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgb(var(--accent) / 0.4)'; e.currentTarget.style.background = 'rgb(var(--accent) / 0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgb(var(--line) / 0.3)'; e.currentTarget.style.background = 'rgb(var(--accent) / 0.03)' }}
    >
      {isImage ? (
        <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'rgb(var(--accent) / 0.05)' }}>
          <img src={att.downloadUrl} alt={att.filename || 'attachment'} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
          <div className="absolute inset-0 ring-1 ring-inset rounded-lg" style={{ borderColor: 'rgb(var(--line) / 0.2)' }} />
        </div>
      ) : (
        <span className="text-lg flex-shrink-0">{icon}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate" style={{ color: 'rgb(var(--ink))' }}>{att.filename || 'unnamed'}</p>
        <p className="text-[10px] mt-0.5" style={{ color: 'rgb(var(--ink-secondary) / 0.7)' }}>{formatBytes(att.size)}{isImage ? ' · Gambar' : ''}</p>
      </div>
      <svg className="w-4 h-4 flex-shrink-0 transition-colors" style={{ color: 'rgb(var(--ink-secondary) / 0.3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </a>
  )
}

function EmailDetail({ email, onClose, onDelete }: { email: Email; onClose: () => void; onDelete?: () => void }) {
  const hasAttachments = email.attachments && email.attachments.length > 0

  useEffect(() => {
    if (!email?.html) return
    const s = document.createElement('style')
    s.id = 'email-dark-override'
    s.textContent = EMAIL_DARK_CSS
    document.body.appendChild(s)
    return () => { document.getElementById('email-dark-override')?.remove() }
  }, [email?.id])

  return (
    <div className="animate-slide-in h-full flex flex-col" style={{ background: 'rgb(var(--accent) / 0.02)' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b md:hidden" style={{ borderColor: 'rgb(var(--line) / 0.3)' }}>
        <button onClick={onClose} className="p-1.5 -ml-1.5 rounded-lg transition-colors" style={{ color: 'rgb(var(--ink-secondary))' }}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium" style={{ color: 'rgb(var(--ink-secondary) / 0.8)' }}>Detail Email</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-5 pt-5 pb-4 space-y-3">
          <h2 className="text-lg font-semibold leading-snug" style={{ color: 'rgb(var(--ink))' }}>
            {email.subject || '(Tanpa subjek)'}
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 mt-0.5"
                style={{ background: 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))' }}>
                {(extractName(email.from) || email.from || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium" style={{ color: 'rgb(var(--ink))' }}>{extractName(email.from) || email.from}</span>
                  <span className="text-xs truncate" style={{ color: 'rgb(var(--ink-secondary) / 0.7)' }}>
                    &lt;{email.from.replace(/^.*<(.+)>$/, '$1') || email.from}&gt;
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'rgb(var(--ink-secondary) / 0.7)' }}>
                  <span>kepada {email.to}</span>
                  <span style={{ color: 'rgb(var(--ink-secondary) / 0.3)' }}>·</span>
                  <span>{formatDateFull(email.receivedAt)}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => { if (window.confirm('Hapus email ini?')) onDelete?.() }}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors"
                    style={{ color: 'rgb(var(--danger) / 0.6)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'rgb(var(--danger))'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgb(var(--danger) / 0.6)'}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {hasAttachments && (
          <div className="px-4 sm:px-5 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-3.5 h-3.5" style={{ color: 'rgb(var(--ink-secondary) / 0.4)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'rgb(var(--ink-secondary) / 0.7)' }}>Lampiran</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ color: 'rgb(var(--ink-secondary) / 0.5)', background: 'rgb(var(--accent) / 0.06)' }}>{email.attachments.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {email.attachments.map((att) => <AttachmentCard key={att.id} att={att} />)}
            </div>
          </div>
        )}

        <div className="px-4 sm:px-5 pb-1">
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t" style={{ borderColor: 'rgb(var(--line) / 0.3)' }} />
            <svg className="w-3 h-3 flex-shrink-0" style={{ color: 'rgb(var(--ink-secondary) / 0.2)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6h16.5" />
            </svg>
            <div className="flex-1 border-t" style={{ borderColor: 'rgb(var(--line) / 0.3)' }} />
          </div>
        </div>

        <div className="px-4 sm:px-5 pb-8">
          {email.html ? (
            <div className="email-content text-sm" dangerouslySetInnerHTML={{ __html: renderEmailHtml(email) }} />
          ) : (
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed" style={{ color: 'rgb(var(--ink))' }}>{email.text || 'Tidak ada konten'}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ inboxAddr }: { inboxAddr: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center px-6 py-12 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4" style={{ background: 'rgb(var(--accent) / 0.06)' }}>
          ✈️
        </div>
        <h3 className="text-lg font-semibold mb-1" style={{ color: 'rgb(var(--ink))' }}>Inbox Kosong</h3>
        <p className="text-sm max-w-xs mx-auto" style={{ color: 'rgb(var(--ink-secondary) / 0.8)' }}>
          Belum ada email yang masuk ke <span className="font-medium" style={{ color: 'rgb(var(--ink))' }}>{inboxAddr}</span>
        </p>
        <p className="text-xs mt-3" style={{ color: 'rgb(var(--ink-secondary) / 0.5)' }}>
          Email akan muncul secara otomatis ✈️
        </p>
      </div>
    </div>
  )
}

function NoEmailSelected() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center" style={{ background: 'rgb(var(--accent) / 0.02)' }}>
      <div className="text-center px-6 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4" style={{ background: 'rgb(var(--accent) / 0.06)' }}>
          💬
        </div>
        <h3 className="text-base font-semibold" style={{ color: 'rgb(var(--ink))' }}>Pilih Email</h3>
        <p className="text-sm mt-1" style={{ color: 'rgb(var(--ink-secondary) / 0.7)' }}>Klik email di samping untuk membaca</p>
      </div>
    </div>
  )
}

function MessageItem({ msg, selected, onSelect, idx, query }: { msg: Email; selected: boolean; onSelect: () => void; idx: number; query?: string }) {
  return (
    <button
      onClick={onSelect}
      className={`message-item w-full text-left px-4 py-3 sm:py-3.5 transition-all animate-fade-in ${selected ? 'active' : ''}`}
      style={{
        borderBottom: '1px solid rgb(var(--line) / 0.2)',
        animationDelay: `${idx * 25}ms`,
      }}
    >
      <div className="flex items-start gap-2.5 sm:gap-3">
        <div className="w-8 h-8 min-w-[32px] rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5"
          style={{ background: selected ? 'rgb(var(--accent) / 0.15)' : 'rgb(var(--accent) / 0.08)', color: 'rgb(var(--accent))' }}>
          {(extractName(msg.from) || msg.from || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <span className="text-sm font-medium truncate" style={{ color: 'rgb(var(--ink))' }}>
              {extractName(msg.from) || msg.from}
            </span>
            <span className="text-[10px] whitespace-nowrap flex-shrink-0 mt-0.5" style={{ color: 'rgb(var(--ink-secondary) / 0.6)' }}>
              {formatRelativeTime(msg.receivedAt)}
            </span>
          </div>
          <p className="text-sm font-semibold truncate mb-0.5" style={{ color: 'rgb(var(--ink))' }}>
              {highlightText(msg.subject || '(Tanpa subjek)', query || '')}
          </p>
          <div className="flex items-center gap-2">
            <p className="text-xs truncate flex-1" style={{ color: 'rgb(var(--ink-secondary) / 0.7)' }}>
              {highlightText(msg.snippet || '...', query || '')}
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
  )
}

// ─── Search Bar ───────────────────────────────────

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex-shrink-0 px-3 py-2" style={{ background: 'rgb(var(--accent) / 0.01)' }}>
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'rgb(var(--ink-secondary) / 0.4)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Cari pengirim, subjek, atau isi..."
          className="w-full pl-9 pr-8 py-2 rounded-xl text-xs outline-none transition-all"
          style={{
            background: 'rgb(var(--accent) / 0.06)',
            border: '1px solid rgb(var(--glass-border))',
            color: 'rgb(var(--ink))',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgb(var(--accent) / 0.4)' }}
          onBlur={e => { e.target.style.borderColor = 'rgb(var(--glass-border))' }}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors"
            style={{ color: 'rgb(var(--ink-secondary) / 0.5)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgb(var(--ink))'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgb(var(--ink-secondary) / 0.5)'}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ─── API ──────────────────────────────────────────

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

async function fetchMessages(inboxAddr: string, searchQuery?: string): Promise<Email[]> {
  try {
    const params = new URLSearchParams()
    params.set('limit', '50')
    if (searchQuery && searchQuery.trim().length >= 2) {
      params.set('search', searchQuery.trim())
    }
    const path = '/inboxes/' + encodeURIComponent(inboxAddr) + '/messages?' + params.toString()
    const data = await callApi<Email[]>('GET', path)
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

async function fetchMessageDetail(messageId: string): Promise<Email | null> {
  try { return await callApi<Email>('GET', '/messages/' + messageId) || null }
  catch { return null }
}


// ─── Main Page ────────────────────────────────────

export default function Home() {
  const [locked, setLocked] = useState(true)
  const [messages, setMessages] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [inboxAddr, setInboxAddr] = useState('all@readyonbooking.app')
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [copied, setCopied] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)

  // Precompute a lowercase searchable blob per message (includes the full email body).
  const searchBlobs = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of messages) {
      const body = m.text || stripHtmlToText(m.html || '')
      const blob = [m.from, m.subject, m.text, m.snippet, body].join(' ').toLowerCase()
      map.set(m.id, blob)
    }
    return map
  }, [messages])

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return messages
    return messages.filter((m) => (searchBlobs.get(m.id) || '').includes(q))
  }, [messages, searchQuery, searchBlobs])

  // Read ?inbox= from URL on mount + handle unlocked state
  useEffect(() => {
    const param = getInboxParam()
    if (param !== 'all@readyonbooking.app') setInboxAddr(param)
    if (typeof window !== 'undefined' && localStorage.getItem('damnmail_unlocked') === 'true') setLocked(false)
  }, [])

  // Sync INBOX_ADDRESS module variable for helper functions
  useEffect(() => { INBOX_ADDRESS = inboxAddr }, [inboxAddr])

  // Polling untuk real-time messages (Appwrite Functions gak support SSE persistent connection)
  useEffect(() => {
    if (locked) return
    let cancelled = false

    const doFetch = async () => {
      const data = await fetchMessages(inboxAddr, searchQuery)
      if (!cancelled) {
        setMessages(data)
        setLoading(false)
      }
    }

    // Initial fetch
    doFetch()

    // Polling — lebih jarang saat search karena query-nya lebih berat
    const interval = setInterval(doFetch, searchQuery.trim() ? POLL_INTERVAL * 2 : POLL_INTERVAL)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [locked, searchQuery, inboxAddr])

  useEffect(() => {
    if (locked) return
    const poll = async () => { const data = await fetchStats(inboxAddr); setStats(data) }
    poll()
    const interval = setInterval(poll, STATS_INTERVAL)
    return () => clearInterval(interval)
  }, [locked, inboxAddr])

  // Fetch selected message detail
  useEffect(function() {
    if (!selectedId) {
      setSelectedEmail(null)
      return
    }
    var cached = messages.find(function(m) { return m.id === selectedId })
    if (cached && cached.html) {
      setSelectedEmail(cached)
      return
    }
    setDetailLoading(true)
    fetchMessageDetail(selectedId).then(function(detail) {
      if (detail && detail.html) {
        setMessages(function(prev) { return prev.map(function(m) { return m.id === detail.id ? detail : m }) })
        setSelectedEmail(detail)
      } else if (detail) {
        setSelectedEmail(detail)
      }
      setDetailLoading(false)
    })
  }, [selectedId])

  const handleUnlock = useCallback(function() { setLocked(false) }, [])
  const handleSelectMessage = useCallback(function(id: string) { setSelectedId(function(prev) { return prev === id ? null : id }) }, [])
  const handleCloseDetail = useCallback(function() { setSelectedId(null) }, [])
  const handleDeleteMessage = useCallback(async function() {
    if (!selectedEmail) return
    if (await deleteMessage(selectedEmail.id)) {
      setMessages(function(prev) { return prev.filter(function(m) { return m.id !== selectedEmail.id }) })
      setSelectedId(null)
      setSelectedEmail(null)
      var freshStats = await fetchStats(inboxAddr)
      if (freshStats) setStats(freshStats)
    }
  }, [selectedEmail?.id, inboxAddr])

  const handleCopy = async () => {
    await copyToClipboard(inboxAddr)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isMobileDetailOpen = selectedId !== null

  return (
    <>
      {locked && <PasswordGate onUnlock={handleUnlock} />}

      <div className="h-screen flex flex-col safe-bottom">
        <SkyBackground />

        {/* ─── Glass Header ─────────────────── */}
        <header className="flex-shrink-0 flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 glass border-b sticky top-0 z-20"
          style={{ borderColor: 'rgb(var(--glass-border))' }}>

          <div className="flex items-center gap-2 mr-1 sm:mr-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold"
              style={{ background: 'linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-dark)))' }}>
              ✈
            </div>
            <h1 className="text-sm sm:text-base font-bold hidden sm:block" style={{ color: 'rgb(var(--ink))' }}>DamnMail</h1>
          </div>

          <div className="flex-1 min-w-0">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-mono truncate max-w-[180px] sm:max-w-[240px] transition-all no-select"
              style={{
                background: 'rgb(var(--accent) / 0.06)',
                border: '1px solid rgb(var(--accent) / 0.1)',
                color: 'rgb(var(--ink-secondary))',
              }}
              title="Klik untuk copy"
            >
              <span className="truncate">{inboxAddr}</span>
              {copied ? (
                <span className="font-medium flex-shrink-0" style={{ color: 'rgb(var(--accent))' }}>Tersalin!</span>
              ) : (
                <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgb(var(--ink-secondary) / 0.5)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
          </div>

          <ThemeToggle />

          <div className="flex items-center gap-2 sm:gap-3">
            <StorageBar stats={stats} />
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px]"
              style={{ background: 'rgb(var(--accent) / 0.06)', color: 'rgb(var(--ink-secondary) / 0.8)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgb(var(--accent))' }} />
              <span className="tabular-nums">{searchQuery ? `${filteredMessages.length}/${messages.length}` : messages.length}</span>
            </span>
          </div>
        </header>

        {/* ─── Main Content ──────────────────── */}
        <div className="flex-1 flex overflow-hidden">
          {/* Message List - hidden on mobile when detail open */}
          <div className={`w-full md:w-[360px] lg:w-[400px] flex-shrink-0 flex flex-col ${
            isMobileDetailOpen ? 'hidden md:flex' : 'flex'
          }`} style={{ borderRight: '1px solid rgb(var(--line) / 0.2)' }}>

            {/* Search Bar */}
            <SearchBar value={searchQuery} onChange={setSearchQuery} />

            {/* Mobile list */}
            <div className="md:hidden flex-1 overflow-y-auto">
              {loading && messages.length === 0 ? (
                <div className="divide-y" style={{ borderColor: 'rgb(var(--line) / 0.2)' }}>
                  <MessageSkeleton /><MessageSkeleton /><MessageSkeleton /><MessageSkeleton /><MessageSkeleton />
                </div>
              ) : filteredMessages.length === 0 ? (
                searchQuery ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="text-center px-6 animate-fade-in">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3" style={{ background: 'rgb(var(--accent) / 0.06)' }}>🔍</div>
                      <p className="text-sm font-medium" style={{ color: 'rgb(var(--ink))' }}>Tidak ditemukan</p>
                      <p className="text-xs mt-1" style={{ color: 'rgb(var(--ink-secondary) / 0.7)' }}>Coba kata kunci lain</p>
                    </div>
                  </div>
                ) : (
                  <EmptyState inboxAddr={inboxAddr} />
                )
              ) : (
                <div className="divide-y" style={{ borderColor: 'rgb(var(--line) / 0.2)' }}>
                  {filteredMessages.map((msg, idx) => (
                    <MessageItem key={msg.id} msg={msg} selected={selectedId === msg.id} onSelect={() => handleSelectMessage(msg.id)} idx={idx} query={searchQuery} />
                  ))}
                </div>
              )}
            </div>

            {/* Desktop list */}
            <div className="hidden md:flex flex-col flex-1 overflow-y-auto">
              {loading && messages.length === 0 ? (
                <div className="divide-y" style={{ borderColor: 'rgb(var(--line) / 0.2)' }}>
                  <MessageSkeleton /><MessageSkeleton /><MessageSkeleton />
                  <MessageSkeleton /><MessageSkeleton /><MessageSkeleton />
                </div>
              ) : filteredMessages.length === 0 ? (
                searchQuery ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="text-center px-6 animate-fade-in">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3" style={{ background: 'rgb(var(--accent) / 0.06)' }}>🔍</div>
                      <p className="text-sm font-medium" style={{ color: 'rgb(var(--ink))' }}>Tidak ditemukan</p>
                      <p className="text-xs mt-1" style={{ color: 'rgb(var(--ink-secondary) / 0.7)' }}>Coba kata kunci lain</p>
                    </div>
                  </div>
                ) : (
                  <EmptyState inboxAddr={inboxAddr} />
                )
              ) : (
                <div className="divide-y" style={{ borderColor: 'rgb(var(--line) / 0.2)' }}>
                  {filteredMessages.map((msg) => (
                    <MessageItem key={msg.id} msg={msg} selected={selectedId === msg.id} onSelect={() => handleSelectMessage(msg.id)} idx={0} query={searchQuery} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Email Detail / No Selection */}
          {selectedEmail ? (
            <div className="flex-1 min-w-0 overflow-hidden">
              <EmailDetail email={selectedEmail} onClose={handleCloseDetail} onDelete={handleDeleteMessage} />
            </div>
          ) : (
            <NoEmailSelected />
          )}
        </div>
      </div>
    </>
  )
}

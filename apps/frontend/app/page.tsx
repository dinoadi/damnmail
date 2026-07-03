'use client'

import { useEffect, useRef, useState } from 'react'
import { startPolling } from './lib/api'
import type { EmailViewModel } from './types'

const PASSWORD = 'ZHAMBALA99'
const AUTH_KEY = 'damnmail-auth'
const THEME_KEY = 'damnmail-theme'
const INBOX_ADDRESS = 'all@readyonbooking.app'

// ─── Helpers ─────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

function senderInitial(from: string): string {
  const match = from.match(/^"?([A-Za-z])/)
  return match ? match[1].toUpperCase() : '#'
}

function senderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</)
  if (match) return match[1].trim()
  const emailMatch = from.match(/([^@]+)@/)
  if (emailMatch) return emailMatch[1]
  return from
}

function senderColor(from: string): string {
  let hash = 0
  for (let i = 0; i < from.length; i++) {
    hash = from.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-500'
  ]
  return colors[Math.abs(hash) % colors.length]
}

// ─── Icons ───────────────────────────────────────────────────────

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

// ─── Theme Toggle ────────────────────────────────────────────────

function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
  }

  return (
    <button
      onClick={toggle}
      className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-panel-dark dark:bg-[#1a2540] hover:bg-line dark:hover:bg-[#243150] transition-colors"
      aria-label="Toggle theme"
    >
      {dark ? <SunIcon className="text-amber-400" /> : <MoonIcon className="text-slate-500" />}
    </button>
  )
}

// ─── Password Gate ───────────────────────────────────────────────

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value === PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, '1')
      onUnlock()
    } else {
      setError(true)
      setValue('')
      inputRef.current?.focus()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative z-10">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <form onSubmit={submit} className="w-full max-w-sm p-8 rounded-2xl bg-panel-light/80 dark:bg-panel-light/90 backdrop-blur-xl border border-line shadow-panel dark:shadow-panel-dark">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 dark:bg-accent/20 flex items-center justify-center">
            <LockIcon className="text-accent" />
          </div>
          <h1 className="text-xl font-semibold text-ink">DamnMail</h1>
          <p className="text-xs text-ink/40">*@readyonbooking.app</p>
        </div>
        <input
          ref={inputRef}
          type="password"
          value={value}
          onChange={e => { setValue(e.target.value); setError(false) }}
          placeholder="Password"
          autoFocus
          className="w-full px-4 py-3 rounded-xl bg-canvas dark:bg-panel-dark border border-line focus:border-accent outline-none text-sm transition-colors"
        />
        {error && <p className="text-xs text-red-500 mt-2 pl-1">Wrong password</p>}
        <button type="submit" className="w-full mt-4 py-3 rounded-xl bg-accent hover:bg-accent-dark text-white text-sm font-medium transition-colors">
          Unlock
        </button>
      </form>
    </div>
  )
}

// ─── Email Detail ────────────────────────────────────────────────

function EmailDetail({ email, onBack }: { email: EmailViewModel; onBack: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 lg:px-6 py-3 border-b border-line">
        <button onClick={onBack} className="lg:hidden p-1 rounded-lg hover:bg-panel-dark transition-colors">
          <ArrowLeftIcon />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold truncate">{email.subject || '(no subject)'}</h2>
          <p className="text-xs text-ink/50 truncate">{email.from}</p>
        </div>
        <span className="text-xs text-ink/40 flex-shrink-0">
          {new Date(email.receivedAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-10 h-10 rounded-full ${senderColor(email.from)} flex items-center justify-center text-white text-sm font-medium flex-shrink-0`}>
            {senderInitial(email.from)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{senderName(email.from)}</p>
            <p className="text-xs text-ink/40 truncate">to {email.to || INBOX_ADDRESS}</p>
          </div>
        </div>
        {email.html ? (
          <div className="email-content prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: email.html }} />
        ) : (
          <pre className="text-sm whitespace-pre-wrap font-sans text-ink/80">{email.text || 'No content'}</pre>
        )}
        {email.attachments && email.attachments.length > 0 && (
          <div className="mt-6 pt-4 border-t border-line">
            <p className="text-xs font-medium text-ink/50 mb-2">{email.attachments.length} attachment{email.attachments.length > 1 ? 's' : ''}</p>
            <div className="flex flex-wrap gap-2">
              {email.attachments.map(att => (
                <a key={att.id} href={att.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-2 rounded-lg bg-panel-dark dark:bg-[#1a2540] border border-line hover:border-accent transition-colors truncate max-w-[200px]">
                  {att.filename}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main App ────────────────────────────────────────────────────

export default function Home() {
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [messages, setMessages] = useState<EmailViewModel[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [messageCount, setMessageCount] = useState(0)

  const selectedEmail = messages.find(m => m.id === selectedId) ?? null

  useEffect(() => {
    if (sessionStorage.getItem(AUTH_KEY) === '1') setIsUnlocked(true)
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    const stop = startPolling(
      `/inboxes/${encodeURIComponent(INBOX_ADDRESS)}/messages`,
      (data: EmailViewModel[]) => {
        setMessages(data)
        setMessageCount(data.length)
        setIsLoading(false)
      },
      () => { setIsLoading(false) },
      5000
    )
    return () => stop()
  }, [isUnlocked])

  if (!isUnlocked) return <PasswordGate onUnlock={() => setIsUnlocked(true)} />

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      {/* Header */}
      <header className="flex items-center justify-between px-4 lg:px-6 h-14 border-b border-line bg-panel-light/70 dark:bg-panel-light/80 backdrop-blur-lg flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white">
            <InboxIcon />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">DamnMail</h1>
            <p className="text-[11px] text-ink/40 font-mono">{INBOX_ADDRESS}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink/40 font-mono mr-1">{messageCount}</span>
          <ThemeToggle />
          <button
            onClick={() => { sessionStorage.removeItem(AUTH_KEY); window.location.reload() }}
            className="px-3 py-1.5 rounded-lg text-xs text-ink/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Message List */}
        <div className={`${selectedEmail ? 'hidden lg:flex' : 'flex'} w-full lg:w-96 flex-shrink-0 border-r border-line bg-panel-light/50 dark:bg-panel-light/30 flex-col overflow-y-auto`}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-ink/30">
              <RefreshIcon className="animate-spin mb-3" />
              <p className="text-sm">Loading...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-ink/30">
              <InboxIcon className="mb-3 w-8 h-8" />
              <p className="text-sm">Inbox empty</p>
              <p className="text-xs mt-1">Send email to *@readyonbooking.app</p>
            </div>
          ) : (
            messages.map(email => (
              <button
                key={email.id}
                onClick={() => setSelectedId(email.id)}
                className={`w-full text-left px-4 py-3 flex gap-3 border-b border-line/50 transition-colors ${
                  selectedId === email.id
                    ? 'bg-accent/10 dark:bg-accent/15'
                    : 'hover:bg-panel-dark dark:hover:bg-[#0f1c33]'
                }`}
              >
                <div className={`w-9 h-9 rounded-full ${senderColor(email.from)} flex-shrink-0 flex items-center justify-center text-white text-xs font-medium`}>
                  {senderInitial(email.from)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{senderName(email.from)}</span>
                    <span className="text-[11px] text-ink/40 flex-shrink-0">{relativeTime(email.receivedAt)}</span>
                  </div>
                  <p className="text-sm truncate text-ink/80 dark:text-ink/60 mt-0.5">{email.subject || '(no subject)'}</p>
                  {email.snippet && <p className="text-xs truncate text-ink/40 mt-0.5">{email.snippet}</p>}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detail Panel */}
        <div className={`${selectedEmail ? 'flex' : 'hidden lg:flex'} flex-1 flex-col`}>
          {selectedEmail ? (
            <EmailDetail email={selectedEmail} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-ink/20">
              <InboxIcon className="w-10 h-10 mb-3" />
              <p className="text-sm">Select an email</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

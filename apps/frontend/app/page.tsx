'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchJson, getEventStreamUrl } from './lib/api'
import type { DomainViewModel, EmailViewModel, InboxViewModel } from './types'

interface DomainsResponse {
  domains: DomainViewModel[]
}

interface CreateInboxResponse {
  inbox: InboxViewModel
  domains: DomainViewModel[]
}

interface MessagesResponse {
  messages: EmailViewModel[]
}

function formatTimeUntilExpiry(expiresAt: string): string {
  const msRemaining = new Date(expiresAt).getTime() - Date.now()
  if (msRemaining <= 0) {
    return 'Expired'
  }

  const totalMinutes = Math.floor(msRemaining / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `Expiring in ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function relativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000))
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
}

export default function Page() {
  const [domains, setDomains] = useState<DomainViewModel[]>([])
  const [username, setUsername] = useState('')
  const [selectedDomain, setSelectedDomain] = useState('')
  const [activeInbox, setActiveInbox] = useState<InboxViewModel | null>(null)
  const [messages, setMessages] = useState<EmailViewModel[]>([])
  const [selectedMessage, setSelectedMessage] = useState<EmailViewModel | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    fetchJson<DomainsResponse>('/api/domains')
      .then((response) => {
        setDomains(response.domains)
        setSelectedDomain(response.domains[0]?.name ?? '')
      })
      .catch(() => {
        setErrorMessage('Gagal memuat domain aktif.')
      })
  }, [])

  useEffect(() => {
    if (!activeInbox) {
      return
    }

    fetchJson<MessagesResponse>(`/api/inboxes/${activeInbox.address}/messages`)
      .then((response) => {
        setMessages(response.messages)
        setSelectedMessage(response.messages[0] ?? null)
      })
      .catch(() => {
        setErrorMessage('Gagal memuat inbox.')
      })

    const eventSource = new EventSource(getEventStreamUrl(`/api/inboxes/${activeInbox.address}/stream`))
    eventSource.addEventListener('email-received', (event) => {
      const incomingMessage = JSON.parse(event.data) as EmailViewModel
      setMessages((currentMessages) => [incomingMessage, ...currentMessages])
      setSelectedMessage((currentMessage) => currentMessage ?? incomingMessage)
    })

    return () => {
      eventSource.close()
    }
  }, [activeInbox])

  const activeAddressLabel = useMemo(() => activeInbox?.address ?? 'No active inbox', [activeInbox])

  async function createInbox(createRandom: boolean): Promise<void> {
    if (!selectedDomain) {
      setErrorMessage('Pilih domain dulu.')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    try {
      const response = await fetchJson<CreateInboxResponse>('/api/inboxes', {
        method: 'POST',
        body: JSON.stringify({
          username: createRandom ? undefined : username,
          domain: selectedDomain
        })
      })

      setActiveInbox(response.inbox)
      setDomains(response.domains)
      setMessages([])
      setSelectedMessage(null)
      setUsername(response.inbox.username)
    } catch {
      setErrorMessage('Gagal membuat email sementara.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 md:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-[28px] border border-line/70 bg-white/85 px-6 py-5 shadow-panel backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-electric text-2xl text-white shadow-glow">😈</div>
            <div>
              <p className="font-display text-3xl tracking-wide text-ink">DamnMail</p>
              <p className="text-sm text-ink/60">Multi-domain temporary mail, clean catch-all delivery.</p>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-sm text-ink/70">
            <a className="rounded-full border border-line bg-panel px-4 py-2 hover:border-electric hover:text-electric" href="#">Home</a>
            <a className="rounded-full border border-line bg-panel px-4 py-2 hover:border-electric hover:text-electric" href="#generator">Create Email</a>
            <a className="rounded-full border border-line bg-panel px-4 py-2 hover:border-electric hover:text-electric" href="#about">About</a>
            <button className="rounded-full border border-line bg-panel px-4 py-2 hover:border-electric hover:text-electric">⚙</button>
          </nav>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_1fr_1.15fr]">
          <aside id="generator" className="relative overflow-hidden rounded-[32px] border border-line/70 bg-white/90 p-6 shadow-panel">
            <div className="absolute -right-10 top-0 h-36 w-36 rounded-full bg-electric/10 blur-3xl" />
            <div className="relative space-y-6">
              <div>
                <p className="font-display text-4xl leading-none text-ink">Forge inbox</p>
                <p className="mt-3 max-w-md text-sm leading-6 text-ink/65">
                  Buat alamat custom atau random. Pilih root domain aktif. Inbox update real-time tanpa refresh.
                </p>
              </div>

              <div className="grid gap-3">
                <label className="text-xs uppercase tracking-[0.3em] text-ink/45">Username</label>
                <div className="grid gap-3 md:grid-cols-[1.3fr_0.9fr]">
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="rahasia"
                    className="rounded-2xl border border-line bg-canvas px-4 py-4 text-base outline-none transition focus:border-electric focus:bg-white"
                  />
                  <select
                    value={selectedDomain}
                    onChange={(event) => setSelectedDomain(event.target.value)}
                    className="rounded-2xl border border-line bg-canvas px-4 py-4 text-base outline-none transition focus:border-electric focus:bg-white"
                  >
                    {domains.map((domain) => (
                      <option key={domain.id} value={domain.name}>
                        @{domain.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <button
                  onClick={() => void createInbox(false)}
                  disabled={isLoading}
                  className="rounded-2xl bg-electric px-5 py-4 text-sm font-semibold text-white shadow-glow transition hover:-translate-y-0.5 disabled:opacity-60"
                >
                  Create Custom Email
                </button>
                <button
                  onClick={() => void createInbox(true)}
                  disabled={isLoading}
                  className="rounded-2xl border border-electric/30 bg-white px-5 py-4 text-sm font-semibold text-electric transition hover:-translate-y-0.5 disabled:opacity-60"
                >
                  Generate Random Email
                </button>
              </div>

              <div className="rounded-[28px] border border-electric/20 bg-canvas p-5 shadow-glow">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-ink/45">Active address</p>
                    <p className="mt-3 break-all font-display text-3xl text-ink">{activeAddressLabel}</p>
                    <p className="mt-2 text-sm text-ink/55">
                      {activeInbox ? formatTimeUntilExpiry(activeInbox.expiresAt) : 'Create inbox to start watching incoming mail.'}
                    </p>
                  </div>
                  <button
                    onClick={() => activeInbox && navigator.clipboard.writeText(activeInbox.address)}
                    className="rounded-full border border-line bg-white px-4 py-2 text-sm text-ink/70 hover:border-electric hover:text-electric"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
            </div>
          </aside>

          <section className="rounded-[32px] border border-line/70 bg-white/90 p-6 shadow-panel">
            <div className="mb-5 flex items-end justify-between gap-3">
              <div>
                <p className="font-display text-3xl text-ink">Inbox</p>
                <p className="text-sm text-ink/55">Watching {activeInbox?.address ?? 'no inbox selected'} in real-time.</p>
              </div>
              <span className="rounded-full border border-electric/20 bg-electric/10 px-3 py-1 text-xs font-semibold text-electric">
                {messages.length} message{messages.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-line p-6 text-sm text-ink/55">
                  Inbox kosong. Kirim email ke alamat aktif untuk lihat stream masuk.
                </div>
              ) : (
                messages.map((message, index) => (
                  <button
                    key={message.id}
                    onClick={() => setSelectedMessage(message)}
                    className={`w-full rounded-[24px] border p-4 text-left transition ${selectedMessage?.id === message.id ? 'border-electric bg-electric/5 shadow-glow' : 'border-line bg-canvas hover:border-electric/40'}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-lg font-semibold text-electric shadow-sm">
                        {message.from.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="truncate font-semibold text-ink">{message.from}</p>
                            <p className="truncate text-sm text-ink/75">{message.subject}</p>
                          </div>
                          <div className="text-right text-xs text-ink/50">
                            <p>{relativeTime(message.receivedAt)}</p>
                            {index === 0 ? (
                              <span className="mt-2 inline-flex rounded-full bg-electric px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                                1 New
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink/60">{message.snippet}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[32px] border border-line/70 bg-white/90 p-6 shadow-panel">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-3xl text-ink">Viewer</p>
                <p className="text-sm text-ink/55">Readable HTML/text parser output.</p>
              </div>
              <span className="rounded-full border border-line bg-canvas px-3 py-1 text-xs text-ink/55">Safe render</span>
            </div>

            {selectedMessage ? (
              <div className="space-y-5">
                <div className="rounded-[24px] border border-line bg-canvas p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-ink/45">From</p>
                  <p className="mt-2 text-lg font-semibold text-ink">{selectedMessage.from}</p>
                  <p className="mt-4 text-xs uppercase tracking-[0.3em] text-ink/45">Subject</p>
                  <p className="mt-2 font-display text-3xl text-ink">{selectedMessage.subject}</p>
                  <p className="mt-4 text-sm text-ink/55">Received {relativeTime(selectedMessage.receivedAt)}</p>
                </div>

                <article className="max-w-none rounded-[24px] border border-line bg-white p-6">
                  {selectedMessage.html ? (
                    <div dangerouslySetInnerHTML={{ __html: selectedMessage.html }} />
                  ) : (
                    <pre className="whitespace-pre-wrap font-body text-base text-ink/80">{selectedMessage.text ?? 'No readable content.'}</pre>
                  )}
                </article>
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-line p-6 text-sm text-ink/55">
                Pilih email dari inbox untuk buka isi lengkap di panel ini.
              </div>
            )}
          </section>
        </section>

        <section id="about" className="rounded-[28px] border border-line/70 bg-white/80 px-6 py-5 text-sm leading-7 text-ink/65 shadow-panel">
          DamnMail built for rapid multi-domain temporary inbox creation. Backend validates RCPT TO against active root domains, parser normalizes multipart emails, and dashboard streams inbound mail live with SSE.
        </section>
      </div>
    </main>
  )
}

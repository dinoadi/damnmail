'use client'

import { useEffect, useState } from 'react'
import { type FormEvent } from 'react'
import { fetchJson, startPolling } from './lib/api'
import type { EmailViewModel } from './types'

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

function formatTimeUntilExpiry(expiresAt: string): string {
  const msRemaining = new Date(expiresAt).getTime() - Date.now()
  if (msRemaining <= 0) return 'Expired'

  const totalMinutes = Math.floor(msRemaining / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `Expiring in ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function relativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000))
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`

  const diffHours = Math.floor(diffMinutes / 60)
  return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
}

const PASSWORD = 'ZHAMBALA99'
const STORAGE_KEY = 'damnmail-auth'

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [input, setInput] = useState('')
  const [wrong, setWrong] = useState('')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (input === PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, '1')
      onUnlock()
    } else {
      setWrong('Password salah.')
      setInput('')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded bg-black text-xl text-white">DM</div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">DamnMail</h1>
            <p className="text-sm text-gray-500">Masukkan password untuk akses</p>
          </div>
        </div>
        <input
          type="password"
          value={input}
          onChange={(e) => { setInput(e.target.value); setWrong('') }}
          placeholder="Password"
          autoFocus
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black mb-3"
        />
        {wrong && <p className="mb-3 text-sm text-red-600">{wrong}</p>}
        <button
          type="submit"
          className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          Masuk
        </button>
      </form>
    </main>
  )
}

export default function Page() {
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [inboxAddress, setInboxAddress] = useState('')
  const [activeAddress, setActiveAddress] = useState('')
  const [messages, setMessages] = useState<EmailViewModel[]>([])
  const [selectedMessage, setSelectedMessage] = useState<EmailViewModel | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY)) {
      setIsUnlocked(true)
    }
  }, [])

  useEffect(() => {
    if (!isUnlocked || !activeAddress) {
      setMessages([])
      setSelectedMessage(null)
      return
    }

    const path = `/api/inboxes/${encodeURIComponent(activeAddress)}/messages`

    fetchJson<ApiResponse<{ messages: EmailViewModel[] } | EmailViewModel[]>>(path)
      .then((response) => {
        if (response.success && response.data) {
          const msgs = Array.isArray(response.data) ? response.data : (response.data as { messages: EmailViewModel[] }).messages || []
          setMessages(msgs)
          setSelectedMessage((current) => current ?? msgs[0] ?? null)
        }
      })
      .catch(() => {
        setErrorMessage('Gagal memuat inbox.')
      })

    const stopPolling = startPolling<ApiResponse<EmailViewModel[]>>(
      path,
      (response) => {
        if (response.success && response.data) {
          setMessages(response.data)
        }
      },
      () => {
        setErrorMessage('Gagal memuat stream inbox.')
      },
      4000
    )

    return () => { stopPolling() }
  }, [isUnlocked, activeAddress])

  if (!isUnlocked) {
    return <PasswordGate onUnlock={() => setIsUnlocked(true)} />
  }

  async function handleCheckInbox(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = inboxAddress.trim()
    if (!trimmed.includes('@')) {
      setErrorMessage('Masukkan alamat email yang valid (contoh: nama@domain.app)')
      return
    }
    setErrorMessage('')
    setSelectedMessage(null)
    setActiveAddress(trimmed.toLowerCase())
  }

  async function handleRefresh() {
    if (!activeAddress) return
    setIsLoading(true)
    try {
      const response = await fetchJson<ApiResponse<EmailViewModel[]>>(
        `/api/inboxes/${encodeURIComponent(activeAddress)}/messages`
      )
      if (response.success && response.data) {
          setMessages(response.data)
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal merefresh inbox.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen bg-gray-50 text-gray-900 px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 border-b border-gray-200 pb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded bg-black text-xl text-white">DM</div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">DamnMail</h1>
              <p className="text-sm text-gray-500">Free, fast, multi-domain temporary mail.</p>
            </div>
          </div>
          <nav className="flex items-center gap-4 text-sm font-medium text-gray-600">
            <a className="hover:text-black" href="#">Home</a>
            <a className="hover:text-black" href="#about">About</a>
            <a className="hover:text-black" href="https://github.com/dinoadi/damnmail" target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </header>

        <section className="grid gap-8 lg:grid-cols-3">
          <aside className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">Check Inbox</h2>
                <p className="mt-2 text-sm text-gray-500">
                  Enter any email address to see its inbox. No registration needed.
                </p>
              </div>

              <form onSubmit={handleCheckInbox} className="space-y-3">
                <div className="grid gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Email Address</label>
                  <input
                    value={inboxAddress}
                    onChange={(e) => setInboxAddress(e.target.value)}
                    placeholder="nama@domain.app"
                    type="email"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
                >
                  Cek Inbox
                </button>
              </form>

              {activeAddress && (
                <div className="rounded-lg bg-gray-50 p-4 border border-gray-200">
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Active Inbox</p>
                      <p className="mt-1 font-mono text-lg font-medium break-all text-black">{activeAddress}</p>
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(activeAddress)}
                      className="self-start rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Copy Address
                    </button>
                  </div>
                </div>
              )}

              {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
            </div>
          </aside>

          <section className="lg:col-span-2 flex flex-col gap-6">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[500px]">
              <div className="border-b border-gray-200 bg-gray-50 px-5 py-4 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">Incoming Mail</h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${activeAddress ? 'bg-green-400' : 'bg-gray-400'}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${activeAddress ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                    </span>
                    <p className="text-xs text-gray-500">
                      {activeAddress ? `Listening on ${activeAddress}` : 'Enter an address above'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {activeAddress && (
                    <button
                      onClick={() => void handleRefresh()}
                      disabled={isLoading}
                      className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5 transition"
                    >
                      <svg className={`h-3 w-3 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 4.89M9 11l3 3L22 4" />
                      </svg>
                      Refresh
                    </button>
                  )}
                  <span className="rounded bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700">
                    {messages.length} message{messages.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                {messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center p-8 text-center text-sm text-gray-500">
                    <p>No messages yet.</p>
                    <p className="mt-1">
                      {activeAddress
                        ? `Waiting for incoming emails to ${activeAddress}...`
                        : 'Enter an email address to check its inbox.'}
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {messages.map((message) => (
                      <li key={message.id}>
                        <button
                          onClick={() => setSelectedMessage(message)}
                          className={`w-full p-4 text-left transition ${selectedMessage?.id === message.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        >
                          <div className="flex justify-between items-baseline gap-2 mb-1">
                            <p className="font-medium text-gray-900 truncate">{message.from}</p>
                            <span className="text-xs text-gray-500 whitespace-nowrap">{relativeTime(message.receivedAt)}</span>
                          </div>
                          <p className="text-sm font-medium text-gray-800 truncate mb-1">{message.subject}</p>
                          <p className="text-xs text-gray-500 line-clamp-2">{message.snippet}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[400px]">
              <div className="border-b border-gray-200 bg-gray-50 px-5 py-4">
                <h2 className="font-semibold text-gray-900">Message Viewer</h2>
              </div>

              {selectedMessage ? (
                <div className="flex-1 flex flex-col">
                  <div className="border-b border-gray-100 p-5 bg-white">
                    <div className="grid grid-cols-[80px_1fr] gap-y-2 text-sm">
                      <span className="text-gray-500 font-medium">From:</span>
                      <span className="text-gray-900">{selectedMessage.from}</span>
                      <span className="text-gray-500 font-medium">To:</span>
                      <span className="text-gray-900">{selectedMessage.to}</span>
                      <span className="text-gray-500 font-medium">Date:</span>
                      <span className="text-gray-900">{new Date(selectedMessage.receivedAt).toLocaleString()}</span>
                      <span className="text-gray-500 font-medium">Subject:</span>
                      <span className="text-gray-900 font-semibold">{selectedMessage.subject}</span>
                    </div>
                  </div>

                  <div className="p-5 overflow-x-auto flex-1 bg-white">
                    {selectedMessage.html ? (
                      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedMessage.html }} />
                    ) : (
                      <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">{selectedMessage.text ?? 'No readable content.'}</pre>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-500 flex-1">
                  Select a message from the inbox to view its contents.
                </div>
              )}
            </div>
          </section>
        </section>

        <footer id="about" className="mt-8 rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm text-center">
          DamnMail is an open-source temporary email service built on Netlify and Appwrite. Free to use, respecting your privacy.
        </footer>
      </div>
    </main>
  )
}

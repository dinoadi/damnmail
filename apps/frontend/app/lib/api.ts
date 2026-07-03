const NEXT_PUBLIC_API_BASE_URL = '/api/proxy'

interface ExecutionResponse<T> {
  status: string
  responseStatusCode: number
  responseBody: string
}

export async function callFunction<T>(method: string, path: string, body?: string): Promise<T> {
  const payload: Record<string, string> = { method, path }
  if (body) {
    payload.body = body
  }

  // We only send the execution payload to the Netlify proxy.
  // The proxy is responsible for securely passing the API key and forwarding to Appwrite.
  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  }

  const response = await fetch(NEXT_PUBLIC_API_BASE_URL, fetchOptions)

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`)
  }

  const execution = await response.json()

  if (execution.status !== 'completed') {
    throw new Error(`Function execution failed: ${execution.status}`)
  }

  if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300) {
    try {
      const parsed = JSON.parse(execution.responseBody);
      throw new Error(parsed.error || `API error: ${execution.responseStatusCode}`);
    } catch {
      throw new Error(`API error: ${execution.responseStatusCode}`);
    }
  }

  // responseBody is a JSON string — parse it to get the actual API response
  return JSON.parse(execution.responseBody) as T
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET'
  const body = typeof init?.body === 'string' ? init.body : undefined
  return callFunction<T>(method, path, body)
}

// SSE is not supported by Appwrite Functions — use polling instead
export function getEventStreamUrl(_path: string): string {
  return ''
}

export function startPolling<T>(
  path: string,
  onData: (data: T) => void,
  onError: (error: Error) => void,
  intervalMs = 4000
): () => void {
  let active = true

  const poll = async () => {
    if (!active) return
    try {
      const data = await callFunction<T>('GET', path)
      onData(data)
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  // Initial fetch
  poll()

  const interval = setInterval(poll, intervalMs)

  return () => {
    active = false
    clearInterval(interval)
  }
}

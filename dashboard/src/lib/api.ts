// A small wrapper around fetch() that adds the login token and turns API
// errors into ApiError objects with a friendly message.

// Empty = same website. In development Vite forwards /api to the API server.
// For a production build, set VITE_API_URL (e.g. https://api.yourstore.com).
export const API_URL: string = import.meta.env.VITE_API_URL ?? ''

const TOKEN_KEY = 'fernway.staff.token'

export interface FieldError {
  field: string | null
  message: string
}

export class ApiError extends Error {
  status: number
  code: string
  details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }

  /** Validation messages keyed by field name, e.g. { name: 'Name is required' } */
  get fieldErrors(): Record<string, string> {
    const fields = (this.details as { fields?: FieldError[] } | undefined)?.fields ?? []
    const result: Record<string, string> = {}
    for (const f of fields) if (f.field && !result[f.field]) result[f.field] = f.message
    return result
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage can be blocked (e.g. private browsing). The user just stays logged in for this tab.
  }
}

let unauthorizedHandler: (() => void) | null = null
/** Called when the API says our token is no longer valid (e.g. it expired). */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler
}

interface RequestOptions {
  method?: string
  body?: unknown
  form?: FormData
}

export async function request<T>(path: string, { method = 'GET', body, form }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', "Can't reach the server. Check that the API is running (npm run dev).")
  }

  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && token) unauthorizedHandler?.()
    const error = data?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? `The server returned an error (${response.status}). Is the API running?`,
      error?.details,
    )
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', form }),
}

/** Turns "/uploads/products/x.jpg" into a full URL the browser can load. */
export function imageSrc(path: string | null): string | null {
  if (!path) return null
  return /^https?:\/\//.test(path) ? path : `${API_URL}${path}`
}

/** Builds "?a=1&b=2", skipping empty values. */
export function queryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

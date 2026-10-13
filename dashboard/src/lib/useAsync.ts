import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
}

/**
 * Loads data and tracks loading / error states.
 *   const { data, error, loading, reload } = useAsync(() => api.get('/api/x'), [dep])
 * Old data stays on screen while reloading, so auto-refresh doesn't flicker.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[], options: { refreshEveryMs?: number } = {}) {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: undefined, loading: true })
  const [version, setVersion] = useState(0)
  const loadRef = useRef(load)

  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    loadRef.current().then(
      (data) => !cancelled && setState({ data, error: undefined, loading: false }),
      (error: Error) => !cancelled && setState((s) => ({ data: s.data, error, loading: false })),
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  useEffect(() => {
    if (!options.refreshEveryMs) return
    const timer = setInterval(() => setVersion((v) => v + 1), options.refreshEveryMs)
    return () => clearInterval(timer)
  }, [options.refreshEveryMs])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const setData = useCallback((data: T) => setState((s) => ({ ...s, data })), [])

  return { ...state, reload, setData }
}

/** Returns `value` only after it has stopped changing for `delayMs` (for search boxes). */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

/** Credentials come from the host's current auth store, never Agent storage. */
export function createHostAgentFetch(options: {
  origin: string
  isCurrent(): boolean
  getHeaders(): Record<string, string>
  onUnauthorized?(): void
  fetch: typeof fetch
}): typeof fetch {
  return async (input, init) => {
    if (!options.isCurrent()) throw new Error('登录状态已变化，请重新打开 Agent')
    const url = new URL(input instanceof Request ? input.url : String(input), options.origin)
    if (url.origin !== new URL(options.origin).origin) throw new Error('Agent API must be same-origin')
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    // Discard stale credentials supplied by a widget before applying host auth.
    headers.delete('Authorization')
    headers.delete('X-Pb-Auth')
    for (const [key, value] of Object.entries(options.getHeaders())) headers.set(key, value)
    const response = await options.fetch(input, { ...init, headers, redirect: 'error' })
    if (response.status === 401 && options.isCurrent()) options.onUnauthorized?.()
    return response
  }
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/integrations/agent/authFetch.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { createHostAgentFetch } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('host injects current PB headers, removes stale credentials and refuses redirects', async () => {
  const calls = []
  let headers = { 'X-Pb-Auth': 'alice-token' }
  const request = createHostAgentFetch({ origin: 'https://canvas.example/p/app/canvas/1', isCurrent: () => true, getHeaders: () => headers,
    fetch: async (input, init) => { calls.push(init); return new Response('{}') },
  })
  await request('/agent-api/capabilities', { headers: { Authorization: 'Bearer stale', 'Content-Type': 'application/json' } })
  assert.equal(calls[0].headers.get('X-Pb-Auth'), 'alice-token')
  assert.equal(calls[0].headers.get('Authorization'), null)
  assert.equal(calls[0].redirect, 'error')
  assert.equal(calls[0].headers.get('Content-Type'), 'application/json')
  headers = { Authorization: 'new-pb-token' }
  await request('/agent-api/capabilities')
  assert.equal(calls[1].headers.get('Authorization'), 'new-pb-token')
  assert.equal(calls[1].headers.get('X-Pb-Auth'), null)
  await assert.rejects(request('https://other.example/api'), /same-origin/)
  assert.equal(calls.length, 2)
})

test('logout, expired credentials and account changes invalidate the old widget client', async () => {
  let current = true
  let calls = 0
  const request = createHostAgentFetch({ origin: 'http://localhost:5173', isCurrent: () => current, getHeaders: () => ({ Authorization: 'fixture' }),
    fetch: async () => { calls++; return new Response('{}') },
  })
  await request('/agent-api/sessions')
  current = false
  await assert.rejects(request('/agent-api/sessions/old/messages'), /登录状态已变化/)
  assert.equal(calls, 1)
})

test('a rejected session clears only its current login, never a newly switched account', async () => {
  let current = true
  let cleared = 0
  let reply
  const request = createHostAgentFetch({ origin: 'http://localhost:5173', isCurrent: () => current, getHeaders: () => ({ Authorization: 'fixture' }),
    onUnauthorized: () => { cleared++ }, fetch: () => new Promise(resolve => { reply = resolve }),
  })
  const rejected = request('/agent-api/capabilities')
  reply(new Response('{}', { status: 401 }))
  await rejected
  assert.equal(cleared, 1)
  const outdated = request('/agent-api/capabilities')
  current = false
  reply(new Response('{}', { status: 401 }))
  await outdated
  assert.equal(cleared, 1)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

// Executes the actual host guard and bridge route. The PB signature verifier
// is stubbed at its platform boundary; this is not a native PB crypto test.
function fixture() {
  let guard
  const routes = new Map()
  const verified = []
  const context = {
    onRecordValidate() {}, onBootstrap() {},
    routerUse: handler => { guard = handler },
    routerAdd: (method, path, handler) => routes.set(`${method} ${path}`, handler),
    $app: {
      findAuthRecordByToken: token => {
        verified.push(token)
        if (!['valid', 'banned'].includes(token)) throw Error('PB rejected signature or expiry')
        return { id: 'fixture-user', get: field => ({ email: ' Alice@Example.Test ', status: token === 'banned' ? 'banned' : '' })[field] }
      },
      findRecordsByFilter: () => [],
    },
  }
  vm.runInNewContext(readFileSync(new URL('../pocketbase/pb_hooks/000-wallet-core.pb.js', import.meta.url), 'utf8'), context)
  vm.runInNewContext(readFileSync(new URL('../agent/integrations/pocketbase/agent-bridge.pb.js', import.meta.url), 'utf8'), context)
  return {
    verified,
    request(headers = {}) {
      let response
      const values = new Map()
      const event = {
        request: { method: 'GET', url: { path: '/api/agent-bridge/v1/identity' } },
        requestInfo: () => ({ method: 'GET', headers, body: { ownerId: 'forged-owner' } }),
        get: key => values.get(key), set: (key, value) => values.set(key, value),
        json: (status, data) => { response = { status, data }; return response },
        next: () => routes.get('GET /api/agent-bridge/v1/identity')(event),
      }
      guard(event)
      return response
    },
  }
}

test('Agent identity uses original canvas middleware for PB verification and account bans', () => {
  const f = fixture()
  assert.equal(f.request().status, 401)
  assert.equal(f.verified.length, 0)
  assert.equal(f.request({ Authorization: 'forged' }).status, 401)
  assert.equal(f.request({ Authorization: 'expired' }).status, 401)
  assert.equal(f.request({ 'X-Pb-Auth': 'banned' }).status, 403)
  for (const headers of [{ Authorization: 'valid' }, { Authorization: 'Bearer valid' }, { 'X-Pb-Auth': 'valid' }]) {
    const result = f.request(headers)
    assert.equal(result.status, 200)
    assert.equal(result.data.ownerId, 'alice@example.test')
    assert.equal(f.verified.at(-1), 'valid')
  }
})

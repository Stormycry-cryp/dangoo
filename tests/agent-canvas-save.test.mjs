import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

function fixture(commitFails = false) {
  const routes = new Map()
  let values = { rh_user_id: 'alice', title: 'Original', canvas_data: { rev: 3, cards: [{ id: 'keep' }] } }
  let inTransaction = false
  const record = {
    get: key => typeof values[key] === 'object' ? JSON.stringify(values[key]) : values[key],
    set: (key, value) => { values[key] = value },
    publicExport: () => structuredClone(values),
  }
  const app = {
    findRecordById: () => { assert.equal(inTransaction, true); return record },
    save: () => assert.equal(inTransaction, true),
    logger: () => ({ error() {}, info() {} }),
    runInTransaction: callback => {
      const before = structuredClone(values)
      inTransaction = true
      try { callback(app); if (commitFails) throw Error('commit failed') }
      catch (error) { values = before; throw error }
      finally { inTransaction = false }
    },
  }
  vm.runInNewContext(readFileSync(new URL('../pocketbase/pb_hooks/canvases.pb.js', import.meta.url), 'utf8'), {
    $app: app, onBootstrap() {}, routerAdd: (method, path, handler) => routes.set(method + ' ' + path, handler),
  })
  return {
    values: () => values,
    save: body => routes.get('PATCH /api/canvases/{id}')({
      get: () => 'alice', request: { pathValue: () => 'canvas1', header: { get: () => '' } },
      requestInfo: () => ({ body }), json: (status, data) => { assert.equal(inTransaction, false); return { status, data } },
    }),
  }
}

test('manual canvas save performs revision check and save in the same transaction', () => {
  const f = fixture()
  assert.equal(f.save({ canvas_rev: 3, canvas_data: { cards: [] } }).status, 200)
  assert.equal(f.values().canvas_data.rev, 4)
  assert.equal(f.save({ title: 'stale', canvas_rev: 3, canvas_data: { cards: [] } }).status, 409)
  assert.equal(f.values().title, 'Original')
})

test('a failed transaction commit cannot report a successful canvas save', () => {
  const f = fixture(true)
  assert.equal(f.save({ canvas_rev: 3, canvas_data: { cards: [] } }).status, 500)
  assert.equal(f.values().canvas_data.rev, 3)
})

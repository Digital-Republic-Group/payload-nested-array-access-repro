import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, beforeEach, expect } from 'vitest'

/**
 * Every test asserts the CORRECT behaviour: a stored `code` survives any update, because an editor
 * is not allowed to change it. A failing test is the bug.
 */

let payload: Payload
let admin: any
let editor: any
let docId: number | string

const codes = (doc: any) => ({
  nested: doc.outer.flatMap((o: any) => o.inner.map((i: any) => i.code)),
  single: doc.single.map((s: any) => s.code),
})

const read = () => payload.findByID({ collection: 'docs', id: docId, depth: 0, draft: true })

const asUser = (user: any) => ({ overrideAccess: false, user })

describe('field access.update = false inside a nested array, on a partial update', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await payload.delete({ collection: 'docs', where: { id: { exists: true } } })
    await payload.delete({ collection: 'users', where: { id: { exists: true } } })
    admin = await payload.create({
      collection: 'users',
      data: { email: 'admin@example.com', password: 'password', role: 'admin' },
    })
    editor = await payload.create({
      collection: 'users',
      data: { email: 'editor@example.com', password: 'password', role: 'editor' },
    })
  })

  beforeEach(async () => {
    const doc = await payload.create({
      collection: 'docs',
      data: {
        title: 'original',
        _status: 'published',
        outer: [
          { label: 'A', inner: [{ code: 'original-1', text: 'a1' }, { code: 'original-2', text: 'a2' }] },
          { label: 'B', inner: [{ code: 'original-3', text: 'b1' }] },
        ],
        single: [{ code: 'original-4', text: 's1' }],
      },
    })
    docId = doc.id
    expect(codes(await read())).toEqual({
      nested: ['original-1', 'original-2', 'original-3'],
      single: ['original-4'],
    })
  })

  it('BUG: editor, partial body { title } -> nested codes reset to defaultValue', async () => {
    await payload.update({ collection: 'docs', id: docId, data: { title: 'edited' }, ...asUser(editor) })
    const after = await read()
    expect(after.title).toBe('edited')
    expect(codes(after)).toEqual({
      nested: ['original-1', 'original-2', 'original-3'],
      single: ['original-4'],
    })
  })

  it('BUG: editor, status-only publish { _status: "published" } -> nested codes reset', async () => {
    await payload.update({
      collection: 'docs',
      id: docId,
      data: { _status: 'published' },
      draft: false,
      ...asUser(editor),
    })
    expect(codes(await read())).toEqual({
      nested: ['original-1', 'original-2', 'original-3'],
      single: ['original-4'],
    })
  })

  it('control: editor, FULL body (as the admin edit view sends) -> codes preserved', async () => {
    const full = await read()
    await payload.update({
      collection: 'docs',
      id: docId,
      data: { title: full.title, outer: full.outer, single: full.single },
      ...asUser(editor),
    })
    expect(codes(await read())).toEqual({
      nested: ['original-1', 'original-2', 'original-3'],
      single: ['original-4'],
    })
  })

  it('control: admin (field access passes), partial body -> codes preserved', async () => {
    await payload.update({ collection: 'docs', id: docId, data: { title: 'edited' }, ...asUser(admin) })
    expect(codes(await read())).toEqual({
      nested: ['original-1', 'original-2', 'original-3'],
      single: ['original-4'],
    })
  })
})

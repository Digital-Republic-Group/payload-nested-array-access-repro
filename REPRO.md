# Field `access.update` inside a nested array wipes the stored value on a partial update

**Payload 3.89.0**, `@payloadcms/db-sqlite`. It was first seen in production on 3.83.0 with
`@payloadcms/db-mongodb`, so it does not depend on the database adapter.

## Summary

A field inside a **nested** array (`array → array → field`) with a field-level `access.update` that
returns `false` is **reset to its `defaultValue`** (or removed, if it has none) when a user without
update access sends an update that **omits the arrays**. Two examples:

- `PATCH /api/docs/:id` with `{ "title": "x" }`
- a status-only publish, `{ "_status": "published" }`. This is exactly what the admin list view's bulk
  **Publish** sends, and bulk **Unpublish** sends `{ "_status": "draft" }`.

`access.update: () => false` is the documented way to make a field immutable after create. With this bug,
an immutable field can instead be silently replaced by any partial update from a user who is not allowed
to change it. The row `id`s survive, so nothing looks wrong structurally, and no error is raised.

A field in a **top-level** array is not affected, and neither is a full-body update (what the document
edit view sends) or an update by a user who passes the access check.

## Run it

```bash
pnpm install
cp .env.example .env
pnpm test:int
```

`tests/int/nested-array-access.int.spec.ts` asserts the **correct** behaviour, so the two `BUG:` tests fail:

```
× BUG: editor, partial body { title } -> nested codes reset to defaultValue
× BUG: editor, status-only publish { _status: "published" } -> nested codes reset
✓ control: editor, FULL body (as the admin edit view sends) -> codes preserved
✓ control: admin (field access passes), partial body -> codes preserved

- Expected                       + Received
    "nested": [                      "nested": [
      "original-1",                    "DEFAULT",
      "original-2",                    "DEFAULT",
      "original-3",                    "DEFAULT",
    ],                               ],
    "single": [ "original-4" ]       "single": [ "original-4" ]   ← top-level array: unaffected
```

The collection is [`src/collections/Docs.ts`](src/collections/Docs.ts). It uses one collection, no hooks and
no custom components. `code` has `defaultValue: 'DEFAULT'` and `access.update` that is true only for admins.

## Cause

In `packages/payload/src/fields/hooks/beforeValidate/promise.ts`:

1. **A missing array is copied from the stored doc, shallowly.** The arrays are omitted from `data`, so
   `getFallbackValue` fills `siblingData.outer` from the original document with `cloneDataFromOriginalDoc`.
   That clone copies the top-level rows (`{...row}`), but a nested array inside a row is **the same array**,
   holding **the same row objects**, as the original document's.
2. **The traversal reaches `code` inside an `inner` row.** `siblingData` and `siblingDoc` are now the same
   object.
3. **Field access fails for this user,** so `delete siblingData[field.name]` runs. Because the object is
   shared, this also deletes `code` from the **original document**.
4. **The refill finds nothing.** `getFallbackValue({ siblingDoc })` finds no stored value, since it was just
   deleted, and falls through to `defaultValue`.

At the top level, `{...row}` gives `siblingData` its own object, so the delete does not reach the original
and the fallback restores the stored value. That is why `single[].code` survives.

## Fix

A deep copy in `cloneDataFromOriginalDoc` fixes it. Replacing its body with
`structuredClone(originalDocData)`, as open PR **#17888** does for **#17475**, makes all four tests pass here
(verified by patching `node_modules`).

Related but distinct:
- **#17475:** the same shallow clone, reported for json array-of-arrays.
- **#17492, #17713, #18203:** they fix #17475 by special-casing array rows. Nested object rows stay shared,
  so they do **not** fix this.
- **#16718:** a different interaction between field `access.update: () => false` and version restore.

Alternatively, or as well, the access-denied branch could restore the value from a copy of the original
taken before any mutation, rather than trusting `siblingDoc`.

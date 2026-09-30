import type { CollectionConfig, FieldAccess } from 'payload'

/**
 * Minimal reproduction.
 *
 * `code` is "immutable after create" for editors, using the documented recipe: a field-level
 * `access.update` that returns false. It also has a `defaultValue`, so a new row gets one.
 *
 * `code` appears twice:
 *   - `outer[].inner[].code`: inside a NESTED array. This is the one that gets reset.
 *   - `single[].code`: inside a top-level array. This one survives. It is the control.
 */
const onlyAdminsCanUpdate: FieldAccess = ({ req }) => req.user?.role === 'admin'

const code = {
  name: 'code',
  type: 'text',
  defaultValue: 'DEFAULT',
  access: { update: onlyAdminsCanUpdate },
} as const

export const Docs: CollectionConfig = {
  slug: 'docs',
  admin: {
    useAsTitle: 'title',
  },
  versions: {
    drafts: true,
  },
  fields: [
    { name: 'title', type: 'text' },
    {
      name: 'outer',
      type: 'array',
      fields: [
        { name: 'label', type: 'text' },
        {
          name: 'inner',
          type: 'array',
          fields: [code, { name: 'text', type: 'text' }],
        },
      ],
    },
    {
      name: 'single',
      type: 'array',
      fields: [code, { name: 'text', type: 'text' }],
    },
  ],
}

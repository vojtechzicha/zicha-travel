import type { CollectionConfig } from 'payload'
import { adminRoleOnly } from '../lib/access'

// Receipts and other files attached to expenses ("účtenky"). Separate from
// the `media` collection (icons/backgrounds) so field uploads stay quick:
// no required alt text, images + PDF only. No generated imageSizes — with
// S3 clientUploads the file bypasses the server, so sharp resizing would
// only run on some deployments; the frontend renders the original scaled
// down instead.
export const ExpenseAttachments: CollectionConfig = {
  slug: 'expense-attachments',
  labels: {
    singular: { en: 'Expense Attachment', cs: 'Příloha výdaje' },
    plural: { en: 'Expense Attachments', cs: 'Přílohy výdajů' },
  },
  admin: {
    description: {
      en: 'Receipts and other expense attachments (photos, PDF)',
      cs: 'Účtenky a další přílohy výdajů (fotky, PDF)',
    },
    group: { en: 'System', cs: 'Systém' },
  },
  access: {
    // Receipts are for signed-in eyes only (compliance blocker 1): reading
    // the documents AND the file route (/api/expense-attachments/file/...)
    // requires an authenticated account. The slug API additionally strips
    // attachments from expenses it ships to anonymous viewers.
    read: ({ req: { user } }) => Boolean(user),
    // Any signed-in account may upload a receipt — frontend users attach
    // them while authoring expenses (see lib/expenseAuthoring). Managing
    // existing attachment documents stays admin-only; the frontend only
    // ever links/unlinks them from an expense.
    create: ({ req: { user } }) => !!user,
    update: adminRoleOnly,
    delete: adminRoleOnly,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      admin: {
        description: {
          en: 'Optional description of the attachment',
          cs: 'Volitelný popis přílohy',
        },
      },
    },
  ],
  upload: {
    // image/* keeps the mobile file picker offering "Take Photo"
    mimeTypes: ['image/*', 'application/pdf'],
  },
}

import type { CollectionConfig } from 'payload'

// Receipts and other files attached to expenses ("účtenky"). Separate from
// the `media` collection (icons/backgrounds) so field uploads stay quick:
// no required alt text, images + PDF only. No generated imageSizes — with
// S3 clientUploads the file bypasses the server, so sharp resizing would
// only run on some deployments; the frontend renders the original scaled
// down instead.
export const ExpenseAttachments: CollectionConfig = {
  slug: 'expense-attachments',
  labels: {
    singular: 'Expense Attachment',
    plural: 'Expense Attachments',
  },
  admin: {
    description: 'Účtenky a další přílohy výdajů (fotky, PDF)',
    group: 'System',
  },
  access: {
    // Public read access for API consumption (consistent with all other
    // collections - attachment files are publicly readable by URL)
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      admin: {
        description: 'Optional description of the attachment',
      },
    },
  ],
  upload: {
    // image/* keeps the mobile file picker offering "Take Photo"
    mimeTypes: ['image/*', 'application/pdf'],
  },
}

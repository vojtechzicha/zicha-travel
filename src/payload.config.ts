import { s3Storage } from '@payloadcms/storage-s3'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Chatas } from './collections/Chatas'
import { Participants } from './collections/Participants'
import { Expenses } from './collections/Expenses'
import { ExpenseAttachments } from './collections/ExpenseAttachments'
import { Prepayments } from './collections/Prepayments'
import { JointAccounts } from './collections/JointAccounts'
import { Backgrounds } from './collections/Backgrounds'
import { Icons } from './collections/Icons'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: '- zicha.travel',
    },
    components: {
      graphics: {
        Logo: './components/admin/Logo',
        Icon: './components/admin/Icon',
      },
      views: {
        login: {
          Component: './components/admin/LoginView',
        },
      },
      beforeDashboard: ['./components/admin/BeforeDashboard'],
    },
  },
  collections: [Users, Media, Chatas, Participants, Expenses, ExpenseAttachments, Prepayments, JointAccounts, Backgrounds, Icons],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
  }),
  sharp,
  plugins: [
    // Cloud media storage (Supabase Storage / any S3-compatible bucket).
    //
    // The plugin is ALWAYS added to the config (not conditionally) so that
    // `payload generate:importmap` deterministically includes the plugin's
    // admin components (e.g. S3ClientUploadHandler) regardless of environment.
    // If it were only added when S3_ENDPOINT is set, an importMap generated
    // without S3 env would omit those components, and production (where S3 IS
    // configured) would fail at runtime with "PayloadComponent not found in
    // importMap" — rendering the admin panel blank.
    //
    // Behaviour is gated via `enabled`: when S3_ENDPOINT is unset (local dev)
    // the plugin is disabled and Payload falls back to local-disk storage.
    s3Storage({
      enabled: Boolean(process.env.S3_ENDPOINT),
      disableLocalStorage: Boolean(process.env.S3_ENDPOINT),
      collections: {
        media: true,
        'expense-attachments': {
          prefix: 'expense-attachments',
        },
      },
      // Upload straight from the browser to the bucket via presigned URLs.
      // Vercel serverless caps request bodies at ~4.5 MB, which phone camera
      // photos routinely exceed; direct uploads bypass that limit. No effect
      // when the plugin is disabled (Fly / local dev - uploads go through the
      // server to disk as before).
      clientUploads: true,
      bucket: process.env.S3_BUCKET || '',
      config: {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || 'us-east-1',
        // Supabase Storage (and most non-AWS S3) require path-style URLs.
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        },
      },
    }),
  ],
})

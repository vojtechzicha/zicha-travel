import type { CollectionConfig } from 'payload'
import { parseCookies } from 'payload'
import jwt from 'jsonwebtoken'
import { isAdminRole, isSuperadmin } from '../lib/access'
import { cleanupDeletedUserReferences } from '../utils/userCleanup'

const isOAuthEnabled = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)

export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: { en: 'User', cs: 'Uživatel' },
    plural: { en: 'Users', cs: 'Uživatelé' },
  },
  admin: {
    useAsTitle: 'email',
    group: { en: 'System', cs: 'Systém' },
    defaultColumns: ['email', 'name', 'role'],
  },
  auth: {
    // With Microsoft OAuth configured the local email+password strategy is
    // disabled (production); without it (local dev) password login stays
    // available for bootstrap.
    ...(isOAuthEnabled ? { disableLocalStrategy: { enableFields: true } } : {}),
    strategies: [
      {
        // Verifies the `payload-token` cookie JWTs that BOTH login flows
        // (Microsoft OAuth callback and magic-link verify) sign with
        // PAYLOAD_SECRET. Always registered — magic-link sessions must work
        // even where OAuth env vars are absent.
        name: 'app-jwt',
        authenticate: async ({ payload, headers }) => {
          const cookies = parseCookies(headers)
          const token = cookies.get('payload-token')
          if (!token) return { user: null }

          try {
            const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as {
              id: string
              collection: string
              email: string
            }
            if (decoded.collection !== 'users') return { user: null }

            // depth 0: populating assignedChatas would run the expensive
            // Chatas afterRead stats hook on every authenticated request
            const user = await payload.findByID({
              collection: 'users',
              id: decoded.id,
              depth: 0,
            })
            if (!user) return { user: null }

            return { user: { ...user, collection: 'users' as const } }
          } catch {
            return { user: null }
          }
        },
      },
    ],
  },
  hooks: {
    // Deleting an account must not leave dangling references (compliance
    // blocker 6): unlink participants, clear expense stamps, drop the
    // account's own claim requests. Shared with the retention job.
    //
    // This MUST run BEFORE the row goes: `claim_requests.user_id` is NOT
    // NULL with ON DELETE SET NULL, so Postgres refuses to delete a user
    // who has any claim request — an afterDelete hook would never be
    // reached. The other references (participants.account, the expense
    // stamps) are nullable, and the database clears them at delete time,
    // which would leave an afterDelete pass nothing to find. Doing the
    // work here makes the cleanup deterministic in both cases.
    //
    // Failure is deliberately NOT swallowed: an aborted delete that keeps
    // the account intact beats a half-deleted one. The retention job logs
    // it per user and retries on its next run.
    beforeDelete: [
      async ({ id, req }) => {
        await cleanupDeletedUserReferences(req.payload, id as number)
      },
    ],
    // Payload's own login op (local email+password strategy — the fallback
    // where Microsoft OAuth is not configured). The OAuth callback and
    // magic-link verify routes stamp lastLoginAt themselves.
    afterLogin: [
      async ({ req, user }) => {
        try {
          await req.payload.update({
            collection: 'users',
            id: user.id,
            data: { lastLoginAt: new Date().toISOString() },
            overrideAccess: true,
            depth: 0,
          })
        } catch {
          // stamping must never break the login itself
        }
        return user
      },
    ],
  },
  access: {
    // Only admin roles may enter the admin panel — frontend accounts
    // (role "user") sign in on the site itself.
    admin: ({ req: { user } }) => isAdminRole(user),
    // Admins need to read users to link accounts to participants; a plain
    // user can only read their own account (for /api/users/me).
    read: ({ req: { user } }) => {
      if (!user) return false
      if (isAdminRole(user)) return true
      return { id: { equals: user.id } }
    },
    create: ({ req: { user } }) => isSuperadmin(user),
    update: ({ req: { user } }) => isSuperadmin(user),
    delete: ({ req: { user } }) => isSuperadmin(user),
  },
  fields: [
    // Email added by default
    {
      // Display name of the account ("Kateřina Rechová") — shown in the
      // frontend header pill and used for avatar initials. Participants
      // linked to this account fall back to it where their own name forms
      // are missing.
      name: 'name',
      type: 'text',
      admin: {
        description: {
          en: 'Full display name shown on the frontend (e.g. "Kateřina Rechová")',
          cs: 'Celé zobrazované jméno na webu (např. „Kateřina Rechová“)',
        },
      },
    },
    {
      name: 'vokativ',
      type: 'text',
      label: { en: 'Vocative (Czech "vokativ")', cs: 'Vokativ (5. pád)' },
      admin: {
        description: {
          en:
            'First name in the vocative case, e.g. "Katko" — used for the personal ' +
            'greeting ("Ahoj, Katko."). Falls back to the participant/account name.',
          cs:
            'Křestní jméno v 5. pádě, např. „Katko“ – používá se pro osobní ' +
            'pozdrav („Ahoj, Katko.“). Když chybí, použije se jméno účastníka/účtu.',
        },
      },
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'user',
      options: [
        {
          label: { en: 'Superadmin (all chatas)', cs: 'Superadmin (všechny chaty)' },
          value: 'superadmin',
        },
        {
          label: { en: 'Admin (assigned chatas)', cs: 'Správce (přiřazené chaty)' },
          value: 'admin',
        },
        {
          label: { en: 'User (frontend only)', cs: 'Uživatel (jen web)' },
          value: 'user',
        },
      ],
      admin: {
        description: {
          en:
            'Superadmins manage everything; admins manage only their assigned chatas; ' +
            'users sign in on the frontend and see their own participant finances.',
          cs:
            'Superadmini spravují vše; správci jen své přiřazené chaty; uživatelé ' +
            'se přihlašují na webu a vidí finance svých účastníků.',
        },
      },
      access: {
        // Only superadmins may grant/change roles
        update: ({ req: { user } }) => isSuperadmin(user),
      },
    },
    {
      name: 'assignedChatas',
      type: 'relationship',
      relationTo: 'chatas',
      hasMany: true,
      admin: {
        description: {
          en: 'Chatas this admin can manage (only applies to the admin role)',
          cs: 'Chaty, které tento správce může spravovat (platí jen pro roli správce)',
        },
        condition: (data) => data.role === 'admin',
      },
    },
    {
      // Linked participants (participants.account points here). One row per
      // chata the person takes part in.
      name: 'participants',
      type: 'join',
      collection: 'participants',
      on: 'account',
      admin: {
        description: {
          en: 'Participants this account is linked to (one per chata)',
          cs: 'Účastníci propojení s tímto účtem (jeden na chatu)',
        },
      },
    },
    {
      // "Active account" marker: set on every successful login. A
      // participant linked to an account is hidden from anonymous visitors
      // only once the account is active (lastLoginAt set) — before the first
      // login everything behaves as if the account did not exist.
      name: 'lastLoginAt',
      type: 'date',
      admin: {
        readOnly: true,
        description: {
          en:
            'Set on every successful login. Participants linked to this account are ' +
            'hidden from anonymous visitors only after the first login.',
          cs:
            'Nastavuje se při každém úspěšném přihlášení. Účastníci propojení s tímto ' +
            'účtem se anonymním návštěvníkům skryjí až po prvním přihlášení.',
        },
        date: { displayFormat: 'yyyy-MM-dd HH:mm' },
      },
    },
    // Magic-link login state — a sha256 hash of the emailed token, never
    // exposed through the API.
    {
      name: 'loginToken',
      type: 'text',
      hidden: true,
      access: {
        read: () => false,
        update: () => false,
      },
    },
    {
      name: 'loginTokenExpires',
      type: 'date',
      hidden: true,
      access: {
        read: () => false,
        update: () => false,
      },
    },
  ],
}

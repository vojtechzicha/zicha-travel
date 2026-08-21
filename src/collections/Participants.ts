import crypto from 'crypto'
import type { CollectionConfig, FieldAccess, PayloadRequest, Where } from 'payload'
import type { Participant } from '../payload-types'
import { refId, syncPaidByInvitations } from '../utils/paidByInvitations'
import { anonymizeParticipant, exportParticipantBundle } from '../utils/participantRights'
import { adminRoleOnly, canManageChata, chataScopedAccess, isSuperadmin } from '../lib/access'
import { pickValidationMessage } from '../i18n/adminTranslations'
import { isOAuthConfigured } from '../lib/auth/config'

const isOAuthEnabled = isOAuthConfigured()

// Who may READ a participant's bank fields (compliance blocker 1, controller
// decisions 6 and 13): the chata's admins, the owner account, the banker's
// account — and everyone for the BANKER's own fields, because the anonymous
// QR settlement needs them. Enforced here at the field level so REST and
// GraphQL obey it; the slug API applies the same rule via lib/privacyScrub.
// Lookups are cached per request (list views read many rows per chata).
const bankFieldReadAccess: FieldAccess = async ({ req, doc }) => {
  if (isSuperadmin(req.user)) return true
  if (!doc) return false
  const chataId = doc.chata != null ? refId(doc.chata) : null
  if (chataId == null) return false
  if (canManageChata(req.user, chataId)) return true

  const cache = req.context as Record<string, unknown>
  const bankerKey = `zt:bankerOf:${chataId}`
  let bankerId = cache[bankerKey] as string | null | undefined
  if (bankerId === undefined) {
    try {
      const chata = await req.payload.findByID({
        collection: 'chatas',
        id: chataId,
        depth: 0,
        overrideAccess: true,
        context: { triggerAfterRead: false },
      })
      bankerId = chata?.banker != null ? refId(chata.banker) : null
    } catch {
      bankerId = null
    }
    cache[bankerKey] = bankerId
  }

  // the banker's own account is public — the anonymous settlement QR needs it
  if (bankerId != null && String(doc.id) === bankerId) return true
  if (!req.user) return false
  // the owner account sees their own fields
  if (doc.account != null && refId(doc.account) === String(req.user.id)) return true
  // the banker's account sees every creditor's fields (refund view)
  if (bankerId != null) {
    const accountKey = `zt:bankerAccountOf:${chataId}`
    let bankerAccount = cache[accountKey] as string | null | undefined
    if (bankerAccount === undefined) {
      try {
        const banker = await req.payload.findByID({
          collection: 'participants',
          id: bankerId,
          depth: 0,
          overrideAccess: true,
        })
        bankerAccount = banker?.account != null ? refId(banker.account) : null
      } catch {
        bankerAccount = null
      }
      cache[accountKey] = bankerAccount
    }
    if (bankerAccount != null && bankerAccount === String(req.user.id)) return true
  }
  return false
}

export const Participants: CollectionConfig = {
  slug: 'participants',
  labels: {
    singular: { en: 'Participant', cs: 'Účastník' },
    plural: { en: 'Participants', cs: 'Účastníci' },
  },
  endpoints: [
    {
      // Retroactive sync of the standing "paid by" invitation onto all
      // existing expenses of this participant's chata (see the
      // ApplyPaidByButton on the edit form)
      path: '/:id/apply-paid-by',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const id = req.routeParams?.id as string | undefined
        if (!id) {
          return Response.json({ error: 'Missing participant id' }, { status: 400 })
        }
        const participant = await req.payload.findByID({
          collection: 'participants',
          id,
          depth: 0,
        })
        const chataId = refId(participant.chata)
        if (!canManageChata(req.user, chataId)) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        const result = await syncPaidByInvitations(req.payload, participant)
        return Response.json(result)
      },
    },
    {
      // Create a frontend user account for this participant (or link an
      // existing one found by email). No invitation/notification is sent —
      // the person only gets an email when they later request a login link.
      path: '/:id/create-account',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const id = req.routeParams?.id as string | undefined
        if (!id) {
          return Response.json({ error: 'Missing participant id' }, { status: 400 })
        }
        const participant = await req.payload.findByID({
          collection: 'participants',
          id,
          depth: 0,
        })
        const chataId = refId(participant.chata)
        if (!canManageChata(req.user, chataId)) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        let email: unknown
        try {
          const body = await req.json?.()
          email = body?.email
        } catch {
          email = undefined
        }
        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          return Response.json({ error: 'A valid email is required' }, { status: 400 })
        }
        const normalizedEmail = email.trim().toLowerCase()

        const existing = await req.payload.find({
          collection: 'users',
          where: { email: { equals: normalizedEmail } },
          limit: 1,
          depth: 0,
        })

        let userId: number
        let created = false
        if (existing.docs.length > 0) {
          const user = existing.docs[0]
          userId = user.id
          // Fill only MISSING name forms from the participant — an account
          // may span several chatas and its own names win
          const nameFill = {
            ...(!user.name && participant.name ? { name: participant.name } : {}),
            ...(!user.vokativ && participant.vokativ ? { vokativ: participant.vokativ } : {}),
          }
          if (Object.keys(nameFill).length > 0) {
            await req.payload.update({
              collection: 'users',
              id: user.id,
              data: nameFill,
              overrideAccess: true,
              depth: 0,
            })
          }
        } else {
          const newUser = await req.payload.create({
            collection: 'users',
            data: {
              email: normalizedEmail,
              role: 'user' as const,
              // Prefill the account's display name forms from the participant
              // (the frontend greeting/header fall back to these)
              ...(participant.name ? { name: participant.name } : {}),
              ...(participant.vokativ ? { vokativ: participant.vokativ } : {}),
              // The local (password) strategy only exists where OAuth is not
              // configured — give it an unguessable throwaway password there
              ...(isOAuthEnabled
                ? {}
                : { password: crypto.randomBytes(24).toString('hex') }),
            },
          })
          userId = newUser.id
          created = true
        }

        await req.payload.update({
          collection: 'participants',
          id: participant.id,
          data: { account: userId },
        })

        return Response.json({ userId, email: normalizedEmail, created, linked: true })
      },
    },
    {
      // Rights machinery (compliance blocker 6): one person's complete data
      // bundle for an Art. 15 access/copy request — admin button on the
      // participant form. Never leaks other people's rows.
      path: '/:id/export-data',
      method: 'get',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const id = req.routeParams?.id as string | undefined
        if (!id) {
          return Response.json({ error: 'Missing participant id' }, { status: 400 })
        }
        let participant
        try {
          participant = await req.payload.findByID({ collection: 'participants', id, depth: 0 })
        } catch {
          return Response.json({ error: 'Participant not found' }, { status: 404 })
        }
        if (!canManageChata(req.user, refId(participant.chata))) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        const bundle = await exportParticipantBundle(req.payload, participant.id)
        return Response.json(bundle)
      },
    },
    {
      // Rights machinery (compliance blocker 6): erasure that keeps the
      // arithmetic — placeholder name, cleared contact/bank/assignment data,
      // amounts and shares stay so the group's settlement still adds up.
      path: '/:id/anonymize',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const id = req.routeParams?.id as string | undefined
        if (!id) {
          return Response.json({ error: 'Missing participant id' }, { status: 400 })
        }
        let participant
        try {
          participant = await req.payload.findByID({ collection: 'participants', id, depth: 0 })
        } catch {
          return Response.json({ error: 'Participant not found' }, { status: 404 })
        }
        if (!canManageChata(req.user, refId(participant.chata))) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        const summary = await anonymizeParticipant(req.payload, participant.id)
        return Response.json({ ok: true, ...summary })
      },
    },
  ],
  hooks: {
    afterChange: [
      // The account link moved (a claim was approved, an admin re-linked or
      // unlinked the participant): re-stamp Expense.payerAccount on this
      // participant's expenses. That field is what makes an expense somebody
      // recorded FOR this person visible to — and editable by — their
      // account, and access filters cannot join to find it.
      async ({ doc, previousDoc, operation, req }) => {
        if (operation !== 'update') return doc
        const before = previousDoc?.account != null ? refId(previousDoc.account) : null
        const after = doc.account != null ? refId(doc.account) : null
        if (before === after) return doc
        try {
          const expenses = await req.payload.find({
            collection: 'expenses',
            where: { 'payer.value': { equals: doc.id } },
            limit: 1000,
            depth: 0,
            overrideAccess: true,
          })
          for (const expense of expenses.docs) {
            // A polymorphic value query can also match a joint account that
            // happens to share the id — only real participant payers count
            const payer = expense.payer as
              | { relationTo?: string; value?: number | { id: number } }
              | null
            if (payer?.relationTo !== 'participants' || refId(payer.value) !== String(doc.id)) {
              continue
            }
            await req.payload.update({
              collection: 'expenses',
              id: expense.id,
              data: { payerAccount: after != null ? Number(after) : null },
              overrideAccess: true,
              depth: 0,
              // a re-link is not a decision — no approval mail, no reset
              context: { expenseDecision: true, skipExpenseApprovalEffects: true },
            })
          }
        } catch (err) {
          req.payload.logger.error(
            { err, participant: doc.id },
            'Failed to re-sync payerAccount after an account link change',
          )
        }
        return doc
      },
    ],
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'chata', 'accountNumber'],
    group: { en: 'Expense Tracking', cs: 'Evidence výdajů' },
  },
  access: {
    // Public read access for API consumption
    read: () => true,
    // Admin roles only; admins are limited to their assigned chatas
    create: adminRoleOnly,
    update: chataScopedAccess,
    delete: chataScopedAccess,
  },
  fields: [
    {
      name: 'copyFrom',
      type: 'ui',
      admin: {
        components: {
          Field:
            '@/collections/Participants/components/CopyFromParticipantButton#CopyFromParticipantButton',
        },
        // Prefill helper for repeating participants — only relevant on create
        condition: (data) => !data?.id,
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: {
          en: 'Participant\'s full name',
          cs: 'Celé jméno účastníka',
        },
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'akuzativ',
          type: 'text',
          label: { en: 'Accusative (Czech "akuzativ")', cs: 'Akuzativ (4. pád)' },
          admin: {
            description: {
              en:
                'Name in the accusative case, e.g. "Katku" — used in phrases like ' +
                '"Vojta zve Katku". Falls back to the plain name when empty.',
              cs:
                'Jméno ve 4. pádě, např. „Katku“ – používá se ve frázích jako ' +
                '„Vojta zve Katku“. Když je prázdné, použije se běžné jméno.',
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
                'Name in the vocative case, e.g. "Katko" — stored for future ' +
                'greetings, not displayed anywhere yet.',
              cs:
                'Jméno v 5. pádě, např. „Katko“ – uloženo pro budoucí oslovení, ' +
                'zatím se nikde nezobrazuje.',
            },
          },
        },
      ],
    },
    {
      name: 'chata',
      type: 'relationship',
      relationTo: 'chatas',
      required: true,
      admin: {
        description: {
          en: 'The trip/chata this participant belongs to',
          cs: 'Chata/výlet, kam tento účastník patří',
        },
      },
    },
    {
      name: 'hasPet',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: {
          en: 'Participant is travelling with a pet',
          cs: 'Účastník cestuje s domácím mazlíčkem',
        },
      },
    },
    {
      name: 'paidBy',
      type: 'relationship',
      relationTo: 'participants',
      admin: {
        description: {
          en:
            'This participant\'s expense shares are permanently covered by another ' +
            'participant (e.g. a child paid by a parent). New expenses automatically ' +
            'get a standing invitation; use the button below to apply the SAVED ' +
            'value to existing expenses.',
          cs:
            'Podíly tohoto účastníka na výdajích trvale hradí jiný účastník ' +
            '(např. dítě, za které platí rodič). Nové výdaje dostanou trvalé ' +
            'pozvání automaticky; tlačítkem níže promítnete ULOŽENOU hodnotu ' +
            'do existujících výdajů.',
        },
        condition: (data) => Boolean(data?.chata),
        components: {
          afterInput: ['@/collections/Participants/components/ApplyPaidByButton#ApplyPaidByButton'],
        },
      },
      filterOptions: ({ data, id }) => {
        const doc = data as Partial<Participant> | undefined
        if (!doc?.chata) return false
        const conditions: Where[] = [
          {
            chata: { equals: typeof doc.chata === 'object' ? doc.chata.id : doc.chata },
          },
        ]
        if (id) {
          conditions.push({ id: { not_equals: id } })
        }
        return { and: conditions }
      },
      validate: (value: unknown, { id, req }: { id?: unknown; req?: PayloadRequest }) => {
        const ref = value as null | undefined | number | string | { id: number | string }
        const refValue = typeof ref === 'object' && ref !== null ? ref.id : ref
        if (refValue !== null && refValue !== undefined && id && String(refValue) === String(id)) {
          return pickValidationMessage(
            req,
            'A participant cannot be paid by themselves',
            'Účastník nemůže platit sám za sebe',
          )
        }
        return true
      },
    },
    {
      type: 'collapsible',
      label: { en: 'Banking Information', cs: 'Bankovní údaje' },
      admin: {
        description: {
          en: 'Required only for creditors who will receive money back',
          cs: 'Potřeba jen u věřitelů, kterým se budou vracet peníze',
        },
        initCollapsed: true,
      },
      fields: [
        {
          name: 'accountNumber',
          type: 'text',
          access: {
            read: bankFieldReadAccess,
          },
          admin: {
            description: {
              en: 'Account number in Czech format (e.g., "123456/0100") - only needed for creditors',
              cs: 'Číslo účtu v českém formátu (např. „123456/0100“) – potřeba jen u věřitelů',
            },
            components: {
              Field:
                '@/components/CzechBankAccountField#CzechBankAccountField',
            },
            custom: {
              siblingPath: 'iban',
              direction: 'toIban',
            },
          },
        },
        {
          name: 'iban',
          type: 'text',
          access: {
            read: bankFieldReadAccess,
          },
          admin: {
            description: {
              en: 'Full IBAN for QR code generation - only needed for creditors',
              cs: 'Celý IBAN pro generování QR kódu – potřeba jen u věřitelů',
            },
            components: {
              Field:
                '@/components/CzechBankAccountField#CzechBankAccountField',
            },
            custom: {
              siblingPath: 'accountNumber',
              direction: 'toAccount',
            },
          },
        },
      ],
    },
    {
      // Frontend user account of this person — a participant belongs to at
      // most ONE user, but one user may own several participants (even in
      // the same chata, e.g. a parent and their children). Signed-in users
      // see only their own participants; admins/superadmins keep the full
      // selector. A participant is hidden from anonymous visitors only once
      // the account is ACTIVE (has logged in at least once).
      name: 'account',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        description: {
          en:
            'User account linked to this participant ("účet"). Use the button below to ' +
            'create a new account from an email — nothing is emailed until the person ' +
            'requests a login link themselves.',
          cs:
            'Uživatelský účet propojený s tímto účastníkem. Tlačítkem níže vytvoříte ' +
            'nový účet z e-mailu – nic se neposílá, dokud si dotyčný sám nevyžádá ' +
            'přihlašovací odkaz.',
        },
        components: {
          afterInput: [
            // Empty name/vokativ prefill from the selected account's display name
            '@/collections/Participants/components/AccountNamePrefill#AccountNamePrefill',
            '@/collections/Participants/components/CreateAccountButton#CreateAccountButton',
          ],
        },
      },
    },
    {
      // Art. 14 notice nudge (blocker 8): copyable message for the group
      // chat telling the participant they are in the system and what one
      // sign-in hides
      name: 'art14Notice',
      type: 'ui',
      admin: {
        components: {
          Field: '@/collections/Participants/components/Art14NoticeBox#Art14NoticeBox',
        },
        condition: (data) => Boolean(data?.id),
      },
    },
    {
      // Data-subject rights actions (blocker 6): export bundle + anonymize
      name: 'rightsActions',
      type: 'ui',
      admin: {
        components: {
          Field:
            '@/collections/Participants/components/RightsActionsButtons#RightsActionsButtons',
        },
        condition: (data) => Boolean(data?.id),
      },
    },
  ],
  // Note: Unique constraint on chata+name handled by application logic
  // Payload 3.x doesn't support compound unique indexes via config
}

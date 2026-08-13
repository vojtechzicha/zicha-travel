import { APIError, type Access, type CollectionConfig, type Where } from 'payload'
import type { Expense } from '../payload-types'
import { buildAutoInvitations, findPaidByPairs } from '../utils/paidByInvitations'
import { canManageChata, isAdminRole, isSuperadmin, refId } from '../lib/access'
import {
  canDecideExpense,
  isAllowedPayer,
  linkedParticipantIds,
  needsApproval,
  normalizePayer,
  payerAccountIds,
} from '../lib/expenseAuthoring'
import { verifyExpenseDecideToken } from '../lib/expenseApproval'
import { requestOrigin } from '../lib/auth/session'
import {
  bankerParticipant,
  chataOrigin,
  expensePayerContext,
  notifyExpenseApprovers,
  notifyExpenseAuthor,
} from '../utils/expenseApproval'
import { pickValidationMessage } from '../i18n/adminTranslations'

// Write access: superadmin everything, admin their assigned chatas, and a
// frontend account (role "user") the expenses it authored itself
// (Expense.authoredBy) plus the ones somebody recorded FOR it
// (Expense.payerAccount — see docs in lib/expenseAuthoring).
const expenseWriteAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperadmin(user)) return true
  // An admin outside their assigned chatas is just a participant like anyone
  // else: in OTHER chatas they keep only what they authored or paid for
  const own: Where[] = [
    { authoredBy: { equals: user.id } },
    { payerAccount: { equals: user.id } },
  ]
  if (user.role === 'admin') {
    const where: Where = {
      or: [{ chata: { in: user.assignedChatas || [] } }, ...own],
    }
    return where
  }
  const where: Where = { or: own }
  return where
}

// Read stays public — like every other collection here — EXCEPT expenses
// waiting for (or refused) approval: those are a claim about somebody else's
// money and must not surface anywhere until confirmed. The people involved
// (author, payer) still see their own; an admin sees everything in the chatas
// they manage, and nothing extra elsewhere. The banker and the frontend go
// through the slug API (local API, access overridden), which applies the same
// rule with the chata context it has.
const expenseReadAccess: Access = ({ req: { user } }) => {
  if (isSuperadmin(user)) return true
  const visible: Where[] = [
    { approvalStatus: { equals: 'approved' } },
    { approvalStatus: { exists: false } },
  ]
  if (user) {
    visible.push({ authoredBy: { equals: user.id } }, { payerAccount: { equals: user.id } })
    if (user.role === 'admin') {
      visible.push({ chata: { in: user.assignedChatas || [] } })
    }
  }
  return { or: visible }
}

export const Expenses: CollectionConfig = {
  slug: 'expenses',
  labels: {
    singular: { en: 'Expense', cs: 'Výdaj' },
    plural: { en: 'Expenses', cs: 'Výdaje' },
  },
  hooks: {
    beforeChange: [
      // Frontend authoring guard + authorship stamp. Authority is scoped to
      // THIS chata, never to the bare role: an admin of one chata is an
      // ordinary participant in every other, and gets the same rules as a
      // frontend account there. Those rules: the expense must live in a chata
      // where they own a participant, the payer must belong to that chata
      // (their own, a joint account with one of them as member, or — held for
      // confirmation — somebody else's), and the chata of an existing expense
      // can never be moved.
      async ({ data, operation, req, originalDoc }) => {
        const user = req.user
        // The decide endpoint writes the approval verdict itself; re-running
        // the guard here would reset the very status it is setting
        if (req.context?.expenseDecision === true) return data

        const original = originalDoc as Expense | undefined
        const chataId = refId(operation === 'create' ? data.chata : (original?.chata ?? data.chata))
        // Who is writing: an admin OF THIS CHATA (or a superadmin) keeps the
        // admin-panel rules; everybody else goes through the guard below
        const managesThisChata = canManageChata(user, chataId)

        if (operation === 'create') {
          // Local API scripts have no user — leave authoredBy unset there
          if (user) data.authoredBy = user.id
        } else if (data && 'authoredBy' in data && user && !managesThisChata) {
          // authorship is server-assigned; frontend accounts cannot change it
          data.authoredBy = originalDoc?.authoredBy ?? user.id
        }
        if (managesThisChata) {
          // An admin-panel decision (status flipped by hand) records itself
          if (
            operation === 'update' &&
            data?.approvalStatus != null &&
            data.approvalStatus !== originalDoc?.approvalStatus &&
            data.approvalStatus !== 'pending'
          ) {
            data.approvalDecidedBy = data.approvalDecidedBy ?? user?.id ?? null
            data.approvalDecidedAt = data.approvalDecidedAt ?? new Date().toISOString()
          }
          return data
        }
        if (!user) return data

        // The approval verdict is server-owned: whatever a frontend account
        // put in these fields is dropped here, so the derivation below (or
        // the stored value, on the early returns) is the only source
        delete data.approvalStatus
        delete data.approvalDecidedBy
        delete data.approvalDecidedAt
        delete data.approvalNote

        if (operation === 'update' && data?.chata != null && original?.chata != null) {
          if (refId(data.chata) !== refId(original.chata)) {
            throw new APIError('Výdaj nelze přesunout do jiné chaty', 403)
          }
        }
        if (!chataId || chataId === 'undefined' || chataId === 'null') {
          throw new APIError('Výdaj musí patřit k chatě', 400)
        }

        const participantsResult = await req.payload.find({
          collection: 'participants',
          where: { chata: { equals: chataId } },
          limit: 1000,
          depth: 0,
          overrideAccess: true,
        })
        const ownIds = linkedParticipantIds(user.id, participantsResult.docs)
        if (ownIds.length === 0) {
          throw new APIError('Na této chatě nemáte propojeného účastníka', 403)
        }

        const payer = normalizePayer(data?.payer ?? original?.payer)
        if (!payer) {
          throw new APIError('Výdaj musí mít plátce', 400)
        }

        // Who is named as the payer, and may this author speak for them?
        // Anybody of THIS chata may be named; whether the author speaks for
        // them decides whether the expense counts right away or waits.
        let payerIsOwn: boolean
        if (payer.relationTo === 'joint-accounts') {
          const jointAccountsResult = await req.payload.find({
            collection: 'joint-accounts',
            where: { chata: { equals: chataId } },
            limit: 1000,
            depth: 0,
            overrideAccess: true,
          })
          const payerJointAccount = jointAccountsResult.docs.find(
            (ja) => String(ja.id) === refId(payer.value),
          )
          if (!payerJointAccount) {
            throw new APIError('Plátcem může být jen společný účet této chaty', 400)
          }
          payerIsOwn = isAllowedPayer(payer, ownIds, jointAccountsResult.docs)
        } else {
          const payerParticipant = participantsResult.docs.find(
            (p) => String(p.id) === refId(payer.value),
          )
          if (!payerParticipant) {
            throw new APIError('Plátce musí být účastník této chaty', 400)
          }
          payerIsOwn = ownIds.includes(String(payerParticipant.id))
        }

        // "Výdaj za jiného plátce": stored, but invisible and outside the
        // maths until the payer, the banker or a chata admin confirms it.
        // Editing one puts it back in the queue — an approved amount must
        // not be changeable after the fact.
        data.approvalStatus = needsApproval({ isAdmin: false, payerIsOwn }) ? 'pending' : 'approved'
        data.approvalDecidedBy = null
        data.approvalDecidedAt = null
        data.approvalNote = null

        return data
      },
      // Keep Expense.payerAccount in sync with the payer's linked account.
      // It is what makes an expense recorded FOR somebody theirs to see and
      // correct, and it drives the write-access filter, which cannot join.
      async ({ data, operation, req, originalDoc }) => {
        if (req.context?.expenseDecision === true) return data
        // PATCH without a payer keeps the stored value — the field is
        // server-owned, so a submitted value is dropped, never honoured
        if (operation === 'update' && data?.payer === undefined) {
          if (data && 'payerAccount' in data) delete data.payerAccount
          return data
        }
        const payer = normalizePayer(data?.payer ?? originalDoc?.payer)
        if (!payer || payer.relationTo !== 'participants') {
          data.payerAccount = null
          return data
        }
        const participant = await req.payload
          .findByID({
            collection: 'participants',
            id: refId(payer.value),
            depth: 0,
            overrideAccess: true,
          })
          .catch(() => null)
        data.payerAccount = participant?.account != null ? Number(refId(participant.account)) : null
        return data
      },
      // Standing "paid by" invitations: on create, participants whose
      // shares are permanently covered (Participant.paidBy, e.g. kids) get
      // an auto invitation row. Deleting the row on a single expense is a
      // per-expense opt-out; the retroactive sync lives on the participant
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data
        const chataId =
          typeof data.chata === 'object' && data.chata !== null ? data.chata.id : data.chata
        if (!chataId) return data
        const pairs = await findPaidByPairs(req.payload, chataId)
        const added = buildAutoInvitations(data, pairs)
        if (added.length > 0) {
          data.invitations = [...(data.invitations || []), ...added]
        }
        return data
      },
    ],
    afterChange: [
      // Approval mail for "výdaj za jiného plátce" (docs/PRD-vydaj-za-jineho.md).
      // One place for all of it, so the composer, the decide endpoint and the
      // admin panel behave the same:
      // - a freshly pending expense asks its decision makers
      // - a decided one tells the author how it went
      // Editing an already pending expense sends nothing — the decide page
      // always shows the current numbers, so a second email would be noise.
      async ({ doc, previousDoc, operation, req }) => {
        if (req.context?.skipExpenseApprovalEffects === true) return doc
        const wasPending = operation === 'update' && previousDoc?.approvalStatus === 'pending'
        const isPending = doc.approvalStatus === 'pending'
        const decided = wasPending && (doc.approvalStatus === 'approved' || doc.approvalStatus === 'rejected')
        if (!decided && !(isPending && !wasPending)) return doc

        const payerRef = normalizePayer(doc.payer)
        const [chata, payer, author, decidedBy] = await Promise.all([
          doc.chata != null
            ? req.payload
                .findByID({
                  collection: 'chatas',
                  id: refId(doc.chata),
                  depth: 0,
                  overrideAccess: true,
                  context: { triggerAfterRead: false },
                })
                .catch(() => null)
            : null,
          expensePayerContext(req.payload, payerRef),
          doc.authoredBy != null
            ? req.payload
                .findByID({
                  collection: 'users',
                  id: refId(doc.authoredBy),
                  depth: 0,
                  overrideAccess: true,
                })
                .catch(() => null)
            : null,
          doc.approvalDecidedBy != null
            ? req.payload
                .findByID({
                  collection: 'users',
                  id: refId(doc.approvalDecidedBy),
                  depth: 0,
                  overrideAccess: true,
                })
                .catch(() => null)
            : null,
        ])
        if (!author || !payer) return doc

        try {
          if (decided) {
            await notifyExpenseAuthor(req.payload, {
              expense: doc,
              chata,
              payerName: payer.name,
              author,
              decidedBy,
            })
          } else if (chata) {
            await notifyExpenseApprovers(req.payload, {
              expense: doc,
              chata,
              payer,
              author,
              // Links land on the host the author was using; a write
              // without a request (scripts, jobs) falls back to the chata's
              // own domain
              origin: req.headers?.get('host') ? requestOrigin(req.headers) : chataOrigin(chata),
            })
          }
        } catch (err) {
          req.payload.logger.error({ err, expense: doc.id }, 'Expense approval mail failed')
        }
        return doc
      },
    ],
  },
  endpoints: [
    {
      // Decide a pending expense ("výdaj za jiného plátce"). Two credentials
      // lead here: the signed link from the notification email (token, no
      // session needed) and a signed-in approver pressing the button on the
      // expense card. Either way the CURRENT rules decide who may confirm:
      // the chata's admins, the payer's own account, the banker's account.
      path: '/decide',
      method: 'post',
      handler: async (req) => {
        let token: unknown
        let expenseId: unknown
        let action: unknown
        let reason: unknown
        try {
          const body = await req.json?.()
          token = body?.token
          expenseId = body?.expenseId
          action = body?.action
          reason = body?.reason
        } catch {
          // fall through to validation
        }
        if (action !== 'approve' && action !== 'reject') {
          return Response.json({ error: 'invalid' }, { status: 400 })
        }

        // Resolve the decider: the token names one, otherwise it is the
        // session user
        let deciderId: number | string | null = null
        if (typeof token === 'string') {
          const secret = process.env.PAYLOAD_SECRET
          if (!secret) return Response.json({ error: 'invalid' }, { status: 500 })
          const verified = verifyExpenseDecideToken(token, secret)
          if (!verified.ok) {
            return Response.json({ error: verified.code }, { status: 400 })
          }
          deciderId = verified.userId
          expenseId = verified.expenseId
        } else if (req.user) {
          deciderId = req.user.id
        }
        if (deciderId == null) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        if (typeof expenseId !== 'number' && typeof expenseId !== 'string') {
          return Response.json({ error: 'Missing expenseId' }, { status: 400 })
        }

        const [decider, expense] = await Promise.all([
          req.payload
            .findByID({ collection: 'users', id: deciderId, depth: 0, overrideAccess: true })
            .catch(() => null),
          req.payload
            .findByID({ collection: 'expenses', id: expenseId, depth: 0, overrideAccess: true })
            .catch(() => null),
        ])
        if (!expense) {
          return Response.json({ error: 'not-found' }, { status: 404 })
        }
        if (!decider) {
          return Response.json({ error: 'forbidden' }, { status: 403 })
        }

        const chata = await req.payload
          .findByID({
            collection: 'chatas',
            id: refId(expense.chata),
            depth: 0,
            overrideAccess: true,
            context: { triggerAfterRead: false },
          })
          .catch(() => null)
        const banker = chata ? await bankerParticipant(req.payload, chata) : null
        const payer = await expensePayerContext(req.payload, normalizePayer(expense.payer))

        const allowed = canDecideExpense({
          userId: decider.id,
          managesChata: canManageChata({ ...decider, collection: 'users' }, refId(expense.chata)),
          payerAccountIds: payer?.accountIds,
          bankerAccountId: banker?.account != null ? refId(banker.account) : null,
        })
        if (!allowed) {
          return Response.json({ error: 'forbidden' }, { status: 403 })
        }
        if (expense.approvalStatus !== 'pending') {
          return Response.json(
            { error: 'already-decided', status: expense.approvalStatus },
            { status: 409 },
          )
        }

        // The note is the rejection reason — an approve carries none
        const trimmedReason =
          action === 'reject' && typeof reason === 'string' ? reason.trim() : ''
        await req.payload.update({
          collection: 'expenses',
          id: expense.id,
          data: {
            approvalStatus: action === 'approve' ? 'approved' : 'rejected',
            approvalDecidedBy: Number(decider.id),
            approvalDecidedAt: new Date().toISOString(),
            approvalNote: trimmedReason || null,
          },
          overrideAccess: true,
          depth: 0,
          context: { expenseDecision: true },
        })
        return Response.json({ ok: true, action })
      },
    },
  ],
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'amount', 'payer', 'approvalStatus', 'chata'],
    group: { en: 'Expense Tracking', cs: 'Evidence výdajů' },
  },
  access: {
    // Public read — except expenses waiting for approval (see above)
    read: expenseReadAccess,
    // Admin roles, plus signed-in frontend accounts (role "user") — those
    // are further restricted by the authoring hook above (own chata, payer
    // of the chata) and may update/delete only expenses they authored or
    // that name one of their own participants as the payer
    create: ({ req: { user } }) => isAdminRole(user) || user?.role === 'user',
    update: expenseWriteAccess,
    delete: expenseWriteAccess,
  },
  fields: [
    {
      name: 'chata',
      type: 'relationship',
      relationTo: 'chatas',
      required: true,
      admin: {
        description: {
          en: 'The trip/chata this expense belongs to',
          cs: 'Chata/výlet, kam tento výdaj patří',
        },
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: {
          en: 'Description of the expense',
          cs: 'Popis výdaje',
        },
      },
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      admin: {
        description: {
          en: 'Total amount (use negative values for refunds)',
          cs: 'Celková částka (pro vratky použijte záporné hodnoty)',
        },
      },
    },
    {
      name: 'payer',
      type: 'relationship',
      // Polymorphic: a person or a joint account ("společný účet") can pay.
      // Joint-account payments are attributed equally to the members in
      // calculateStats; weights below stay participants-only.
      relationTo: ['participants', 'joint-accounts'],
      required: true,
      admin: {
        description: {
          en: 'Who paid for this expense (a participant or a joint account)',
          cs: 'Kdo tento výdaj zaplatil (účastník nebo společný účet)',
        },
        condition: (data) => Boolean(data?.chata),
      },
      filterOptions: ({ siblingData }) => {
        // Only show participants/joint accounts from the selected chata
        const data = siblingData as Partial<Expense> | undefined
        if (data?.chata) {
          return {
            chata: {
              equals: data.chata,
            },
          }
        }
        return false
      },
    },
    {
      name: 'splitType',
      type: 'select',
      required: true,
      defaultValue: 'equal',
      options: [
        {
          label: { en: 'Equal Split (ALL)', cs: 'Rovným dílem (všichni)' },
          value: 'equal',
        },
        {
          label: { en: 'Weighted Split', cs: 'Podle podílů' },
          value: 'weighted',
        },
      ],
      admin: {
        description: {
          en: 'How to split this expense among participants',
          cs: 'Jak tento výdaj rozdělit mezi účastníky',
        },
      },
    },
    {
      name: 'weights',
      type: 'array',
      admin: {
        description: {
          en: 'Weighted distribution - only used when Split Type is "Weighted"',
          cs: 'Rozdělení podle podílů – použije se jen při typu rozdělení „Podle podílů“',
        },
        condition: (data, siblingData) => Boolean(data?.chata) && siblingData?.splitType === 'weighted',
        components: {
          beforeInput: ['@/collections/Expenses/components/PrefillWeightsButton#PrefillWeightsButton'],
          afterInput: ['@/collections/Expenses/components/WeightsSumIndicator#WeightsSumIndicator'],
        },
      },
      fields: [
        {
          name: 'participant',
          type: 'relationship',
          relationTo: 'participants',
          required: true,
          admin: {
            description: {
              en: 'Participant sharing this expense',
              cs: 'Účastník, který se na tomto výdaji podílí',
            },
          },
          filterOptions: ({ data }) => {
            // siblingData is the weights array row - the chata lives on the
            // full document, which Payload passes as `data`
            const doc = data as Partial<Expense> | undefined
            if (doc?.chata) {
              return {
                chata: {
                  equals: typeof doc.chata === 'object' ? doc.chata.id : doc.chata,
                },
              }
            }
            return false
          },
        },
        {
          name: 'weight',
          type: 'number',
          required: true,
          min: 0,
          admin: {
            description: {
              en:
                'Weight multiplier for this participant (e.g., 1, 0.5, 2). If all weights ' +
                'add up to the total amount (±1 Kč), they are displayed as Kč amounts.',
              cs:
                'Váha podílu tohoto účastníka (např. 1, 0.5, 2). Pokud součet všech vah ' +
                'odpovídá celkové částce (±1 Kč), zobrazí se jako částky v Kč.',
            },
            components: {
              afterInput: ['@/collections/Expenses/components/WeightShareHint#WeightShareHint'],
            },
          },
        },
      ],
      validate: (value, { req, siblingData }) => {
        // Only validate if splitType is weighted
        const data = siblingData as Partial<Expense> | undefined
        if (data?.splitType === 'weighted') {
          if (!value || value.length === 0) {
            return pickValidationMessage(
              req,
              'At least one participant weight is required for weighted splits',
              'Rozdělení podle podílů vyžaduje alespoň jeden podíl účastníka',
            )
          }
        }
        return true
      },
    },
    {
      name: 'invitations',
      type: 'array',
      admin: {
        description: {
          en:
            'The host pays the guest\'s share of this expense. A host can invite ' +
            'multiple guests; each guest can be invited only once per expense.',
          cs:
            'Hostitel platí podíl hosta na tomto výdaji. Hostitel může pozvat víc ' +
            'hostů; každý host může být na jeden výdaj pozván jen jednou.',
        },
        condition: (data) => Boolean(data?.chata),
      },
      fields: [
        {
          name: 'host',
          type: 'relationship',
          relationTo: 'participants',
          required: true,
          admin: {
            description: {
              en: 'Who covers the share (the inviter)',
              cs: 'Kdo podíl hradí (ten, kdo zve)',
            },
          },
          filterOptions: ({ data }) => {
            const doc = data as Partial<Expense> | undefined
            if (doc?.chata) {
              return {
                chata: {
                  equals: typeof doc.chata === 'object' ? doc.chata.id : doc.chata,
                },
              }
            }
            return false
          },
        },
        {
          name: 'guest',
          type: 'relationship',
          relationTo: 'participants',
          required: true,
          admin: {
            description: {
              en: 'Whose share is covered (the invited one)',
              cs: 'Čí podíl je hrazen (pozvaný)',
            },
          },
          filterOptions: ({ data }) => {
            const doc = data as Partial<Expense> | undefined
            if (doc?.chata) {
              return {
                chata: {
                  equals: typeof doc.chata === 'object' ? doc.chata.id : doc.chata,
                },
              }
            }
            return false
          },
        },
        {
          name: 'auto',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: {
              en:
                'Standing arrangement (e.g. a parent paying for a child) - managed ' +
                'automatically from the participant\'s "Paid By" field and hidden on ' +
                'the expense card. Leave unchecked for one-off invitations, which are shown.',
              cs:
                'Trvalé ujednání (např. rodič platící za dítě) – spravuje se automaticky ' +
                'z pole „Platí za něj/ni“ účastníka a na kartě výdaje se nezobrazuje. ' +
                'U jednorázových pozvání, která se zobrazují, nechte pole nezaškrtnuté.',
            },
          },
        },
      ],
      validate: (value, { req }) => {
        const rows = (value || []) as Array<{ host?: unknown; guest?: unknown }>
        const refId = (ref: unknown): string | null => {
          if (ref === null || ref === undefined) return null
          if (typeof ref === 'object') return String((ref as { id: unknown }).id)
          return String(ref)
        }
        const seenGuests = new Set<string>()
        for (const row of rows) {
          const host = refId(row.host)
          const guest = refId(row.guest)
          if (host && guest && host === guest) {
            return pickValidationMessage(
              req,
              'A participant cannot invite themselves',
              'Účastník nemůže pozvat sám sebe',
            )
          }
          if (guest) {
            if (seenGuests.has(guest)) {
              return pickValidationMessage(
                req,
                'Each guest can be invited only once per expense',
                'Každý host může být na jeden výdaj pozván jen jednou',
              )
            }
            seenGuests.add(guest)
          }
        }
        return true
      },
    },
    {
      name: 'createdAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
      hooks: {
        beforeValidate: [
          ({ value, operation }) => {
            if (operation === 'create' && !value) {
              return new Date()
            }
            return value
          },
        ],
      },
    },
    {
      name: 'note',
      type: 'textarea',
      admin: {
        description: {
          en: 'Optional notes about this expense',
          cs: 'Volitelné poznámky k tomuto výdaji',
        },
      },
    },
    {
      name: 'attachments',
      type: 'upload',
      relationTo: 'expense-attachments',
      hasMany: true,
      admin: {
        description: {
          en: 'Receipts and other attachments (photos, PDF) - on mobile the file picker offers taking a photo directly',
          cs: 'Účtenky a další přílohy (fotky, PDF) – výběr souboru na mobilu nabízí i přímé vyfocení',
        },
      },
    },
    {
      // The signed-in account that created this expense. Set automatically
      // by the beforeChange hook; drives the frontend "Přidali jste vy"
      // footer with edit/delete. maxDepth 0 keeps it a bare ID on the
      // public read APIs (never populates the user document/email).
      name: 'authoredBy',
      type: 'relationship',
      relationTo: 'users',
      maxDepth: 0,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: {
          en: 'Account that created this expense (set automatically). Frontend users may edit/delete only their own expenses.',
          cs: 'Účet, který tento výdaj vytvořil (nastavuje se automaticky). Uživatelé webu mohou upravovat/mazat jen své vlastní výdaje.',
        },
      },
    },
    {
      // Account linked to the payer participant, kept in sync by the hook
      // above (and by the Participants hook when a link changes). An expense
      // somebody recorded FOR you is yours too: you see it while it waits,
      // you may confirm it, and you may correct or delete it afterwards.
      // maxDepth 0 keeps it a bare ID on the public read APIs.
      name: 'payerAccount',
      type: 'relationship',
      relationTo: 'users',
      maxDepth: 0,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: {
          en: 'Account of the paying participant (set automatically). They may confirm and edit this expense.',
          cs: 'Účet plátce (nastavuje se automaticky). Může tento výdaj potvrdit i upravit.',
        },
      },
    },
    {
      // "Výdaj za jiného plátce" (docs/PRD-vydaj-za-jineho.md): a frontend
      // account may record an expense somebody ELSE paid, but until it is
      // confirmed it stays out of the journal and out of every balance.
      // Admin-panel entries are approved from the start.
      name: 'approvalStatus',
      type: 'select',
      defaultValue: 'approved',
      options: [
        { label: { en: 'Approved', cs: 'Potvrzeno' }, value: 'approved' },
        { label: { en: 'Waiting for approval', cs: 'Čeká na potvrzení' }, value: 'pending' },
        { label: { en: 'Rejected', cs: 'Zamítnuto' }, value: 'rejected' },
      ],
      admin: {
        position: 'sidebar',
        description: {
          en:
            'Expenses recorded by a participant for SOMEBODY ELSE wait for the payer (if they ' +
            'have an account) or the banker. Anything but "Approved" is hidden from the site ' +
            'and left out of all balances.',
          cs:
            'Výdaj, který někdo zapsal za JINÉHO plátce, čeká na potvrzení plátce (pokud má účet) ' +
            'nebo pokladníka. Cokoli jiného než „Potvrzeno“ se na webu nezobrazuje a nepočítá ' +
            'se do vyrovnání.',
        },
      },
    },
    {
      name: 'approvalNote',
      type: 'textarea',
      admin: {
        position: 'sidebar',
        description: {
          en: 'Why it was rejected — emailed to the author',
          cs: 'Důvod zamítnutí – odešle se autorovi e-mailem',
        },
        condition: (data) => data?.approvalStatus === 'rejected',
      },
    },
    {
      name: 'approvalDecidedBy',
      type: 'relationship',
      relationTo: 'users',
      maxDepth: 0,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: {
          en: 'Who confirmed or rejected the expense',
          cs: 'Kdo výdaj potvrdil nebo zamítl',
        },
        condition: (data) => data?.approvalStatus !== 'approved' || data?.approvalDecidedBy != null,
      },
    },
    {
      name: 'approvalDecidedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { displayFormat: 'yyyy-MM-dd HH:mm' },
        condition: (data) => data?.approvalDecidedAt != null,
      },
    },
    {
      name: 'isPlanned',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: {
          en: 'Planned expense (not yet paid) - uncheck when actually paid',
          cs: 'Plánovaný výdaj (zatím nezaplacený) – po skutečném zaplacení zrušte zaškrtnutí',
        },
      },
    },
  ],
}

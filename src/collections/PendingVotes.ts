import { APIError, type CollectionConfig, type Where } from 'payload'
import { canManageChata, chataScopedAccess, isSuperadmin, refId } from '../lib/access'

// "Nepotvrzené hlasy" — a planning vote somebody cast without being signed
// in (docs/PRD-planovani.md). Knowing an email proves nothing, so the vote
// waits here until its owner signs in ANY way (the emailed confirm link, a
// plain login link, Google/Apple/Microsoft) and becomes a real trip-vote.
// Kept as its own row, not as URL params on a one-shot login token, so a
// vote is never lost to a mail scanner, an expired link or a second login
// link request — and so admins can see who tried to join and stalled.
export const PendingVotes: CollectionConfig = {
  slug: 'pending-votes',
  labels: {
    singular: { en: 'Pending vote', cs: 'Nepotvrzený hlas' },
    plural: { en: 'Pending votes', cs: 'Nepotvrzené hlasy' },
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'chata', 'user', 'status', 'issue', 'createdAt'],
    group: { en: 'Planning', cs: 'Plánování' },
    description: {
      en:
        'Votes cast on the planning page by people who were not signed in. Each becomes a ' +
        'real vote the moment its owner signs in (confirmation link, login link or Google/Apple/' +
        'Microsoft). A row that stays pending with an issue needs a look: the name was taken ' +
        'or the planning phase ended before they signed in.',
      cs:
        'Hlasy z plánovací stránky od lidí, kteří nebyli přihlášení. Každý se změní ve skutečný ' +
        'hlas, jakmile se jeho majitel přihlásí (potvrzovacím odkazem, přihlašovacím odkazem nebo ' +
        'přes Google/Apple/Microsoft). Řádek, který zůstává nepotvrzený s problémem, si zaslouží ' +
        'pohled: jméno už někdo měl, nebo plánování skončilo dřív, než se dotyčný přihlásil.',
    },
  },
  access: {
    // NOT public — rows link accounts (emails) to names and preferences.
    // Admins see their chatas' queue; a frontend user only their own rows.
    read: ({ req: { user } }) => {
      if (!user) return false
      if (isSuperadmin(user)) return true
      if (user.role === 'admin') {
        const where: Where = { chata: { in: user.assignedChatas || [] } }
        return where
      }
      const own: Where = { user: { equals: user.id } }
      return own
    },
    // Rows only come from the vote flow (local API); nothing to create by hand
    create: () => false,
    update: chataScopedAccess,
    delete: chataScopedAccess,
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc, req }) => {
        // The access Where scopes only STORED docs — an admin editing must
        // manage the row's chata, and cannot move it into another one
        const chataRef = data?.chata ?? originalDoc?.chata
        if (req.user && chataRef != null && !canManageChata(req.user, refId(chataRef))) {
          throw new APIError('Forbidden', 403)
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: { en: 'Name', cs: 'Jméno' },
      admin: {
        description: {
          en: 'The name typed into the vote form — becomes the participant name on confirmation.',
          cs: 'Jméno zadané do hlasovacího formuláře – po potvrzení se stane jménem účastníka.',
        },
      },
    },
    {
      name: 'chata',
      type: 'relationship',
      relationTo: 'chatas',
      required: true,
      index: true,
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: { en: 'Account', cs: 'Účet' },
      admin: {
        description: {
          en: 'The account created (or reused) for the email given in the form.',
          cs: 'Účet založený (nebo použitý) pro e-mail zadaný ve formuláři.',
        },
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'pending',
          index: true,
          options: [
            { label: { en: 'Pending', cs: 'Nepotvrzený' }, value: 'pending' },
            { label: { en: 'Confirmed', cs: 'Potvrzený' }, value: 'confirmed' },
            { label: { en: 'Discarded', cs: 'Zahozený' }, value: 'discarded' },
          ],
        },
        {
          name: 'issue',
          type: 'select',
          label: { en: 'Issue', cs: 'Problém' },
          options: [
            { label: { en: 'Name already taken', cs: 'Jméno už někdo má' }, value: 'name-taken' },
            { label: { en: 'Planning ended', cs: 'Plánování skončilo' }, value: 'planning-closed' },
            {
              label: { en: 'Selection no longer valid', cs: 'Výběr už neplatí' },
              value: 'invalid-selection',
            },
          ],
          admin: {
            description: {
              en: 'Why the last sign-in could not turn this into a vote. Cleared automatically on the next successful attempt.',
              cs: 'Proč se hlas při posledním přihlášení nepodařilo uložit. Při dalším úspěšném pokusu se maže samo.',
            },
          },
        },
        {
          name: 'source',
          type: 'select',
          label: { en: 'Source', cs: 'Cesta' },
          options: [
            { label: { en: 'Email link', cs: 'E-mailový odkaz' }, value: 'email' },
            { label: 'Microsoft', value: 'microsoft' },
            { label: 'Google', value: 'google' },
            { label: 'Apple', value: 'apple' },
          ],
          admin: { readOnly: true },
        },
      ],
    },
    {
      // Filed anonymously against an account that already existed? Then
      // nobody has proven the account holder cast it: an ordinary sign-in
      // only REVEALS it for a one-tap check, and only the emailed link
      // (mailbox proof) records it outright. Accounts created by the
      // submission itself, and same-browser OAuth intents, are trusted.
      name: 'autoConfirm',
      type: 'checkbox',
      defaultValue: false,
      label: { en: 'Confirm on any sign-in', cs: 'Potvrdit při jakémkoli přihlášení' },
      admin: {
        readOnly: true,
        description: {
          en: 'Off when the vote was filed for an account that already existed: the account holder sees it and decides. On for accounts the vote itself created.',
          cs: 'Vypnuto, když byl hlas zadán pro účet, který už existoval: majitel účtu ho uvidí a rozhodne. Zapnuto pro účty, které hlas sám založil.',
        },
      },
    },
    {
      // Regenerated on every re-submission; the emailed link carries it,
      // so an older email can never confirm a newer selection
      name: 'submissionKey',
      type: 'text',
      admin: { hidden: true },
    },
    {
      name: 'dates',
      type: 'relationship',
      relationTo: 'trip-date-options',
      hasMany: true,
      label: { en: 'Dates that work', cs: 'Vyhovující termíny' },
      filterOptions: ({ data }) => (data?.chata ? { chata: { equals: data.chata } } : false),
    },
    {
      name: 'accommodations',
      type: 'relationship',
      relationTo: 'trip-accommodation-options',
      hasMany: true,
      label: { en: 'Liked places', cs: 'Líbí se' },
      filterOptions: ({ data }) => (data?.chata ? { chata: { equals: data.chata } } : false),
    },
    {
      type: 'row',
      fields: [
        {
          name: 'confirmedAt',
          type: 'date',
          label: { en: 'Confirmed at', cs: 'Potvrzeno' },
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'linkExpiresAt',
          type: 'date',
          label: { en: 'Email link valid until', cs: 'E-mailový odkaz platí do' },
          admin: {
            readOnly: true,
            date: { pickerAppearance: 'dayAndTime' },
            description: {
              en: 'Only the emailed link expires; the row keeps waiting for any other sign-in.',
              cs: 'Vyprší jen odkaz z e-mailu; řádek dál čeká na jakékoli jiné přihlášení.',
            },
          },
        },
        {
          // The emailed link signs the account in, so it is spent on its
          // first use — a mailbox copy must not stay a login credential
          name: 'linkUsedAt',
          type: 'date',
          label: { en: 'Email link used at', cs: 'E-mailový odkaz použit' },
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
        },
      ],
    },
    {
      name: 'vote',
      type: 'relationship',
      relationTo: 'trip-votes',
      label: { en: 'Resulting vote', cs: 'Výsledný hlas' },
      admin: { readOnly: true },
    },
  ],
}

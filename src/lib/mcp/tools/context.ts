import { assignedChataIds, isSuperadmin, refId } from '@/lib/access'
import { getTripPhase } from '@/app/(frontend)/utils/tripData'
import { getTripNights } from '@/app/(frontend)/utils/participantHelpers'
import type { Chata } from '@/payload-types'
import { defineTool } from '../tool-kit'
import { MCP_SCOPES } from '../oauth'
import { isoDate } from '../chata'

export const contextTools = [
  defineTool({
    name: 'get_context',
    title: 'Account and chatas',
    description:
      'Start here. The signed-in zicha.travel account (name, role, what this connection may do), ' +
      'today in Europe/Prague, and every chata (trip) the account belongs to: id, slug, dates, ' +
      'phase (before / during / after), its own participants there and whether it is the banker ' +
      'or an admin of the chata. Superadmins get every chata.',
    access: 'read',
    input: {},
    handler: async (_args, caller) => {
      const { payload, user } = caller
      const own = await payload.find({
        collection: 'participants',
        where: { account: { equals: user.id } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      const ownByChata = new Map<string, Array<{ id: number; name: string }>>()
      for (const p of own.docs) {
        const key = refId(p.chata)
        ownByChata.set(key, [...(ownByChata.get(key) ?? []), { id: p.id, name: p.name }])
      }
      const adminIds = new Set(assignedChataIds(user as never))
      const ids = [...new Set([...ownByChata.keys(), ...adminIds])].map(Number)
      const chatas = await payload.find({
        collection: 'chatas',
        where: isSuperadmin(user as never) ? {} : { id: { in: ids.length > 0 ? ids : [0] } },
        sort: '-tripDateFrom',
        limit: 500,
        depth: 0,
        overrideAccess: true,
        context: { triggerAfterRead: false },
      })
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date())
      const scopes = caller.auth.scopes
      return {
        account: {
          id: user.id,
          name: user.name ?? null,
          email: user.email,
          role: user.role,
        },
        connection: {
          app: caller.auth.clientName,
          can_write: scopes.includes(MCP_SCOPES.WRITE),
        },
        today,
        site: caller.origin,
        chatas: (chatas.docs as Chata[]).map((chata) => {
          const mine = ownByChata.get(String(chata.id)) ?? []
          return {
            id: chata.id,
            slug: chata.slug,
            name: chata.name,
            location: chata.location ?? null,
            url: `${caller.origin}/${chata.slug}`,
            date_from: isoDate(chata.tripDateFrom),
            date_to: isoDate(chata.tripDateTo),
            dates_tentative: chata.tripDatesTentative === true,
            nights: getTripNights(chata),
            phase: chata.planningEnabled ? 'planning' : getTripPhase(chata),
            settled_at: isoDate(chata.settledAt),
            my_participants: mine,
            i_am_banker: chata.banker != null && mine.some((p) => String(p.id) === refId(chata.banker)),
            i_am_admin: isSuperadmin(user as never) || adminIds.has(String(chata.id)),
          }
        }),
      }
    },
  }),
]

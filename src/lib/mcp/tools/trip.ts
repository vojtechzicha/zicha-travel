import { z } from 'zod'
import { refId } from '@/lib/access'
import { visibleCustomTabs } from '@/lib/customTabs'
import {
  getTripPhase,
  nightLabel,
  participantsWithoutCar,
  transportDay,
  transportRiders,
} from '@/app/(frontend)/utils/tripData'
import { getOccupantNights, getTripNights } from '@/app/(frontend)/utils/participantHelpers'
import { roomHasSpace } from '@/lib/organizationEditing'
import { defineTool } from '../tool-kit'
import {
  bankerOf,
  isoDate,
  loadChata,
  ownParticipants,
  participantNames,
  richTextToPlain,
  type ChataPayload,
} from '../chata'

const chataInput = {
  chata: z
    .union([z.string(), z.number()])
    .describe('The chata: id, slug or name (get_context lists them).'),
}

const rows = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : [])

function participantsView(data: ChataPayload) {
  const own = new Set(data.viewer.linkedParticipantIds.map(String))
  const locked = new Set(data.locked.map((l) => String(l.id)))
  const banker = bankerOf(data)
  const jointOf = new Map<string, string>()
  for (const ja of data.jointAccounts) {
    for (const m of rows<any>(ja.members)) jointOf.set(refId(m), ja.name)
  }
  return data.participants.map((p) => ({
    id: p.id,
    name: p.name,
    is_me: own.has(String(p.id)),
    is_banker: banker != null && banker.id === p.id,
    has_account: p.account != null,
    // a locked participant belongs to an account that has signed in; others
    // cannot open their finance view (the web shows them greyed out)
    locked: locked.has(String(p.id)),
    paid_by: p.paidBy != null ? (participantNames(data).get(refId(p.paidBy)) ?? null) : null,
    joint_account: jointOf.get(String(p.id)) ?? null,
    has_pet: p.hasPet === true,
  }))
}

export const tripTools = [
  defineTool({
    name: 'get_chata',
    title: 'Trip information',
    description:
      'Everything on the Informace and Účastníci tabs of a chata: dates and phase, the place ' +
      '(destination, check-in/out, links), basic info, amenities, packing list, daily program, ' +
      'surroundings, contacts and house rules, keys and Wi-Fi ("privateInfo", for signed-in ' +
      'accounts), getting there (car routes, parking, public transport), custom tabs as text, ' +
      'the participant list (who is me, the banker, joint accounts, standing "paid by" ' +
      'arrangements) and which modules (beds, cars, shopping, beer, planning) are on.',
    access: 'read',
    input: chataInput,
    handler: async ({ chata: ref }, caller) => {
      const data = await loadChata(caller, ref)
      const c = data.chata
      const names = participantNames(data)
      const tentative = c.tripDatesTentative === true
      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        short_name: c.shortName ?? null,
        location: c.location ?? null,
        url: `${caller.origin}/${c.slug}`,
        phase: c.planningEnabled ? 'planning' : getTripPhase(c),
        dates: {
          from: isoDate(c.tripDateFrom),
          to: isoDate(c.tripDateTo),
          tentative,
          note: tentative
            ? 'Tentative: from/to only bound the window; the stay length is "nights".'
            : undefined,
          nights: getTripNights(c),
          check_in: c.checkInTime ?? null,
          check_out: c.checkOutTime ?? null,
        },
        settled_at: isoDate(c.settledAt),
        destination: {
          name: c.destinationName ?? null,
          address: c.destinationLocation ?? null,
          description: c.destinationDescription ?? null,
          lat: c.destinationLat ?? null,
          lng: c.destinationLng ?? null,
          links: rows<any>(c.destinationLinks).map((l) => ({ title: l.title, url: l.url })),
        },
        basic_info: rows<any>(c.basicInfo).map((r) => r.info),
        amenities: rows<any>(c.amenities).map((a) => ({ name: a.name, available: a.available !== false })),
        packing_list: rows<any>(c.packingItems).map((r) => r.item),
        program: rows<any>(c.program).map((r) => ({ date: isoDate(r.date), text: r.description })),
        surroundings: rows<any>(c.surroundings).map((r) => ({
          name: r.name,
          note: r.note ?? null,
          kind: r.category ?? null,
        })),
        contacts_and_rules: rows<any>(c.contactRules).map((r) => ({ label: r.label, value: r.value })),
        keys_and_wifi: rows<any>(c.privateInfo).map((r) => ({ label: r.label, value: r.value || null })),
        shared_album: c.sharedAlbumUrl ?? null,
        getting_there: {
          parking: c.parking ?? null,
          car_routes: rows<any>(c.carRoutes).map((r) => ({
            from: r.from,
            duration: r.duration,
            distance: r.distance,
            route: r.route,
          })),
          public_transport: rows<any>(c.publicTransportOptions).map((o) => ({
            id: o.id,
            title: o.title,
            direction: o.direction === 'zpet' ? 'back' : o.direction === 'tam' ? 'there' : null,
            day: isoDate(transportDay(c, o)),
            total_duration: o.totalDuration ?? null,
            notes: o.notes ?? null,
            connections: rows<any>(o.connections).map((k) => ({
              type: k.type,
              number: k.number,
              from: k.from,
              to: k.to,
              departure: k.departure,
              arrival: k.arrival,
            })),
            riders: rows<any>(o.riders).map((r) => names.get(refId(r.participant)) ?? null).filter(Boolean),
          })),
        },
        custom_tabs: visibleCustomTabs(rows<any>(c.customTabs)).map((t: any) => ({
          title: t.title,
          text: richTextToPlain(t.content),
        })),
        modules: {
          beds: c.bedroomOrganizationEnabled === true,
          beds_per_night: c.advancedBedroomMode === true,
          cars: c.sharedCarsEnabled === true,
          shopping_list: data.shopping != null,
          beer_order: data.beer != null,
          planning_poll: data.planning != null,
        },
        participants: participantsView(data),
        joint_accounts: data.jointAccounts.map((ja) => ({
          id: ja.id,
          name: ja.name,
          members: rows<any>(ja.members).map((m) => names.get(refId(m)) ?? null).filter(Boolean),
        })),
        my_claims: data.viewerClaims.map((cl) => ({
          id: cl.id,
          participant: names.get(String(cl.participantId)) ?? cl.participantId,
          status: cl.status,
        })),
        participants_with_pending_claim: data.pendingClaims.map((id) => names.get(String(id)) ?? id),
      }
    },
  }),

  defineTool({
    name: 'get_organization',
    title: 'Beds and cars',
    description:
      'The Organizace tab: rooms with beds, who sleeps where (per night when the chata plans ' +
      'beds per night), free places per room, shared cars with driver, front and back seats and ' +
      'free seats, public-transport riders, and who has no ride there yet. Ids of rooms, beds ' +
      'and cars are what edit_beds and edit_cars take.',
    access: 'read',
    input: chataInput,
    handler: async ({ chata: ref }, caller) => {
      const data = await loadChata(caller, ref)
      const c = data.chata
      const names = participantNames(data)
      const nameOf = (value: unknown) => (value == null ? null : (names.get(refId(value)) ?? null))
      const totalNights = getTripNights(c)
      const perNight = c.advancedBedroomMode === true
      const own = ownParticipants(data)
      const banker = bankerOf(data)
      const isOrganizer =
        data.viewer.canViewAll || (banker != null && own.some((p) => p.id === banker.id))
      const phase = getTripPhase(c)
      const nightLabels =
        perNight && totalNights > 0 && c.tripDatesTentative !== true
          ? Array.from({ length: totalNights }, (_, i) => ({ night: i + 1, label: nightLabel(c, i + 1, 'cs') }))
          : undefined

      const rooms = rows<any>(c.rooms).map((room) => {
        const occupied = rows<any>(room.beds).flatMap((bed) => rows<any>(bed.occupants))
        return {
          id: room.id,
          name: room.name,
          description: room.description ?? null,
          max_sleeping_spaces: room.maxSleepingSpaces,
          has_space_for_one_more_whole_stay: roomHasSpace(room, -1, null, totalNights),
          occupant_rows: occupied.length,
          beds: rows<any>(room.beds).map((bed) => ({
            id: bed.id,
            name: bed.name,
            occupants: rows<any>(bed.occupants).map((o) => ({
              participant_id: o.participant == null ? null : Number(refId(o.participant)),
              name: nameOf(o.participant),
              nights: getOccupantNights(o) ?? 'whole stay',
            })),
          })),
        }
      })
      const placed = new Set(
        rows<any>(c.rooms).flatMap((r) =>
          rows<any>(r.beds).flatMap((b) => rows<any>(b.occupants).map((o) => refId(o.participant))),
        ),
      )
      const cars = rows<any>(c.sharedCars).map((car) => {
        const passengers = rows<any>(car.passengers).map((p) => nameOf(p.participant)).filter(Boolean)
        const taken = 1 + (car.frontPassenger != null ? 1 : 0) + passengers.length
        return {
          id: car.id,
          name: car.name,
          description: car.description ?? null,
          seats: car.seats ?? null,
          free_seats: car.seats != null ? Math.max(0, car.seats - taken) : null,
          driver: nameOf(car.driver),
          driver_id: car.driver == null ? null : Number(refId(car.driver)),
          front: nameOf(car.frontPassenger),
          back: passengers,
          equipment: rows<any>(car.equipment).map((e) => e.name),
        }
      })
      return {
        chata: { id: c.id, slug: c.slug, name: c.name },
        phase,
        editable:
          phase !== 'after' && c.planningEnabled !== true
            ? isOrganizer
              ? 'you may move anybody (banker or chata admin)'
              : own.length > 0
                ? `you may place and move your own participants: ${own.map((p) => p.name).join(', ')}`
                : 'read only (no participant of yours here)'
            : 'read only',
        beds: c.bedroomOrganizationEnabled === true
          ? {
              per_night: perNight,
              total_nights: totalNights,
              night_labels: nightLabels,
              rooms,
              without_bed: data.participants.filter((p) => !placed.has(String(p.id))).map((p) => p.name),
            }
          : null,
        cars: c.sharedCarsEnabled === true
          ? {
              cars,
              without_ride_there: participantsWithoutCar(c, data.participants).map((p: any) => p.name),
            }
          : null,
        public_transport: rows<any>(c.publicTransportOptions).map((o) => ({
          title: o.title,
          direction: o.direction === 'zpet' ? 'back' : 'there',
          riders: transportRiders(o, data.participants).map((p: any) => p.name),
        })),
      }
    },
  }),
]

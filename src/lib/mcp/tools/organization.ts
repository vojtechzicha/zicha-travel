import { z } from 'zod'
import { callApi } from '../loopback'
import { ToolError, audit, defineTool, expectOk } from '../tool-kit'
import { loadChata, resolveParticipant } from '../chata'

// "Organizace" editing: one endpoint (POST /api/chatas/:id/organization)
// with an action, run under the chata's advisory lock so the last free bed or
// seat has one winner. Your own participants (a parent and a child) for
// everybody; anybody for the banker and chata admins. Rooms, beds and public
// transport stay admin-only.

const ref = z.union([z.string(), z.number()])

async function organizationAction(
  caller: Parameters<typeof loadChata>[0],
  chataId: number,
  tool: string,
  body: Record<string, unknown>,
) {
  const result = expectOk(
    await callApi<any>(caller, 'POST', `chatas/${chataId}/organization`, { body }),
    `Organization (${body.action})`,
  )
  await audit(caller, {
    tool,
    action: String(body.action),
    chata: chataId,
    collection: 'chatas',
    documentId: chataId,
    request: body,
  })
  return result
}

export const organizationTools = [
  defineTool({
    name: 'edit_beds',
    title: 'Place someone in a bed',
    description:
      'place: puts a participant into a bed (room_id and bed_id from get_organization), moving ' +
      'them out of any other bed; in per-night mode `nights` (1-based) picks the nights, ' +
      'default the whole stay. leave: takes them out of every bed. Rooms have a per-night limit ' +
      '(max sleeping spaces); a full room is refused.',
    access: 'write',
    input: {
      chata: ref,
      action: z.enum(['place', 'leave']),
      participant: ref.describe('Who (id or name): your own participant, or anybody as an organizer.'),
      room_id: z.string().optional(),
      bed_id: z.string().optional(),
      nights: z.array(z.number().int().min(1)).max(60).optional(),
    },
    handler: async (args, caller) => {
      const data = await loadChata(caller, args.chata)
      const participantId = resolveParticipant(data, args.participant)
      if (args.action === 'place' && (!args.room_id || !args.bed_id)) {
        throw new ToolError('place needs room_id and bed_id (see get_organization).')
      }
      const body =
        args.action === 'place'
          ? { action: 'bed.place', participantId, roomId: args.room_id, bedId: args.bed_id, nights: args.nights }
          : { action: 'bed.leave', participantId }
      await organizationAction(caller, data.ref.id, 'edit_beds', body)
      return { ok: true, ...body }
    },
  }),

  defineTool({
    name: 'edit_cars',
    title: 'Offer a car or take a seat',
    description:
      'offer: your participant offers their car and becomes its driver (one car per driver; ' +
      'seats counts the driver). update / remove: the driver or an organizer edits or withdraws ' +
      'a car (car_id from get_organization). seat: takes the front or a back seat in a car, ' +
      'moving out of any other seat. leave: gives up the seat.',
    access: 'write',
    input: {
      chata: ref,
      action: z.enum(['offer', 'update', 'remove', 'seat', 'leave']),
      participant: ref.optional().describe('Driver (offer) or passenger (seat, leave): id or name.'),
      car_id: z.string().optional(),
      seat: z.enum(['front', 'back']).optional(),
      car: z
        .object({
          name: z.string().trim().min(1).max(80),
          seats: z.number().int().min(1).max(9),
          description: z.string().max(500).optional(),
          equipment: z.array(z.string().max(60)).max(20).optional(),
        })
        .optional()
        .describe('For offer and update: the car (seats including the driver).'),
    },
    handler: async (args, caller) => {
      const data = await loadChata(caller, args.chata)
      const person = () => {
        if (args.participant === undefined) throw new ToolError(`${args.action} needs a participant.`)
        return resolveParticipant(data, args.participant)
      }
      const carId = () => {
        if (!args.car_id) throw new ToolError(`${args.action} needs car_id (see get_organization).`)
        return args.car_id
      }
      const car = () => {
        if (!args.car) throw new ToolError(`${args.action} needs the car (name, seats).`)
        return args.car
      }
      let body: Record<string, unknown>
      switch (args.action) {
        case 'offer':
          body = { action: 'car.offer', driverId: person(), car: car() }
          break
        case 'update':
          body = { action: 'car.update', carId: carId(), car: car() }
          break
        case 'remove':
          body = { action: 'car.remove', carId: carId() }
          break
        case 'seat':
          if (!args.seat) throw new ToolError('seat needs seat: front or back.')
          body = { action: 'car.seat', carId: carId(), participantId: person(), seat: args.seat }
          break
        case 'leave':
          body = { action: 'car.leave', participantId: person() }
          break
      }
      await organizationAction(caller, data.ref.id, 'edit_cars', body)
      return { ok: true, ...body }
    },
  }),
]

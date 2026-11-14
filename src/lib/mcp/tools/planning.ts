import { z } from 'zod'
import { callApi } from '../loopback'
import { ToolError, audit, defineTool, expectOk } from '../tool-kit'
import { isoDate, loadChata, ownParticipants, participantNames, resolveParticipant } from '../chata'

// "Plánujeme" (the date/cottage poll while a chata is in planning) and the
// "Jsi to ty?" claim for a signed-in account, through the same endpoints as
// PlanningView and ClaimFlow.

const ref = z.union([z.string(), z.number()])
const idRef = z.union([z.number(), z.string().regex(/^\d+$/)]).transform(Number)

export const planningTools = [
  defineTool({
    name: 'get_planning',
    title: 'Trip poll (Plánujeme)',
    description:
      'While a chata is in planning: the candidate date windows and cottages (with the windows ' +
      'each cottage is available in), the intro text, how many voted, and the votes per person ' +
      'when this account may see them (chata admins, and people who already have a participant ' +
      'in the chata). Option ids are what submit_vote takes.',
    access: 'read',
    input: { chata: ref },
    handler: async ({ chata }, caller) => {
      const data = await loadChata(caller, chata)
      const p = data.planning
      if (!p) throw new ToolError(`${data.ref.name} is not in planning; its trip is booked.`)
      const names = participantNames(data)
      const dateLabel = new Map(p.dateOptions.map((d: any) => [d.id, d.label || `${isoDate(d.dateFrom)}–${isoDate(d.dateTo)}`]))
      const cottageName = new Map(p.accommodations.map((a: any) => [a.id, a.name]))
      return {
        chata: { id: data.ref.id, slug: data.ref.slug, name: data.ref.name },
        intro: p.intro,
        date_options: p.dateOptions.map((d: any) => ({
          id: d.id,
          label: d.label,
          from: isoDate(d.dateFrom),
          to: isoDate(d.dateTo),
          note: d.note,
        })),
        cottages: p.accommodations.map((a: any) => ({
          id: a.id,
          name: a.name,
          where: a.locationNote,
          url: a.url,
          description: a.description,
          available_in: a.dateOptionIds.length === 0 ? 'all windows' : a.dateOptionIds.map((id: number) => dateLabel.get(id) ?? id),
        })),
        vote_count: p.voteCount,
        you_voted: p.viewerVoted,
        your_participants: ownParticipants(data),
        votes:
          p.votes?.map((v: any) => ({
            participant: names.get(String(v.participantId)) ?? v.participantId,
            dates: v.dateOptionIds.map((id: number) => dateLabel.get(id) ?? id),
            cottages: v.accommodationOptionIds.map((id: number) => cottageName.get(id) ?? id),
          })) ?? 'Results show once you have voted (or to chata admins).',
      }
    },
  }),

  defineTool({
    name: 'submit_vote',
    title: 'Vote in the trip poll',
    description:
      'Records (or replaces) a vote: every date window and cottage that works for you. For ' +
      'your own participant (`participant` when you have several, e.g. a child). An account ' +
      'with no participant in the chata yet joins it with `name` (default the account name). ' +
      'The chata admins get an email.',
    access: 'write',
    input: {
      chata: ref,
      date_option_ids: z.array(idRef).max(50),
      cottage_ids: z.array(idRef).max(50),
      participant: ref.optional(),
      name: z.string().trim().min(1).max(80).optional(),
    },
    handler: async (args, caller) => {
      const data = await loadChata(caller, args.chata)
      if (!data.planning) throw new ToolError(`${data.ref.name} is not in planning.`)
      const own = ownParticipants(data)
      let participantId: number | null = null
      if (args.participant !== undefined) {
        participantId = resolveParticipant(data, args.participant)
        if (!own.some((p) => p.id === participantId)) {
          throw new ToolError('You can vote only for your own participants.')
        }
      } else if (own.length === 1) {
        participantId = own[0].id
      } else if (own.length > 1) {
        throw new ToolError(`Say for whom: ${own.map((p) => p.name).join(', ')}.`)
      }
      const body = {
        chataId: data.ref.id,
        dateOptionIds: args.date_option_ids,
        accommodationOptionIds: args.cottage_ids,
        participantId,
        name: args.name ?? caller.user.name ?? null,
      }
      const result = expectOk(await callApi<any>(caller, 'POST', 'trip-votes/submit', { body }), 'Voting')
      await audit(caller, {
        tool: 'submit_vote',
        action: 'vote',
        chata: data.ref.id,
        collection: 'trip-votes',
        request: body,
      })
      return result
    },
  }),

  defineTool({
    name: 'withdraw_vote',
    title: 'Withdraw a poll vote',
    description: 'Removes the vote of one of your participants from the trip poll.',
    access: 'delete',
    input: { chata: ref, participant: ref.optional() },
    handler: async (args, caller) => {
      const data = await loadChata(caller, args.chata)
      const own = ownParticipants(data)
      const participantId =
        args.participant !== undefined
          ? resolveParticipant(data, args.participant)
          : own.length === 1
            ? own[0].id
            : null
      if (participantId == null) throw new ToolError('Say whose vote (participant).')
      const body = { participantId }
      const result = expectOk(await callApi<any>(caller, 'POST', 'trip-votes/withdraw', { body }), 'Withdrawing the vote')
      await audit(caller, { tool: 'withdraw_vote', action: 'withdraw', chata: data.ref.id, collection: 'trip-votes', request: body })
      return result
    },
  }),

  defineTool({
    name: 'claim_participant',
    title: 'Claim a participant as yourself',
    description:
      '"Jsi to ty?": asks to link a participant of a chata to this account (it is you, or your ' +
      'child). Only participants nobody has claimed yet; a chata admin approves, or it is ' +
      'approved at once when you are already linked in another chata and the participant has ' +
      'no account. get_chata shows your claims.',
    access: 'write',
    input: { chata: ref, participant: ref },
    handler: async (args, caller) => {
      const data = await loadChata(caller, args.chata)
      const participantId = resolveParticipant(data, args.participant)
      const body = { participantId }
      const result = expectOk(await callApi<any>(caller, 'POST', 'claim-requests/submit', { body }), 'Claiming')
      await audit(caller, {
        tool: 'claim_participant',
        action: 'claim',
        chata: data.ref.id,
        collection: 'claim-requests',
        request: body,
        after: result,
      })
      return result
    },
  }),

  defineTool({
    name: 'cancel_claim',
    title: 'Cancel a claim',
    description: 'Cancels one of your pending claims (id from get_chata my_claims).',
    access: 'write',
    input: { claim_id: idRef },
    handler: async ({ claim_id }, caller) => {
      const result = expectOk(
        await callApi<any>(caller, 'POST', `claim-requests/${claim_id}/cancel`, { body: {} }),
        'Cancelling the claim',
      )
      await audit(caller, { tool: 'cancel_claim', action: 'cancel', collection: 'claim-requests', documentId: claim_id })
      return result ?? { ok: true }
    },
  }),

]

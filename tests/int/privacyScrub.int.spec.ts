import { describe, it, expect } from 'vitest'
import {
  deepScrubParticipants,
  scrubLockedStats,
  stripExpenseAttachments,
} from '@/lib/privacyScrub'
import { bankFieldVisibilityFor } from '@/utils/participantPrivacy'
import type { ChataStats } from '@/utils/calculateStats'

const participant = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  name: `P${id}`,
  chata: 1,
  accountNumber: `${id}00/0100`,
  iban: `CZ${id}`,
  account: null as unknown,
  ...over,
})

describe('deepScrubParticipants', () => {
  it('blanks bank fields of everyone not in the allowed set', () => {
    const docs = [participant(1), participant(2)]
    deepScrubParticipants(docs, new Set(['1']))
    expect(docs[0].accountNumber).toBe('100/0100')
    expect(docs[1].accountNumber).toBeNull()
    expect(docs[1].iban).toBeNull()
  })

  it('keeps everything for "all" visibility', () => {
    const docs = [participant(1), participant(2)]
    deepScrubParticipants(docs, 'all')
    expect(docs[1].accountNumber).toBe('200/0100')
  })

  it('reaches participants nested deep inside a chata doc (banker, occupants)', () => {
    const chata = {
      id: 1,
      name: 'Chata',
      banker: participant(3),
      rooms: [
        {
          beds: [{ occupants: [{ participant: participant(4) }] }],
        },
      ],
    }
    deepScrubParticipants(chata, new Set(['3']))
    expect(chata.banker.accountNumber).toBe('300/0100')
    expect(chata.rooms[0].beds[0].occupants[0].participant.accountNumber).toBeNull()
  })

  it('flattens populated user accounts back to bare ids (no email ships)', () => {
    const docs = [
      participant(1, {
        account: { id: 9, email: 'katka@example.com', role: 'user', lastLoginAt: 'x' },
      }),
    ]
    deepScrubParticipants(docs, 'all')
    expect(docs[0].account).toBe(9)
  })

  it('strips email off a stray user-like doc', () => {
    const node = { viewerAccount: { id: 9, email: 'a@b.cz', role: 'user' } }
    deepScrubParticipants(node, 'all')
    expect(node.viewerAccount.email).toBeUndefined()
  })

  it('survives circular references', () => {
    const a: Record<string, unknown> = { id: 1 }
    a.self = a
    expect(() => deepScrubParticipants(a, 'all')).not.toThrow()
  })
})

describe('scrubLockedStats', () => {
  const stats = (): ChataStats => ({
    participants: {
      Katka: { name: 'Katka', balance: 100 } as ChataStats['participants'][string],
      Vojta: { name: 'Vojta', balance: -100 } as ChataStats['participants'][string],
    },
    debtors: [{ name: 'Vojta', amount: 100 }],
    creditors: [{ name: 'Katka', amount: 100 }],
    totalExpenses: 0,
    totalPrepayments: 0,
  })

  it('removes the per-person entries of locked participants', () => {
    const s = stats()
    scrubLockedStats(s, ['Katka'])
    expect(s.participants.Katka).toBeUndefined()
    expect(s.participants.Vojta).toBeDefined()
  })

  it('keeps the settlement lists (deliberately public)', () => {
    const s = stats()
    scrubLockedStats(s, ['Katka'])
    expect(s.creditors).toHaveLength(1)
    expect(s.debtors).toHaveLength(1)
  })
})

describe('stripExpenseAttachments', () => {
  it('empties attachments on every expense', () => {
    const expenses = [{ id: 1, attachments: [{ id: 5 }] }, { id: 2 }]
    stripExpenseAttachments(expenses as Array<Record<string, unknown>>)
    expect(expenses[0].attachments).toEqual([])
  })
})

describe('bankFieldVisibilityFor', () => {
  const participants = [
    { id: 1, name: 'Banker', account: 10 },
    { id: 2, name: 'Katka', account: 20 },
    { id: 3, name: 'NoAccount', account: null },
  ]

  it('anonymous viewers see only the banker', () => {
    const v = bankFieldVisibilityFor({ user: null, chataId: 1, bankerId: '1', participants })
    expect(v).toEqual(new Set(['1']))
  })

  it('a linked user sees the banker plus their own participants', () => {
    const v = bankFieldVisibilityFor({
      user: { id: 20 },
      chataId: 1,
      bankerId: '1',
      participants,
    })
    expect(v).toEqual(new Set(['1', '2']))
  })

  it("the banker's own account sees everything (refund view)", () => {
    const v = bankFieldVisibilityFor({
      user: { id: 10 },
      chataId: 1,
      bankerId: '1',
      participants,
    })
    expect(v).toBe('all')
  })

  it('a superadmin sees everything', () => {
    const v = bankFieldVisibilityFor({
      user: { id: 99, role: 'superadmin' } as never,
      chataId: 1,
      bankerId: '1',
      participants,
    })
    expect(v).toBe('all')
  })

  it('a chata without a banker exposes no bank fields to anonymous viewers', () => {
    const v = bankFieldVisibilityFor({ user: null, chataId: 1, bankerId: null, participants })
    expect(v).toEqual(new Set())
  })
})

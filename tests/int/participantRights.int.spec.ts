import { describe, it, expect } from 'vitest'
import { expenseInvolvesParticipant } from '@/utils/participantRights'

// The export bundle promises to be complete (GDPR Art. 15/20), so the
// membership rule decides whether a person's shares actually ship.

describe('expenseInvolvesParticipant', () => {
  const pid = '7'

  it('includes an equal-split expense even with no weight rows', () => {
    // calculateStats builds equal shares from the chata's participant list,
    // so there is nothing in `weights` to match on — the most common case
    expect(expenseInvolvesParticipant({ splitType: 'equal', weights: [] }, pid)).toBe(true)
  })

  it('includes an equal-split expense the person neither pays nor hosts', () => {
    expect(
      expenseInvolvesParticipant(
        { splitType: 'equal', weights: [], invitations: [], payer: { relationTo: 'participants', value: 99 } },
        pid,
      ),
    ).toBe(true)
  })

  it('includes a weighted expense when the person carries a weight', () => {
    expect(
      expenseInvolvesParticipant(
        { splitType: 'weighted', weights: [{ participant: 7 }, { participant: 8 }] },
        pid,
      ),
    ).toBe(true)
  })

  it('excludes a weighted expense the person has nothing to do with', () => {
    expect(
      expenseInvolvesParticipant(
        {
          splitType: 'weighted',
          weights: [{ participant: 8 }],
          invitations: [{ host: 8, guest: 9 }],
          payer: { relationTo: 'participants', value: 8 },
        },
        pid,
      ),
    ).toBe(false)
  })

  it('includes a weighted expense where the person is the payer only', () => {
    expect(
      expenseInvolvesParticipant(
        { splitType: 'weighted', weights: [{ participant: 8 }], payer: { relationTo: 'participants', value: 7 } },
        pid,
      ),
    ).toBe(true)
  })

  it('includes a weighted expense where the person is a guest or a host', () => {
    expect(
      expenseInvolvesParticipant(
        { splitType: 'weighted', weights: [{ participant: 8 }], invitations: [{ host: 8, guest: 7 }] },
        pid,
      ),
    ).toBe(true)
    expect(
      expenseInvolvesParticipant(
        { splitType: 'weighted', weights: [{ participant: 8 }], invitations: [{ host: 7, guest: 8 }] },
        pid,
      ),
    ).toBe(true)
  })

  it('does not treat a joint-account payer as the participant', () => {
    expect(
      expenseInvolvesParticipant(
        { splitType: 'weighted', weights: [], payer: { relationTo: 'joint-accounts', value: 7 } },
        pid,
      ),
    ).toBe(false)
  })

  it('matches populated relationship objects, not just bare ids', () => {
    expect(
      expenseInvolvesParticipant(
        { splitType: 'weighted', weights: [{ participant: { id: 7, name: 'Katka' } }] },
        pid,
      ),
    ).toBe(true)
  })
})

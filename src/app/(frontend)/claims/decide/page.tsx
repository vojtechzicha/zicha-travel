import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { refId, canManageChata } from '@/lib/access'
import { verifyDecideToken } from '@/lib/claimRequests'
import { GlassCard } from '../../components/GlassCard'
import { DecideClaimCard } from '../../components/DecideClaimCard'
import '../../styles.css'

export const metadata: Metadata = {
  title: 'Žádost o propojení',
  description: 'Schválení žádosti o propojení účastníka s účtem',
}

// The admin lands here from the notification email. The signed token in the
// URL is the credential (no session needed); the actual decision is a POST
// from the client card — a mutating GET would get triggered by mail-scanner
// link prefetches.
export default async function DecideClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  const shell = (content: React.ReactNode) => (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />
      <div className="relative z-10 max-w-app mx-auto px-5 py-10 flex items-center justify-center min-h-screen">
        {content}
      </div>
    </div>
  )

  const message = (title: string, body: string) =>
    shell(
      <GlassCard padding="large" className="w-full max-w-md text-center">
        <h1 className="font-serif text-2xl font-bold text-gray-900 mb-3">{title}</h1>
        <p className="text-gray-600">{body}</p>
      </GlassCard>
    )

  if (!token) {
    return message('Neplatný odkaz', 'V odkazu chybí podpis. Použijte prosím odkaz z e-mailu.')
  }

  const secret = process.env.PAYLOAD_SECRET
  const verified = secret ? verifyDecideToken(token, secret) : ({ ok: false, code: 'invalid' } as const)
  if (!verified.ok) {
    return verified.code === 'expired'
      ? message(
          'Odkaz vypršel',
          'Odkazy z e-mailu platí 7 dní. Žádost najdete v administraci pod „Claim Requests".'
        )
      : message('Neplatný odkaz', 'Podpis odkazu nesedí. Použijte prosím odkaz z e-mailu.')
  }

  const payload = await getPayload({ config: await config })
  const [admin, claim] = await Promise.all([
    payload
      .findByID({ collection: 'users', id: verified.adminId, depth: 0, overrideAccess: true })
      .catch(() => null),
    payload
      .findByID({ collection: 'claim-requests', id: verified.claimId, depth: 0, overrideAccess: true })
      .catch(() => null),
  ])

  if (!claim) {
    return message('Žádost nenalezena', 'Žádost o propojení už neexistuje.')
  }
  if (!admin || !canManageChata({ ...admin, collection: 'users' }, refId(claim.chata))) {
    return message(
      'Nemáte oprávnění',
      'Tento odkaz patří správci, který už tuto chatu nespravuje. Požádejte jiného správce.'
    )
  }

  const [participant, chata, requester] = await Promise.all([
    claim.participant != null
      ? payload
          .findByID({ collection: 'participants', id: refId(claim.participant), depth: 0 })
          .catch(() => null)
      : null,
    claim.chata != null
      ? payload
          .findByID({
            collection: 'chatas',
            id: refId(claim.chata),
            depth: 0,
            context: { triggerAfterRead: false },
          })
          .catch(() => null)
      : null,
    claim.user != null
      ? payload
          .findByID({ collection: 'users', id: refId(claim.user), depth: 0, overrideAccess: true })
          .catch(() => null)
      : null,
  ])

  if (!participant || !requester) {
    return message(
      'Žádost už nejde vyřídit',
      'Účastník nebo účet z této žádosti mezitím zmizel. Žádost najdete v administraci.'
    )
  }

  if (claim.status !== 'pending') {
    const statusText: Record<string, string> = {
      approved: 'Žádost už byla schválena.',
      rejected: 'Žádost už byla zamítnuta.',
      cancelled: 'Žadatel vzal žádost zpět.',
    }
    return message('Už rozhodnuto', statusText[claim.status] || 'Žádost už není otevřená.')
  }

  // Context for a confident decision, mirrored from the notification email
  const [others, linked] = await Promise.all([
    payload.find({
      collection: 'claim-requests',
      where: {
        and: [
          { participant: { equals: participant.id } },
          { status: { equals: 'pending' } },
          { id: { not_equals: claim.id } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'participants',
      where: { account: { equals: requester.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  // A never-used admin-created link would be replaced by approving
  const replacesInactiveAccount =
    participant.account != null && refId(participant.account) !== refId(claim.user)

  return shell(
    <DecideClaimCard
      token={token}
      participantName={participant.name}
      chataName={chata?.name ?? ''}
      requesterEmail={requester.email}
      requestedAt={claim.createdAt}
      otherPendingCount={others.totalDocs}
      requesterLinkedCount={linked.totalDocs}
      replacesInactiveAccount={replacesInactiveAccount}
    />
  )
}

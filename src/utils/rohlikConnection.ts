import type { Payload } from 'payload'
import { refId } from '@/lib/access'
import { linkedParticipantIds } from '@/lib/expenseAuthoring'
import { decryptToken, encryptToken } from '@/lib/rohlik/crypto'
import { refreshTokens, type RohlikTokens } from '@/lib/rohlik/oauth'
import { productDetails } from '@/lib/rohlik/mcp'
import type { RohlikProduct } from '@/lib/shopping'

// Side effects of the banker's Rohlík connection (collection
// rohlik-connections): storing the encrypted tokens, handing out a fresh
// access token (refreshing and persisting the rotated pair when it is about
// to expire) and the lookups the endpoints need to decide who may do what.
// Every read/write here is server-side with overrideAccess — the collection
// itself is closed to the API.

/** Refresh when less than this is left on the access token. */
const REFRESH_MARGIN_MS = 60 * 1000

function secret(): string {
  const value = process.env.PAYLOAD_SECRET
  if (!value) throw new Error('PAYLOAD_SECRET is not set')
  return value
}

async function findConnection(payload: Payload, userId: number | string) {
  const result = await payload.find({
    collection: 'rohlik-connections',
    where: { user: { equals: userId } },
    limit: 1,
    depth: 0,
    // also lifts the field-level read lock on the token fields
    overrideAccess: true,
  })
  return result.docs[0] ?? null
}

export async function isRohlikConnected(
  payload: Payload,
  userId: number | string,
): Promise<boolean> {
  const connection = await findConnection(payload, userId)
  return (
    connection != null &&
    typeof connection.accessToken === 'string' &&
    connection.accessToken !== ''
  )
}

export async function saveConnection(
  payload: Payload,
  args: { userId: number | string; clientId: string; redirectUri: string; tokens: RohlikTokens },
): Promise<void> {
  const data = {
    user: Number(args.userId),
    clientId: args.clientId,
    redirectUri: args.redirectUri,
    accessToken: encryptToken(args.tokens.accessToken, secret()),
    refreshToken: args.tokens.refreshToken
      ? encryptToken(args.tokens.refreshToken, secret())
      : null,
    expiresAt: args.tokens.expiresAt.toISOString(),
    connectedAt: new Date().toISOString(),
  }
  const existing = await findConnection(payload, args.userId)
  if (existing) {
    await payload.update({
      collection: 'rohlik-connections',
      id: existing.id,
      data,
      depth: 0,
      overrideAccess: true,
    })
  } else {
    await payload.create({ collection: 'rohlik-connections', data, depth: 0, overrideAccess: true })
  }
}

export async function deleteConnection(payload: Payload, userId: number | string): Promise<void> {
  await payload.delete({
    collection: 'rohlik-connections',
    where: { user: { equals: userId } },
    overrideAccess: true,
  })
}

/**
 * A usable access token for the user's Rohlík account, or null when there
 * is no connection or it can't be refreshed any more (the row is dropped
 * then, so the UI offers to connect again).
 */
export async function getAccessToken(
  payload: Payload,
  userId: number | string,
): Promise<string | null> {
  const connection = await findConnection(payload, userId)
  if (!connection) return null
  const accessToken = decryptToken(connection.accessToken, secret())
  if (!accessToken) return null
  const expiresAt = connection.expiresAt ? new Date(connection.expiresAt).getTime() : 0
  if (expiresAt - Date.now() > REFRESH_MARGIN_MS) return accessToken

  const refreshToken = decryptToken(connection.refreshToken, secret())
  if (!refreshToken || !connection.clientId) {
    await deleteConnection(payload, userId)
    return null
  }
  try {
    const tokens = await refreshTokens({ clientId: connection.clientId, refreshToken })
    await payload.update({
      collection: 'rohlik-connections',
      id: connection.id,
      data: {
        accessToken: encryptToken(tokens.accessToken, secret()),
        refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken, secret()) : null,
        expiresAt: tokens.expiresAt.toISOString(),
      },
      depth: 0,
      overrideAccess: true,
    })
    return tokens.accessToken
  } catch (err) {
    // a refused refresh (revoked, expired) means the banker connects again;
    // a transport failure keeps the row for the next attempt
    const status = (err as { status?: unknown }).status
    if (typeof status === 'number' && status >= 400 && status < 500) {
      await deleteConnection(payload, userId)
    }
    return null
  }
}

/** The account linked to the chata's banker participant (who orders), or null. */
export async function bankerAccountId(
  payload: Payload,
  chataId: number | string,
): Promise<string | null> {
  const chata = await payload
    .findByID({
      collection: 'chatas',
      id: chataId,
      depth: 0,
      overrideAccess: true,
      context: { triggerAfterRead: false },
    })
    .catch(() => null)
  if (!chata?.banker) return null
  const banker = await payload
    .findByID({
      collection: 'participants',
      id: refId(chata.banker),
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  return banker?.account != null ? refId(banker.account) : null
}

/** IDs of the chata's participants linked to this account. */
export async function viewerParticipantIds(
  payload: Payload,
  chataId: number | string,
  userId: number | string,
): Promise<string[]> {
  const participants = await payload.find({
    collection: 'participants',
    where: { and: [{ chata: { equals: chataId } }, { account: { equals: userId } }] },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  return linkedParticipantIds(userId, participants.docs)
}

/**
 * The product as Rohlík itself describes it right now, looked up with the
 * chata banker's connection; null when there is no connection, the id is
 * unknown or Rohlík doesn't answer. Item writes trust only this, never the
 * product fields of a REST body (src/collections/ShoppingItems.ts).
 */
export async function verifiedRohlikProduct(
  payload: Payload,
  chataId: number | string,
  productId: string,
): Promise<RohlikProduct | null> {
  try {
    const accountId = await bankerAccountId(payload, chataId)
    if (!accountId) return null
    const token = await getAccessToken(payload, accountId)
    if (!token) return null
    return await productDetails(token, productId)
  } catch (err) {
    payload.logger.warn({ err }, 'Rohlík product lookup failed')
    return null
  }
}

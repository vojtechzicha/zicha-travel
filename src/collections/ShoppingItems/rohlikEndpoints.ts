import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { parseCookies, type Endpoint, type PayloadRequest } from 'payload'
import { canManageChata, refId } from '@/lib/access'
import { requestOrigin, safeReturnTo } from '@/lib/auth/session'
import { RATE_LIMITS, checkRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { addToCart, searchProducts } from '@/lib/rohlik/mcp'
import {
  ROHLIK_ENDPOINT_PATH,
  ROHLIK_STATE_COOKIE,
  ROHLIK_STATE_TTL_SECONDS,
  buildAuthorizeUrl,
  callbackUrl,
  createPkce,
  exchangeCode,
  registerClient,
  signConnectState,
  verifyConnectState,
} from '@/lib/rohlik/oauth'
import { mergeCartLines, sendRoute } from '@/lib/shopping'
import type { ManualItem } from '@/lib/shoppingEmail'
import { notifyManualItems } from '@/utils/shoppingEmail'
import { refreshChataPrices } from '@/utils/rohlikPriceRefresh'
import {
  bankerAccountId,
  deleteConnection,
  getAccessToken,
  saveConnection,
  viewerParticipantIds,
} from '@/utils/rohlikConnection'

// Rohlík for the shopping list ("Nákup", src/lib/shopping.ts), mounted on
// shopping-items as /api/shopping-items/rohlik/…:
// - connect/callback: the banker links their Rohlík account (OAuth with
//   dynamic client registration + PKCE, src/lib/rohlik/oauth.ts); the
//   redirect URI is built from the request host, so the round trip stays on
//   the chata subdomain it started on and the state cookie is host-only
// - search: any signed-in participant of the chata (or its admin) finds
//   Rohlík products, through the BANKER's connection
// - send: the banker puts the list into their Rohlík cart; ordering and
//   paying stays in Rohlík, we never place an order
// - disconnect: the banker drops the connection
// Only the account linked to the chata's banker participant may connect,
// send or disconnect — the order lands in their Rohlík account.

const secret = (): string | null => process.env.PAYLOAD_SECRET ?? null

const chataIdOf = (value: unknown): number | null => {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function readBody(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    return ((await req.json?.()) ?? {}) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function isBanker(req: PayloadRequest, chataId: number): Promise<boolean> {
  if (!req.user) return false
  const banker = await bankerAccountId(req.payload, chataId)
  return banker != null && banker === String(req.user.id)
}

/**
 * Back to the page the connect started on, with `rohlik=<result>`. The path
 * passed safeReturnTo when it was stored; resolving it must still land on
 * this origin (CLAUDE.md open-redirect rule) or it falls back to `/`.
 */
function backTo(
  req: PayloadRequest,
  returnTo: string,
  result: 'connected' | 'error',
): NextResponse {
  const origin = requestOrigin(req.headers)
  let target = new URL(safeReturnTo(returnTo), origin)
  if (target.origin !== origin) target = new URL('/', origin)
  target.searchParams.set('rohlik', result)
  const response = NextResponse.redirect(target, 302)
  response.cookies.set(ROHLIK_STATE_COOKIE, '', { path: ROHLIK_ENDPOINT_PATH, maxAge: 0 })
  return response
}

export const rohlikEndpoints: Endpoint[] = [
  {
    path: '/rohlik/connect',
    method: 'get',
    handler: async (req) => {
      const returnTo = safeReturnTo(req.searchParams.get('returnTo'))
      const origin = requestOrigin(req.headers)
      if (!req.user) {
        return NextResponse.redirect(
          new URL(`/login?returnTo=${encodeURIComponent(returnTo)}`, origin),
          302,
        )
      }
      const chataId = chataIdOf(req.searchParams.get('chata'))
      if (chataId == null) return Response.json({ error: 'invalid-chata' }, { status: 400 })
      if (!(await isBanker(req, chataId))) {
        return Response.json({ error: 'forbidden' }, { status: 403 })
      }
      const key = secret()
      if (!key) return Response.json({ error: 'Server misconfigured' }, { status: 500 })

      const redirectUri = callbackUrl(origin)
      let clientId: string
      try {
        clientId = await registerClient(redirectUri)
      } catch (err) {
        req.payload.logger.error({ err }, 'Rohlík client registration failed')
        return backTo(req, returnTo, 'error')
      }
      const { verifier, challenge } = createPkce()
      const nonce = randomBytes(16).toString('base64url')
      const response = NextResponse.redirect(
        buildAuthorizeUrl({ clientId, redirectUri, challenge, nonce }),
        302,
      )
      response.cookies.set(
        ROHLIK_STATE_COOKIE,
        signConnectState(
          {
            userId: String(req.user.id),
            chataId: String(chataId),
            clientId,
            redirectUri,
            verifier,
            nonce,
            returnTo,
          },
          key,
        ),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: ROHLIK_ENDPOINT_PATH,
          maxAge: ROHLIK_STATE_TTL_SECONDS,
        },
      )
      return response
    },
  },
  {
    path: '/rohlik/callback',
    method: 'get',
    handler: async (req) => {
      const key = secret()
      const cookie = parseCookies(req.headers).get(ROHLIK_STATE_COOKIE)
      const verified = key
        ? verifyConnectState(cookie, key, {
            userId: req.user?.id,
            nonce: req.searchParams.get('state'),
          })
        : null
      if (!verified?.ok) return backTo(req, '/', 'error')
      const { state } = verified
      const code = req.searchParams.get('code')
      if (!code || req.searchParams.get('error')) return backTo(req, state.returnTo, 'error')
      // the banker may have changed between connect and callback
      if (!(await isBanker(req, Number(state.chataId)))) return backTo(req, state.returnTo, 'error')
      try {
        const tokens = await exchangeCode({
          clientId: state.clientId,
          redirectUri: state.redirectUri,
          code,
          verifier: state.verifier,
        })
        await saveConnection(req.payload, {
          userId: state.userId,
          clientId: state.clientId,
          redirectUri: state.redirectUri,
          tokens,
        })
      } catch (err) {
        req.payload.logger.error({ err }, 'Rohlík token exchange failed')
        return backTo(req, state.returnTo, 'error')
      }
      return backTo(req, state.returnTo, 'connected')
    },
  },
  {
    path: '/rohlik/disconnect',
    method: 'post',
    handler: async (req) => {
      const chataId = chataIdOf((await readBody(req)).chata)
      if (chataId == null) return Response.json({ error: 'invalid-chata' }, { status: 400 })
      if (!req.user || !(await isBanker(req, chataId))) {
        return Response.json({ error: 'forbidden' }, { status: 403 })
      }
      await deleteConnection(req.payload, req.user.id)
      return Response.json({ ok: true })
    },
  },
  {
    path: '/rohlik/search',
    method: 'get',
    handler: async (req) => {
      const user = req.user
      const chataId = chataIdOf(req.searchParams.get('chata'))
      if (chataId == null) return Response.json({ error: 'invalid-chata' }, { status: 400 })
      if (!user) return Response.json({ error: 'forbidden' }, { status: 401 })
      const allowed =
        canManageChata(user, chataId) ||
        (await viewerParticipantIds(req.payload, chataId, user.id)).length > 0
      if (!allowed) return Response.json({ error: 'forbidden' }, { status: 403 })

      const limit = checkRateLimit(`rohlik-search:${user.id}`, RATE_LIMITS.rohlikSearchPerUser)
      if (!limit.allowed) return rateLimitResponse(limit)

      const query = (req.searchParams.get('q') ?? '').trim().slice(0, 100)
      if (query.length < 2) return Response.json({ products: [] })

      const banker = await bankerAccountId(req.payload, chataId)
      const token = banker ? await getAccessToken(req.payload, banker) : null
      if (!token) return Response.json({ error: 'not-connected' }, { status: 409 })
      try {
        return Response.json({ products: await searchProducts(token, query) })
      } catch (err) {
        req.payload.logger.error({ err }, 'Rohlík search failed')
        return Response.json({ error: 'unavailable' }, { status: 502 })
      }
    },
  },
  {
    path: '/rohlik/send',
    method: 'post',
    handler: async (req) => {
      const chataId = chataIdOf((await readBody(req)).chata)
      if (chataId == null) return Response.json({ error: 'invalid-chata' }, { status: 400 })
      if (!req.user || !(await isBanker(req, chataId))) {
        return Response.json({ error: 'forbidden' }, { status: 403 })
      }
      const token = await getAccessToken(req.payload, req.user.id)
      if (!token) return Response.json({ error: 'not-connected' }, { status: 409 })

      // prices first, so the receipt shows what the cart will actually cost;
      // a failed check doesn't stop the send (Rohlík prices the cart itself)
      try {
        await refreshChataPrices(req.payload, chataId, token)
      } catch (err) {
        req.payload.logger.warn({ err }, 'Rohlík price refresh before send failed')
      }

      const { docs: items } = await req.payload.find({
        collection: 'shopping-items',
        where: { chata: { equals: chataId } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      // What still has to go in: whole items never sent, and only the
      // increase for items whose quantity grew after the last send — a
      // second click must not double the cart
      const pending = items
        .map((item) => {
          const quantity = Math.max(1, Math.round(item.quantity || 1))
          const already = item.sentToCartAt ? (item.sentQuantity ?? quantity) : 0
          return { item, quantity, delta: quantity - already }
        })
        .filter(({ delta }) => delta > 0)
      const routed = pending.map((entry) => ({ ...entry, route: sendRoute(entry.item.rohlik) }))
      const skipped = routed.filter(({ route }) => route === 'text').length
      // sold out at the check above: not in the cart, not marked sent, so a
      // later send picks them up once Rohlík has them again
      const soldOut = routed.filter(({ route }) => route === 'soldOut').length
      const lines = mergeCartLines(
        routed
          .filter(({ route }) => route === 'cart')
          .map(({ item, delta }) => ({
            title: item.title,
            quantity: delta,
            rohlik: item.rohlik,
          })),
      )

      let report: Awaited<ReturnType<typeof addToCart>>
      try {
        report = await addToCart(token, lines)
      } catch (err) {
        req.payload.logger.error({ err }, 'Rohlík add-to-cart failed')
        return Response.json({ error: 'unavailable' }, { status: 502 })
      }

      const added = new Set(report.added)
      const sentAt = new Date().toISOString()
      for (const { item, quantity, route } of routed) {
        const productId = item.rohlik?.productId
        if (route !== 'cart' || !productId || !added.has(productId)) continue
        await req.payload.update({
          collection: 'shopping-items',
          id: item.id,
          data: { sentToCartAt: sentAt, sentQuantity: quantity },
          depth: 0,
          overrideAccess: true,
        })
      }

      const titlesOf = new Map(lines.map((line) => [line.productId, line.titles.join(', ')]))

      // What the banker still adds by hand: free-text items, sold-out
      // products and lines Rohlík refused. They get the checklist by email
      // (src/utils/shoppingEmail.ts)
      const failedIds = new Set(report.failed.map((failure) => failure.productId))
      const manualPending = routed.filter(
        ({ item, route }) =>
          route !== 'cart' || failedIds.has(item.rohlik?.productId ?? ''),
      )
      let manualEmailed = false
      if (manualPending.length > 0) {
        const [chata, participants] = await Promise.all([
          req.payload.findByID({
            collection: 'chatas',
            id: chataId,
            depth: 0,
            overrideAccess: true,
            context: { triggerAfterRead: false },
          }),
          req.payload.find({
            collection: 'participants',
            where: { chata: { equals: chataId } },
            limit: 1000,
            depth: 0,
            overrideAccess: true,
          }),
        ])
        const nameOf = new Map(participants.docs.map((p) => [String(p.id), p.name]))
        const manualItems: ManualItem[] = manualPending.map(({ item, delta, route }) => ({
          title: item.title,
          quantity: delta,
          wantedBy: item.participant != null ? (nameOf.get(refId(item.participant)) ?? null) : null,
          note: item.note ?? null,
          reason: route === 'cart' ? 'rejected' : route,
        }))
        manualEmailed = await notifyManualItems(req.payload, {
          chata,
          banker: req.user,
          items: manualItems,
          addedCount: report.added.length,
          checkoutUrl: report.checkoutUrl,
        })
        // free-text items on the emailed checklist are handed over: the
        // banker has them, so the next send skips them (and the page stops
        // offering a send for them). Refused and sold-out Rohlík lines stay
        // pending and go in again next time.
        if (manualEmailed) {
          for (const { item, quantity, route } of manualPending) {
            if (route !== 'text') continue
            await req.payload.update({
              collection: 'shopping-items',
              id: item.id,
              data: { sentToCartAt: sentAt, sentQuantity: quantity },
              depth: 0,
              overrideAccess: true,
            })
          }
        }
      }

      return Response.json({
        lines: lines.length,
        added: report.added.length,
        failed: report.failed.map((failure) => ({
          title: titlesOf.get(failure.productId) ?? failure.productId,
          reason: failure.reason,
        })),
        skipped,
        soldOut,
        // where the banker finishes the order (Rohlík's own checkout link)
        checkoutUrl: report.checkoutUrl,
        // the "přidej ručně" checklist went out by email
        manualEmailed,
      })
    },
  },
]

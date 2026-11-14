import { MCP_SCOPES, getMcpResourceUrl, getPublicOrigin } from '@/lib/mcp/oauth'
import { isSameOriginRequest } from '@/lib/mcp/http'
import { mcpRuntime } from '@/lib/mcp/runtime'

export const dynamic = 'force-dynamic'

// The /claude page: the signed-in account's connected apps, and "Odpojit".
// Session cookie; only the account's OWN grants are listed or revoked.

export async function GET(request: Request) {
  const { payload, store } = await mcpRuntime()
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const grants = await store.listGrants(Number(user.id))
  return Response.json(
    {
      mcpUrl: getMcpResourceUrl(getPublicOrigin(request.headers)),
      connections: grants.map((g) => ({
        id: g.id,
        clientName: g.clientName,
        canWrite: g.scopes.includes(MCP_SCOPES.WRITE),
        createdAt: g.createdAt.toISOString(),
        lastUsedAt: g.lastUsedAt ? g.lastUsedAt.toISOString() : null,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request, getPublicOrigin(request.headers))) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }
  const { payload, store } = await mcpRuntime()
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  let id: unknown
  try {
    id = (await request.json())?.revoke
  } catch {
    id = undefined
  }
  if (typeof id !== 'string' && typeof id !== 'number') {
    return Response.json({ error: 'invalid' }, { status: 400 })
  }
  const grant = await store.getGrant(String(id))
  // somebody else's grant looks exactly like a missing one
  if (!grant || grant.userId !== Number(user.id)) {
    return Response.json({ error: 'not-found' }, { status: 404 })
  }
  await store.revokeGrant(grant.id)
  return Response.json({ ok: true })
}

import {
  MCP_SCOPES,
  buildRedirect,
  getPublicOrigin,
  issueAuthorizationCode,
  validateAuthorizeRequest,
} from '@/lib/mcp/oauth'
import { isSameOriginRequest } from '@/lib/mcp/http'
import { mcpRuntime } from '@/lib/mcp/runtime'

export const dynamic = 'force-dynamic'

// POST /api/mcp/oauth/decide — the consent page (/oauth/authorize) posts the
// ORIGINAL authorization query back here with the person's choice, so the
// request is validated again on the server rather than trusted from the
// page. Signed in by the session cookie; same-origin only. Answers the URL to
// send the browser to (Claude's callback, with a code or access_denied); the
// page navigates there itself, so CSP form-action never gets in the way.
export async function POST(request: Request) {
  const origin = getPublicOrigin(request.headers)
  if (!isSameOriginRequest(request, origin)) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }
  let body: { params?: unknown; decision?: unknown; allowWrite?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid' }, { status: 400 })
  }
  const params =
    body.params && typeof body.params === 'object'
      ? Object.fromEntries(
          Object.entries(body.params as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {}
  if (body.decision !== 'approve' && body.decision !== 'deny') {
    return Response.json({ error: 'invalid' }, { status: 400 })
  }

  const { payload, store } = await mcpRuntime()
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const validation = await validateAuthorizeRequest(store, params, origin)
  if (!validation.ok) {
    return Response.json({ error: validation.error, redirectTo: validation.redirectTo }, { status: 400 })
  }
  const { request: authorize } = validation
  if (body.decision === 'deny') {
    return Response.json({
      redirectTo: buildRedirect(authorize.redirectUri, {
        error: 'access_denied',
        state: authorize.state,
        iss: origin,
      }),
    })
  }
  const scopes =
    body.allowWrite === true
      ? authorize.scopes
      : authorize.scopes.filter((s) => s === MCP_SCOPES.READ)
  const code = await issueAuthorizationCode(store, authorize, Number(user.id), scopes)
  return Response.json({
    redirectTo: buildRedirect(authorize.redirectUri, { code, state: authorize.state, iss: origin }),
  })
}

// How a connector tool acts for its account: by calling the SAME HTTP API the
// web frontend calls (Payload's REST pipeline and the slug API), in-process,
// signed in as that account. Nothing here re-implements a rule. Collection
// access, the beforeChange hooks (expense authoring, private expenses, list
// rules), the custom endpoints (decide, organization, opt-outs, …) and the
// slug API's privacy scrub all run exactly as they do for a browser, so a
// connected Claude can never see or do more than the person could on the web.
//
// The session is a 2-minute JWT minted for the call, in the same shape the
// sign-in flows put in the `payload-token` cookie. It never leaves the
// process. Rate limits keyed on the client IP get `mcp:<grant>` instead of
// Anthropic's shared egress address, so one person's connector cannot use up
// everybody else's budget.

import jwt from 'jsonwebtoken'
import config from '@payload-config'
import { handleEndpoints, type Payload } from 'payload'
import { GET as slugApiGet } from '@/app/(payload)/api/chatas/slug/[slug]/route'
import type { User } from '@/payload-types'
import type { McpAuth } from './oauth'

export interface ApiResult<T = unknown> {
  status: number
  ok: boolean
  data: T
}

export interface Caller {
  payload: Payload
  auth: McpAuth
  user: User
  origin: string
}

function sessionCookie(user: User): string {
  const token = jwt.sign(
    { id: user.id, email: user.email, collection: 'users' },
    process.env.PAYLOAD_SECRET!,
    { expiresIn: 120 },
  )
  return `payload-token=${token}`
}

function headersFor(caller: Caller, json: boolean): Headers {
  const headers = new Headers({
    cookie: sessionCookie(caller.user),
    'x-forwarded-for': `mcp:${caller.auth.grantId}`,
    accept: 'application/json',
    'user-agent': 'zicha.travel Claude connector',
  })
  if (json) headers.set('content-type', 'application/json')
  return headers
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 500) }
  }
}

/** One call to /api/<path> through Payload's REST pipeline, as the caller. */
export async function callApi<T = unknown>(
  caller: Caller,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const url = new URL(`/api/${path.replace(/^\/+/, '')}`, caller.origin)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  const hasBody = options.body !== undefined
  const request = new Request(url, {
    method,
    headers: headersFor(caller, hasBody),
    body: hasBody ? JSON.stringify(options.body) : undefined,
  })
  const response = await handleEndpoints({ config, request, path: url.pathname })
  return { status: response.status, ok: response.ok, data: (await readJson(response)) as T }
}

/** The slug API payload (/api/chatas/slug/:slug) exactly as the caller's browser would get it. */
export async function fetchChataPayload<T = unknown>(caller: Caller, slug: string): Promise<ApiResult<T>> {
  const url = new URL(`/api/chatas/slug/${encodeURIComponent(slug)}`, caller.origin)
  const request = new Request(url, { method: 'GET', headers: headersFor(caller, false) })
  const response = await slugApiGet(request, { params: Promise.resolve({ slug }) })
  return { status: response.status, ok: response.ok, data: (await readJson(response)) as T }
}

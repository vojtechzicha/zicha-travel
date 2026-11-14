# Claude connector (remote MCP)

The site serves a remote [MCP](https://modelcontextprotocol.io) server at
`/api/mcp`. Any zicha.travel account can add it to Claude once, and every
Claude session (claude.ai chat, the desktop and mobile apps, Claude Code)
can then read that account's chatas and, with write access, do what the
account could do on the web: add and edit expenses, confirm them, take beds
and car seats, edit the shopping list and the beer order, vote.

The shape follows the connectors of zicha-study and toggl-track-quick-view
(OAuth 2.1 + PKCE, hashed opaque tokens, a stateless endpoint, an audit
log, read/write scopes). The difference: those apps have one owner, this one
has many accounts with different rights, so the connector acts **as one
account** and must never see or do more than that account can on the web.

## Connect

**claude.ai** (also the desktop and mobile apps and Claude Code cloud
sessions): Settings → Connectors → Add custom connector, URL
`https://zicha.travel/api/mcp`. Claude opens `/oauth/authorize`: sign in
if needed, pick "Číst i upravovat" or "Jen číst", allow.

**Claude Code in a terminal:**

```bash
claude mcp add --transport http --scope user zicha-travel https://zicha.travel/api/mcp
```

Then `/mcp` in Claude Code and authenticate.

**`/claude`** (footer link "Propojení s Claude", signed-in only) shows the
address, copies the Claude Code command and lists the account's connected
apps with "Odpojit". User help: `/napoveda/claude`.

## Parity: how a tool acts as the account

`src/lib/mcp/loopback.ts` is the whole trick. A tool never queries the
database with its own rules. It calls the site's own HTTP API in-process:

- `callApi()` runs Payload's REST pipeline (`handleEndpoints`, the same thing
  `app/(payload)/api/[...slug]` runs) for `/api/expenses`, the custom
  endpoints (`expenses/decide`, `expenses/private-settle`,
  `chatas/:id/organization`, `list-opt-outs/set`, `keg-items/taps`, …) and so
  on;
- `fetchChataPayload()` calls the slug API route
  (`/api/chatas/slug/:slug`), whose privacy scrub, finance gating (locked
  participants), pending/private visibility and `privateInfo` blanking are
  exactly what the browser gets.

Both carry a 2-minute JWT minted for the call in the `payload-token` shape,
so Payload's `app-jwt` strategy signs the request in as the account. The
JWT never leaves the process. `x-forwarded-for` is `mcp:<grant id>`, so the
endpoints' per-IP rate limits count per connection instead of lumping every
user behind Anthropic's egress address together.

Consequence: a new rule added to a collection hook or an endpoint applies to
Claude automatically. A new feature on the web needs a tool only if Claude
should be able to use it.

## Tools

| Area | Tools |
| --- | --- |
| Context | `get_context` (account, role, today, the account's chatas) |
| Trip | `get_chata` (Informace + Účastníci), `get_organization` (beds, cars, transport) |
| Money | `get_finances` (balances, settlement, banker account, prepayments, breakdowns, private layer), `list_expenses` |
| Expenses | `create_expense`, `update_expense`, `delete_expense`, `decide_expense`, `mark_private_payment` |
| Organizace | `edit_beds` (place / leave), `edit_cars` (offer / update / remove / seat / leave) |
| Nákup | `get_shopping_list`, `search_rohlik_products`, `add_/update_/delete_shopping_item`, `send_shopping_to_rohlik` |
| Pivo | `get_beer_order` (optionally with the catalog), `add_/update_/delete_beer_item`, `change_bar_taps`, `email_beer_order_summary` |
| Lists | `close_list`, `set_list_opt_out` |
| Planning | `get_planning`, `submit_vote`, `withdraw_vote` |
| Claims | `claim_participant`, `cancel_claim` |
| History | `list_recent_changes` (this account's connector writes) |

Chatas and people are named by id, slug or exact (case-insensitive) name
(`src/lib/mcp/chata.ts`). Expense tools take `dry_run`. Read tools need
`travel:read`, the rest `travel:write`; a read-only token does not even list
the write tools. Tools are annotated read-only / destructive / open-world
(Rohlík), so Claude asks before deleting.

**Left on the web:** receipts (photos need the upload flow), connecting
Rohlík (browser paste flow), login and registration, and all admin-panel
work (participants, prepayments, chata settings, rooms and beds). The
server instructions (`src/lib/mcp/server.ts`) say so, and explain the money
rules (split modes, 1 Kč threshold, banker pot, invitations, planned,
"za jiného plátce", private).

## OAuth

```
Claude ── POST /api/mcp (Bearer) ──▶ app/(payload)/api/mcp/route.ts ─▶ lib/mcp/server.ts ─▶ lib/mcp/tools/* ─▶ lib/mcp/loopback.ts ─▶ the site's own API
   │ 401 + resource_metadata
   ├─▶ /.well-known/oauth-protected-resource/api/mcp   (RFC 9728)
   ├─▶ /.well-known/oauth-authorization-server         (RFC 8414)
   ├─▶ POST /api/mcp/oauth/register                    (dynamic client registration, RFC 7591)
   ├─▶ /oauth/authorize                                (sign-in + consent, PKCE S256)
   │     └─ POST /api/mcp/oauth/decide                 (session cookie, same-origin)
   ├─▶ POST /api/mcp/oauth/token                       (authorization_code, refresh_token)
   └─▶ POST /api/mcp/oauth/revoke                      (RFC 7009)
```

- `src/lib/mcp/oauth.ts`: the authorization server, on the `McpStore`
  interface; unit-tested against the in-memory store
  (`tests/int/mcpOAuth.int.spec.ts`).
- `src/lib/mcp/store.ts`: `payloadMcpStore` (production) and
  `memoryMcpStore` (tests). Codes and refresh tokens are consumed with one
  `UPDATE … RETURNING`, so a race never lets both requests win.
- Collections (`src/collections/McpConnector.ts`, System group, closed to the
  API; only `mcp-grants` and `mcp-audit` are visible to superadmins in the
  admin): `mcp-clients`, `mcp-grants` (one per connected app and account),
  `mcp-tokens` (codes, access and refresh tokens, as SHA-256 hashes),
  `mcp-audit`.
- The consent page posts the ORIGINAL query to `/api/mcp/oauth/decide`,
  which validates it again and answers the URL to continue to; the page
  navigates there itself, so CSP `form-action 'self'` is not in the way.
  The decide and `/api/mcp/connections` endpoints check the Origin.
- The endpoint is stateless (a new MCP server per request, JSON responses),
  which fits Vercel functions. The issuer is the request's own origin, and
  tokens are bound to it, so a production token does not work on a preview.

## Safety

- **Who:** any signed-in account; it acts as itself. Superadmins and chata
  admins get their web powers on the site's frontend endpoints, never the
  admin panel. Their connection outlives the 2-hour admin session (accepted
  risk, recorded in `docs/legal/bezpecnost-a-incidenty.md`).
- **Scopes:** `travel:read`, or `travel:read travel:write`, chosen on the
  consent page.
- **Tokens:** access 1 hour, refresh 60 days, rotated on every use; reusing
  an old refresh token revokes the whole connection. Rotating
  `PAYLOAD_SECRET` does NOT revoke them (they are not JWTs): revoke grants
  instead (incident procedure).
- **Redirects:** only `https://claude.ai/api/mcp/auth_callback`,
  `https://claude.com/api/mcp/auth_callback` and loopback addresses.
- **Audit:** every write lands in `mcp-audit` with the request and the record
  before and after; `list_recent_changes` shows an account its own rows.
- **Rate limits:** 300 MCP requests a minute per connection, 20 client
  registrations an hour and 60 token requests a minute per IP (in-memory,
  per instance, like the rest of `src/lib/rateLimit.ts`).
- **Account deletion:** the Users beforeDelete hook removes the account's
  tokens, grants and audit rows (`src/utils/userCleanup.ts`).
- **Retention** (`src/utils/retention.ts`): expired tokens daily, grants
  revoked 30+ days ago, audit rows after 12 months, clients nobody connected
  within 30 days. A token refresh stamps `users.lastLoginAt`, so an account
  used only through Claude is not "dormant".
- **Legal:** Anthropic is the user's own tool, not our processor (decision
  15 in `docs/legal/compliance-gaps.md`); privacy policy version 7,
  sections 3, 4, 6, 7, 8, 9, 14 and 15; terms version 3, section 5.

## Testing locally

```bash
pnpm dev
npx @modelcontextprotocol/inspector
```

Connect the Inspector to `http://localhost:3000/api/mcp` (Streamable HTTP).
Its callback is a loopback address, so it registers without configuration;
sign in on the consent page with a local account.

Tests: `tests/int/mcpOAuth.int.spec.ts` (pure OAuth) and
`tests/int/mcpConnector.int.spec.ts` (local database: the full flow through
`/api/mcp`, scope filtering, and the parity matrix: private expenses, locked
participants, keys and Wi-Fi, "za jiného plátce", other people's expenses,
shopping-list rights, account deletion). The local database needs the new
tables first: run `pnpm dev` once so Payload pushes the schema (vitest never
pushes).

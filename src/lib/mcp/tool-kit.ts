// Tool plumbing for the connector: a tool is a zod input shape plus a handler
// that acts through src/lib/mcp/loopback.ts as the signed-in account. Read
// tools need travel:read, everything else travel:write; tools the token
// can't use are not even listed.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { z, ZodRawShape } from 'zod'
import { MCP_SCOPES } from './oauth'
import type { ApiResult, Caller } from './loopback'

export type ToolAccess = 'read' | 'write' | 'delete'

export interface ToolDefinition<Shape extends ZodRawShape = ZodRawShape> {
  name: string
  title: string
  description: string
  access: ToolAccess
  /** The tool talks to a service outside zicha.travel (Rohlík). */
  openWorld?: boolean
  input: Shape
  handler: (args: z.infer<z.ZodObject<Shape>>, caller: Caller) => Promise<unknown>
}

export function defineTool<Shape extends ZodRawShape>(def: ToolDefinition<Shape>): ToolDefinition {
  return def as unknown as ToolDefinition
}

/** Expected failures (not found, refused, validation). The message is shown to the agent. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolError'
  }
}

export function canUse(def: ToolDefinition, scopes: string[]): boolean {
  return def.access === 'read'
    ? scopes.includes(MCP_SCOPES.READ)
    : scopes.includes(MCP_SCOPES.WRITE)
}

// Error codes the site's endpoints answer with, explained for the agent.
const ERROR_HINTS: Record<string, string> = {
  forbidden: 'this account may not do that (the same rule applies on the web)',
  'not-found': 'no such record, or this account cannot see it',
  invalid: 'the request was not valid',
  'already-decided': 'somebody already decided this expense',
  'rate-limited': 'too many requests, wait a little and retry',
  'not-connected': "the banker's Rohlík account is not connected (they connect it on the web)",
  unavailable: 'the service did not answer, try again later',
  disabled: 'this part is switched off for the chata',
  planning: 'the chata is still in the planning phase',
  'trip-over': 'the trip is over, its organization is read-only',
  'room-full': 'the room is full for those nights',
  'car-full': 'the car has no free seat',
  'front-taken': 'the front seat is taken',
  'is-driver': 'that person drives a car and cannot take a seat elsewhere',
  'already-driving': 'that person already offers a car',
  'seats-too-few': 'more people ride in the car than that many seats',
  'invalid-car': 'the car details are not valid',
  closed: 'the list is closed (ordered); the banker can reopen it',
  'name-taken': 'another participant of the chata already has that name',
}

/** Turns a non-2xx loopback answer into a ToolError with whatever the site said. */
export function expectOk<T>(result: ApiResult<T>, what: string): T {
  if (result.ok) return result.data
  const data = result.data as
    | { error?: unknown; errors?: Array<{ message?: string; data?: unknown }>; message?: string }
    | null
  const code = typeof data?.error === 'string' ? data.error : null
  const messages = (data?.errors ?? [])
    .map((e) => {
      const fieldErrors = (e.data as { errors?: Array<{ path?: string; message?: string }> } | undefined)
        ?.errors
      if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
        return fieldErrors.map((f) => `${f.path ?? ''}: ${f.message ?? ''}`).join('; ')
      }
      return e.message
    })
    .filter(Boolean)
  const detail =
    messages.length > 0
      ? messages.join('; ')
      : code
        ? `${code}${ERROR_HINTS[code] ? ` (${ERROR_HINTS[code]})` : ''}`
        : (data?.message ?? 'unknown error')
  throw new ToolError(`${what} failed (HTTP ${result.status}): ${detail}`)
}

function textResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data ?? null, null, 2) }] }
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

export async function runTool(
  def: ToolDefinition,
  args: unknown,
  caller: Caller,
): Promise<CallToolResult> {
  if (!canUse(def, caller.auth.scopes)) {
    return errorResult(`This connection is read-only; ${def.name} needs the travel:write scope.`)
  }
  try {
    return textResult(await def.handler(args as never, caller))
  } catch (err) {
    if (err instanceof ToolError) return errorResult(err.message)
    console.error(`MCP tool ${def.name} failed:`, err)
    return errorResult('Unexpected server error. Nothing more is known; try again or use the web.')
  }
}

export function registerTools(server: McpServer, tools: ToolDefinition[], caller: Caller) {
  for (const def of tools) {
    if (!canUse(def, caller.auth.scopes)) continue
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.input,
        annotations: {
          title: def.title,
          readOnlyHint: def.access === 'read',
          destructiveHint: def.access === 'delete',
          openWorldHint: def.openWorld === true,
        },
      },
      ((args: unknown) => runTool(def, args, caller)) as never,
    )
  }
}

// ─── Audit log ──────────────────────────────────────────────────────────────

export async function audit(
  caller: Caller,
  entry: {
    tool: string
    action: string
    chata?: number | null
    collection?: string
    documentId?: string | number | null
    request?: unknown
    before?: unknown
    after?: unknown
  },
) {
  try {
    await caller.payload.create({
      collection: 'mcp-audit',
      data: {
        user: caller.user.id,
        grant: Number(caller.auth.grantId),
        clientName: caller.auth.clientName,
        tool: entry.tool,
        action: entry.action,
        chata: entry.chata ?? null,
        targetCollection: entry.collection ?? null,
        documentId: entry.documentId != null ? String(entry.documentId) : null,
        request: (entry.request ?? null) as never,
        before: (entry.before ?? null) as never,
        after: (entry.after ?? null) as never,
      },
      depth: 0,
      overrideAccess: true,
    })
  } catch (err) {
    // the write itself happened; a lost log row must not turn it into an error
    console.error('MCP audit write failed:', err)
  }
}

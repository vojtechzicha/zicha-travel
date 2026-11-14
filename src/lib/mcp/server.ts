import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerTools, type ToolDefinition } from './tool-kit'
import type { Caller } from './loopback'
import { contextTools } from './tools/context'
import { tripTools } from './tools/trip'
import { financeTools } from './tools/finance'
import { expenseTools } from './tools/expenses'
import { organizationTools } from './tools/organization'
import { listTools } from './tools/lists'
import { planningTools } from './tools/planning'
import { auditTools } from './tools/audit'

export const MCP_TOOLS: ToolDefinition[] = [
  ...contextTools,
  ...tripTools,
  ...financeTools,
  ...expenseTools,
  ...organizationTools,
  ...listTools,
  ...planningTools,
  ...auditTools,
]

// What a model needs to know before the first call. Kept short; each tool's
// description carries its own rules.
export const INSTRUCTIONS = `zicha.travel: shared trips ("chata", plural chatas) and their money, beds, cars and shopping, for one signed-in account. Czech UI and data; amounts in CZK.
Start with get_context: it lists the account's chatas. Name a chata by id, slug or name, and people by id or exact name.
You act as this person and can see and change exactly what they could on the web. When something is refused, the same rule applies on the web; say so rather than working around it.
Money: every expense is split equally among everybody, by shares, or by exact amounts. Each person's balance is what they paid and prepaid minus their fair share; within 1 Kč counts as settled. Debtors pay the banker, the banker pays creditors. An invitation ("pozvání") moves a guest's share to their host. A planned expense is an estimate, not paid yet. An expense recorded for somebody else waits for their confirmation and does not count until then. A private expense (gift, surprise) is visible only to its payer and the people in it, stays out of the pot and is settled directly.
Writes go to production and are seen by everyone in the chata; some send emails (approval requests, the keg order summary). Read first, use dry_run where offered, and confirm with the user before deleting or before acting for somebody else. list_recent_changes shows what was changed through Claude.
Write titles and notes in Czech like the existing data unless the user asks otherwise. Receipts, photos, Rohlík connecting and admin-panel work (participants, prepayments, chata settings) stay on the web.`

// One server per request: the endpoint is stateless and the tool list depends on the token's scopes.
export function createMcpServer(caller: Caller) {
  const server = new McpServer(
    { name: 'zicha-travel', title: 'zicha.travel', version: '1.0.0' },
    { instructions: INSTRUCTIONS },
  )
  registerTools(server, MCP_TOOLS, caller)
  return server
}

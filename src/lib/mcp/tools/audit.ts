import { z } from 'zod'
import { refId } from '@/lib/access'
import { defineTool } from '../tool-kit'
import { loadChata } from '../chata'

const ref = z.union([z.string(), z.number()])

export const auditTools = [
  defineTool({
    name: 'list_recent_changes',
    title: 'What this account changed through Claude',
    description:
      'The log of writes made through the connector by THIS account (any connected app), ' +
      'newest first, with the record before and after. Use it to review or undo.',
    access: 'read',
    input: {
      limit: z.number().int().min(1).max(100).optional(),
      chata: ref.optional(),
    },
    handler: async ({ limit, chata }, caller) => {
      const chataId = chata !== undefined ? (await loadChata(caller, chata)).ref.id : null
      const result = await caller.payload.find({
        collection: 'mcp-audit',
        where: {
          and: [
            { user: { equals: caller.user.id } },
            ...(chataId != null ? [{ chata: { equals: chataId } }] : []),
          ],
        },
        sort: '-createdAt',
        limit: limit ?? 20,
        depth: 0,
        overrideAccess: true,
      })
      return {
        changes: result.docs.map((row: any) => ({
          at: row.createdAt,
          app: row.clientName,
          tool: row.tool,
          action: row.action,
          chata: row.chata,
          collection: row.targetCollection,
          record: row.documentId,
          request: row.request,
          before: row.before,
          after: row.after,
          grant: row.grant != null ? refId(row.grant) : null,
        })),
      }
    },
  }),
]

/**
 * Normalized identity returned by GET /api/auth/me and consumed by the
 * frontend finance view. Kept provider-agnostic and free of server imports so
 * client components can use the type.
 *
 * `providers` lists the OAuth providers that are configured (env present), so
 * the UI can render the right login / add-email buttons in every state.
 */
export type Identity =
  | { type: 'none'; providers: string[] }
  | { type: 'admin'; providers: string[]; name?: string; email?: string; canManage: boolean }
  | {
      type: 'participant'
      providers: string[]
      accountName?: string
      emails: string[]
      participant: { id: number; name: string }
    }
  | { type: 'participant-unlinked'; providers: string[]; accountName?: string; emails: string[] }

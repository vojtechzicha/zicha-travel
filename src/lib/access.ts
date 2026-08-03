import type { Access, PayloadRequest } from 'payload'

// Role model ("uživatelé a role"):
// - superadmin: full access to everything, all chatas
// - admin: admin-panel access limited to their assignedChatas
// - user: frontend-only account linked to participant(s) — never gets
//   admin-panel access or write access to any collection
//
// NOTE for the database: the legacy values were 'admin' (= today's
// superadmin) and 'user' (= today's admin). scripts/migrate-payer-polymorphic.mjs
// renames the enum values in place, so old rows keep their meaning.

type AnyUser = PayloadRequest['user']

export const refId = (value: unknown): string =>
  typeof value === 'object' && value !== null
    ? String((value as { id: unknown }).id)
    : String(value)

export const isSuperadmin = (user: AnyUser): boolean => user?.role === 'superadmin'

/** superadmin or (chata-scoped) admin — anyone allowed into the admin panel */
export const isAdminRole = (user: AnyUser): boolean =>
  user?.role === 'superadmin' || user?.role === 'admin'

export const assignedChataIds = (user: AnyUser): string[] =>
  (((user?.assignedChatas as unknown[]) || []) as unknown[]).map(refId)

export const canManageChata = (user: AnyUser, chataId: unknown): boolean => {
  if (!user) return false
  if (isSuperadmin(user)) return true
  if (user.role !== 'admin') return false
  return assignedChataIds(user).includes(refId(chataId))
}

/** Access: superadmins only */
export const superadminOnly: Access = ({ req: { user } }) => isSuperadmin(user)

/** Access: any admin-panel role (superadmin or admin) */
export const adminRoleOnly: Access = ({ req: { user } }) => isAdminRole(user)

/**
 * Access for collections that belong to a chata via a `chata` relationship:
 * superadmin everything, admin only documents of their assigned chatas.
 */
export const chataScopedAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperadmin(user)) return true
  if (user.role !== 'admin') return false
  return {
    chata: {
      in: user.assignedChatas || [],
    },
  }
}

/**
 * Access on the Chatas collection itself: superadmin everything, admin only
 * their assigned chatas (matched on id).
 */
export const ownChataAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperadmin(user)) return true
  if (user.role !== 'admin') return false
  return {
    id: {
      in: user.assignedChatas || [],
    },
  }
}

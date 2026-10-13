import type { Payload } from 'payload'
import type { Chata, User } from '@/payload-types'
import { sendAppEmail } from '@/lib/email'
import { chataViewUrl, manualItemsEmail, type ManualItem } from '@/lib/shoppingEmail'
import { claimDecisionMakers } from './claimRequests'

/**
 * Who gets the "přidej ručně" checklist: the banker who sent the list (it
 * is their cart), or — when their account has no email — the chata's
 * admins (superadmins + admins with the chata assigned, like claim emails).
 */
export async function manualItemsRecipients(
  payload: Payload,
  chataId: number,
  banker: Pick<User, 'email'> | null,
): Promise<string[]> {
  if (banker?.email) return [banker.email]
  const admins = await claimDecisionMakers(payload, chataId)
  return admins.map((admin) => admin.email).filter((email): email is string => Boolean(email))
}

/**
 * Sends the checklist after "Poslat do košíku". Failures are logged, never
 * thrown: the cart is already filled and the result shows on the page too.
 * Returns whether at least one email went out.
 */
export async function notifyManualItems(
  payload: Payload,
  args: {
    chata: Pick<Chata, 'id' | 'name' | 'shortName' | 'slug' | 'domains'>
    banker: Pick<User, 'email'> | null
    items: ManualItem[]
    addedCount: number
    checkoutUrl: string | null
  },
): Promise<boolean> {
  if (args.items.length === 0) return false
  try {
    const recipients = await manualItemsRecipients(payload, args.chata.id, args.banker)
    const email = manualItemsEmail({
      chataName: args.chata.shortName || args.chata.name,
      items: args.items,
      addedCount: args.addedCount,
      checkoutUrl: args.checkoutUrl,
      listUrl: chataViewUrl(args.chata, 'shopping'),
    })
    let sent = false
    for (const to of recipients) {
      try {
        await sendAppEmail(payload, { to, ...email })
        sent = true
      } catch (err) {
        payload.logger.error({ err }, 'Failed to send the shopping checklist email')
      }
    }
    return sent
  } catch (err) {
    payload.logger.error({ err }, 'Failed to prepare the shopping checklist email')
    return false
  }
}

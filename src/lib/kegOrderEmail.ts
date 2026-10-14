// "Pivo": the order summary the banker emails themselves from the tab
// (POST /api/keg-items/order-summary). Benecentrum has no API, so this is
// the order written out once, ready to forward to the shop or read out on
// the phone, plus who asked for what. Czech only, tykání, like the other
// emails to the trip's organizers. Nothing here goes to the shop itself.

import { createHash } from 'node:crypto'
import { formatCurrency } from './formatCurrency'
import {
  BEER_SHOP,
  beerTotals,
  lineCost,
  mergeOrderLines,
  tapRentalDays,
  type OrderLine,
} from './beer'
import { chataViewUrl } from './shoppingEmail'
import { KEG_CATALOG_PRINTED } from './kegCatalog'

export interface KegOrderEmail {
  subject: string
  text: string
  html: string
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const plural = (count: number, one: string, few: string, many: string) =>
  `${count} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`

/** 1 sud / 2 sudy / 5 sudů */
export const kegsCs = (count: number) => plural(count, 'sud', 'sudy', 'sudů')
/** 1 den / 2 dny / 5 dní */
export const daysCs = (count: number) => plural(count, 'den', 'dny', 'dní')

/** "pátek 13. 11. 2026" (dates are stored at noon UTC, read in Prague) */
export function arrivalDayCs(date: string): string {
  return new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'Europe/Prague',
  }).format(new Date(date))
}

/** One order line as the shop should read it. */
export function orderLineText(line: OrderLine, tapDays: number): string {
  if (line.unit === 'day') {
    return `${line.quantity}× ${line.name} na ${daysCs(tapDays)}`
  }
  // our codes mean nothing to the shop: name and size are what it needs
  return `${line.quantity}× ${line.name}, sud ${line.liters} l, ${formatCurrency(line.price)} za sud`
}

export function kegOrderEmail(args: {
  chataName: string
  lines: OrderLine[]
  /** rental days of every tap (tapRentalDays) */
  tapDays: number
  /** where the beer should go: the cottage's name and address */
  place: string | null
  /** arrival day and check-in time, as the chata states them */
  arrival: string | null
  listUrl: string
}): KegOrderEmail {
  const { chataName, lines, tapDays, place, arrival, listUrl } = args
  const totals = beerTotals(lines, tapDays)
  const tap = lines.find((line) => line.unit === 'day')
  const printed = new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(new Date(`${KEG_CATALOG_PRINTED}T12:00:00.000Z`))

  const intro =
    `Tady je objednávka piva, kterou parta poskládala na stránce ${chataName}. ` +
    `Přepošli ji na ${BEER_SHOP.email}, nebo ji nadiktuj na ${BEER_SHOP.phone}.`
  const order = lines.map((line) => orderLineText(line, tapDays))
  const where = [place ? `Na chatu: ${place}.` : null, arrival ? `Příjezd: ${arrival}.` : null]
  const sum =
    `Celkem ${kegsCs(totals.kegs)}, ${totals.liters} l. Podle ceníku z ${printed} ` +
    `to vychází asi na ${formatCurrency(totals.total)}` +
    (tap
      ? `, z toho kohouty ${formatCurrency(lineCost(tap, tapDays))} podle orientační ceny ` +
        `${formatCurrency(tap.price)} za kohout a den.`
      : '.')
  const caveat = 'Zálohu na sudy, kohouty a dopravu ceník neuvádí, domluv je s obchodem.'
  const who = lines
    .filter((line) => line.wantedBy.length > 0 || line.notes.length > 0)
    .map((line) => {
      const label = line.unit === 'day' ? line.name : `${line.name} ${line.liters} l`
      const parts = [line.wantedBy.join(', '), ...line.notes.map((note) => `„${note}“`)]
      return `${label}: ${parts.filter(Boolean).join('; ')}`
    })

  const text =
    `${intro}\n\n` +
    `Objednávka:\n${order.map((line) => `- ${line}`).join('\n')}\n` +
    where
      .filter(Boolean)
      .map((line) => `${line}\n`)
      .join('') +
    `\n${sum}\n${caveat}\n` +
    (who.length > 0 ? `\nKdo co chce:\n${who.map((line) => `- ${line}`).join('\n')}\n` : '') +
    `\nCelý seznam: ${listUrl}\n`

  const list = (items: string[]) =>
    `<ul style="line-height: 1.7; padding-left: 20px;">${items
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('')}</ul>`

  return {
    subject: `${chataName}: objednávka piva do Benecentra`,
    text,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
        <h2 style="color: #d97706;">zicha.travel</h2>
        <h3 style="margin: 0 0 10px;">Objednávka piva</h3>
        <p style="line-height: 1.6;">${escapeHtml(intro)}</p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 4px 16px 12px;">
          <p style="font-weight: bold; margin: 12px 0 0;">Objednávka</p>
          ${list(order)}
          ${where
            .filter((line): line is string => Boolean(line))
            .map((line) => `<p style="margin: 4px 0;">${escapeHtml(line)}</p>`)
            .join('')}
        </div>
        <p style="line-height: 1.6;">${escapeHtml(sum)}<br />${escapeHtml(caveat)}</p>
        ${who.length > 0 ? `<p style="font-weight: bold; margin: 16px 0 0;">Kdo co chce</p>${list(who)}` : ''}
        <p style="line-height: 1.6; color: #666; font-size: 13px;">
          Celý seznam najdeš na <a href="${escapeHtml(listUrl)}" style="color: #666;">stránce chaty</a>.
        </p>
      </div>`,
  }
}

/** The chata fields the summary email reads. */
export interface KegOrderChata {
  name: string
  shortName?: string | null
  slug?: string | null
  domains?: { domain: string }[] | null
  destinationName?: string | null
  destinationLocation?: string | null
  tripDateFrom?: string | null
  tripDateTo?: string | null
  tripDatesTentative?: boolean | null
  tripPlannedNights?: number | null
  checkInTime?: string | null
  beerTapDays?: number | null
  beerClosedAt?: string | null
  beerClosedTapDays?: number | null
}

/**
 * The summary email for a chata's beer order as it stands now. The endpoint
 * sends it; the slug API rebuilds it to tell whether the last one sent is
 * still current (kegOrderFingerprint), so both read the same inputs.
 */
export function buildKegOrderEmail(
  chata: KegOrderChata,
  items: {
    code: string
    name?: string | null
    liters?: number | null
    price?: number | null
    unit?: string | null
    quantity: number
    participant?: number | string | { id: number | string } | null
    note?: string | null
  }[],
  participants: { id: number | string; name: string }[],
): KegOrderEmail {
  const nameOf = new Map(participants.map((p) => [String(p.id), p.name]))
  const participantId = (value: unknown) =>
    value != null && typeof value === 'object' ? (value as { id: unknown }).id : value
  const lines = mergeOrderLines(
    items.map((item) => ({
      code: item.code,
      name: item.name ?? item.code,
      liters: item.liters ?? null,
      price: item.price ?? 0,
      unit: item.unit === 'day' ? 'day' : 'keg',
      quantity: item.quantity,
      wantedBy:
        item.participant != null
          ? (nameOf.get(String(participantId(item.participant))) ?? null)
          : null,
      note: item.note ?? null,
    })),
  )
  const place = [chata.destinationName, chata.destinationLocation].filter(Boolean).join(', ')
  const arrival =
    chata.tripDateFrom && !chata.tripDatesTentative
      ? [arrivalDayCs(chata.tripDateFrom), chata.checkInTime].filter(Boolean).join(', ')
      : null
  return kegOrderEmail({
    chataName: chata.shortName || chata.name,
    lines,
    tapDays: tapRentalDays(chata),
    place: place || null,
    arrival,
    listUrl: chataViewUrl(chata, 'beer'),
  })
}

/**
 * What a sent summary said, as a short hash of its subject and text: any
 * change the email would show (items, notes, names, rental days, place,
 * arrival) changes it.
 */
export function kegOrderFingerprint(email: Pick<KegOrderEmail, 'subject' | 'text'>): string {
  return createHash('sha256').update(`${email.subject}\n${email.text}`).digest('hex')
}

#!/usr/bin/env tsx
// Retakes the screenshots used by the help pages (/napoveda/*).
//
//   1. seed the demo chata:  pnpm exec tsx scripts/seed-help-demo.mts
//   2. run the dev server:   pnpm dev            (port 3000 by default)
//   3. shoot:                pnpm exec tsx scripts/shoot-help-screenshots.mts
//
// SITE (default http://localhost:3000) and OUT (default public/napoveda)
// can be overridden. Everything is captured against the made-up "Ukázková
// chata" from the seed script, never against real data.
//
// Signed-in shots (the FAB, the composer wizard, an own expense card) use a
// hand-signed session cookie for the demo account — the same JWT shape the
// login routes issue (src/lib/auth/session.ts).

import { config as loadEnv } from 'dotenv'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import jwt from 'jsonwebtoken'
import { chromium, type Browser, type Page } from 'playwright'

const run = promisify(execFile)

loadEnv({ path: '.env.local' })
loadEnv()

const SITE = process.env.SITE || 'http://localhost:3000'
const OUT = process.env.OUT || path.join(process.cwd(), 'public', 'napoveda')
const SLUG = 'ukazka'
const DEMO_EMAIL = 'demo@zicha.travel'

const DESKTOP = { width: 1280, height: 900 }
const PHONE = { width: 420, height: 880 }

interface Ids {
  chataId: number
  slug: string
  participants: Record<string, number>
  userId: number
  adminId: number
  claimId: number
}

/** Written by seed-help-demo.mts — the admin and claim rows are not public. */
async function loadIds(): Promise<Ids> {
  const manifest = path.join(process.cwd(), 'scripts', '.help-demo.json')
  try {
    return JSON.parse(await readFile(manifest, 'utf8')) as Ids
  } catch {
    throw new Error(`chybí ${manifest} — spusťte nejdřív scripts/seed-help-demo.mts`)
  }
}

function sessionCookie(userId: number, email = DEMO_EMAIL) {
  const token = jwt.sign({ id: userId, email, collection: 'users' }, process.env.PAYLOAD_SECRET!, {
    expiresIn: 60 * 60,
  })
  const { hostname } = new URL(SITE)
  return { name: 'payload-token', value: token, domain: hostname, path: '/' }
}

/**
 * Screenshots are shot as PNG (all Playwright offers) and stored as WebP:
 * captured at 2× for sharp text, the whole set is ~6 MB as PNG and under
 * 1 MB as WebP. Needs `cwebp` (brew install webp).
 */
async function toWebp(pngPath: string): Promise<string> {
  const webpPath = pngPath.replace(/\.png$/, '.webp')
  await run('cwebp', ['-quiet', '-q', '82', pngPath, '-o', webpPath])
  await rm(pngPath)
  return webpPath
}

/** Waits for the client-side chata view to swap the skeleton for content. */
async function ready(page: Page, selector: string) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 20000 })
  // the dev-server overlay button would sit in every screenshot
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.waitForTimeout(700) // fonts + background image settle
}

/**
 * Crops to one element. Uses a full-page screenshot so tall content (the
 * overview table, a whole finance panel) is not cut off at the fold;
 * `maxHeight` keeps the images readable when embedded in the help pages.
 */
async function shootElement(
  page: Page,
  selector: string,
  file: string,
  { pad = 14, maxHeight = 1500 }: { pad?: number; maxHeight?: number } = {},
) {
  const target = page.locator(selector).first()
  await target.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(250)
  const box = await target.boundingBox()
  if (!box) throw new Error(`nenalezeno: ${selector} (${file})`)
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))
  const clip = {
    x: Math.max(0, box.x + scroll.x - pad),
    y: Math.max(0, box.y + scroll.y - pad),
    width: box.width + pad * 2,
    height: Math.min(box.height + pad * 2, maxHeight),
  }
  const png = path.join(OUT, file)
  await page.screenshot({ path: png, clip, fullPage: true })
  await toWebp(png)
  console.log(`  ${file}  ${Math.round(clip.width)}×${Math.round(clip.height)}`)
}

/** Whole viewport — for fixed elements (the floating button, modals). */
async function shootViewport(page: Page, file: string) {
  const png = path.join(OUT, file)
  await page.screenshot({ path: png })
  await toWebp(png)
  console.log(`  ${file}  viewport`)
}

async function anonymousShots(browser: Browser, ids: Ids) {
  const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2, locale: 'cs-CZ' })
  const page = await context.newPage()

  console.log('anonymní návštěvník:')

  // Homepage card of the demo chata (the list also holds real chatas, so
  // only the one card is captured)
  await page.goto(`${SITE}/`, { waitUntil: 'networkidle' })
  await ready(page, 'text=Ukázková chata')
  await shootElement(page, 'a:has-text("Ukázková chata")', 'vyber-chaty.png')

  // Information / organization / participants
  await page.goto(`${SITE}/${SLUG}?view=information`, { waitUntil: 'networkidle' })
  await ready(page, '.info-hero')
  await shootElement(page, '.info-hero', 'informace.png')

  await page.goto(`${SITE}/${SLUG}?view=organization`, { waitUntil: 'networkidle' })
  await ready(page, 'text=Kde budeme spát')
  // open the first room so the beds and their occupants are visible
  await page.locator('button:has-text("Zobrazit postele")').first().click()
  await page.waitForTimeout(500)
  await shootElement(page, '.rooms-grid', 'organizace.png')
  await shootElement(page, 'text=Sdílená auta >> xpath=../..', 'auta.png')

  await page.goto(`${SITE}/${SLUG}?view=participants`, { waitUntil: 'networkidle' })
  await ready(page, 'text=Kdo všechno jede')
  await shootElement(page, 'text=Kdo všechno jede >> xpath=../..', 'ucastnici.png')

  // Finance: the participant selector, then one person's numbers
  await page.goto(`${SITE}/${SLUG}?view=finance`, { waitUntil: 'networkidle' })
  await ready(page, 'text=Vyber svoje jméno')
  await shootElement(page, 'text=Kdo jsi? >> xpath=../..', 'vyber-ucastnika.png')

  // Míša is a creditor: his panel shows the "dostaneš zpět" result
  const misa = ids.participants['Míša']
  await page.goto(`${SITE}/${SLUG}?view=finance&participant=${misa}`, { waitUntil: 'networkidle' })
  await ready(page, 'text=Jak se vyrovnat')

  const summaryBox = 'div.rounded-2xl.p-6:has-text("Tvá útrata")'
  await shootElement(page, 'text=Jsi to ty?', 'jsi-to-ty.png', { pad: 18 })
  await shootElement(page, 'aside', 'denik-vydaju.png')
  await shootElement(page, summaryBox, 'finance-souhrn.png')

  // the same box with the fair-share breakdown unfolded
  await page.locator('text=Tvá útrata (Fair Share):').first().click()
  await page.waitForTimeout(500)
  await shootElement(page, summaryBox, 'finance-rozpad.png')

  await shootElement(page, 'text=Historie plateb >> xpath=..', 'historie.png')

  // Petr owes a small amount: his panel carries the QR code and the account
  // number for paying the banker
  await page.goto(`${SITE}/${SLUG}?view=finance&participant=${ids.participants['Petr']}`, {
    waitUntil: 'networkidle',
  })
  await ready(page, 'text=Jak se vyrovnat')
  await shootElement(page, 'text=Jak se vyrovnat >> xpath=..', 'vyrovnani.png')

  // two expense cards: a weighted one and the one with an invitation
  await shootElement(page, 'div.shadow-md:has-text("Pivo a víno")', 'karta-vydaje.png')
  await shootElement(page, 'div.shadow-md:has-text("Vstup do skalního bludiště")', 'karta-pozvani.png')

  // the all-participants overview
  await page.goto(`${SITE}/${SLUG}?view=finance-overview`, { waitUntil: 'networkidle' })
  await ready(page, 'text=Celkové výdaje')
  await shootElement(page, 'table', 'prehled.png', { pad: 20 })

  // login
  await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' })
  await ready(page, 'text=Přihlášení')
  await shootElement(page, 'form >> xpath=../..', 'prihlaseni.png', { pad: 20 })

  await context.close()
}

async function signedInShots(browser: Browser, ids: Ids) {
  const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2, locale: 'cs-CZ' })
  await context.addCookies([sessionCookie(ids.userId)])
  const page = await context.newPage()

  console.log('přihlášený účastník:')

  await page.goto(`${SITE}/${SLUG}?view=finance`, { waitUntil: 'networkidle' })
  await ready(page, 'text=Přidat výdaj')
  await shootViewport(page, 'prihlasene-finance.png')

  // own expense card carries the "Přidáno tebou" footer
  await shootElement(page, 'div.shadow-md:has-text("Přidáno tebou")', 'vlastni-vydaj.png')

  // desktop composer
  await page.locator('button[aria-label="Přidat výdaj"]').click()
  await ready(page, 'text=Nový výdaj')
  await shootViewport(page, 'composer-desktop.png')

  // the two split modes that need explaining
  await page.locator('#expense-title').fill('Pivo a víno')
  await page.locator('#expense-amount').fill('1250')
  await page.locator('button:has-text("Podíly")').click()
  await page.waitForTimeout(400)
  await shootElement(page, 'text=Rozdělení >> xpath=..', 'deleni-podily.png')

  await page.locator('button:has-text("Přesné částky")').click()
  await page.waitForTimeout(400)
  await page.locator('input[inputmode="numeric"]').nth(1).fill('400')
  await page.waitForTimeout(400)
  await shootElement(page, 'text=Rozdělení >> xpath=..', 'deleni-castky.png')

  await context.close()

  // ─── the mobile wizard, step by step ──────────────────────────────────
  const phone = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'cs-CZ',
  })
  await phone.addCookies([sessionCookie(ids.userId)])
  const mobile = await phone.newPage()

  console.log('mobilní průvodce:')

  await mobile.goto(`${SITE}/${SLUG}?view=finance`, { waitUntil: 'networkidle' })
  await ready(mobile, 'button[aria-label="Přidat výdaj"]')
  await shootViewport(mobile, 'mobil-tlacitko.png')

  await mobile.locator('button[aria-label="Přidat výdaj"]').click()
  await ready(mobile, 'text=Zadat ručně')
  await shootViewport(mobile, 'composer-vstup.png')

  await mobile.locator('text=Zadat ručně').click()
  await ready(mobile, 'text=co a kolik')
  await mobile.locator('#expense-title').fill('Nákup na sobotní snídani')
  await mobile.locator('#expense-amount').fill('740')
  await mobile.waitForTimeout(300)
  await shootViewport(mobile, 'composer-krok1.png')

  await mobile.locator('button:has-text("Pokračovat")').click()
  await ready(mobile, 'text=kdo se dělí')
  await shootViewport(mobile, 'composer-krok2.png')

  await mobile.locator('button:has-text("Pokračovat")').click()
  await ready(mobile, 'text=Uložit výdaj')
  await shootViewport(mobile, 'composer-krok3.png')

  await phone.close()
}

/**
 * Admin-side shots. Every page is opened straight on a demo document, never
 * on a list view that would render the real chatas sitting in the same
 * local database.
 */
async function adminShots(browser: Browser, ids: Ids) {
  console.log('správce:')
  const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2, locale: 'cs-CZ' })
  await context.addCookies([sessionCookie(ids.adminId, 'demo-spravce@zicha.travel')])
  const page = await context.newPage()

  await page.goto(`${SITE}/admin/collections/chatas/${ids.chataId}`, { waitUntil: 'networkidle' })
  await ready(page, 'text=Ukázková chata')
  await shootViewport(page, 'admin-chata.png')

  // Ela carries the "platí za ni" arrangement and the account controls
  await page.goto(`${SITE}/admin/collections/participants/${ids.participants['Ela']}`, {
    waitUntil: 'networkidle',
  })
  await ready(page, 'input#field-name')
  await shootViewport(page, 'admin-ucastnik.png')

  // the decision page an admin reaches from the claim e-mail
  const token = jwt.sign(
    { claimId: ids.claimId, adminId: ids.adminId, purpose: 'claim-decide' },
    process.env.PAYLOAD_SECRET!,
    { expiresIn: '7d' },
  )
  await page.goto(`${SITE}/claims/decide?token=${token}`, { waitUntil: 'networkidle' })
  await ready(page, 'text=Ano, schválit')
  await shootElement(page, 'button:has-text("Ano, schválit") >> xpath=ancestor::div[2]', 'claim-rozhodnuti.png', {
    pad: 20,
  })

  await context.close()
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const ids = await loadIds()
  // system Chrome: the repo's Playwright build has no bundled browser
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    await anonymousShots(browser, ids)
    await signedInShots(browser, ids)
    await adminShots(browser, ids)
  } finally {
    await browser.close()
  }
  console.log(`\nHotovo → ${OUT}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

// "Nákup": the email that follows the banker's "Poslat do košíku" when
// something could not go into the Rohlík cart on its own — free-text items
// (no Rohlík product), products sold out right now and lines Rohlík refused. A checklist for the banker
// (src/utils/shoppingEmail.ts picks the recipients and sends it). Czech
// only, tykání, like the other emails to the trip's organizers.

export interface ManualItem {
  title: string
  quantity: number
  wantedBy: string | null
  note: string | null
  /**
   * 'text' = never was a Rohlík product, 'soldOut' = Rohlík has none right
   * now, 'rejected' = Rohlík refused it
   */
  reason: 'text' | 'soldOut' | 'rejected'
}

export interface ManualItemsEmail {
  subject: string
  text: string
  html: string
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 1 produkt / 2 produkty / 5 produktů */
export function productsCs(count: number): string {
  const word = count === 1 ? 'produkt' : count >= 2 && count <= 4 ? 'produkty' : 'produktů'
  return `${count} ${word}`
}

/** The chata page with a view open, on its own domain when it has one. */
export function chataViewUrl(
  chata: { slug?: string | null; domains?: { domain: string }[] | null },
  view: string,
): string {
  const domain = chata.domains?.[0]?.domain
  const home = domain ? `https://${domain}` : `https://zicha.travel/${chata.slug ?? ''}`
  return `${home}?view=${encodeURIComponent(view)}`
}

function lineText(item: ManualItem): string {
  let line = `${item.quantity}× ${item.title}`
  if (item.wantedBy) line += ` (chce ${item.wantedBy})`
  if (item.reason === 'rejected') line += '. Rohlík ji nepřijal'
  if (item.reason === 'soldOut') line += '. Na Rohlíku je teď vyprodaná, přidej něco podobného'
  if (item.note) line += `. Poznámka: ${item.note}`
  return line
}

export function manualItemsEmail(args: {
  chataName: string
  items: ManualItem[]
  addedCount: number
  checkoutUrl: string | null
  listUrl: string
}): ManualItemsEmail {
  const { chataName, items, addedCount, listUrl } = args
  const checkoutUrl = args.checkoutUrl || 'https://www.rohlik.cz/'
  const intro =
    addedCount > 0
      ? `Do košíku na Rohlíku šlo ${productsCs(addedCount)} ze seznamu ${chataName}. ` +
        'Tyhle věci je potřeba přidat ručně:'
      : `Ze seznamu ${chataName} je potřeba přidat do košíku ručně tyhle věci:`
  const lines = items.map(lineText)

  return {
    subject: `${chataName}: tohle přidej do košíku ručně`,
    text:
      `${intro}\n\n` +
      lines.map((line) => `- ${line}`).join('\n') +
      `\n\nDokončit objednávku: ${checkoutUrl}\nCelý seznam: ${listUrl}\n`,
    html: `
      <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
        <h2 style="color: #d97706;">zicha.travel</h2>
        <h3 style="margin: 0 0 10px;">Tohle přidej do košíku ručně</h3>
        <p style="line-height: 1.6;">${escapeHtml(intro)}</p>
        <ul style="line-height: 1.7; padding-left: 20px;">
          ${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('\n          ')}
        </ul>
        <p style="line-height: 1.6;">
          <a href="${escapeHtml(checkoutUrl)}" style="color: #b45309; font-weight: bold;">Dokončit objednávku na Rohlíku</a>
        </p>
        <p style="line-height: 1.6; color: #666; font-size: 13px;">
          Celý seznam najdeš na <a href="${escapeHtml(listUrl)}" style="color: #666;">stránce chaty</a>.
        </p>
      </div>`,
  }
}

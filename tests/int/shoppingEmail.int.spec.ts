import { describe, it, expect } from 'vitest'
import type { Payload } from 'payload'
import { chataViewUrl, manualItemsEmail, productsCs } from '@/lib/shoppingEmail'
import { manualItemsRecipients, notifyManualItems } from '@/utils/shoppingEmail'

describe('manualItemsEmail', () => {
  const base = {
    chataName: 'Přátelé 2026',
    addedCount: 3,
    checkoutUrl: 'https://www.rohlik.cz/objednavka/kosik',
    listUrl: 'https://pratele.zicha.travel?view=shopping',
  }

  it('lists free-text and refused items with who wants them and notes', () => {
    const email = manualItemsEmail({
      ...base,
      items: [
        {
          title: 'Něco sladkého',
          quantity: 1,
          wantedBy: 'Denisa',
          note: 'bez ořechů',
          reason: 'text',
        },
        { title: 'Pivo Braník', quantity: 6, wantedBy: null, note: null, reason: 'rejected' },
      ],
    })
    expect(email.subject).toBe('Přátelé 2026: tohle přidej do košíku ručně')
    expect(email.text).toContain('Do košíku na Rohlíku šlo 3 produkty ze seznamu Přátelé 2026.')
    expect(email.text).toContain('- 1× Něco sladkého (chce Denisa). Poznámka: bez ořechů')
    expect(email.text).toContain('- 6× Pivo Braník. Rohlík ji nepřijal')
    expect(email.text).toContain('Dokončit objednávku: https://www.rohlik.cz/objednavka/kosik')
    expect(email.text).toContain('Celý seznam: https://pratele.zicha.travel?view=shopping')
  })

  it('falls back to rohlik.cz without a checkout link and words a zero-add send', () => {
    const email = manualItemsEmail({
      ...base,
      addedCount: 0,
      checkoutUrl: null,
      items: [{ title: 'Led', quantity: 2, wantedBy: null, note: null, reason: 'text' }],
    })
    expect(email.text).toContain('je potřeba přidat do košíku ručně tyhle věci')
    expect(email.text).toContain('https://www.rohlik.cz/')
  })

  it('escapes participant text in the HTML part', () => {
    const email = manualItemsEmail({
      ...base,
      items: [{ title: '<b>x</b>', quantity: 1, wantedBy: 'A&B', note: null, reason: 'text' }],
    })
    expect(email.html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(email.html).toContain('A&amp;B')
    expect(email.html).not.toContain('<b>x</b>')
  })

  it('asks for a substitute when a product is sold out', () => {
    const email = manualItemsEmail({
      ...base,
      items: [
        { title: 'Kefír', quantity: 2, wantedBy: 'Katka', note: 'ten malý', reason: 'soldOut' },
      ],
    })
    expect(email.text).toContain(
      '- 2× Kefír (chce Katka). Na Rohlíku je teď vyprodaná, přidej něco podobného. Poznámka: ten malý',
    )
  })

  it('uses no em or en dashes in the copy', () => {
    const email = manualItemsEmail({
      ...base,
      items: [
        { title: 'Led', quantity: 1, wantedBy: null, note: null, reason: 'text' },
        { title: 'Kefír', quantity: 1, wantedBy: null, note: null, reason: 'soldOut' },
        { title: 'Pivo', quantity: 1, wantedBy: null, note: null, reason: 'rejected' },
      ],
    })
    expect(email.text + email.subject).not.toMatch(/[–—]/)
  })
})

describe('helpers', () => {
  it('declines "produkt" the Czech way', () => {
    expect(productsCs(1)).toBe('1 produkt')
    expect(productsCs(3)).toBe('3 produkty')
    expect(productsCs(5)).toBe('5 produktů')
    expect(productsCs(0)).toBe('0 produktů')
  })

  it('links the chata view on its own domain when it has one', () => {
    expect(
      chataViewUrl({ slug: 'pratele', domains: [{ domain: 'pratele.zicha.travel' }] }, 'shopping'),
    ).toBe('https://pratele.zicha.travel?view=shopping')
    expect(chataViewUrl({ slug: 'pratele', domains: [] }, 'shopping')).toBe(
      'https://zicha.travel/pratele?view=shopping',
    )
  })
})

describe('manualItemsRecipients', () => {
  // only the admin lookup touches payload; a stub stands in for it
  const payloadWith = (users: object[]) =>
    ({ find: async () => ({ docs: users }) }) as unknown as Payload

  it('sends to the banker when their account has an email', async () => {
    expect(
      await manualItemsRecipients(payloadWith([{ email: 'admin@x.cz', role: 'superadmin' }]), 10, {
        email: 'banker@x.cz',
      }),
    ).toEqual(['banker@x.cz'])
  })

  it('falls back to the chata admins otherwise', async () => {
    const recipients = await manualItemsRecipients(
      payloadWith([
        { id: 1, email: 'super@x.cz', role: 'superadmin' },
        { id: 2, email: 'chata@x.cz', role: 'admin', assignedChatas: [10] },
        { id: 3, email: 'other@x.cz', role: 'admin', assignedChatas: [11] },
      ]),
      10,
      { email: '' },
    )
    expect(recipients).toEqual(['super@x.cz', 'chata@x.cz'])
  })
})

describe('notifyManualItems', () => {
  const chata = { id: 10, name: 'Přátelé 2026', shortName: 'Přátelé', slug: 'pratele', domains: null }

  const stubPayload = (sent: { to: string; text?: string }[]) =>
    ({
      find: async () => ({ docs: [] }),
      sendEmail: async (message: { to: string; text?: string }) => {
        sent.push(message)
      },
      logger: { info: () => {}, error: () => {} },
    }) as unknown as Payload

  it('goes out when the only manual items are sold out', async () => {
    const sent: { to: string; text?: string }[] = []
    const ok = await notifyManualItems(stubPayload(sent), {
      chata,
      banker: { email: 'banker@x.cz' },
      items: [{ title: 'Kefír', quantity: 1, wantedBy: null, note: null, reason: 'soldOut' }],
      addedCount: 4,
      checkoutUrl: null,
    })
    expect(ok).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toContain('1× Kefír. Na Rohlíku je teď vyprodaná')
  })

  it('stays quiet with nothing to add by hand', async () => {
    const sent: { to: string; text?: string }[] = []
    const ok = await notifyManualItems(stubPayload(sent), {
      chata,
      banker: { email: 'banker@x.cz' },
      items: [],
      addedCount: 4,
      checkoutUrl: null,
    })
    expect(ok).toBe(false)
    expect(sent).toHaveLength(0)
  })
})

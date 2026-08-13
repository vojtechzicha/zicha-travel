import { describe, it, expect } from 'vitest'
import { calendarDetails, escapeCalendarText, joinParts } from '@/lib/tripCalendar'

describe('joinParts', () => {
  it('drops the parts that are not there', () => {
    expect(joinParts(['3 noci', null, 'check-in od 15:00', '', false])).toBe(
      '3 noci · check-in od 15:00',
    )
  })
})

describe('escapeCalendarText', () => {
  it('escapes the characters that would become markup', () => {
    expect(escapeCalendarText('Kuba & <b>Katka</b>')).toBe('Kuba &amp; &lt;b&gt;Katka&lt;/b&gt;')
  })
})

describe('calendarDetails', () => {
  it('renders headings and lines with the Google Calendar markup', () => {
    expect(
      calendarDetails([
        { lines: ['Chaloupka · Horní Lomná', '3 noci'] },
        { title: 'Program', lines: ['pá 5. · příjezd', 'so 6. · túra'] },
      ]),
    ).toBe(
      'Chaloupka · Horní Lomná<br>3 noci<br><br><b>Program</b><br>pá 5. · příjezd<br>so 6. · túra',
    )
  })

  it('skips blocks with no usable lines, heading included', () => {
    expect(
      calendarDetails([
        { title: 'Co s sebou', lines: [] },
        { title: 'Kontakt a pravidla', lines: [null, '  ', undefined, false] },
        { lines: ['Detail chaty: https://chata.zicha.travel/'] },
      ]),
    ).toBe('Detail chaty: https://chata.zicha.travel/')
  })

  it('returns an empty string when nothing has data', () => {
    expect(calendarDetails([{ title: 'Program', lines: [] }])).toBe('')
  })

  it('escapes database values but keeps our own structure', () => {
    expect(calendarDetails([{ title: 'Kontakt & pravidla', lines: ['Majitel: <Novák>'] }])).toBe(
      '<b>Kontakt &amp; pravidla</b><br>Majitel: &lt;Novák&gt;',
    )
  })
})

import type { Metadata } from 'next'
import { KrkonoseTrip } from './KrkonoseTrip'
import '../styles.css'

export const metadata: Metadata = {
  title: 'Krkonoše – tři dny na hřebenech',
  description:
    'Klidný třídenní výlet do Krkonoš: v neděli přijet do údolí, v pondělí autobusem na Špindlerovu boudu a hřebenem přes Sněžku na Luční boudu, v úterý sestup a cesta domů. Plán, ubytování, doprava, jídlo i turistické mapy.',
  openGraph: {
    title: 'Krkonoše – tři dny na hřebenech',
    description:
      'Neděle: příjezd do údolí. Pondělí: autobusem na Špindlerovu boudu, hřebenem přes Sněžku na Luční boudu. Úterý: sestup údolím Bílého Labe a cesta domů.',
  },
}

export default function KrkonosePage() {
  return <KrkonoseTrip />
}

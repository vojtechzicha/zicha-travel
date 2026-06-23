'use client'

import { useState } from 'react'
import {
  Mountain,
  Sun,
  Sunrise,
  Bus,
  Car,
  Footprints,
  BedDouble,
  Utensils,
  Coffee,
  MapPin,
  Clock,
  ArrowRight,
  ArrowDown,
  ChevronDown,
  Phone,
  Globe,
  ExternalLink,
  Map as MapIcon,
  Waves,
  Compass,
  Info,
  Backpack,
  TriangleAlert,
  Snowflake,
  Star,
  Wallet,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Data                                                              */
/* ------------------------------------------------------------------ */

// Mapy.cz turistická (KČT) – the authoritative Czech hiking map.
// Each key place links to the topographic hiking map centred on it.
const mapy = (lon: number, lat: number, z = 14) =>
  `https://mapy.cz/turisticka?x=${lon}&y=${lat}&z=${z}`

const PLACES = {
  spindl: { name: 'Špindlerův Mlýn (Sv. Petr)', lon: 15.62, lat: 50.715 },
  spindlerovaBouda: { name: 'Špindlerova bouda', lon: 15.5453, lat: 50.7706 },
  slezska: { name: 'Slezská bouda', lon: 15.6995, lat: 50.7466 },
  snezka: { name: 'Sněžka', lon: 15.7397, lat: 50.7359 },
  lucni: { name: 'Luční bouda', lon: 15.6995, lat: 50.7335 },
  bileLabe: { name: 'Bouda u Bílého Labe', lon: 15.66, lat: 50.745 },
}

// Mapy.com (Mapy.cz) – the authoritative Czech hiking map. Embedded share of the
// pondělní trail: Špindlerova bouda → Sněžka → Luční bouda.
const MAPY_TRAIL_EMBED = 'https://mapy.com/s/demejukuhe'
const MAPY_TRAIL_LINK = 'https://mapy.com/s/magepunevo'

interface Accommodation {
  name: string
  tag: string
  tagColor: string
  blurb: string
  pros: string[]
  note: string
}

const ACCOMMODATIONS: Accommodation[] = [
  {
    name: 'Hotel Sněžka',
    tag: 'Doporučeno',
    tagColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    blurb:
      'Půvabná stavba s historickou architekturou kousek od sjezdovky Medvědín, jen ~200 m od centra. Dvě tradiční restaurace přímo v domě – po cestě nemusíte nikam.',
    pros: ['Vlastní restaurace', 'Krytý bazén a sauna', 'Blízko centra i parkovišť'],
    note: 'Dobrá volba, když chcete v neděli večer dorazit, navečeřet se na místě a nic neřešit.',
  },
  {
    name: 'Pension Centrum',
    tag: 'Nejlepší poloha',
    tagColor: 'bg-amber-100 text-amber-700 border-amber-200',
    blurb:
      'Penzion přímo v centru, pár kroků od autobusové zastávky a turistických tras (hodnocení polohy 9,6). Skvělé snídaně, vstřícný majitel, příjemná obsluha.',
    pros: ['Top poloha u zastávky busu', 'Výborná snídaně', 'Cenově nejdostupnější'],
    note: 'Ideální pro pondělní ráno – ze snídaně rovnou k autobusu nahoru.',
  },
  {
    name: 'Hotel Praha',
    tag: 'Wellness',
    tagColor: 'bg-sky-100 text-sky-700 border-sky-200',
    blurb:
      'Jeden z nejoblíbenějších hotelů ve středu Špindlu s výhledem na panorama Krkonoš. Bylinná sauna, vířivka, masáže a stylová restaurace.',
    pros: ['Výhled na hřebeny', 'Sauna a vířivka', 'Restaurace v hotelu'],
    note: 'Když chcete neděli pojmout jako odpočinek před náročnějším pondělím.',
  },
]

interface BusTime {
  up: string
  upArr: string
  down: string
  downArr: string
}

// Spring/summer timetable 2026 (7. 4. – 26. 6.), jízda ~22 min nahoru / ~17 min dolů.
const BUS_TIMES: BusTime[] = [
  { up: '8:30', upArr: '8:52', down: '9:00', downArr: '9:17' },
  { up: '9:30', upArr: '9:52', down: '10:00', downArr: '10:17' },
  { up: '10:30', upArr: '10:52', down: '11:00', downArr: '11:17' },
  { up: '11:30', upArr: '11:52', down: '12:00', downArr: '12:17' },
  { up: '12:30', upArr: '12:52', down: '13:00', downArr: '13:17' },
  { up: '14:30', upArr: '14:52', down: '15:00', downArr: '15:17' },
  { up: '16:30', upArr: '16:52', down: '17:00', downArr: '17:17' },
]

interface HikeLeg {
  from: string
  detail: string
  km: string
  elev: string
  refreshment?: boolean
}

const MONDAY_LEGS: HikeLeg[] = [
  {
    from: 'Špindlerova bouda',
    detail:
      'Nástup na červenou „Cestu česko-polského přátelství“, která kopíruje státní hranici. Mírný hřebenový terén bez velkých převýšení a parádní výhledy na obě strany.',
    km: '1 198 m n. m. · start',
    elev: '',
    refreshment: true,
  },
  {
    from: 'Slezská bouda',
    detail:
      'Ideální místo na první delší pauzu a občerstvení. Odsud už dohlédnete na vrchol Sněžky před sebou.',
    km: '≈ 7 km od startu',
    elev: '+ mírné stoupání',
    refreshment: true,
  },
  {
    from: 'Sněžka (1 603 m)',
    detail:
      'Nejvyšší bod Čech a vrchol celého dne. Stoupání po hřebeni, na vrcholu odpočinek, občerstvení a rozhled do Polska i do Čech.',
    km: '≈ 10 km od startu',
    elev: 'nejvyšší bod',
    refreshment: true,
  },
  {
    from: 'Luční bouda (1 410 m)',
    detail:
      'Sestup z vrcholu k nejvýše položené horské chatě v Česku. Check-in, večeře, wellness – a hřeben máte celý večer „doma“.',
    km: '≈ 14 km celkem',
    elev: 'cíl dne · nocleh',
    refreshment: true,
  },
]

const TUESDAY_LEGS: HikeLeg[] = [
  {
    from: 'Luční bouda',
    detail: 'Ranní bufetová snídaně s pečivem z vlastní pekárny, pak klesání do údolí Bílého Labe.',
    km: '1 410 m n. m. · start',
    elev: '',
  },
  {
    from: 'Bouda u Bílého Labe',
    detail:
      'Sestup podél řeky je vrcholem celého okruhu – cestou míjíte vodopády a peřeje. U boudy se dá zastavit na občerstvení.',
    km: '≈ 4 km',
    elev: 'klesání podél řeky',
    refreshment: true,
  },
  {
    from: 'Dívčí lávky → Weberova cesta',
    detail:
      'U soutoku Labe a Bílého Labe se napojíte na modrou Weberovu cestu – pohodová, téměř rovinatá cesta zpět k autu.',
    km: '≈ 8–9 km celkem',
    elev: 'nenáročné',
  },
  {
    from: 'Špindlerův Mlýn (Sv. Petr)',
    detail: 'Zpět u auta na parkovišti P2 a hurá domů.',
    km: 'cíl · auto',
    elev: 'cesta domů',
  },
]

const PACKING = [
  'Vrstvy: na hřebeni je i v létě vítr a může být citelně chladněji než v údolí',
  'Nepromokavá bunda – počasí se v Krkonoších mění rychle',
  'Pohorky s pevnou podrážkou, ne tenisky',
  'Dost vody a svačina (občerstvení na boudách funguje, ale ne vždy a všude)',
  'Čelovka, malá lékárnička, nabíječka / powerbanka',
  'Hotovost – na některých boudách bývá platba kartou rozmar',
]

interface Contact {
  label: string
  value: string
  href: string
  icon: typeof Phone
}

const CONTACTS: Contact[] = [
  { label: 'Luční bouda – rezervace', value: 'lucnibouda.cz', href: 'https://www.lucnibouda.cz/', icon: Globe },
  { label: 'Luční bouda – telefon', value: '+420 733 740 888', href: 'tel:+420733740888', icon: Phone },
  {
    label: 'Autobus na Špindlerovu boudu',
    value: 'sluzbyspindleruvmlyn.cz',
    href: 'https://www.sluzbyspindleruvmlyn.cz/jizdni-rady/',
    icon: Bus,
  },
  { label: 'Spojení autem / busem', value: 'idos.cz', href: 'https://idos.cz/', icon: Compass },
  { label: 'Turistická mapa', value: 'mapy.cz', href: mapy(15.66, 50.745, 12), icon: MapIcon },
]

/* ------------------------------------------------------------------ */
/*  Small building blocks                                             */
/* ------------------------------------------------------------------ */

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl shadow-md ${className}`}>{children}</div>
  )
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Sun; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6 pb-3 border-b-[3px] border-gray-100">
      <Icon size={26} className="text-primary shrink-0" />
      <h3 className="font-serif text-2xl sm:text-3xl m-0 text-gray-900 font-bold">{children}</h3>
    </div>
  )
}

function MapButton({ place, z = 14 }: { place: { name: string; lon: number; lat: number }; z?: number }) {
  return (
    <a
      href={mapy(place.lon, place.lat, z)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-50 hover:bg-primary hover:text-white text-gray-700 rounded-lg text-sm font-semibold border border-gray-200 hover:border-primary transition-all"
    >
      <MapPin size={15} /> {place.name}
    </a>
  )
}

function DayBadge({ day, date, label }: { day: string; date: string; label: string }) {
  return (
    <div className="flex flex-col items-center bg-white/95 rounded-2xl px-6 py-4 shadow-lg min-w-[150px] border border-white/40">
      <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{day}</span>
      <span className="font-serif text-2xl font-black text-primary my-1">{date}</span>
      <span className="text-sm text-gray-600 text-center">{label}</span>
    </div>
  )
}

function HikeTimeline({ legs, accent }: { legs: HikeLeg[]; accent: 'up' | 'down' }) {
  return (
    <div className="relative pl-8">
      <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-primary/30" />
      {legs.map((leg, idx) => (
        <div key={idx} className="relative pb-7 last:pb-0">
          <div className="absolute -left-8 top-0.5 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center shadow-md">
            {accent === 'up' ? <Mountain size={13} /> : <ArrowDown size={13} />}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <strong className="text-gray-900 text-lg">{leg.from}</strong>
            <span className="text-xs font-semibold text-primary-dark bg-primary-light/30 px-2 py-0.5 rounded">
              {leg.km}
            </span>
            {leg.elev && <span className="text-xs text-gray-500">{leg.elev}</span>}
            {leg.refreshment && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                <Coffee size={12} /> občerstvení
              </span>
            )}
          </div>
          <p className="text-gray-600 text-sm sm:text-[0.95rem] leading-relaxed mt-1.5 mb-0">{leg.detail}</p>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export function KrkonoseTrip() {
  const [openAcc, setOpenAcc] = useState<number>(0)

  return (
    <div lang="cs" className="w-full px-4 py-8 sm:py-12 text-gray-800">
      <div className="max-w-app mx-auto">
        {/* ---------------- Hero ---------------- */}
        <header className="text-center text-white mb-10">
          <div className="inline-block bg-white/10 p-4 rounded-full mb-4 backdrop-blur-sm border border-white/20 shadow-lg">
            <Mountain className="text-primary-light" size={48} />
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl font-black tracking-tight mb-3 text-shadow-heading">
            Krkonoše: tři dny na hřebenech
          </h1>
          <p className="text-white/85 text-lg max-w-2xl mx-auto text-shadow-subheading leading-relaxed">
            Chytře načasovaný výlet, který se vyhne davům. V neděli jen přijedete a vyspíte se v údolí,
            pondělní hřebenovku i úterní sestup máte celé ve všedních dnech – v klidu a tichu.
          </p>
        </header>

        {/* ---------------- Three-day overview ---------------- */}
        <div className="bg-white/95 backdrop-blur-md rounded-glass-lg shadow-2xl p-6 sm:p-10 animate-popIn">
          <div className="flex flex-wrap items-stretch justify-center gap-4 sm:gap-6">
            <DayBadge day="Neděle" date="Ne" label="Příjezd do údolí, nocleh ve Špindlu" />
            <ArrowRight className="self-center text-primary hidden sm:block" size={28} />
            <DayBadge day="Pondělí" date="Po" label="Bus nahoru, hřeben přes Sněžku, Luční bouda" />
            <ArrowRight className="self-center text-primary hidden sm:block" size={28} />
            <DayBadge day="Úterý" date="Út" label="Sestup údolím Bílého Labe, cesta domů" />
          </div>

          {/* The idea / strategy */}
          <div className="mt-8 bg-gradient-to-br from-primary-light/20 to-primary-light/5 border border-primary/20 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <Star className="text-primary shrink-0 mt-1" size={22} />
              <div>
                <h2 className="font-serif text-xl font-bold text-gray-900 mt-0 mb-2">Proč zrovna takhle?</h2>
                <ul className="space-y-2 text-gray-700 text-[0.97rem] leading-relaxed m-0 list-none p-0">
                  <li className="flex gap-2">
                    <Sun size={18} className="text-primary shrink-0 mt-0.5" />
                    <span>
                      <strong>Neděle</strong> = jen sjet dolů a ubytovat se. Nedělní cesty se davů skoro
                      nedotknou – akorát řídíte a děláte check-in.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <Footprints size={18} className="text-primary shrink-0 mt-0.5" />
                    <span>
                      <strong>Pondělí</strong> = autobusem na Špindlerovu boudu, hřebenem přes Sněžku dolů
                      na Luční boudu. Všední den, ticho.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <ArrowDown size={18} className="text-primary shrink-0 mt-0.5" />
                    <span>
                      <strong>Úterý</strong> = sestup a cesta domů. Zase všední den, zase klid.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* ================= NEDĚLE ================= */}
        <section className="bg-white/95 backdrop-blur-md rounded-glass-lg shadow-2xl p-6 sm:p-10 mt-8 animate-popIn">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-primary text-white font-bold rounded-full w-10 h-10 flex items-center justify-center shadow-md shrink-0">
              1
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary m-0">Neděle</p>
              <h2 className="font-serif text-2xl sm:text-3xl font-black text-gray-900 m-0">
                Sjet dolů a vyspat se v údolí
              </h2>
            </div>
          </div>
          <p className="text-gray-600 mb-8 sm:ml-13">
            Cíl dne je jediný: v pohodě dorazit do Špindlerova Mlýna, zaparkovat a dobře se vyspat. Žádný
            spěch, žádné dlouhé túry – jen řízení a check-in.
          </p>

          {/* Driving */}
          <SectionTitle icon={Car}>Jak dojet autem</SectionTitle>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <Card className="p-5 border-l-4 border-primary">
              <div className="flex items-center justify-between mb-2">
                <strong className="text-lg text-gray-900">z Prahy</strong>
                <span className="route-duration">≈ 2 h · 150 km</span>
              </div>
              <p className="route-path m-0">
                D11 směr Hradec Králové → pokračovat k Trutnovu → Vrchlabí → silnice 295 do Špindlerova
                Mlýna. Závěrečné údolí podél Labe je úzké, počítejte s pomalejší jízdou.
              </p>
            </Card>
            <Card className="p-5 border-l-4 border-primary">
              <div className="flex items-center justify-between mb-2">
                <strong className="text-lg text-gray-900">z Českého Těšína</strong>
                <span className="route-duration">≈ 3 h · 250 km</span>
              </div>
              <p className="route-path m-0">
                D48 přes Frýdek-Místek → D1 → D35 (Olomouc – Mohelnice – Hradec Králové) → směr Trutnov →
                Vrchlabí → Špindlerův Mlýn.
              </p>
            </Card>
          </div>
          <div className="parking-note mb-10 flex items-start gap-2">
            <Info size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            <span>
              <strong>Tip na parkování:</strong> auto nechte na parkovišti <strong>P2 ve Sv. Petru</strong> –
              odsud v pondělí jede autobus nahoru a v úterý sem údolím Bílého Labe sestoupíte. Celý okruh tak
              začíná i končí u auta.
            </span>
          </div>

          {/* Sleeping options */}
          <SectionTitle icon={BedDouble}>Kde přespat — 3 tipy v údolí</SectionTitle>
          <div className="space-y-4 mb-10">
            {ACCOMMODATIONS.map((acc, idx) => {
              const open = openAcc === idx
              return (
                <Card key={idx} className="overflow-hidden">
                  <button
                    onClick={() => setOpenAcc(open ? -1 : idx)}
                    className="w-full flex items-center justify-between gap-3 p-5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <BedDouble className="text-primary shrink-0" size={22} />
                      <strong className="text-lg text-gray-900">{acc.name}</strong>
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${acc.tagColor}`}>
                        {acc.tag}
                      </span>
                    </div>
                    <ChevronDown
                      size={22}
                      className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {open && (
                    <div className="px-5 pb-5 animate-slideDown">
                      <p className="text-gray-600 leading-relaxed mt-0 mb-3">{acc.blurb}</p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {acc.pros.map((p, i) => (
                          <span
                            key={i}
                            className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1"
                          >
                            ✓ {p}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-primary-dark bg-primary-light/15 border border-primary-light/40 rounded-lg px-3 py-2 m-0">
                        {acc.note}
                      </p>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>

          {/* Where to eat */}
          <SectionTitle icon={Utensils}>Kde se najíst</SectionTitle>
          <Card className="p-5 border-l-4 border-primary">
            <p className="text-gray-700 leading-relaxed mt-0 mb-3">
              Špindl nabízí slušný výběr restaurací s tradiční českou i krkonošskou kuchyní. Nejjednodušší je
              navečeřet se rovnou v hotelu (Sněžka i Praha mají vlastní restauraci). Pokud chcete vyrazit do
              města, míří se do centra kolem řeky.
            </p>
            <p className="text-sm text-gray-600 m-0">
              <strong>Praktická rada:</strong> v neděli večer některé podniky zavírají dřív a v pondělí ráno
              nemusí být otevřeno – snídani proto vyřešte přímo v ubytování a na hřeben si vezměte svačinu.
            </p>
          </Card>
        </section>

        {/* ================= PONDĚLÍ ================= */}
        <section className="bg-white/95 backdrop-blur-md rounded-glass-lg shadow-2xl p-6 sm:p-10 mt-8 animate-popIn">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-primary text-white font-bold rounded-full w-10 h-10 flex items-center justify-center shadow-md shrink-0">
              2
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary m-0">Pondělí</p>
              <h2 className="font-serif text-2xl sm:text-3xl font-black text-gray-900 m-0">
                Hřebenovka přes Sněžku na Luční boudu
              </h2>
            </div>
          </div>
          <p className="text-gray-600 mb-8 sm:ml-13">
            Hlavní den výletu. Od auta ve Sv. Petru autobusem nahoru na Špindlerovu boudu a odtud po červené
            hřebenem přes Sněžku až na Luční boudu, kde i přespíte.
          </p>

          {/* Getting to the bus + timing */}
          <SectionTitle icon={Bus}>Autobus nahoru — a kdy ho chytit</SectionTitle>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-2 text-gray-900">
                <Sunrise size={20} className="text-primary" />
                <strong className="text-lg">Ráno k zastávce</strong>
              </div>
              <p className="text-gray-600 text-[0.95rem] leading-relaxed m-0">
                Po snídani se přesuňte ke Sv. Petru (parkoviště P2), kde autobus na Špindlerovu boudu začíná.
                Jízda nahoru trvá <strong>jen ~22 minut</strong>. Pozor: kola ani koloběžky se nevozí.
              </p>
            </Card>
            <Card className="p-5 bg-primary-light/10 border border-primary-light/40">
              <div className="flex items-center gap-2 mb-2 text-gray-900">
                <Clock size={20} className="text-primary" />
                <strong className="text-lg">Doporučené načasování</strong>
              </div>
              <p className="text-gray-700 text-[0.95rem] leading-relaxed m-0">
                Vezměte <strong>bus v 9:30</strong> (nahoře ~9:52) a hřeben máte rozchozený do 10:00 –
                s přestávkami dorazíte na Luční boudu pohodlně odpoledne. Chcete-li klid a víc času na vrcholu,
                jeďte už <strong>v 8:30</strong>.
              </p>
            </Card>
          </div>

          {/* Bus timetable */}
          <Card className="p-5 mb-3">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <strong className="text-gray-900 text-lg">Jízdní řád · Špindlerův Mlýn ↔ Špindlerova bouda</strong>
              <span className="text-sm text-gray-500">jaro/léto 7. 4. – 26. 6. 2026</span>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-primary-dark mb-2 uppercase tracking-wide">
                  <Mountain size={15} /> Nahoru
                </div>
                <ul className="space-y-1.5 m-0 p-0 list-none">
                  {BUS_TIMES.map((t, i) => (
                    <li
                      key={i}
                      className={`flex items-center gap-2 text-[0.95rem] ${
                        t.up === '9:30' ? 'font-bold text-primary' : 'text-gray-700'
                      }`}
                    >
                      <span className="font-serif">{t.up}</span>
                      <ArrowRight size={13} className="text-gray-400" />
                      <span className="font-serif">{t.upArr}</span>
                      {t.up === '9:30' && <Star size={13} className="text-primary" />}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-primary-dark mb-2 uppercase tracking-wide">
                  <ArrowDown size={15} /> Dolů
                </div>
                <ul className="space-y-1.5 m-0 p-0 list-none">
                  {BUS_TIMES.map((t, i) => (
                    <li key={i} className="flex items-center gap-2 text-[0.95rem] text-gray-700">
                      <span className="font-serif">{t.down}</span>
                      <ArrowRight size={13} className="text-gray-400" />
                      <span className="font-serif">{t.downArr}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
          <p className="text-sm text-gray-500 mb-10 flex items-start gap-2">
            <TriangleAlert size={16} className="text-amber-500 shrink-0 mt-0.5" />
            Časy jsou orientační podle sezónního řádu – před cestou si je ověřte (řád se mění a v nepřízni
            počasí bus nemusí jet). Aktuální verze: sluzbyspindleruvmlyn.cz.
          </p>

          {/* The hike */}
          <SectionTitle icon={Footprints}>Túra po hřebeni</SectionTitle>
          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-gray-500 m-0">Délka</p>
              <p className="font-serif text-2xl font-black text-primary m-0">≈ 14 km</p>
            </div>
            <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-gray-500 m-0">Čas s přestávkami</p>
              <p className="font-serif text-2xl font-black text-primary m-0">5–6 h</p>
            </div>
            <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-gray-500 m-0">Značení</p>
              <p className="font-serif text-2xl font-black text-red-600 m-0">červená</p>
            </div>
          </div>

          <Card className="p-6 mb-6">
            <HikeTimeline legs={MONDAY_LEGS} accent="up" />
          </Card>

          {/* Food on the ridge */}
          <Card className="p-5 mb-6 border-l-4 border-emerald-400 bg-emerald-50/40">
            <div className="flex items-center gap-2 mb-2 text-gray-900">
              <Coffee size={20} className="text-emerald-600" />
              <strong className="text-lg">Jídlo na hřebeni</strong>
            </div>
            <p className="text-gray-700 text-[0.95rem] leading-relaxed m-0">
              Občerstvit se dá na <strong>Špindlerově boudě</strong>, <strong>Slezské boudě</strong>, na vrcholu{' '}
              <strong>Sněžky</strong> i na <strong>Luční boudě</strong>. Přesto si vezměte vodu a svačinu –
              provoz bývá závislý na sezóně a počasí. Hlavní teplé jídlo si dejte večer na Luční boudě.
            </p>
          </Card>

          {/* Hiking maps */}
          <SectionTitle icon={MapIcon}>Turistická mapa trasy</SectionTitle>
          <div className="rounded-2xl overflow-hidden shadow-md border border-gray-200 mb-4">
            <iframe
              title="Turistická mapa: Špindlerova bouda → Sněžka → Luční bouda"
              src={MAPY_TRAIL_EMBED}
              className="w-full h-[360px] border-0"
              loading="lazy"
            />
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Výše je pondělní trasa zakreslená v české turistické mapě (Mapy.com, KČT značení). Jednotlivé body
            si můžete otevřít i samostatně:
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            <MapButton place={PLACES.spindlerovaBouda} />
            <MapButton place={PLACES.slezska} />
            <MapButton place={PLACES.snezka} />
            <MapButton place={PLACES.lucni} />
          </div>
          <a
            href={MAPY_TRAIL_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-2 mb-10 text-primary font-semibold hover:text-primary-dark"
          >
            <ExternalLink size={16} /> Otevřít celou trasu v Mapy.com
          </a>

          {/* Sleeping at Luční bouda */}
          <SectionTitle icon={BedDouble}>Nocleh na Luční boudě</SectionTitle>
          <Card className="p-6 border-l-4 border-primary">
            <p className="text-gray-700 leading-relaxed mt-0 mb-4">
              <strong>Luční bouda (1 410 m n. m.)</strong> je nejvýše položená horská chata v Česku, jen 4 km od
              vrcholu Sněžky, a útočiště tu lidé hledají už 300 let. Ubytuje až 150 lidí ve čtyřech cenových
              kategoriích – od luxusního apartmá přes moderní pokoje Standard až po klasiku ve spacáku. Součástí
              je vždy <strong>snídaně formou bufetu</strong> s čerstvým pečivem z vlastní pekárny.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <div className="flex items-center gap-2 text-gray-700 text-sm bg-gray-50 rounded-lg px-3 py-2">
                <Waves size={16} className="text-primary" /> Wellness: pivní lázně, vířivka, finská sauna, masáže
              </div>
              <div className="flex items-center gap-2 text-gray-700 text-sm bg-gray-50 rounded-lg px-3 py-2">
                <Utensils size={16} className="text-primary" /> Do restaurace je nutná rezervace předem
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://www.lucnibouda.cz/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary-dark transition-all shadow-md"
              >
                <Globe size={16} /> lucnibouda.cz
              </a>
              <a
                href="tel:+420733740888"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-800 rounded-xl font-semibold hover:bg-gray-200 transition-all"
              >
                <Phone size={16} /> +420 733 740 888
              </a>
            </div>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4 mb-0 flex items-start gap-2">
              <TriangleAlert size={16} className="shrink-0 mt-0.5" />
              Boudy na hřebeni se přes léto plní – nocleh i stůl v restauraci rezervujte s předstihem.
            </p>
          </Card>
        </section>

        {/* ================= ÚTERÝ ================= */}
        <section className="bg-white/95 backdrop-blur-md rounded-glass-lg shadow-2xl p-6 sm:p-10 mt-8 animate-popIn">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-primary text-white font-bold rounded-full w-10 h-10 flex items-center justify-center shadow-md shrink-0">
              3
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary m-0">Úterý</p>
              <h2 className="font-serif text-2xl sm:text-3xl font-black text-gray-900 m-0">
                Sestup údolím Bílého Labe a cesta domů
              </h2>
            </div>
          </div>
          <p className="text-gray-600 mb-8 sm:ml-13">
            Pohodový závěr. Z Luční boudy klesání podél Bílého Labe kolem vodopádů zpět k autu ve Sv. Petru –
            nenáročné a malebné. Pak už jen volantem domů.
          </p>

          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-gray-500 m-0">Délka</p>
              <p className="font-serif text-2xl font-black text-primary m-0">≈ 8–9 km</p>
            </div>
            <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-gray-500 m-0">Čas</p>
              <p className="font-serif text-2xl font-black text-primary m-0">~ 3 h</p>
            </div>
            <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-gray-500 m-0">Náročnost</p>
              <p className="font-serif text-2xl font-black text-emerald-600 m-0">nízká</p>
            </div>
          </div>

          <Card className="p-6 mb-6">
            <HikeTimeline legs={TUESDAY_LEGS} accent="down" />
          </Card>

          <div className="flex flex-wrap gap-2 mb-6">
            <MapButton place={PLACES.lucni} />
            <MapButton place={PLACES.bileLabe} />
            <MapButton place={PLACES.spindl} />
          </div>

          <Card className="p-5 border-l-4 border-primary">
            <div className="flex items-center gap-2 mb-2 text-gray-900">
              <Car size={20} className="text-primary" />
              <strong className="text-lg">Cesta domů</strong>
            </div>
            <p className="text-gray-700 text-[0.95rem] leading-relaxed m-0">
              U auta ve Sv. Petru se dá ještě zajít na oběd do Špindlu a vyrazit. Návrat stejnou trasou:
              do Prahy ~2 h, do Českého Těšína ~3 h. V úterý odpoledne jsou silnice z hor prázdné – ideální.
            </p>
          </Card>
        </section>

        {/* ================= PRAKTICKÉ ================= */}
        <section className="bg-white/95 backdrop-blur-md rounded-glass-lg shadow-2xl p-6 sm:p-10 mt-8 animate-popIn">
          <SectionTitle icon={Backpack}>Co sbalit a na co myslet</SectionTitle>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <ul className="info-list">
                {PACKING.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <Card className="p-4 border-l-4 border-sky-400 bg-sky-50/40">
                <div className="flex items-center gap-2 mb-1 text-gray-900">
                  <Snowflake size={18} className="text-sky-500" />
                  <strong>Počasí na hřebeni</strong>
                </div>
                <p className="text-sm text-gray-600 m-0">
                  Krkonošský hřeben má své vlastní počasí – mlha, vítr a déšť přijdou rychle i v létě. Sledujte
                  předpověď a v mlze se držte značení.
                </p>
              </Card>
              <Card className="p-4 border-l-4 border-emerald-400 bg-emerald-50/40">
                <div className="flex items-center gap-2 mb-1 text-gray-900">
                  <Mountain size={18} className="text-emerald-600" />
                  <strong>1. zóna národního parku</strong>
                </div>
                <p className="text-sm text-gray-600 m-0">
                  Luční bouda i hřeben leží v nejpřísněji chráněné zóně KRNAP. Choďte jen po značených cestách,
                  netáborte mimo boudy a psa mějte na vodítku.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* ================= ODKAZY ================= */}
        <section className="bg-white/95 backdrop-blur-md rounded-glass-lg shadow-2xl p-6 sm:p-10 mt-8 mb-4 animate-popIn">
          <SectionTitle icon={Compass}>Užitečné odkazy</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-3">
            {CONTACTS.map((c, i) => {
              const Icon = c.icon
              return (
                <a
                  key={i}
                  href={c.href}
                  target={c.href.startsWith('http') ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 bg-gray-50 hover:bg-primary hover:text-white rounded-xl border border-gray-200 hover:border-primary transition-all group"
                >
                  <Icon size={20} className="text-primary group-hover:text-white shrink-0" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{c.label}</span>
                    <span className="block text-sm opacity-70">{c.value}</span>
                  </span>
                  <ExternalLink size={16} className="opacity-40 group-hover:opacity-100 shrink-0" />
                </a>
              )
            })}
          </div>
          <p className="text-center text-sm text-gray-400 mt-8 mb-0 flex items-center justify-center gap-1.5">
            <Wallet size={14} /> Sdílené výdaje na výlet můžete řešit ve zbytku zicha.travel.
          </p>
        </section>
      </div>
    </div>
  )
}

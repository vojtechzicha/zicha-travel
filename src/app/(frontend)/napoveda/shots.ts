// Screenshots used by the help pages. They live in public/napoveda and are
// retaken by scripts/shoot-help-screenshots.mts against the made-up
// "Ukázková chata" from scripts/seed-help-demo.mts — never against real
// data. Dimensions are the CSS size of the captured area (the files
// themselves are 2× that); they keep the layout from jumping while loading.

export interface Shot {
  /** intrinsic width in CSS pixels */
  width: number
  height: number
  alt: string
  /** phone shots are rendered narrow, wide ones fill the card */
  variant?: 'phone' | 'wide' | 'inline'
}

export const SHOTS = {
  'vyber-chaty': {
    width: 548,
    height: 198,
    alt: 'Karta chaty na úvodní stránce s termínem a účastníky',
    variant: 'inline',
  },
  informace: { width: 948, height: 504, alt: 'Pohled Informace s termínem příjezdu a odjezdu' },
  organizace: { width: 972, height: 435, alt: 'Pokoje s počtem lůžek a tlačítkem Zobrazit postele' },
  auta: { width: 972, height: 423, alt: 'Sdílená auta s řidičem a spolujezdci' },
  ucastnici: { width: 1052, height: 660, alt: 'Seznam účastníků s počtem nocí' },
  'vyber-ucastnika': {
    width: 1088,
    height: 335,
    alt: 'Výběr účastníka ve financích s poznámkou „bez účtu“',
  },
  'jsi-to-ty': { width: 533, height: 59, alt: 'Pruh s dotazem „Jsi to ty?“', variant: 'inline' },
  'denik-vydaju': { width: 348, height: 1325, alt: 'Deník výdajů s kartami jednotlivých výdajů', variant: 'phone' },
  'finance-souhrn': { width: 736, height: 376, alt: 'Souhrnný box s útratou, zálohou a výsledkem' },
  'finance-rozpad': { width: 736, height: 520, alt: 'Rozbalený rozpad útraty po jednotlivých výdajích' },
  historie: { width: 736, height: 290, alt: 'Historie plateb účastníka' },
  vyrovnani: { width: 736, height: 500, alt: 'Vyrovnání s QR kódem a číslem účtu pokladníka' },
  'karta-vydaje': { width: 300, height: 168, alt: 'Karta výdaje rozděleného na podíly', variant: 'inline' },
  'karta-pozvani': { width: 300, height: 216, alt: 'Karta výdaje s pozvánkou „Katka zve Terezu“', variant: 'inline' },
  'vlastni-vydaj': {
    width: 300,
    height: 262,
    alt: 'Vlastní výdaj s patičkou „Přidali jste vy“ a odkazy Upravit a Smazat',
    variant: 'inline',
  },
  prehled: { width: 1068, height: 804, alt: 'Podrobný přehled všech účastníků v tabulce' },
  prihlaseni: { width: 1140, height: 940, alt: 'Přihlašovací okno s polem pro e-mail' },
  'prihlasene-finance': {
    width: 1280,
    height: 900,
    alt: 'Finance přihlášeného účastníka s tlačítkem Přidat výdaj',
    variant: 'wide',
  },
  'composer-desktop': {
    width: 1280,
    height: 900,
    alt: 'Formulář nového výdaje na počítači',
    variant: 'wide',
  },
  'deleni-podily': { width: 692, height: 537, alt: 'Rozdělení na podíly s tlačítky plus a minus' },
  'deleni-castky': { width: 692, height: 521, alt: 'Rozdělení přesnými částkami s dopočítaným zbytkem' },
  'mobil-tlacitko': { width: 420, height: 880, alt: 'Kulaté tlačítko pro přidání výdaje na mobilu', variant: 'phone' },
  'composer-vstup': { width: 420, height: 880, alt: 'Volba mezi vyfocením účtenky a ručním zadáním', variant: 'phone' },
  'composer-krok1': { width: 420, height: 880, alt: 'Krok 1: co a kolik', variant: 'phone' },
  'composer-krok2': { width: 420, height: 880, alt: 'Krok 2: kdo se dělí', variant: 'phone' },
  'composer-krok3': { width: 420, height: 880, alt: 'Krok 3: souhrn a pozvání', variant: 'phone' },
  'admin-chata': { width: 1280, height: 900, alt: 'Formulář chaty v administraci', variant: 'wide' },
  'admin-ucastnik': {
    width: 1280,
    height: 900,
    alt: 'Formulář účastníka s volbou „platí za něj/ni“',
    variant: 'wide',
  },
  'claim-rozhodnuti': {
    width: 488,
    height: 446,
    alt: 'Stránka s rozhodnutím o žádosti o propojení',
    variant: 'inline',
  },
} as const satisfies Record<string, Shot>

export type ShotName = keyof typeof SHOTS

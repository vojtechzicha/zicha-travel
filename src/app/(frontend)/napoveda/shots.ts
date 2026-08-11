// Screenshots used by the help pages. They live in public/napoveda and are
// retaken by scripts/shoot-help-screenshots.mts against the made-up
// "Ukázková chata" from scripts/seed-help-demo.mts — never against real
// data. Dimensions are the CSS size of the captured area (the files
// themselves are 2× that); they keep the layout from jumping while loading.
//
// The screenshots themselves show the Czech UI and are shared by both
// locales; only the alt text is per-locale.

export interface Shot {
  /** intrinsic width in CSS pixels */
  width: number
  height: number
  alt: { cs: string; en: string }
  /** phone shots are rendered narrow, wide ones fill the card */
  variant?: 'phone' | 'wide' | 'inline'
}

export const SHOTS = {
  'vyber-chaty': {
    width: 548,
    height: 198,
    alt: {
      cs: 'Karta chaty na úvodní stránce s termínem a účastníky',
      en: 'Chata card on the home page with dates and participants',
    },
    variant: 'inline',
  },
  informace: {
    width: 948,
    height: 504,
    alt: {
      cs: 'Pohled Informace s termínem příjezdu a odjezdu',
      en: 'The Information view with arrival and departure dates',
    },
  },
  organizace: {
    width: 972,
    height: 435,
    alt: {
      cs: 'Pokoje s počtem lůžek a tlačítkem Zobrazit postele',
      en: 'Rooms with bed counts and the Show beds button',
    },
  },
  auta: {
    width: 972,
    height: 423,
    alt: {
      cs: 'Sdílená auta s řidičem a spolujezdci',
      en: 'Shared cars with a driver and passengers',
    },
  },
  ucastnici: {
    width: 1052,
    height: 660,
    alt: {
      cs: 'Seznam účastníků s počtem nocí',
      en: 'Participant list with the number of nights',
    },
  },
  'vyber-ucastnika': {
    width: 1088,
    height: 335,
    alt: {
      cs: 'Výběr účastníka ve financích s poznámkou „bez účtu“',
      en: 'Participant picker in Finances with a "no account" note',
    },
  },
  'jsi-to-ty': {
    width: 533,
    height: 59,
    alt: {
      cs: 'Pruh s dotazem „Jsi to ty?“',
      en: 'Bar with the "Is that you?" prompt',
    },
    variant: 'inline',
  },
  'denik-vydaju': {
    width: 348,
    height: 1325,
    alt: {
      cs: 'Deník výdajů s kartami jednotlivých výdajů',
      en: 'Expense journal with individual expense cards',
    },
    variant: 'phone',
  },
  'finance-souhrn': {
    width: 736,
    height: 376,
    alt: {
      cs: 'Souhrnný box s útratou, zálohou a výsledkem',
      en: 'Summary box with fair share, advance and result',
    },
  },
  'finance-rozpad': {
    width: 736,
    height: 520,
    alt: {
      cs: 'Rozbalený rozpad útraty po jednotlivých výdajích',
      en: 'Expanded fair share breakdown, expense by expense',
    },
  },
  historie: {
    width: 736,
    height: 290,
    alt: {
      cs: 'Historie plateb účastníka',
      en: "A participant's payment history",
    },
  },
  vyrovnani: {
    width: 736,
    height: 500,
    alt: {
      cs: 'Vyrovnání s QR kódem a číslem účtu pokladníka',
      en: "Settlement with a QR code and the banker's account number",
    },
  },
  'karta-vydaje': {
    width: 300,
    height: 168,
    alt: {
      cs: 'Karta výdaje rozděleného na podíly',
      en: 'Card of an expense split by shares',
    },
    variant: 'inline',
  },
  'karta-pozvani': {
    width: 300,
    height: 216,
    alt: {
      cs: 'Karta výdaje s pozvánkou „Katka zve Terezu“',
      en: 'Expense card with the invitation "Katka invites Tereza"',
    },
    variant: 'inline',
  },
  'vlastni-vydaj': {
    width: 300,
    height: 262,
    alt: {
      cs: 'Vlastní výdaj s patičkou „Přidali jste vy“ a odkazy Upravit a Smazat',
      en: 'Your own expense with the "Added by you" footer and Edit and Delete links',
    },
    variant: 'inline',
  },
  prehled: {
    width: 1068,
    height: 804,
    alt: {
      cs: 'Podrobný přehled všech účastníků v tabulce',
      en: 'Detailed overview of all participants in a table',
    },
  },
  prihlaseni: {
    width: 1140,
    height: 940,
    alt: {
      cs: 'Přihlašovací okno s polem pro e-mail',
      en: 'Sign-in dialog with an email field',
    },
  },
  'prihlasene-finance': {
    width: 1280,
    height: 900,
    alt: {
      cs: 'Finance přihlášeného účastníka s tlačítkem Přidat výdaj',
      en: 'Finances view of a signed-in participant with the Add expense button',
    },
    variant: 'wide',
  },
  'composer-desktop': {
    width: 1280,
    height: 900,
    alt: {
      cs: 'Formulář nového výdaje na počítači',
      en: 'New expense form on a computer',
    },
    variant: 'wide',
  },
  'deleni-podily': {
    width: 692,
    height: 537,
    alt: {
      cs: 'Rozdělení na podíly s tlačítky plus a minus',
      en: 'Splitting by shares with plus and minus buttons',
    },
  },
  'deleni-castky': {
    width: 692,
    height: 521,
    alt: {
      cs: 'Rozdělení přesnými částkami s dopočítaným zbytkem',
      en: 'Splitting by exact amounts with an auto-filled remainder',
    },
  },
  'mobil-tlacitko': {
    width: 420,
    height: 880,
    alt: {
      cs: 'Kulaté tlačítko pro přidání výdaje na mobilu',
      en: 'Round button for adding an expense on a phone',
    },
    variant: 'phone',
  },
  'composer-vstup': {
    width: 420,
    height: 880,
    alt: {
      cs: 'Volba mezi vyfocením účtenky a ručním zadáním',
      en: 'Choice between photographing a receipt and entering it manually',
    },
    variant: 'phone',
  },
  'composer-krok1': {
    width: 420,
    height: 880,
    alt: { cs: 'Krok 1: co a kolik', en: 'Step 1: what and how much' },
    variant: 'phone',
  },
  'composer-krok2': {
    width: 420,
    height: 880,
    alt: { cs: 'Krok 2: kdo se dělí', en: 'Step 2: who shares it' },
    variant: 'phone',
  },
  'composer-krok3': {
    width: 420,
    height: 880,
    alt: { cs: 'Krok 3: souhrn a pozvání', en: 'Step 3: summary and invitations' },
    variant: 'phone',
  },
  'admin-chata': {
    width: 1280,
    height: 900,
    alt: {
      cs: 'Formulář chaty v administraci',
      en: 'Chata form in the admin panel',
    },
    variant: 'wide',
  },
  'admin-ucastnik': {
    width: 1280,
    height: 900,
    alt: {
      cs: 'Formulář účastníka s volbou „platí za něj/ni“',
      en: 'Participant form with the "paid by" option',
    },
    variant: 'wide',
  },
  'claim-rozhodnuti': {
    width: 488,
    height: 446,
    alt: {
      cs: 'Stránka s rozhodnutím o žádosti o propojení',
      en: 'Decision page for a link request',
    },
    variant: 'inline',
  },
} as const satisfies Record<string, Shot>

export type ShotName = keyof typeof SHOTS

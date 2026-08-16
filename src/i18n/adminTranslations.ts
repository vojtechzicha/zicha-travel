import type { NestedKeysStripped } from '@payloadcms/translations'
import type { PayloadRequest } from 'payload'

// Custom admin-panel translations (namespace `zicha`), merged into Payload's
// own translations via the i18n config in payload.config.ts. Components read
// them with useTranslation<AdminTranslationsObject, AdminTranslationKeys>()
// and t('zicha:key'). English keeps the original hardcoded wording.
const en = {
  zicha: {
    // Shared
    cancel: 'Cancel',
    close: 'Close',
    errorPrefix: 'Error: {{message}}',
    loading: 'Loading...',

    // LoginView / BeforeLogin branding
    signInWithMicrosoft: 'Sign in with Microsoft',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    signingIn: 'Signing in...',
    invalidCredentials: 'Invalid email or password',
    loginFailed: 'Login failed. Please try again.',
    tagline: 'Group trips & shared expenses',
    errOauth: 'Microsoft sign-in was cancelled or failed. Please try again.',
    errUnauthorized: 'Your Microsoft account is not authorized. Contact the administrator.',
    errMissingParams: 'Invalid OAuth response. Please try again.',
    errInvalidState: 'Session expired. Please try again.',
    errNoEmail: 'Could not retrieve email from Microsoft. Please try again.',
    errCallbackFailed: 'Sign-in failed. Please try again.',
    welcomeTitle: 'Welcome to zicha.travel',
    welcomeText: 'Manage your group trips and shared expenses with ease.',
    quickGuide: 'Quick Guide:',
    guideChatasLabel: 'Chatas',
    guideChatasText: 'Create and manage trips/events',
    guideParticipantsLabel: 'Participants',
    guideParticipantsText: 'Add people to each trip',
    guideExpensesLabel: 'Expenses',
    guideExpensesText: 'Track shared costs',
    guidePrepaymentsLabel: 'Prepayments',
    guidePrepaymentsText: 'Record advances and refunds',
    guideUsersLabel: 'Users',
    guideUsersText: 'Manage admin accounts',

    // BeforeDashboard
    dashboardTagline:
      'Manage group trips and shared expenses. Track who paid what, calculate fair splits, and settle up with automatic balance calculations.',

    // CzechBankAccountField
    fillIban: 'Fill IBAN → {{value}}',
    fillAccountNumber: 'Fill account number → {{value}}',

    // ColorPickerField
    openColorPicker: 'Click to open color picker',

    // PrefillParticipantsButton (Chatas)
    prefillHide: 'Hide "Prefill participants"',
    prefillShow: 'Prefill participants from previous chatas…',
    prefillLoading: 'Loading participants…',
    prefillNoOthers: 'No participants in other chatas.',
    prefillAlreadyInChata: '— already in this chata',
    prefillCreating: 'Creating…',
    prefillCreateCount: 'Create {{count}} participant(s) for this chata',
    prefillCreatedAlert: 'Created {{count}} participant(s).',
    prefillSkippedAlert: ' Skipped (name already in this chata): {{names}}.',
    prefillCreateError: 'Error creating participants',
    prefillFooter:
      'Creates new participants of this chata copied from previous ones (name, declension forms, banking info).',

    // BankerAccountSummary (Chatas)
    bankerNoBankingInfo:
      'has no banking info yet — settlements will show no account or QR code.',
    bankerAddOnParticipant: 'Add it on the participant →',
    bankerPaymentsGoToPrefix: 'Payments go to ',
    bankerPaymentsGoToSuffix: "'s own account:",
    bankerEditOnParticipant: 'Edit on the participant →',
    bankerNeedsAccountHint:
      'The banker has no linked user account. Creditor account numbers are shown only to signed-in bankers and admins, so without an account they cannot see where to send refunds. Use "Create account from email..." on the participant.',
    bankerNeedsAccountCta: 'Open the participant →',

    // CreateAccountButton (Participants)
    createAccountOpen: 'Create account from email...',
    saveParticipantFirst: 'Save the participant first.',
    createAccountCreating: 'Creating...',
    createAccountSubmit: 'Create & link',
    createAccountCreatedAlert:
      'Account {{email}} created and linked. No email was sent - they can sign in via magic link or Microsoft.',
    createAccountLinkedAlert: 'Existing account {{email}} linked to this participant.',
    createAccountError: 'Error creating account',

    // CopyFromParticipantButton (Participants)
    copyFromHide: 'Hide "Copy from"',
    copyFromShow: 'Copy from existing participant…',
    copyFromLoading: 'Loading participants…',
    copyFromNone: 'No participants found',
    copyFromSelect: 'Select participant (chata)…',
    copyFromApply: 'Prefill',
    copyFromFooter:
      'Prefills name, declension forms and banking info from a participant of a previous chata.',

    // ApplyPaidByButton (Participants)
    paidByApplying: 'Applying...',
    paidByRemoveStanding: 'Remove standing invitations from existing expenses',
    paidByApplyRetro: 'Apply retroactively to existing expenses',
    paidByHintUnsaved: 'Unsaved change - the button applies the saved value. Save first.',
    paidByHintSelectFirst: 'Select and save "Paid By" first.',
    paidByDoneAlert: 'Done - expenses checked: {{scanned}}, updated: {{updated}}.',
    paidByAllInSync: ' Everything was already in sync.',
    paidByError: 'Error applying retroactively',

    // PrefillWeightsButton (Expenses)
    weightsSelectChataFirst: 'Select a chata first',
    weightsPrefillAll: 'Prefill all participants',
    weightsNoParticipants: 'No participants found for this chata',
    weightsLoadError: 'Error loading participants',

    // WeightsSumIndicator (Expenses)
    weightsSumLabel: 'Weights sum:',
    weightsSumMatches:
      '— matches the total amount, so the expense card shows each weight as a Kč amount.',
    weightsSumMultipliers:
      '— shown as multipliers (e.g. “2x”). Make the weights add up to the total amount{{amount}} to display them as Kč amounts.',

    // WeightShareHint (Expenses)
    weightShareOf: '{{weight}} of {{total}} weight units',
  },
}

const cs: typeof en = {
  zicha: {
    // Shared
    cancel: 'Zrušit',
    close: 'Zavřít',
    errorPrefix: 'Chyba: {{message}}',
    loading: 'Načítání…',

    // LoginView / BeforeLogin branding
    signInWithMicrosoft: 'Přihlásit se přes Microsoft',
    email: 'E-mail',
    password: 'Heslo',
    signIn: 'Přihlásit se',
    signingIn: 'Přihlašování…',
    invalidCredentials: 'Neplatný e-mail nebo heslo',
    loginFailed: 'Přihlášení se nezdařilo. Zkuste to prosím znovu.',
    tagline: 'Skupinové výlety a společné výdaje',
    errOauth:
      'Přihlášení přes Microsoft bylo zrušeno nebo se nezdařilo. Zkuste to prosím znovu.',
    errUnauthorized:
      'Váš účet Microsoft nemá oprávnění. Kontaktujte správce.',
    errMissingParams: 'Neplatná odpověď OAuth. Zkuste to prosím znovu.',
    errInvalidState: 'Platnost relace vypršela. Zkuste to prosím znovu.',
    errNoEmail:
      'Od Microsoftu se nepodařilo získat e-mail. Zkuste to prosím znovu.',
    errCallbackFailed: 'Přihlášení se nezdařilo. Zkuste to prosím znovu.',
    welcomeTitle: 'Vítejte na zicha.travel',
    welcomeText: 'Snadno spravujte skupinové výlety a společné výdaje.',
    quickGuide: 'Rychlý průvodce:',
    guideChatasLabel: 'Chaty',
    guideChatasText: 'Vytváření a správa výletů/akcí',
    guideParticipantsLabel: 'Účastníci',
    guideParticipantsText: 'Přidávání lidí k jednotlivým výletům',
    guideExpensesLabel: 'Výdaje',
    guideExpensesText: 'Evidence společných nákladů',
    guidePrepaymentsLabel: 'Zálohy',
    guidePrepaymentsText: 'Záznam záloh a vratek',
    guideUsersLabel: 'Uživatelé',
    guideUsersText: 'Správa účtů správců',

    // BeforeDashboard
    dashboardTagline:
      'Spravujte skupinové výlety a společné výdaje. Sledujte, kdo co zaplatil, počítejte férové podíly a vyrovnejte se díky automatickému výpočtu zůstatků.',

    // CzechBankAccountField
    fillIban: 'Vyplnit IBAN → {{value}}',
    fillAccountNumber: 'Vyplnit číslo účtu → {{value}}',

    // ColorPickerField
    openColorPicker: 'Kliknutím otevřete výběr barvy',

    // PrefillParticipantsButton (Chatas)
    prefillHide: 'Skrýt „Předvyplnit účastníky“',
    prefillShow: 'Předvyplnit účastníky z předchozích chat…',
    prefillLoading: 'Načítání účastníků…',
    prefillNoOthers: 'Na ostatních chatách nejsou žádní účastníci.',
    prefillAlreadyInChata: '– už je na této chatě',
    prefillCreating: 'Vytváření…',
    prefillCreateCount: 'Vytvořit vybrané účastníky ({{count}}) pro tuto chatu',
    prefillCreatedAlert: 'Vytvořeno účastníků: {{count}}.',
    prefillSkippedAlert: ' Přeskočeno (jméno už na této chatě je): {{names}}.',
    prefillCreateError: 'Chyba při vytváření účastníků',
    prefillFooter:
      'Vytvoří nové účastníky této chaty zkopírované z předchozích (jméno, skloňované tvary, bankovní údaje).',

    // BankerAccountSummary (Chatas)
    bankerNoBankingInfo:
      'zatím nemá bankovní údaje – u vyrovnání se nezobrazí číslo účtu ani QR kód.',
    bankerAddOnParticipant: 'Doplnit u účastníka →',
    bankerPaymentsGoToPrefix: 'Platby jdou na vlastní účet účastníka „',
    bankerPaymentsGoToSuffix: '“:',
    bankerEditOnParticipant: 'Upravit u účastníka →',
    bankerNeedsAccountHint:
      'Pokladník nemá propojený uživatelský účet. Čísla účtů věřitelů se zobrazují jen přihlášeným pokladníkům a správcům – bez účtu neuvidí, kam posílat vratky. Použijte „Vytvořit účet z e-mailu…“ u účastníka.',
    bankerNeedsAccountCta: 'Otevřít účastníka →',

    // CreateAccountButton (Participants)
    createAccountOpen: 'Vytvořit účet z e-mailu…',
    saveParticipantFirst: 'Nejdřív účastníka uložte.',
    createAccountCreating: 'Vytváření…',
    createAccountSubmit: 'Vytvořit a propojit',
    createAccountCreatedAlert:
      'Účet {{email}} byl vytvořen a propojen. Žádný e-mail nebyl odeslán – přihlásit se lze přihlašovacím odkazem nebo přes Microsoft.',
    createAccountLinkedAlert:
      'Existující účet {{email}} byl propojen s tímto účastníkem.',
    createAccountError: 'Chyba při vytváření účtu',

    // CopyFromParticipantButton (Participants)
    copyFromHide: 'Skrýt „Zkopírovat od“',
    copyFromShow: 'Zkopírovat od existujícího účastníka…',
    copyFromLoading: 'Načítání účastníků…',
    copyFromNone: 'Žádní účastníci nenalezeni',
    copyFromSelect: 'Vyberte účastníka (chata)…',
    copyFromApply: 'Předvyplnit',
    copyFromFooter:
      'Předvyplní jméno, skloňované tvary a bankovní údaje od účastníka předchozí chaty.',

    // ApplyPaidByButton (Participants)
    paidByApplying: 'Provádí se…',
    paidByRemoveStanding: 'Odebrat trvalá pozvání z existujících výdajů',
    paidByApplyRetro: 'Promítnout zpětně do existujících výdajů',
    paidByHintUnsaved:
      'Neuložená změna – tlačítko promítne uloženou hodnotu. Nejdřív uložte.',
    paidByHintSelectFirst: 'Nejdřív vyberte a uložte „Platí za něj/ni“.',
    paidByDoneAlert:
      'Hotovo – zkontrolováno výdajů: {{scanned}}, upraveno: {{updated}}.',
    paidByAllInSync: ' Vše už bylo v pořádku.',
    paidByError: 'Chyba při zpětném promítnutí',

    // PrefillWeightsButton (Expenses)
    weightsSelectChataFirst: 'Nejdřív vyberte chatu',
    weightsPrefillAll: 'Předvyplnit všechny účastníky',
    weightsNoParticipants: 'Pro tuto chatu nebyli nalezeni žádní účastníci',
    weightsLoadError: 'Chyba při načítání účastníků',

    // WeightsSumIndicator (Expenses)
    weightsSumLabel: 'Součet vah:',
    weightsSumMatches:
      '– odpovídá celkové částce, na kartě výdaje se tedy každá váha zobrazí jako částka v Kč.',
    weightsSumMultipliers:
      '– zobrazí se jako počty podílů (např. „2 podíly“). Aby se zobrazovaly jako částky v Kč, musí součet vah odpovídat celkové částce{{amount}}.',

    // WeightShareHint (Expenses)
    weightShareOf: '{{weight}} z {{total}} váhových jednotek',
  },
}

export const adminTranslations = { en, cs }

export type AdminTranslationsObject = typeof en
export type AdminTranslationKeys = NestedKeysStripped<AdminTranslationsObject>

// Bilingual message picker for validate() functions — Payload's `t` is typed
// to its own default keys there, so user-visible validation messages pick the
// wording from the request language instead (fallback: English).
export const pickValidationMessage = (
  req: Pick<PayloadRequest, 'i18n'> | undefined,
  english: string,
  czech: string,
): string => ((req?.i18n?.language ?? 'en').startsWith('cs') ? czech : english)

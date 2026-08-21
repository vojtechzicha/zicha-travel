// Czech content, moved verbatim from page.tsx when the frontend went
// bilingual. Edit wording here; page.tsx only picks a locale.

import { KeyRound, LogOut, Mail, ShieldQuestion, Sparkles, UserCheck } from 'lucide-react'
import { Callout, HelpShell, List, NextPage, Screenshot, Section, Steps } from '../ui'

export default function UcetContentCs() {
  return (
    <HelpShell
      title="Účet a přihlášení"
      lead="Účet je jenom e-mail a odkaz, který si necháš poslat. Žádné heslo si vymýšlet nebudeš."
    >
      <div className="flex flex-col gap-6">
        <Section title="K čemu ti účet je" icon={<UserCheck size={20} />}>
          <p>Bez přihlášení se dá projít celá chata. Účet přidává tři věci:</p>
          <List
            items={[
              <>Finance se otevřou rovnou na tvém jménu, nemusíš se hledat v seznamu.</>,
              <>Můžeš přidávat vlastní výdaje a své vlastní pak i upravovat a mazat.</>,
              <>
                Tvoje čísla zmizí anonymním návštěvníkům ze seznamu. Tvoje jméno u nich zůstane, ale
                zešedne.
              </>,
            ]}
          />
          <p>
            Jeden účet může držet víc jmen, klidně v jedné chatě. Typicky rodič, který má na sobě i
            děti a přepíná mezi nimi.
          </p>
        </Section>

        <Section title="Přihlášení odkazem do e-mailu" icon={<Mail size={20} />}>
          <Screenshot
            name="prihlaseni"
            caption="Přihlašovací okno. Odkaz platí 15 minut a použije se jen jednou."
          />
          <Steps
            items={[
              <>
                Otevři <strong>Přihlásit se</strong> v patičce stránky.
              </>,
              <>
                Zadej e-mail a odešli ho. Odpověď je vždycky stejná, aplikace nikomu neprozradí,
                jestli k tomu e-mailu účet existuje.
              </>,
              <>
                Ve schránce najdi zprávu a klepni na odkaz. Tím jsi uvnitř a vracíš se tam,
                odkud jsi odešel/odešla.
              </>,
            ]}
          />
          <p>
            Kdo má účet u Microsoftu, Googlu nebo Applu, může místo toho použít tlačítko{' '}
            <strong>Přihlásit se přes Microsoft</strong>, <strong>Google</strong> nebo{' '}
            <strong>Apple</strong>. Výsledek je stejný, jen musí být účet vedený na stejný e-mail.
          </p>
          <Callout tone="warn">
            Nepřišel e-mail? Zkontroluj spam a to, jestli píšeš stejnou adresu, jakou má správce
            chaty u tvého jména. Účet, který nikdo nezaložil, žádný odkaz nedostane.
          </Callout>
        </Section>

        <Section title="Propojení: „Jsi to ty?“" icon={<ShieldQuestion size={20} />}>
          <p>
            Když si otevřeš ve financích své jméno a ještě k němu nemáš účet, objeví se pod
            hlavičkou tenhle pruh.
          </p>
          <Screenshot name="jsi-to-ty" caption="Nabídka propojení u vybraného účastníka." />
          <Steps
            items={[
              <>
                Klepni na <strong>Tohle jsem já</strong>. Otevře se okno se dvěma cestami.
              </>,
              <>
                <strong>Už tu účet mám</strong>: přihlásíš se přes Microsoft, Google či Apple,
                nebo si necháš poslat
                odkaz. Po návratu se žádost odešle sama.
              </>,
              <>
                <strong>Jsem tu poprvé</strong>: necháš e-mail, přijde ověřovací odkaz. Klepnutí na
                něj je zároveň ověření adresy a první přihlášení.
              </>,
              <>
                Správce chaty dostane e-mail a rozhodne. Jakmile potvrdí, přijde ti zpráva a
                účastník je tvůj.
              </>,
            ]}
          />
          <List
            items={[
              <>
                Když už tě aplikace zná z jiné chaty, propojení proběhne rovnou a nikdo nic
                neschvaluje.
              </>,
              <>
                Dokud žádost čeká, drží se na jejím místě pruh s informací a tlačítkem{' '}
                <strong>Vzít zpět</strong>.
              </>,
              <>
                O jedno jméno může požádat víc lidí najednou. Schválením jednoho se ostatní žádosti
                automaticky zamítnou.
              </>,
              <>Zamítnutí vždy obsahuje důvod, který napíše správce.</>,
            ]}
          />
          <Callout>
            Propojit jde jen jméno, které ještě nikomu nepatří. U lidí, kteří se už přihlásili,
            nabídka nesvítí. Další jméno na svůj účet (partner, děti) ti přidá správce chaty.
          </Callout>
        </Section>

        <Section title="Co se změní po přihlášení" icon={<Sparkles size={20} />}>
          <List
            items={[
              <>Na úvodní stránce vidíš jen chaty, kterých se účastníš, a u nich svůj zůstatek.</>,
              <>Ve financích se přeskočí výběr jména.</>,
              <>Přibude tlačítko pro přidání výdaje.</>,
              <>V patičce se místo přihlášení ukazuje tvůj e-mail a odhlášení.</>,
            ]}
          />
        </Section>

        <Section title="Odhlášení a platnost" icon={<LogOut size={20} />}>
          <List
            items={[
              <>Přihlášení běžnému účtu vydrží 30 dní, správcům chat dvě hodiny.</>,
              <>Platí napříč všemi chatami včetně těch, které mají vlastní adresu.</>,
              <>
                Odhlásit se jde kdykoli odkazem <strong>Odhlásit se</strong> v patičce.
              </>,
            ]}
          />
          <p>
            Superadmin se přihlašuje výhradně přes Microsoft, Google nebo Apple. Když si vyžádá
            odkaz e-mailem, místo
            něj mu přijde vysvětlení.
          </p>
        </Section>

        <Section title="Odkud se účty berou" icon={<KeyRound size={20} />}>
          <List
            items={[
              <>Buď si o propojení řekneš přes „Jsi to ty?“.</>,
              <>
                Nebo ti účet založí správce chaty z tvé e-mailové adresy. V tu chvíli ti nic
                nepřijde. První zpráva dorazí, až o přihlášení požádáš.
              </>,
            ]}
          />
        </Section>

        <NextPage href="/napoveda/prehled" />
      </div>
    </HelpShell>
  )
}

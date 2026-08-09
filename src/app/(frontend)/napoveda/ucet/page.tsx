import type { Metadata } from 'next'
import { KeyRound, LogOut, Mail, ShieldQuestion, Sparkles, UserCheck } from 'lucide-react'
import { Callout, HelpShell, List, NextPage, Screenshot, Section, Steps } from '../ui'
import '../../styles.css'

export const metadata: Metadata = {
  title: 'Účet a přihlášení',
  description: 'Přihlašovací odkaz, Microsoft a propojení účtu s účastníkem',
}

export default function UcetPage() {
  return (
    <HelpShell
      title="Účet a přihlášení"
      lead="Účet je jenom e-mail a odkaz, který si necháte poslat. Žádné heslo si vymýšlet nebudete."
    >
      <div className="flex flex-col gap-6">
        <Section title="K čemu vám účet je" icon={<UserCheck size={20} />}>
          <p>Bez přihlášení se dá projít celá chata. Účet přidává tři věci:</p>
          <List
            items={[
              <>Finance se otevřou rovnou na vašem jménu, nemusíte se hledat v seznamu.</>,
              <>Můžete přidávat vlastní výdaje a své vlastní pak i upravovat a mazat.</>,
              <>
                Vaše čísla zmizí anonymním návštěvníkům ze seznamu. Vaše jméno u nich zůstane, ale
                zešedne.
              </>,
            ]}
          />
          <p>
            Jeden účet může držet víc jmen, klidně v jedné chatě. Typicky rodič, který má na sobě i
            děti, a přepíná mezi nimi.
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
                Otevřete <strong>Přihlásit se</strong> v patičce stránky.
              </>,
              <>
                Zadejte e-mail a odešlete. Odpověď je vždycky stejná, aplikace nikomu neprozradí,
                jestli k tomu e-mailu účet existuje.
              </>,
              <>
                Ve schránce najděte zprávu a klepněte na odkaz. Tím jste uvnitř a vracíte se tam,
                odkud jste odešli.
              </>,
            ]}
          />
          <p>
            Kdo má pracovní nebo školní Microsoft účet, může místo toho použít tlačítko{' '}
            <strong>Přihlásit se přes Microsoft</strong>. Výsledek je stejný.
          </p>
          <Callout tone="warn">
            Nepřišel e-mail? Zkontrolujte spam a to, jestli píšete stejnou adresu, jakou má správce
            chaty u vašeho jména. Účet, který nikdo nezaložil, žádný odkaz nedostane.
          </Callout>
        </Section>

        <Section title="Propojení: „Jsi to ty?“" icon={<ShieldQuestion size={20} />}>
          <p>
            Když si otevřete ve financích své jméno a ještě k němu nemáte účet, objeví se pod
            hlavičkou tenhle pruh.
          </p>
          <Screenshot name="jsi-to-ty" caption="Nabídka propojení u vybraného účastníka." />
          <Steps
            items={[
              <>
                Klepněte na <strong>Tohle jsem já</strong>. Otevře se okno se dvěma cestami.
              </>,
              <>
                <strong>Už tu účet mám</strong>: přihlásíte se přes Microsoft nebo si necháte poslat
                odkaz. Po návratu se žádost odešle sama.
              </>,
              <>
                <strong>Jsem tu poprvé</strong>: necháte e-mail, přijde ověřovací odkaz. Klepnutí na
                něj je zároveň ověření adresy a první přihlášení.
              </>,
              <>
                Správce chaty dostane e-mail a rozhodne. Jakmile potvrdí, přijde vám zpráva a
                účastník je váš.
              </>,
            ]}
          />
          <List
            items={[
              <>
                Když už vás aplikace zná z jiné chaty, propojení proběhne rovnou a nikdo nic
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
            nabídka nesvítí. Další jméno na svůj účet (partner, děti) vám přidá správce chaty.
          </Callout>
        </Section>

        <Section title="Co se změní po přihlášení" icon={<Sparkles size={20} />}>
          <List
            items={[
              <>Na úvodní stránce vidíte jen chaty, kterých se účastníte, a u nich svůj zůstatek.</>,
              <>Ve financích se přeskočí výběr jména.</>,
              <>Přibude tlačítko pro přidání výdaje.</>,
              <>V patičce se místo přihlášení ukazuje váš e-mail a odhlášení.</>,
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
            Superadmin se přihlašuje výhradně přes Microsoft. Když si vyžádá odkaz e-mailem, místo
            něj mu přijde vysvětlení.
          </p>
        </Section>

        <Section title="Odkud se účty berou" icon={<KeyRound size={20} />}>
          <List
            items={[
              <>Buď si o propojení řeknete sami přes „Jsi to ty?“.</>,
              <>
                Nebo vám účet založí správce chaty z vaší e-mailové adresy. V tu chvíli vám nic
                nepřijde. První zpráva dorazí, až o přihlášení požádáte.
              </>,
            ]}
          />
        </Section>

        <NextPage href="/napoveda/prehled" />
      </div>
    </HelpShell>
  )
}

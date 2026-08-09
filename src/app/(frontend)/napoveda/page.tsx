import type { Metadata } from 'next'
import {
  BookOpen,
  Calculator,
  Compass,
  Crown,
  Eye,
  LifeBuoy,
  Map,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import { Callout, HelpShell, List, PageCards, Screenshot, Section } from './ui'
import '../styles.css'

export const metadata: Metadata = {
  title: 'Nápověda',
  description: 'Jak zicha.travel funguje pro návštěvníka, účastníka a správce chaty',
}

const NAV = [
  { href: '#prehled', label: 'Co kde najdete' },
  { href: '#bez-prihlaseni', label: 'Bez přihlášení' },
  { href: '#ucastnik', label: 'Účastník s účtem' },
  { href: '#spravce', label: 'Správce chaty' },
  { href: '#superadmin', label: 'Superadmin' },
  { href: '#pocty', label: 'Jak se počítají peníze' },
  { href: '#slovnicek', label: 'Slovníček' },
]

export default function HelpPage() {
  return (
    <HelpShell
      isHub
      title="Nápověda"
      lead="Co v aplikaci zvládnete jako návštěvník bez účtu, jako přihlášený účastník a jako správce chaty."
    >
      <nav className="flex flex-wrap justify-center gap-2 mb-8">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white/85 bg-white/15
                       border border-white/20 backdrop-blur-md hover:bg-white/25 hover:text-white
                       transition-colors"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-6">
        <Section id="uvod" title="K čemu to celé je" icon={<Compass size={20} />}>
          <p>
            zicha.travel je stránka jedné společné akce. Na jednom místě drží termín a místo,
            rozdělení pokojů a aut, seznam lidí a hlavně peníze: kdo co zaplatil, kolik z toho
            připadá na koho a kdo komu na konci pošle kolik.
          </p>
          <p>
            Každá chata má vlastní adresu a vlastní účastníky. Data se mezi chatami nemíchají, jen
            lidé se často opakují. Když se přihlásíte, na úvodní stránce uvidíte chaty, kterých se
            účastníte, seřazené podle toho, jestli právě probíhají, teprve budou, nebo už jsou za
            vámi.
          </p>
        </Section>

        <Section title="Podrobné návody" icon={<Map size={20} />}>
          <p>
            Tahle stránka je rychlý přehled. Každá část má vlastní návod s obrázky a popisem toho,
            co se stane po kliknutí.
          </p>
          <PageCards />
        </Section>

        <Section id="prehled" title="Co kde najdete" icon={<BookOpen size={20} />}>
          <p>
            Přepínač pod názvem chaty vede mezi jednotlivými pohledy. Některé se neukážou, pokud
            je správce chaty nevyplnil.
          </p>
          <List
            items={[
              <>
                <strong>Informace</strong>: termín, místo, popis, fotky a doprava. U autobusových a
                vlakových spojení je tlačítko, které vám cestu i s přestupy uloží do Google
                kalendáře.
              </>,
              <>
                <strong>Organizace</strong>: pokoje a postele včetně toho, kdo v které spí, a
                sdílená auta s řidičem, spolujezdci a volnými místy.
              </>,
              <>
                <strong>Účastníci</strong>: kdo všechno jede a na kolik nocí. Ukáže se, až když je
                v chatě víc než dva lidi.
              </>,
              <>
                <strong>Finance</strong>: hlavní pohled na peníze. Vyberete jméno a uvidíte deník
                výdajů, útratu, zálohy a výsledek.
              </>,
              <>
                <strong>Podrobný přehled</strong>: odkaz pod financemi. Naskládá všechny účastníky
                a všechny výdaje do jedné tabulky, což se hodí, když někomu nesedí čísla.
              </>,
            ]}
          />
          <p className="text-sm text-gray-500">
            Podrobně v návodu <a className="underline" href="/napoveda/orientace">Kde co najdete</a>.
          </p>
        </Section>

        <Section id="bez-prihlaseni" title="Bez přihlášení" icon={<Eye size={20} />}>
          <p>
            Odkaz na chatu stačí otevřít. Nic se nezakládá, nic se nepotvrzuje. Informace,
            organizaci i seznam účastníků si projde kdokoliv, kdo adresu zná.
          </p>
          <Screenshot
            name="vyber-ucastnika"
            caption="Ve financích si vyberete jméno a uvidíte stejná čísla, jaká vidí ten člověk sám."
          />
          <List
            items={[
              <>
                Uvidíte útratu, zálohy, výsledek i návod, komu poslat kolik.
              </>,
              <>
                Jedna výjimka: kdo se do aplikace už aspoň jednou přihlásil, ten je ve výběru
                zamčený. Jméno zůstane vidět šedivé a po klepnutí se ukáže zamaskovaný e-mail, aby
                jeho majitel poznal, kterým účtem se má přihlásit.
              </>,
              <>Vlastní výdaj přidat nejde. Deník výdajů vám místo toho nabídne přihlášení.</>,
              <>
                Když mezi jmény najdete sebe, otevřete si ho a pod hlavičkou se objeví nabídka „Jsi
                to ty?“. Odtud vede cesta k účtu.
              </>,
            ]}
          />
          <Callout>
            Zamčená jména jsou ohled v rozhraní, ne trezor. Věci, které nesnesou cizí oči, do
            sdílené kasy nepatří.
          </Callout>
        </Section>

        <Section id="ucastnik" title="Účastník s účtem" icon={<UserCheck size={20} />}>
          <p>
            Účet je e-mail a jednorázový přihlašovací odkaz. Žádné heslo si vymýšlet nemusíte.
            Založí vám ho správce chaty, nebo si o propojení řeknete sami přes „Jsi to ty?“.
          </p>
          <List
            items={[
              <>
                Finance se otevřou rovnou na vašem jménu. Pokud na váš účet správce navěsil i děti
                nebo partnera, přepínáte mezi nimi.
              </>,
              <>
                Vpravo dole přibude tlačítko <strong>Přidat výdaj</strong>. Na mobilu vás provede
                třemi kroky, na počítači je to jedno okno.
              </>,
              <>
                Dělit se dá rovným dílem, na podíly, nebo přesnými částkami. Účtenku můžete
                vyfotit rovnou z formuláře.
              </>,
              <>
                Vlastní výdaje poznáte podle patičky „Přidali jste vy“ a můžete je upravit nebo
                smazat. Na cizí nesáhnete.
              </>,
            ]}
          />
          <p className="text-sm text-gray-500">
            Podrobně v návodech{' '}
            <a className="underline" href="/napoveda/ucet">
              Účet a přihlášení
            </a>{' '}
            a{' '}
            <a className="underline" href="/napoveda/vydaje">
              Přidání a úprava výdaje
            </a>
            .
          </p>
        </Section>

        <Section id="spravce" title="Správce chaty" icon={<ShieldCheck size={20} />}>
          <p>
            Správce se dostane do administrace, ale jen k chatám, které mu superadmin přiřadil. Ve
            financích na webu vidí všechny účastníky a může mezi nimi přepínat.
          </p>
          <List
            items={[
              <>
                Zakládá účastníky, hromadně je kopíruje z minulých chat a vybírá pokladníka.
              </>,
              <>
                Zadává výdaje, zálohy, doplatky a vrácené přeplatky, spravuje společné účty a
                pozvání.
              </>,
              <>Rozhoduje žádosti o propojení a zakládá účty z e-mailové adresy.</>,
              <>Nastavuje, co je v chatě vidět, jak vypadá a na jaké adrese běží.</>,
            ]}
          />
          <p className="text-sm text-gray-500">
            Podrobně v návodu{' '}
            <a className="underline" href="/napoveda/sprava">
              Pro správce chaty
            </a>
            .
          </p>
        </Section>

        <Section id="superadmin" title="Superadmin" icon={<Crown size={20} />}>
          <p>Superadmin má na starosti aplikaci jako celek, napříč všemi chatami.</p>
          <List
            items={[
              <>Zakládá a maže chaty a přiřazuje k nim správce.</>,
              <>
                Spravuje uživatelské účty a role. Roli může změnit jen superadmin, správce chaty na
                ni nedosáhne.
              </>,
              <>Stará se o ikony, pozadí a ostatní média.</>,
              <>
                Přihlašuje se výhradně přes Microsoft. O přihlašovací odkaz e-mailem si říct může,
                ale místo něj mu přijde vysvětlení.
              </>,
            ]}
          />
        </Section>

        <Section id="pocty" title="Jak se počítají peníze" icon={<Calculator size={20} />}>
          <p>
            Každý výdaj má toho, kdo ho zaplatil, a rozdělení mezi účastníky. Součet vašich podílů
            ze všech výdajů je vaše útrata. Proti ní stojí to, co jste sami zaplatili, a zálohy
            poslané pokladníkovi.
          </p>
          <List
            items={[
              <>
                Rovným dílem se výdaj rozpustí mezi vybrané lidi stejně. Podíly umí zohlednit, že
                někdo spotřebuje víc: dva podíly znamenají dvojnásobek jednoho. Přesné částky
                rozepíšou položku po korunách.
              </>,
              <>
                Zálohy, doplatky a vrácené přeplatky jsou pohyby mezi účastníkem a pokladníkem, ne
                platby za konkrétní věc. Pokladníkovi se jeho vlastní vklad nepočítá znovu.
              </>,
              <>
                Když platí společný účet, útrata se rovným dílem rozdělí mezi jeho členy. Peníze se
                ale vždycky vyrovnávají mezi lidmi.
              </>,
              <>
                Pozvání přesune podíl hosta na hostitele. Posouvá se o jeden krok: když pozvaný sám
                někoho pozve, jeho vlastní podíl už dál neputuje.
              </>,
            ]}
          />
          <p>
            Na konci vyjde jedno číslo. Buď doplácíte, nebo dostáváte zpět. Rozdíly do jedné
            koruny bere aplikace jako vyrovnané, ať se kvůli zaokrouhlení neposílají haléře.
          </p>
          <p className="text-sm text-gray-500">
            Rozepsané i s příkladem v návodu{' '}
            <a className="underline" href="/napoveda/prehled">
              Podrobný přehled a výpočty
            </a>
            .
          </p>
        </Section>

        <Section id="slovnicek" title="Slovníček" icon={<BookOpen size={20} />}>
          <dl className="flex flex-col gap-3 m-0">
            {[
              ['Chata', 'Jedna akce. Vlastní adresa, vlastní účastníci, vlastní kasa.'],
              [
                'Pokladník',
                'Člověk, který drží společnou kasu. Vybírá zálohy a na konci rozesílá, co komu zbylo.',
              ],
              [
                'Účastník',
                'Jméno v jedné chatě. Účet mít může a nemusí. Bez účtu je jeho přehled financí přístupný komukoliv s odkazem.',
              ],
              [
                'Účet',
                'Přihlášení e-mailem. Jeden účet může držet víc účastníků, klidně i v jedné chatě, třeba rodič a děti.',
              ],
              ['Podíl', 'Číslo, kterým se dělí výdaj. Dva podíly znamenají dvakrát tolik než jeden.'],
              [
                'Záloha, doplatek, vrácený přeplatek',
                'Peníze mezi účastníkem a pokladníkem, které nepatří ke konkrétnímu výdaji.',
              ],
              [
                'Společný účet',
                'Bankovní účet dvou a víc lidí. Co se z něj zaplatí, rozdělí se mezi ně rovným dílem.',
              ],
              ['Pozvání', 'Hostitel bere podíl svého hosta na sebe.'],
              [
                'Propojení',
                'Spojení účtu s účastníkem. Teprve po něm aplikace ví, kdo jste, a ukáže vám vaše finance rovnou.',
              ],
            ].map(([term, meaning]) => (
              <div key={term}>
                <dt className="font-semibold text-gray-900">{term}</dt>
                <dd className="m-0">{meaning}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="nesedi" title="Když něco nesedí" icon={<LifeBuoy size={20} />}>
          <p>
            Nejdřív zkuste podrobný přehled pod financemi. Ukáže všechny výdaje a všechny lidi
            najednou, takže z něj bývá vidět, kde se čísla rozešla: chybějící účtenka, špatně
            nastavené podíly, zapomenutá záloha.
          </p>
          <p>
            Svůj vlastní výdaj si opravíte sami. U všeho ostatního pomůže ten, kdo chatu zakládal.
            Pokladníka, tedy člověka od společné kasy, máte v hlavičce vedle názvu chaty. Pokud
            koukáte na finance někoho cizího a mělo by tam být vaše jméno, požádejte o propojení
            přes „Jsi to ty?“.
          </p>
        </Section>
      </div>
    </HelpShell>
  )
}

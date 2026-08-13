// Czech content, moved verbatim from page.tsx when the frontend went
// bilingual. Edit wording here; page.tsx only picks a locale.

import { Calculator, HeartHandshake, Sigma, Table2, Users, Wallet } from 'lucide-react'
import { Callout, HelpShell, List, NextPage, Screenshot, Section, Steps } from '../ui'

export default function PrehledContentCs() {
  return (
    <HelpShell
      title="Podrobný přehled a výpočty"
      lead="Když někomu čísla nesedí, otevřete tabulku, kde je vidět všechno najednou. A tady je i výpočet, který za ní stojí."
    >
      <div className="flex flex-col gap-6">
        <Section title="Kde přehled najdete" icon={<Table2 size={20} />}>
          <p>
            Ve Financích pod obsahem je řádek „Nesedí vám čísla, nebo chcete vidět všechno
            najednou?“ a v něm odkaz <strong>Podrobný přehled všech účastníků</strong>. Otevřený je
            komukoli, i bez přihlášení.
          </p>
          <Screenshot
            name="prehled"
            caption="Sloupec na osobu, řádek na položku. Vpravo kontrolní součet, dole výsledek každého."
          />
        </Section>

        <Section title="Jak tabulku číst" icon={<Sigma size={20} />}>
          <List
            items={[
              <>
                <strong>Zaplaceno za ostatní</strong>: co daný člověk zaplatil ze svého. U společného
                účtu se částka dělí mezi jeho členy.
              </>,
              <>
                <strong>Záloha a doplatek pokladníkovi</strong>: kladné u toho, kdo posílal, záporné
                u pokladníka, který je vybral. Součet řádku je proto nula.
              </>,
              <>
                <strong>Útrata</strong>: jeden řádek na výdaj. V každém sloupci je podíl toho člověka
                a poznámka, když ho platil někdo jiný.
              </>,
              <>
                <strong>Σ kontrola</strong> vpravo: součet řádku. U výdajů musí odpovídat jejich ceně,
                u přesunů k pokladníkovi nule.
              </>,
              <>
                <strong>Výsledek</strong> dole: kolik kdo dostane nebo doplatí. Celý řádek dává
                dohromady nulu, jinak by se peníze někde ztrácely.
              </>,
            ]}
          />
          <p>
            Na širokých obrazovkách se otevírá tabulka, na mobilu karty. Přepnout jde tlačítky
            nahoře a volba se pamatuje.
          </p>
        </Section>

        <Section title="Odkud se bere váš podíl" icon={<Calculator size={20} />}>
          <p>
            Každý výdaj se rozpustí mezi lidi jedním ze tří způsobů. Součet všech vašich podílů je
            vaše útrata.
          </p>
          <Steps
            items={[
              <>
                <strong>Rovným dílem.</strong> Cena děleno počtem lidí. Pronájem chalupy za 7 200 Kč
                mezi šest lidí dělá 1 200 Kč na osobu.
              </>,
              <>
                <strong>Podíly.</strong> Cena děleno součtem podílů. Pivo a víno za 1 250 Kč se dělilo
                na 1 + 2 + 1 + 2 podílů, tedy 208 Kč na podíl. Kdo měl dva, platí 417 Kč.
              </>,
              <>
                <strong>Přesné částky.</strong> Podíly zadané v korunách. Co zůstane nevyplněné, se
                rovnoměrně rozpočítá mezi zbytek.
              </>,
            ]}
          />
        </Section>

        <Section title="Pozvání a děti" icon={<HeartHandshake size={20} />}>
          <p>
            Pozvání přesune podíl hosta na hostitele. V tabulce je to vidět z obou stran: u hosta
            nula s poznámkou, kdo za něj platí, u hostitele zvýšená částka s poznámkou, za koho.
          </p>
          <List
            items={[
              <>
                Ela má u každého výdaje nulu a poznámku, že za ni platí Katka. Katce se proto podíly
                sčítají za dva.
              </>,
              <>
                Přesouvá se vždy původní podíl a jen o jeden krok. Když pozvaný sám někoho pozve,
                řetěz se dál nesčítá.
              </>,
              <>Kdo za koho platí trvale, nastavuje správce chaty u účastníka.</>,
            ]}
          />
        </Section>

        <Section title="Zálohy, pokladník a společný účet" icon={<Wallet size={20} />}>
          <List
            items={[
              <>
                Záloha, doplatek a vrácený přeplatek jsou přesuny mezi člověkem a pokladníkem, ne
                platby za konkrétní věc.
              </>,
              <>
                Pokladníkovi se jeho vlastní vklad nepočítá znovu. Jde o pohyb uvnitř společné kasy,
                a proto jeho zůstatek obvykle vypadá hodně záporně: drží peníze ostatních.
              </>,
              <>
                Výdaj zaplacený ze společného účtu se rovným dílem připíše jeho členům. Vyrovnává se
                ale vždycky mezi lidmi, na společný účet se nikdy nic neposílá.
              </>,
            ]}
          />
          <Callout>
            Rozdíly do jedné koruny bere aplikace jako vyrovnané. Je to schválně: kvůli zaokrouhlení
            podílů by jinak zůstávaly viset haléřové dluhy.
          </Callout>
        </Section>

        <Section title="Když čísla pořád nesedí" icon={<Users size={20} />}>
          <List
            items={[
              <>
                Projděte řádek po řádku sloupec <strong>Σ kontrola</strong>. Kde součet neodpovídá
                ceně výdaje, je špatně zadané rozdělení.
              </>,
              <>Zkontrolujte, jestli chybí zapsaná záloha nebo účtenka, kterou někdo zaplatil bokem.</>,
              <>
                Plánované výdaje se do vyrovnání nepočítají. Jestli už je zaplaceno, potvrdí to autor
                výdaje tlačítkem <em>Už zaplaceno</em> na kartě, u ostatních přepne výdaj správce
                chaty.
              </>,
              <>Svůj vlastní výdaj opravíte sami, u ostatních pomůže správce chaty.</>,
            ]}
          />
        </Section>

        <NextPage href="/napoveda/sprava" />
      </div>
    </HelpShell>
  )
}

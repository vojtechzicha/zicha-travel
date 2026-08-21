// Czech content, moved verbatim from page.tsx when the frontend went
// bilingual. Edit wording here; page.tsx only picks a locale.

import { Banknote, ClipboardList, Crown, ListTree, Receipt, UserSearch, Wallet } from 'lucide-react'
import { Callout, HelpShell, List, NextPage, Screenshot, ScreenshotRow, Section, Steps } from '../ui'

export default function FinanceContentCs() {
  return (
    <HelpShell
      title="Finance řádek po řádku"
      lead="Vybereš jméno a uvidíš jednu obrazovku s pěti až sedmi čísly. Tady je, co každé z nich znamená."
    >
      <div className="flex flex-col gap-6">
        <Section title="Nejdřív si vyber jméno" icon={<UserSearch size={20} />}>
          <Screenshot
            name="vyber-ucastnika"
            caption="Výběr účastníka. Korunka označuje pokladníka, poznámka „bez účtu“ znamená, že si člověk ještě nepropojil přihlášení."
          />
          <Steps
            items={[
              <>
                Klepni na své jméno. Když je lidí hodně, použij pole <em>Hledat účastníka</em>.
              </>,
              <>
                Výběr si prohlížeč zapamatuje, takže příště naskočíš rovnou na sebe. Změnit ho jde
                tlačítkem <strong>Změnit</strong> v pruhu se jménem.
              </>,
              <>
                Přihlášeným se tenhle krok přeskočí: otevře se rovnou jejich vlastní jméno. Správce
                chaty naopak může přepínat mezi všemi.
              </>,
            ]}
          />
          <Callout>
            Šedivá jména na konci seznamu patří lidem, kteří se už někdy přihlásili. Jejich finance
            uvidí po přihlášení jen oni. Po klepnutí se ukáže nápověda, jakým e-mailem se hlásit.
          </Callout>
        </Section>

        <Section title="Souhrnný box: odkud se bere výsledek" icon={<Wallet size={20} />}>
          <p>
            Barva boxu napovídá dřív než čísla. Zelená znamená, že jsi na svém nebo dostáváš
            zpátky, červená, že doplácíš, modrá patří pokladníkovi.
          </p>
          <Screenshot
            name="finance-souhrn"
            caption="Míša nakoupil za celou chatu, takže je v zisku: dostane zpět 3 360 Kč."
          />
          <p>Řádky se objevují jen tehdy, když mají co ukázat:</p>
          <List
            items={[
              <>
                <strong>Zaplaceno za ostatní</strong>: součet výdajů, které jsi zaplatil/a ty. Když
                platil společný účet, započítá se ti polovina (nebo díl podle počtu členů).
              </>,
              <>
                <strong>Záloha</strong> a <strong>Doplatek</strong>: co jsi poslal/a pokladníkovi.
                Přičítá se ti to k dobru.
              </>,
              <>
                <strong>Vrácený přeplatek</strong>: peníze, které ti pokladník už poslal zpátky.
                Odečítá se.
              </>,
              <>
                <strong>Tvá útrata (Fair Share)</strong>: součet tvých podílů ze všech výdajů. Tohle
                je to, co tě chata reálně stojí. Číslo jde rozkliknout.
              </>,
              <>
                <strong>Plánovaná útrata</strong>: žlutý řádek pro výdaje, které jsou zatím jen v
                plánu. Vidíš, kam to spěje, ale k vyrovnání se zatím nepočítá.
              </>,
              <>
                <strong>Výsledek</strong> pod čárou: buď <em>Doplácíš</em>, nebo{' '}
                <em>Dostaneš zpět</em>. Rozdíly do jedné koruny bere aplikace jako vyrovnané.
              </>,
            ]}
          />
        </Section>

        <Section title="Rozpad útraty" icon={<ListTree size={20} />}>
          <p>
            Klepnutím na řádek <strong>Tvá útrata</strong> se rozbalí seznam, ze kterého je vidět,
            kolik z každého výdaje připadlo na tebe.
          </p>
          <Screenshot
            name="finance-rozpad"
            caption="U každé položky je částka a v závorce podíl, kterým se dělila."
          />
          <List
            items={[
              <>
                U rovného dělení má každý jeden podíl. U vážených výdajů uvidíš třeba dva podíly, u
                přesných částek rovnou konkrétní sumu.
              </>,
              <>
                Když tvůj podíl někdo převzal, je u položky poznámka, kdo tě pozval, a částka je
                zelená. Když jsi naopak platil/a za někoho ty, přičte se ti jeho podíl a je u toho
                jeho jméno.
              </>,
              <>Plánované výdaje mají vlastní rozpad ve žlutém řádku pod tím.</>,
            ]}
          />
        </Section>

        <Section title="Deník výdajů" icon={<ClipboardList size={20} />}>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <Screenshot name="denik-vydaju" caption="Sloupec s výdaji, na mobilu je pod přehledem." />
            <div className="flex flex-col gap-4 flex-1">
              <p>
                Vlevo (na mobilu dole) běží seznam výdajů. Přepínač <strong>moje</strong> a{' '}
                <strong>vše</strong> v jeho hlavičce mění, jestli koukáš jen na výdaje, které se
                týkají vybraného člověka, nebo na celou chatu.
              </p>
              <List
                items={[
                  <>Výdaje jsou seřazené od nejstaršího, tedy tak, jak přibývaly.</>,
                  <>
                    Výdaje, které se tě netýkají, jsou v režimu <em>vše</em> vybledlé.
                  </>,
                  <>
                    Žlutě čárkovaný rámeček a značka <em>Plánovaný</em> znamenají výdaj, který se
                    teprve chystá.
                  </>,
                ]}
              />
            </div>
          </div>
        </Section>

        <Section title="Co je na kartě výdaje" icon={<Receipt size={20} />}>
          <ScreenshotRow>
            <Screenshot
              name="karta-vydaje"
              caption="Vážený výdaj: Vojta a Petr mají dvojnásobný podíl."
            />
            <Screenshot
              name="karta-pozvani"
              caption="Růžová značka říká, že hostitel převzal podíl pozvaného."
            />
          </ScreenshotRow>
          <List
            items={[
              <>Název, částka a kdo platil. U společného účtu jsou uvedena obě jména.</>,
              <>
                Značky pod tím ukazují dělení: buď <em>Všichni rovným dílem</em>, nebo jednotlivá
                jména s počtem podílů či s částkou.
              </>,
              <>
                Když je jmen moc, sbalí se do <em>+ N dalších</em>. Klepnutím se rozbalí.
              </>,
              <>
                Účtenky visí jako malé náhledy. Obrázek se po klepnutí otevře přes celou obrazovku,
                PDF se otevře v nové záložce.
              </>,
            ]}
          />
        </Section>

        <Section title="Historie plateb" icon={<Banknote size={20} />}>
          <Screenshot name="historie" caption="Pohyby mezi tebou a pokladníkem plus tvoje platby." />
          <p>
            Poslední blok shrnuje, co se s tvými penězi dělo: odeslané zálohy a doplatky, vrácené
            přeplatky a výdaje, které jsi zaplatil/a. Slouží ke kontrole, když nemáš jistotu, jestli
            se něco započítalo.
          </p>
        </Section>

        <Section title="Jak se vyrovnat" icon={<Crown size={20} />}>
          <Screenshot
            name="vyrovnani"
            caption="Dlužník vidí QR kód, číslo účtu pokladníka, IBAN a částku. Každý údaj jde zkopírovat."
          />
          <p>Podle toho, jak na tom jsi, uvidíš jednu ze tří variant:</p>
          <List
            items={[
              <>
                <strong>Doplácíš</strong>: QR kód na přesnou částku a pod ním údaje k ručnímu
                zadání. Platí se pokladníkovi.
              </>,
              <>
                <strong>Dostáváš zpět</strong>: jen informace, že ti pokladník pošle peníze, až se
                vyberou dluhy. Nic dělat nemusíš.
              </>,
              <>
                <strong>Máš vyrovnáno</strong>: potvrzení, že je hotovo.
              </>,
            ]}
          />
          <p>
            Pokladník má obrazovku jinou: v jednom sloupci vidí, kdo mu ještě dluží, ve druhém, komu
            má poslat. U každého věřitele si rozbalí QR kód s jeho číslem účtu. Kdo bankovní údaje
            nevyplnil, objeví se ve žlutém rámečku s poznámkou, že se mu má zaplatit hotově.
          </p>
          <Callout tone="warn">
            Aplikace platby nesleduje. Když někdo pošle peníze, musí to pokladník zanést jako zálohu
            nebo doplatek, jinak zůstane dluh v přehledu viset.
          </Callout>
        </Section>

        <NextPage href="/napoveda/vydaje" />
      </div>
    </HelpShell>
  )
}

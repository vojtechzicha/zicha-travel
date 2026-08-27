// Czech content, moved verbatim from page.tsx when the frontend went
// bilingual. Edit wording here; page.tsx only picks a locale.

import {
  Camera,
  Clock,
  EyeOff,
  HeartHandshake,
  Monitor,
  PencilLine,
  Plus,
  Scale,
  Smartphone,
  UserCheck,
} from 'lucide-react'
import { Callout, HelpShell, List, NextPage, Screenshot, ScreenshotRow, Section, Steps } from '../ui'

export default function VydajeContentCs() {
  return (
    <HelpShell
      title="Přidání a úprava výdaje"
      lead="Zaplatil/a jsi něco za partu? Zapiš to, ať se to nemusí posílat pokladníkovi do zpráv."
    >
      <div className="flex flex-col gap-6">
        <Section title="Kdo může přidávat výdaje" icon={<Plus size={20} />}>
          <p>
            Přihlášený účastník, tedy člověk, jehož účet je propojený s některým jménem v téhle
            chatě. Anonymní návštěvník tlačítko neuvidí, jen nabídku přihlásit se.
          </p>
          <ScreenshotRow>
            <Screenshot
              name="prihlasene-finance"
              className="flex-1 min-w-[320px] max-w-[640px]"
              caption="Na počítači má tlačítko popisek a sedí vpravo dole."
            />
            <Screenshot name="mobil-tlacitko" caption="Na mobilu je z něj kolečko u palce." />
          </ScreenshotRow>
          <p>
            Odkud výdaj zapíšeš, se nikam nepromítá. Formulář je v obou případech stejný, jen
            jinak poskládaný.
          </p>
        </Section>

        <Section title="Na mobilu: tři kroky" icon={<Smartphone size={20} />}>
          <p>
            Po klepnutí vyjede zespodu nabídka, jak chceš začít. Účtenka rovnou otevře fotoaparát,
            ruční zadání jde přímo na formulář.
          </p>
          <ScreenshotRow>
            <Screenshot name="composer-vstup" caption="Vyfotit účtenku, nebo zadat ručně." />
            <Screenshot name="composer-krok1" caption="Krok 1: co a kolik." />
            <Screenshot name="composer-krok2" caption="Krok 2: kdo se dělí." />
            <Screenshot name="composer-krok3" caption="Krok 3: souhrn a pozvání." />
          </ScreenshotRow>
          <Steps
            items={[
              <>
                <strong>Co a kolik.</strong> Název výdaje, částka a datum. Přepínač{' '}
                <em>Vrátili ti peníze</em> použij, když jde o vratku, třeba když ti hospoda
                něco vrátila. Pokud patříš do společného účtu, vybereš tu i to, jestli jsi platil/a
                ty, nebo účet.
              </>,
              <>
                <strong>Kdo se dělí.</strong> Ve výchozím stavu se dělí všichni rovným dílem a
                aplikace hned ukáže, kolik to dělá na osobu. Přepnutím na <em>Vybrat podíly</em> jde
                někoho vyřadit nebo mu dát větší díl.
              </>,
              <>
                <strong>Zkontrolovat a uložit.</strong> Souhrn celého výdaje, možnost dofotit
                účtenku a pole pro pozvání. Tlačítkem <strong>Uložit výdaj</strong> je hotovo.
              </>,
            ]}
          />
          <p>
            Nahoře běží pruh se třemi díly, takže je vidět, kde jsi. Šipkou vlevo se vracíš o krok
            zpět, <em>Zrušit</em> zahodí rozdělanou práci.
          </p>
        </Section>

        <Section title="Na počítači: jedno okno" icon={<Monitor size={20} />}>
          <Screenshot
            name="composer-desktop"
            caption="Stejná pole jako na mobilu, jen pod sebou v jednom okně."
          />
          <p>
            Na širší obrazovce se kroky neschovávají. Nahoře název, částka a datum, uprostřed volba
            plátce a účtenky, dole rozdělení a pozvání. Uloží se tlačítkem vpravo dole.
          </p>
        </Section>

        <Section title="Tři způsoby dělení" icon={<Scale size={20} />}>
          <p>
            <strong>Všichni rovným dílem</strong> je výchozí a nejčastější: částka se rozpustí mezi
            všechny účastníky chaty stejně.
          </p>
          <ScreenshotRow>
            <Screenshot
              name="deleni-podily"
              caption="Podíly: plus a minus u každého jména. Dva podíly znamenají dvojnásobek."
            />
            <Screenshot
              name="deleni-castky"
              caption="Přesné částky: co nevyplníš, aplikace dopočítá a označí."
            />
          </ScreenshotRow>
          <List
            items={[
              <>
                <strong>Podíly</strong> se hodí, když někdo spotřeboval víc. Odškrtnutím políčka
                člověka z výdaje úplně vyřadíš.
              </>,
              <>
                <strong>Přesné částky</strong> použij, když máš účtenku položku po položce.
                Vyplň, co víš, zbytek se rovnoměrně rozpočítá mezi ostatní a je u nich napsáno{' '}
                <em>dopočítáno</em>.
              </>,
              <>
                Dole se průběžně kontroluje součet. Dokud sedí na celou částku, svítí{' '}
                <em>Zbývá rozdělit: 0 Kč</em> a jde uložit.
              </>,
            ]}
          />
        </Section>

        <Section title="Účtenky" icon={<Camera size={20} />}>
          <p>
            K výdaji jde přiložit libovolný počet fotek nebo PDF. Na telefonu se z tlačítka rovnou
            otevře fotoaparát, na počítači se soubory přetahují do vyznačeného rámečku.
          </p>
          <List
            items={[
              <>Fotka se před odesláním zmenší přímo v prohlížeči, takže nahrání netrvá věčnost.</>,
              <>Na kartě výdaje se pak zobrazí jako malý náhled, který se dá otevřít přes celou obrazovku.</>,
              <>Přiloženou účtenku můžeš kdykoli odebrat křížkem.</>,
            ]}
          />
        </Section>

        <Section title="Plánovaný výdaj: zatím nezaplaceno" icon={<Clock size={20} />}>
          <p>
            Přepínač <em>Zatím nezaplaceno</em> hned pod částkou říká, že se výdaj teprve chystá.
            Chata je zamluvená, platí se ale až na místě. V deníku má taková karta žlutý čárkovaný
            rámeček a značku <em>Plánovaný</em> a v součtech se drží zvlášť, aby bylo poznat, co už
            proběhlo a co teprve přijde.
          </p>
          <List
            items={[
              <>
                Až peníze opravdu odejdou, klepni na kartě na <strong>Už zaplaceno</strong>. Otevře
                se souhrn výdaje, kde ještě jde opravit částku podle skutečnosti a přifotit účtenku.
              </>,
              <>
                Datum se přitom přepíše na dnešek, tedy na den, kdy se platilo. Ručně ho můžeš
                změnit zpátky.
              </>,
              <>
                Zpátky to nejde. Jakmile je výdaj zaplacený, přepínač v úpravě už není, aby ho
                nikdo omylem nevrátil mezi plány. Když se spleteš, výdaj smaž a zadej znovu.
              </>,
              <>
                Cizí plánované výdaje, třeba ty od správce chaty, přepnout nejde. Ty zůstávají na
                svém autorovi.
              </>,
            ]}
          />
        </Section>

        <Section title="Soukromý výdaj: dárek, který nemá být vidět" icon={<EyeOff size={20} />}>
          <p>
            Kupuješ na výletě dárek a oslavenec o něm nesmí vědět? Zapni fialový přepínač{' '}
            <em>Soukromý výdaj (překvapení)</em>. Takový výdaj uvidíš jen ty a lidi, které vybereš
            v rozdělení. Nikdo jiný ho nenajde v deníku, v souhrnu ani v Přehledu. Prostě tam pro
            něj není.
          </p>
          <List
            items={[
              <>
                Plátcem jsi vždycky ty, tedy některý z tvých propojených účastníků. Rozdělení se
                zadává po podílech nebo přesných částkách, <em>všichni rovným dílem</em> tady z
                podstaty věci není.
              </>,
              <>
                Soukromý výdaj jde úplně mimo společnou pokladnu. Členové ti svůj podíl posílají
                přímo na účet: ve Financích na ně čeká fialová karta <em>Soukromé výdaje</em> s QR
                platbou a tlačítkem <strong>Označit jako zaplacené</strong>.
              </>,
              <>
                Když si s někým dlužíte navzájem, karta nabídne poslat jen rozdíl a označit obojí
                jedním klepnutím.
              </>,
              <>
                Přepínač je jen při vytváření výdaje. Veřejný výdaj už soukromým udělat nejde,
                lidi ho totiž mohli vidět. Opačně to jde kdykoli: odtajněný výdaj se stane obyčejným.
              </>,
              <>
                Když u soukromého výdaje změníš částku, plátce nebo rozdělení, označení zaplacených
                podílů se zruší. Dluh se totiž změnil a je potřeba ho označit znovu.
              </>,
              <>
                Účtenky k němu zatím přiložit nejde. Soubory příloh by viděli i lidi mimo výdaj.
              </>,
            ]}
          />
          <Callout tone="note">
            Správce chaty ani pokladník soukromý výdaj nevidí, pokud nejsou přímo v jeho rozdělení.
            Jedinou výjimkou je superadministrátor webu. Překvapení tak zůstane překvapením.
          </Callout>
        </Section>

        <Section title="Pozvání: platím za někoho dalšího" icon={<HeartHandshake size={20} />}>
          <p>
            Pozvání znamená, že podíl jednoho člověka převezme někdo jiný. Nastavuje se v posledním
            kroku dvěma rozbalovacími poli: kdo zve a koho.
          </p>
          <List
            items={[
              <>
                Růžový pruh <em>Automaticky</em> se objeví, když už máš trvale nastavené, že za
                někoho platíš, třeba za dítě. To se přidá samo a nemusíš na to myslet.
              </>,
              <>Jeden hostitel může pozvat víc lidí, každého ale jen jednou za výdaj.</>,
              <>
                Podíl se posouvá o jeden krok. Když pozvaný sám někoho pozve, jeho vlastní podíl už
                dál neputuje.
              </>,
            ]}
          />
        </Section>

        <Section title="Zaplatil to někdo jiný" icon={<UserCheck size={20} />}>
          <p>
            Někdy je potřeba zapsat výdaj za kamaráda, který zrovna nemá čas. Pod výběrem plátce
            je proto tichý odkaz <em>Zaplatil to někdo jiný?</em> a za ním zbytek chaty, lidé i
            společné účty.
          </p>
          <List
            items={[
              <>
                Výdaj se uloží, ale nikde se neukáže a do vyrovnání se nepočítá, dokud ho někdo
                nepotvrdí.
              </>,
              <>
                Když má plátce svůj účet, potvrdit to může on sám, nebo pokladník či správce chaty.
                Když účet nemá, rozhodují pokladník a správci. U společného účtu může potvrdit
                kterýkoli jeho člen.
              </>,
              <>
                Všem, kdo mohou rozhodnout, přijde e-mail s odkazem. Potvrdit nebo zamítnout jde i
                rovnou na kartě výdaje ve financích.
              </>,
              <>
                Než se rozhodne, vidí kartu se značkou <em>Čeká na potvrzení</em> jenom autor,
                plátce, pokladník a správci, a to i v záložce <em>moje</em>, aby jim neutekla. Po
                potvrzení se výdaj chová jako každý jiný.
              </>,
              <>
                Při zamítnutí zůstane skrytý napořád a autorovi přijde e-mail, i s důvodem, pokud
                ho rozhodující napsal.
              </>,
              <>
                Úprava takového výdaje ho pošle k potvrzení znovu, aby se jednou odsouhlasená
                částka nedala potichu přepsat.
              </>,
              <>Správci chaty tímhle kolečkem neprocházejí, jejich zápis platí rovnou.</>,
            ]}
          />
        </Section>

        <Section title="Úprava a smazání" icon={<PencilLine size={20} />}>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <Screenshot
              name="vlastni-vydaj"
              caption="Vlastní výdaj poznáš podle patičky s odkazy Upravit a Smazat."
            />
            <div className="flex flex-col gap-4 flex-1">
              <p>
                Výdaje, které jsi zapsal/a ty, mají v deníku patičku <em>Přidáno tebou</em>. Odtud
                se otevře stejný formulář jako při zakládání, jen s vyplněnými hodnotami.
              </p>
              <List
                items={[
                  <>Smazání se ptá na potvrzení přímo na kartě, žádné vyskakovací okno.</>,
                  <>
                    Cizí výdaje upravit nejde. Když je v nich chyba, řekni si autorovi nebo správci
                    chaty. Výjimkou je výdaj, který někdo zapsal za tebe: ten je i tvůj, takže ho
                    můžeš opravit i smazat.
                  </>,
                  <>
                    Chatu u výdaje změnit nelze. Plátcem může být tvoje jméno, tvůj společný účet, a
                    po potvrzení i někdo jiný.
                  </>,
                ]}
              />
            </div>
          </div>
          <Callout>
            Po uložení se čísla přepočítají hned. Nový výdaj se okamžitě promítne do útraty všech,
            kterých se týká, a do jejich vyrovnání.
          </Callout>
        </Section>

        <NextPage href="/napoveda/ucet" />
      </div>
    </HelpShell>
  )
}

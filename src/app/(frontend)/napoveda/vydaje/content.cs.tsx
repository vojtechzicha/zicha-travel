// Czech content, moved verbatim from page.tsx when the frontend went
// bilingual. Edit wording here; page.tsx only picks a locale.

import { Camera, HeartHandshake, Monitor, PencilLine, Plus, Scale, Smartphone } from 'lucide-react'
import { Callout, HelpShell, List, NextPage, Screenshot, ScreenshotRow, Section, Steps } from '../ui'

export default function VydajeContentCs() {
  return (
    <HelpShell
      title="Přidání a úprava výdaje"
      lead="Zaplatili jste něco za partu? Zapište to sami, ať se to nemusí posílat pokladníkovi do zpráv."
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
            Odkud výdaj zapíšete, se nikam nepromítá. Formulář je v obou případech stejný, jen
            jinak poskládaný.
          </p>
        </Section>

        <Section title="Na mobilu: tři kroky" icon={<Smartphone size={20} />}>
          <p>
            Po klepnutí vyjede zespodu nabídka, jak chcete začít. Účtenka rovnou otevře fotoaparát,
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
                <em>Byly vám vráceny peníze</em> použijte, když jde o vratku, třeba když vám hospoda
                něco vrátila. Pokud patříte do společného účtu, vyberete tu i to, jestli jste platili
                vy, nebo účet.
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
            Nahoře běží pruh se třemi díly, takže je vidět, kde jste. Šipkou vlevo se vracíte o krok
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
              caption="Přesné částky: co nevyplníte, aplikace dopočítá a označí."
            />
          </ScreenshotRow>
          <List
            items={[
              <>
                <strong>Podíly</strong> se hodí, když někdo spotřeboval víc. Odškrtnutím políčka
                člověka z výdaje úplně vyřadíte.
              </>,
              <>
                <strong>Přesné částky</strong> použijte, když máte účtenku položku po položce.
                Vyplňte, co víte, zbytek se rovnoměrně rozpočítá mezi ostatní a je u nich napsáno{' '}
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
              <>Přiloženou účtenku můžete kdykoli odebrat křížkem.</>,
            ]}
          />
        </Section>

        <Section title="Pozvání: platím za někoho dalšího" icon={<HeartHandshake size={20} />}>
          <p>
            Pozvání znamená, že podíl jednoho člověka převezme někdo jiný. Nastavuje se v posledním
            kroku dvěma rozbalovacími poli: kdo zve a koho.
          </p>
          <List
            items={[
              <>
                Růžový pruh <em>Automaticky</em> se objeví, když už máte trvale nastavené, že za
                někoho platíte, třeba za dítě. To se přidá samo a nemusíte na to myslet.
              </>,
              <>Jeden hostitel může pozvat víc lidí, každého ale jen jednou za výdaj.</>,
              <>
                Podíl se posouvá o jeden krok. Když pozvaný sám někoho pozve, jeho vlastní podíl už
                dál neputuje.
              </>,
            ]}
          />
        </Section>

        <Section title="Úprava a smazání" icon={<PencilLine size={20} />}>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <Screenshot
              name="vlastni-vydaj"
              caption="Vlastní výdaj poznáte podle patičky s odkazy Upravit a Smazat."
            />
            <div className="flex flex-col gap-4 flex-1">
              <p>
                Výdaje, které jste zapsali vy, mají v deníku patičku <em>Přidali jste vy</em>. Odtud
                se otevře stejný formulář jako při zakládání, jen s vyplněnými hodnotami.
              </p>
              <List
                items={[
                  <>Smazání se ptá na potvrzení přímo na kartě, žádné vyskakovací okno.</>,
                  <>
                    Cizí výdaje upravit nejde. Když je v nich chyba, řekněte si autorovi nebo správci
                    chaty.
                  </>,
                  <>
                    Chatu u výdaje změnit nelze a plátcem může být jen vaše jméno nebo váš společný
                    účet.
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

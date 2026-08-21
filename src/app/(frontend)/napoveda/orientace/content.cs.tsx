// Czech content, moved verbatim from page.tsx when the frontend went
// bilingual. Edit wording here; page.tsx only picks a locale.

import { BedDouble, Car, Compass, Info, Users } from 'lucide-react'
import { Callout, HelpShell, List, NextPage, Screenshot, Section, Steps } from '../ui'

export default function OrientaceContentCs() {
  return (
    <HelpShell
      title="Kde co najdeš"
      lead="Od výběru chaty přes záložky až po pokoje a auta. Obrázky jsou z ukázkové chaty, tvoje bude vypadat stejně."
    >
      <div className="flex flex-col gap-6">
        <Section title="Výběr chaty" icon={<Compass size={20} />}>
          <p>
            Pokud vede odkaz na hlavní adresu, přivítá tě seznam chat. Nahoře běží ty, které se
            právě konají, pod nimi chystané a nakonec archiv.
          </p>
          <Screenshot
            name="vyber-chaty"
            caption="Karta chaty: název, místo, termín a kolečka s účastníky. Přihlášeným navíc přibude jejich vlastní zůstatek."
          />
          <List
            items={[
              <>
                U chystané chaty svítí odpočet ve dnech, u probíhající místo něj text, do kdy jsi na
                místě.
              </>,
              <>
                Přihlášeným se seznam zkrátí na jejich vlastní chaty. Anonymní návštěvník vidí
                všechny.
              </>,
              <>
                Klepnutím na kartu se dostaneš dovnitř. Zpátky vede tlačítko „Změnit chatu“ v
                hlavičce.
              </>,
            ]}
          />
          <Callout>
            Chata může mít vlastní adresu, třeba <code>lipno.zicha.travel</code>. Pak se otevře
            rovnou a tlačítko „Změnit chatu“ zmizí. Ostatní chaty přes takovou adresu nejsou
            dostupné.
          </Callout>
        </Section>

        <Section title="Hlavička a záložky" icon={<Info size={20} />}>
          <p>
            Pod názvem chaty je místo a jméno pokladníka, tedy člověka, který drží společnou kasu.
            Vedle sebe pak stojí záložky. Kolik jich uvidíš, záleží na tom, co správce chaty
            vyplnil: prázdné části se nezobrazují a Finance zůstávají vždycky.
          </p>
          <List
            items={[
              <>
                <strong>Informace</strong> se objeví, když je k chatě vyplněný popis cesty.
              </>,
              <>
                <strong>Organizace</strong> se objeví, když jsou zadané pokoje nebo sdílená auta.
              </>,
              <>
                <strong>Účastníci</strong> se objeví, jakmile jedou víc než dva lidi.
              </>,
              <>
                <strong>Finance</strong> jsou tu vždy. Nápověda k nim má vlastní stránku.
              </>,
            ]}
          />
          <p>
            Přepínání záložek mění adresu v prohlížeči, takže konkrétní pohled jde poslat odkazem.
            Zpětné tlačítko prohlížeče funguje normálně.
          </p>
        </Section>

        <Section title="Informace o cestě" icon={<Info size={20} />}>
          <Screenshot
            name="informace"
            caption="Příjezd a odjezd i se dnem v týdnu a délkou pobytu."
          />
          <p>Pod termínem najdeš podle toho, co je vyplněné:</p>
          <List
            items={[
              <>Popis místa, odkazy na web ubytování a fotogalerii.</>,
              <>Praktické poznámky, třeba kde se vyzvedávají klíče nebo jak je to s Wi-Fi.</>,
              <>Cestu autem: odkud, jak dlouho, kolik kilometrů a kde se parkuje.</>,
              <>
                Spojení vlakem a autobusem. Klepnutím na spoj se rozbalí jednotlivé úseky s časy a
                čísly vlaků.
              </>,
            ]}
          />
          <Callout>
            U každého spojení je tlačítko, které přidá cestu do Google kalendáře i s popisem
            přestupů. Otevře se předvyplněná událost, kterou stačí uložit.
          </Callout>
        </Section>

        <Section title="Pokoje a postele" icon={<BedDouble size={20} />}>
          <Screenshot
            name="organizace"
            caption="Každý pokoj ukazuje, kolik lůžek je obsazených z celkového počtu."
          />
          <Steps
            items={[
              <>
                Klepni na <strong>Zobrazit postele</strong> a pokoj se rozbalí.
              </>,
              <>
                U každé postele je jméno člověka, který v ní spí. Volná místa jsou označená jako
                volné místo.
              </>,
              <>
                Pokud někdo nejede na celý pobyt, je u něj napsáno, které noci tam je. Ostatní noci
                zůstává lůžko volné.
              </>,
            ]}
          />
        </Section>

        <Section title="Sdílená auta" icon={<Car size={20} />}>
          <Screenshot name="auta" caption="Řidič, spolujezdci a volná místa v každém autě." />
          <p>
            U auta bývá poznámka, kdy a odkud vyjíždí. Rozbalením se ukáže seznam cestujících a
            volná místa. Když je u auta uvedený náklad na cestu, jde jen o informaci: peníze se
            řeší jako běžný výdaj ve Financích.
          </p>
        </Section>

        <Section title="Účastníci" icon={<Users size={20} />}>
          <Screenshot name="ucastnici" caption="Kdo jede a na kolik nocí." />
          <p>
            Přehled lidí i s délkou pobytu. Kdo je na celý pobyt, má to napsané, ostatní mají
            vypsané konkrétní noci. Záložka se objeví, až když jedou víc než dva lidi.
          </p>
        </Section>

        <NextPage href="/napoveda/finance" />
      </div>
    </HelpShell>
  )
}

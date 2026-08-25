// Czech content of /podminky: the terms of use, transcribed from
// docs/legal/podminky-uziti.cs.md (effective 2026-08-16). Edit wording
// there first, then mirror it here; page.tsx only picks a locale.

import {
  BookOpen,
  Calculator,
  Eye,
  History,
  Info,
  KeyRound,
  Landmark,
  LogOut,
  Mail,
  Receipt,
  ScrollText,
  ShieldAlert,
  UserCog,
  Wrench,
} from 'lucide-react'
import { HelpShell, List, Section } from '../napoveda/ui'

const link = 'text-primary underline underline-offset-2'

export default function TermsContentCs() {
  return (
    <HelpShell
      isHub
      icon={<ScrollText size={44} className="text-primary-light" />}
      title="Podmínky užití"
      lead="Služba zicha.travel · Účinnost od 16. 8. 2026"
    >
      <div className="flex flex-col gap-6">
        <Section
          id="sluzba"
          title="1. Co je zicha.travel a kdo ho provozuje"
          icon={<Info size={20} />}
        >
          <p>
            zicha.travel je soukromá webová aplikace pro party přátel a rodin: pomáhá
            zorganizovat společný výlet na chatu a spravedlivě rozdělit společné výdaje.
            Provozuje ji Vojtěch Zicha,{' '}
            <a href="mailto:mail@vojtechzicha.com" className={link}>
              mail@vojtechzicha.com
            </a>{' '}
            (dále „my“).
          </p>
          <p>
            Služba je bezplatná a nekomerční. Neplatíte nic, neprodáváme reklamu a neprodáváme
            data. Provozujeme ji ve volném čase pro uzavřený okruh lidí; tomu odpovídá i rozsah
            záruk v kapitole 9.
          </p>
          <p>
            Tyto podmínky jsou smlouvou mezi vámi a námi. Užíváním služby (a u účtu jeho
            založením) je přijímáte. Zpracování osobních údajů popisují samostatné{' '}
            <a href="/soukromi" className={link}>
              Zásady zpracování osobních údajů
            </a>
            ; tyto podmínky na ně navazují.
          </p>
        </Section>

        <Section id="pojmy" title="2. Pojmy" icon={<BookOpen size={20} />}>
          <p>
            <strong>Chata</strong> je jeden výlet nebo akce se svou stránkou, účastníky a
            vyúčtováním. <strong>Účastník</strong> je člověk zapsaný na výlet; účet mít nemusí.{' '}
            <strong>Uživatel</strong> je člověk s účtem. <strong>Správce chaty</strong> je
            uživatel s přístupem do administrace své chaty. <strong>Pokladník</strong> je
            účastník, přes kterého tečou peníze party.
          </p>
        </Section>

        <Section id="prohlizeni" title="3. Prohlížení bez přihlášení" icon={<Eye size={20} />}>
          <p>
            Stránky chat jsou dostupné každému, kdo zná jejich adresu; co přesně je bez
            přihlášení vidět, popisují{' '}
            <a href="/soukromi#viditelnost" className={link}>
              zásady v kapitole 6
            </a>
            . I bez účtu ale platí pravidla:
          </p>
          <List
            items={[
              <>
                údaje, které na stránkách vidíte, jsou osobní údaje skutečných lidí z party.
                Používejte je jen v souvislosti s výletem; jejich kopírování, zveřejňování jinde
                nebo strojové stahování je zakázáno,
              </>,
              <>
                nesmíte se pokoušet obcházet přístupová omezení, hádat adresy cizích chat ani
                zkoušet, co API vydá navíc,
              </>,
              <>adresu chaty šiřte jen v rámci party.</>,
            ]}
          />
        </Section>

        <Section id="ucty" title="4. Účty" icon={<KeyRound size={20} />}>
          <p>
            Účet vám založí správce chaty, nebo vznikne přes „To jsem já“ (žádost o propojení se
            jménem účastníka), přes „Jsem tu poprvé“, anebo hlasováním při plánování výletu.
            Přihlašuje se jednorázovým odkazem na e-mail,
            nebo přes Microsoft, Google či Apple; heslo u nás neexistuje, takže chraňte svou
            e-mailovou schránku, kdo ovládá ji, ovládá váš účet.
          </p>
          <p>
            Účet je osobní a smí ho mít jen zletilá osoba. Při žádosti o propojení uvádějte jen
            svou vlastní totožnost; nárokovat si cizí jméno je porušení těchto podmínek.
          </p>
          <p>
            Účet můžete kdykoli zrušit e-mailem na náš kontakt. My můžeme účet zrušit nebo
            pozastavit při porušení podmínek, po 2 letech nečinnosti (viz doby uchování v
            zásadách), nebo pokud služba skončí.
          </p>
        </Section>

        <Section
          id="uzivatele"
          title="5. Pravidla pro přihlášené uživatele"
          icon={<Receipt size={20} />}
        >
          <p>
            Přihlášený uživatel může zadávat výdaje své chaty, upravovat a mazat své vlastní,
            nahrávat účtenky a potvrzovat či odmítat výdaje, které za něj zapsal někdo jiný.
            Přitom platí:
          </p>
          <List
            items={[
              <>
                zadávejte jen skutečné výdaje se skutečnými částkami; vyúčtování celé party
                stojí na tom, že čísla sedí,
              </>,
              <>
                výdaj „za jiného plátce“ zapisujte jen, když se opravdu stal; dotčený člověk ho
                musí potvrdit a nepravdivý zápis je porušení podmínek,
              </>,
              <>
                nahrávejte jen účtenky ke společným výdajům. Nenahrávejte doklady s citlivými
                položkami (léky, zdravotní služby) ani soubory, ke kterým nemáte práva,
              </>,
              <>potvrzením výdaje stvrzujete, že souhlasí s tím, co se stalo.</>,
            ]}
          />
          <p>
            Obsah, který nahrajete, zůstává váš. Dáváte nám licenci ho uložit a zobrazovat
            členům chaty, protože jinak by služba nefungovala; licence trvá, dokud obsah
            nesmažete nebo neuplyne jeho doba uchování.
          </p>
        </Section>

        <Section id="spravci" title="6. Pravidla pro správce chat" icon={<UserCog size={20} />}>
          <p>
            Správce chaty zapisuje údaje jiných lidí, a proto má vedle běžných pravidel i tyto
            povinnosti:
          </p>
          <List
            items={[
              <>
                zapisujte jen lidi, kteří na výlet skutečně jedou nebo se k němu hlásí, a jen
                údaje, které výlet potřebuje,
              </>,
              <>
                při zapsání účastníka mu pošlete odkaz na{' '}
                <a href="/soukromi" className={link}>
                  zásady zpracování osobních údajů
                </a>{' '}
                (stačí zpráva ve skupinové konverzaci party). Zásady s tímto krokem počítají;
                bez něj se účastník nemá jak dozvědět, že v systému je,
              </>,
              <>údaje dětí zapisujte jen se souhlasem rodiče,</>,
              <>
                když vás účastník požádá o opravu nebo výmaz svých údajů, proveďte to, nebo
                žádost předejte nám,
              </>,
              <>bankovní spojení účastníků a sekci „Klíče a Wi-Fi“ nikam nekopírujte,</>,
              <>
                při nakládání s osobními údaji jednáte podle našich pokynů a zásad; role správce
                chaty vás neopravňuje užívat údaje k ničemu jinému než k organizaci výletu.
              </>,
            ]}
          />
          <p>Porušení těchto povinností je důvodem k odebrání role správce.</p>
        </Section>

        <Section
          id="vyuctovani"
          title="7. Vyúčtování je pomůcka, ne rozhodčí"
          icon={<Calculator size={20} />}
        >
          <p>
            Výpočet vyrovnání je prostá aritmetika nad zadanými podíly. Neručíme za to, že
            zadané částky odpovídají skutečnosti, to je věc party. Kdo komu kolik pošle, je
            dohoda mezi účastníky; my nejsme stranou těchto plateb, nedržíme žádné peníze a
            spory o peníze si parta řeší sama. Vyúčtování není daňový doklad ani finanční
            poradenství. Zaokrouhlení do 1 Kč považujeme za vyrovnané.
          </p>
        </Section>

        <Section
          id="dostupnost"
          title="8. Dostupnost a změny služby"
          icon={<Wrench size={20} />}
        >
          <p>
            Služba běží bez záruky dostupnosti; může mít výpadky a odstávky. Funkce můžeme
            měnit, přidávat i ubírat. Pokud bychom službu ukončovali nebo rušili funkci, se
            kterou by odešla vaše data, dáme vědět s předstihem na webu a uživatelům e-mailem,
            abyste si stihli data vyžádat (právo na kopii dat máte podle zásad kdykoli).
          </p>
        </Section>

        <Section id="odpovednost" title="9. Odpovědnost" icon={<ShieldAlert size={20} />}>
          <p>
            Služba je poskytována tak, jak je, zdarma a bez záruky. V rozsahu, v jakém to české
            právo dovoluje, neodpovídáme za škodu vzniklou užitím služby, zejména za škodu z
            chybně zadaných údajů, z jednání ostatních účastníků nebo z výpadku služby. Tím není
            dotčena odpovědnost, kterou podle zákona vyloučit nelze (újma způsobená úmyslně nebo
            z hrubé nedbalosti, újma na přirozených právech člověka, § 2898 občanského
            zákoníku).
          </p>
          <p>
            Vy odpovídáte za obsah, který do služby zadáte, a za to, že jím neporušujete práva
            jiných.
          </p>
        </Section>

        <Section id="ukonceni" title="10. Ukončení" icon={<LogOut size={20} />}>
          <p>
            Přestat službu užívat můžete kdykoli. Zrušení účtu a mazání dat se řídí{' '}
            <a href="/soukromi" className={link}>
              zásadami
            </a>{' '}
            (kapitola 9 a 10 zásad). Ustanovení, která mají z povahy věci přetrvat (licence k už
            zobrazenému vyúčtování, odpovědnost, rozhodné právo), trvají i po ukončení.
          </p>
        </Section>

        <Section id="zmeny" title="11. Změny podmínek" icon={<History size={20} />}>
          <p>
            Podmínky můžeme měnit, například když přibude funkce nebo to vyžádá právo. Novou
            verzi zveřejníme na webu s datem účinnosti; na podstatné změny upozorníme uživatele
            předem e-mailem nebo na webu. Pokud s novou verzí nesouhlasíte, můžete účet zrušit;
            dalším užíváním po účinnosti změnu přijímáte.
          </p>
        </Section>

        <Section id="pravo" title="12. Rozhodné právo" icon={<Landmark size={20} />}>
          <p>
            Tyto podmínky se řídí českým právem. Spory rozhodují české soudy. Pokud jste
            spotřebitel, nic v těchto podmínkách nekrátí práva, která vám dává zákon; k
            mimosoudnímu řešení spotřebitelských sporů je příslušná Česká obchodní inspekce (
            <a
              href="https://www.coi.cz"
              target="_blank"
              rel="noopener noreferrer"
              className={link}
            >
              www.coi.cz
            </a>
            ). Je-li některé ustanovení neplatné, zbytek podmínek platí dál.
          </p>
        </Section>

        <Section id="kontakt" title="13. Kontakt" icon={<Mail size={20} />}>
          <p>
            Vojtěch Zicha,{' '}
            <a href="mailto:mail@vojtechzicha.com" className={link}>
              mail@vojtechzicha.com
            </a>
            .
          </p>
        </Section>
      </div>
    </HelpShell>
  )
}

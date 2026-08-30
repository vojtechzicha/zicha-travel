// Czech content of /soukromi: the full privacy policy, transcribed from
// docs/legal/zasady-ochrany-osobnich-udaju.cs.md (version 2, effective
// 2026-08-25; the version history section tracks the changes).
// Edit wording there first, then mirror it here; page.tsx only picks a
// locale. The one interactive element is the consent button in section 12.

import {
  Baby,
  BarChart3,
  Bot,
  Building2,
  Cookie,
  Database,
  Eye,
  FileClock,
  Gavel,
  Globe,
  History,
  Hourglass,
  Inbox,
  Lock,
  Mail,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
} from 'lucide-react'
import { analyticsEnabled } from '@/lib/consent'
import { Callout, HelpShell, List, Section } from '../napoveda/ui'
import { PrivacySettingsLink } from '../components/PrivacySettingsLink'

const link = 'text-primary underline underline-offset-2'

export default function PrivacyContentCs() {
  return (
    <HelpShell
      isHub
      icon={<ShieldCheck size={44} className="text-primary-light" />}
      title="Zásady zpracování osobních údajů"
      lead="Služba zicha.travel · Účinnost od 25. 8. 2026 (verze 2)"
    >
      <div className="flex flex-col gap-6">
        <Section id="spravce" title="1. Kdo je správce" icon={<UserCog size={20} />}>
          <p>
            Správcem vašich osobních údajů je Vojtěch Zicha (dále „my“). Se vším, co se týká
            vašich údajů, se na nás obraťte na adrese{' '}
            <a href="mailto:mail@vojtechzicha.com" className={link}>
              mail@vojtechzicha.com
            </a>
            . Odpovídáme nejpozději do jednoho měsíce.
          </p>
          <p>
            Správci jednotlivých chat (lidé, kteří v administraci zakládají výlety a zapisují
            účastníky) zpracovávají údaje podle našich pokynů a těchto zásad. Nejsou samostatnými
            správci; odpovědnost vůči vám neseme my.
          </p>
        </Section>

        <Section
          id="sluzba"
          title="2. K čemu služba slouží a čí údaje zpracováváme"
          icon={<Users size={20} />}
        >
          <p>
            zicha.travel je soukromá, bezplatná aplikace pro party přátel a rodin, které spolu
            jezdí na chaty a chtějí si férově rozdělit společné výdaje. Není to veřejná služba:
            chatu založí její správce a účastníky do ní zapíše sám. Jedinou výjimkou je fáze
            plánování: dokud parta hlasuje o termínu a ubytování, můžete se k výletu přidat sami
            hlasovacím formulářem.
          </p>
          <p>Zpracováváme údaje čtyř skupin lidí:</p>
          <List
            items={[
              <>
                <strong>účastníci výletu</strong>, které do systému zapsal správce chaty. Většina
                z nich nemá účet a mnozí o zápisu ani nevěděli, dokud jim to správce chaty
                neřekl. Právě proto existuje kapitola 5,
              </>,
              <>
                <strong>přihlášení uživatelé</strong>, tedy lidé s účtem (účastníci, kteří si
                účet nechali založit, nárokovali si své jméno přes „To jsem já“, nebo se přidali
                hlasováním při plánování výletu),
              </>,
              <>
                <strong>správci chat</strong> a administrátoři webu,
              </>,
              <>
                <strong>návštěvníci</strong> stránek, i nepřihlášení.
              </>,
            ]}
          />
        </Section>

        <Section id="udaje" title="3. Jaké údaje zpracováváme" icon={<Database size={20} />}>
          <p>
            <strong>O účastnících:</strong> jméno a jeho české tvary pro skloňování, e-mail
            (pokud ho správce chaty zadal), číslo bankovního účtu nebo IBAN pro vyrovnání, údaj,
            zda s sebou má zvíře, vazbu „platí za něj někdo jiný“ (typicky rodič za dítě),
            přiřazení k pokoji a posteli, místo v autě nebo spoji veřejné dopravy, podíly na
            výdajích, zálohy a vratky, členství ve společném účtu a výsledné vyrovnání (kdo komu
            kolik dluží). Pokud se o podobě výletu hlasovalo, patří sem i hlas: které termíny
            účastníkovi vyhovují a která ubytování se mu líbí.
          </p>
          <p>
            <strong>O přihlášených uživatelích navíc:</strong> e-mail účtu, čas posledního
            přihlášení, při přihlášení přes Microsoft, Google nebo Apple identifikátor a e-mail
            z vašeho účtu u zvoleného poskytovatele, výdaje, které jste zadali, a žádosti o
            propojení se jménem účastníka včetně
            případného důvodu zamítnutí.
          </p>
          <p>
            <strong>Účtenky:</strong> k výdaji lze nahrát fotku nebo PDF účtenky. Účtenka může
            mimoděk obsahovat i další údaje (položky nákupu, část čísla karty, adresu prodejny).
            Nahrávejte jen účtenky ke společným výdajům; nepatří sem doklady se zdravotními nebo
            jinak citlivými položkami.
          </p>
          <p>
            <strong>O návštěvnících:</strong> technické záznamy o požadavcích (IP adresa v
            provozních lozích hostingu), cookies popsané v kapitole 11 a anonymní statistiky
            popsané v kapitole 12. U veřejných formulářů (přihlášení, žádost o propojení)
            zpracovává Cloudflare Turnstile signály prohlížeče kvůli ochraně před roboty.
          </p>
          <p>
            Nezpracováváme záměrně žádné zvláštní kategorie údajů (zdraví, vyznání a podobně) a
            nechceme je ani na účtenkách.
          </p>
        </Section>

        <Section
          id="zaklad"
          title="4. Proč údaje zpracováváme a na jakém základě"
          icon={<Scale size={20} />}
        >
          <p>
            <strong>Společné vyúčtování výletu.</strong> Jména, podíly na výdajích, zálohy,
            bankovní spojení a vyrovnání zpracováváme proto, aby si parta mohla spravedlivě
            rozdělit náklady a poslat si peníze. U účastníků bez účtu je základem náš oprávněný
            zájem a oprávněný zájem celé party na funkčním společném vyúčtování (čl. 6 odst. 1
            písm. f GDPR). Proti tomuto zpracování můžete vznést námitku (kapitola 10).
          </p>
          <p>
            <strong>Organizace výletu.</strong> Rozdělení postelí, aut a spojů, program a seznam
            věcí zpracováváme ze stejného oprávněného zájmu: aby výlet proběhl.
          </p>
          <p>
            <strong>Vedení účtu.</strong> U přihlášených uživatelů je základem plnění smlouvy,
            tedy{' '}
            <a href="/podminky" className={link}>
              podmínek užití
            </a>{' '}
            (čl. 6 odst. 1 písm. b GDPR): bez e-mailu vám nepošleme přihlašovací odkaz a bez
            záznamu o vašich výdajích nefunguje pravidlo, že si je můžete sami upravit.
          </p>
          <p>
            <strong>E-maily.</strong> Posíláme jen provozní zprávy: přihlašovací odkazy,
            potvrzení hlasu při plánování výletu, rozhodnutí o žádostech o propojení a žádosti o
            potvrzení výdaje, který za vás zapsal někdo jiný. Žádný marketing.
          </p>
          <p>
            <strong>Statistiky.</strong> Anonymní měření návštěvnosti stojí na oprávněném zájmu
            vědět, jestli web funguje. Statistické cookies ukládáme jen s vaším souhlasem
            (§ 89 odst. 3 zákona č. 127/2005 Sb.), viz kapitola 12.
          </p>
          <p>
            <strong>Ochrana provozu.</strong> Provozní logy a ochranu formulářů před roboty
            opíráme o oprávněný zájem na zabezpečení služby.
          </p>
        </Section>

        <Section id="zdroj" title="5. Odkud údaje máme" icon={<Inbox size={20} />}>
          <p>
            Většinu údajů o účastnících nezadáváte vy, ale správce vaší chaty, který vás zná a
            výlet organizuje. Podle čl. 14 GDPR máte právo se o tom dozvědět. Řešíme to takto:
            správce chaty se v{' '}
            <a href="/podminky" className={link}>
              podmínkách užití
            </a>{' '}
            zavazuje, že vám při zapsání pošle odkaz na tyto zásady (typicky ve skupinové
            konverzaci party), a odkaz na ně je v patičce každé stránky webu. Pokud si myslíte,
            že vás někdo zapsal neprávem, napište nám a záznam prověříme.
          </p>
          <p>
            Údaje o přihlášených uživatelích, a také o účastnících, kteří se přidali sami
            hlasováním při plánování výletu, pocházejí od nich samotných, případně z jejich účtu
            u Microsoftu, Googlu nebo Applu, pokud se přes něj přihlásí.
          </p>
        </Section>

        <Section id="viditelnost" title="6. Kdo vaše údaje vidí" icon={<Eye size={20} />}>
          <p>
            Stránka chaty je dostupná každému, kdo zná její adresu. Počítáme s tím, že adresu si
            parta posílá mezi sebou; stránky ale nejsou nijak tajné. Pro vyhledávače platí
            rozdělení: domovská stránka a základní informace o výletu, které nenesou žádná
            jména, indexované být mohou; záložky se jmény a financemi (Organizace, Účastníci,
            Finance, Přehled) označujeme tak, aby je vyhledávače neindexovaly.
          </p>
          <p>
            Bez přihlášení návštěvník s odkazem vidí: název a termín výletu, jména účastníků,
            program, rozdělení postelí a aut, výdaje a jejich částky, zálohy, výsledné vyrovnání
            (kdo komu kolik posílá) a platební údaje pokladníka, aby fungovalo placení QR kódem.
            Detail financí účastníka, jehož účet už byl použit k přihlášení, se nepřihlášeným
            nezobrazuje: jedno přihlášení je tedy způsob, jak svůj rozpis a zůstatek schovat.
            Jméno u výletu zůstává v obou případech.
          </p>
          <p>
            Bez přihlášení naopak nikdy není vidět: bankovní spojení kohokoli kromě pokladníka,
            účtenky, e-mailové adresy, sekce „Klíče a Wi-Fi“, výdaje čekající na potvrzení,
            soukromé výdaje a hlasy z plánování výletu (kdo se přidal a co komu vyhovuje); hlasy
            vidí jen přihlášení účastníci dané chaty a její správci.
            Bankovní spojení účastníka vidí jen on sám (přes svůj účet), přihlášený pokladník a
            správci dané chaty; pokladníkovo bankovní spojení je veřejné, protože bez něj by
            nefungovalo anonymní vyrovnání (pokladník s tím svou rolí počítá). Účtenky vidí jen
            přihlášení uživatelé.
          </p>
          <p>
            Soukromý výdaj (dárek nebo překvapení) je přísnější výjimka: vidí ho jen jeho plátce,
            účastníci jeho rozdělení a superadministrátor webu. Nevidí ho ani správci chaty, ani
            pokladník, pokud v rozdělení sami nejsou. Protože se takový výdaj platí přímo plátci,
            zobrazuje se členům jeho rozdělení bankovní spojení plátce; založením soukromého
            výdaje s tím plátce počítá.
          </p>
          <p>
            Správci chaty vidí všechny údaje své chaty. My jako provozovatel máme přístup ke
            všemu, ale používáme ho jen k provozu, podpoře a plnění těchto zásad.
          </p>
        </Section>

        <Section
          id="zpracovatele"
          title="7. Kdo údaje zpracovává za nás"
          icon={<Building2 size={20} />}
        >
          <p>Provoz služby zajišťují tito zpracovatelé a příjemci:</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold">Kdo</th>
                  <th className="py-2 pr-4 font-semibold">Co u něj probíhá</th>
                  <th className="py-2 font-semibold">Kde</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Supabase</td>
                  <td className="py-2.5 pr-4">databáze a úložiště souborů včetně účtenek</td>
                  <td className="py-2.5">EU</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Vercel</td>
                  <td className="py-2.5 pr-4">hosting webu, provozní logy s IP adresami</td>
                  <td className="py-2.5">EU/USA</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Resend</td>
                  <td className="py-2.5 pr-4">rozesílání e-mailů (adresy a obsah zpráv)</td>
                  <td className="py-2.5">USA</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">PostHog</td>
                  <td className="py-2.5 pr-4">anonymní statistiky návštěvnosti</td>
                  <td className="py-2.5">EU (Frankfurt)</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Cloudflare</td>
                  <td className="py-2.5 pr-4">
                    ochrana veřejných formulářů před roboty (Turnstile)
                  </td>
                  <td className="py-2.5">EU/USA</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Microsoft</td>
                  <td className="py-2.5 pr-4">
                    přihlášení přes Microsoft účet, pokud ho použijete
                  </td>
                  <td className="py-2.5">EU/USA</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Google</td>
                  <td className="py-2.5 pr-4">
                    přihlášení přes Google účet, pokud ho použijete
                  </td>
                  <td className="py-2.5">EU/USA</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Apple</td>
                  <td className="py-2.5 pr-4">
                    přihlášení přes Apple účet, pokud ho použijete
                  </td>
                  <td className="py-2.5">EU/USA</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4">Paylibo</td>
                  <td className="py-2.5 pr-4">
                    generování platebního QR kódu u vyrovnání: číslo účtu příjemce, částka a
                    zpráva platby, plus IP adresa a prohlížeč každého, kdo si QR zobrazí
                  </td>
                  <td className="py-2.5">EU (ČR)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Váš prohlížeč navíc při zobrazení předpovědi počasí u výletu stahuje data ze služby
            Open-Meteo (ta se dozví vaši IP adresu, žádné vaše údaje jí neposíláme). Odkazy na
            Google Kalendář a Google Mapy otevíráte sami; do té chvíle Googlu nic neodchází.
          </p>
          <p>Údaje nikomu neprodáváme a nikomu je nepředáváme k reklamě.</p>
        </Section>

        <Section id="mimo-eu" title="8. Předávání mimo EU" icon={<Globe size={20} />}>
          <p>
            Data držíme v EU, kde to jde (databáze, soubory, statistiky). Někteří poskytovatelé
            (Vercel, Resend, Cloudflare, Microsoft, Google, Apple) jsou americké firmy;
            předání je kryto
            rozhodnutím Evropské komise o odpovídající ochraně (Data Privacy Framework),
            případně standardními smluvními doložkami. Podrobnosti ke konkrétnímu poskytovateli
            vám na vyžádání pošleme.
          </p>
        </Section>

        <Section id="uchovani" title="9. Jak dlouho údaje uchováváme" icon={<Hourglass size={20} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold">Údaje</th>
                  <th className="py-2 font-semibold">Jak dlouho</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">
                    záznam výletu (jména, program, výdaje, zálohy, vyrovnání)
                  </td>
                  <td className="py-2.5">po dobu provozu služby, jako společný archiv party</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">bankovní spojení účastníků</td>
                  <td className="py-2.5">smažeme do 12 měsíců od vyrovnání výletu</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">účtenky</td>
                  <td className="py-2.5">smažeme do 12 měsíců od vyrovnání výletu</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">účet, který se 2 roky nepřihlásil</td>
                  <td className="py-2.5">smažeme včetně vazeb</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">žádosti o propojení včetně důvodu zamítnutí</td>
                  <td className="py-2.5">smažeme do 12 měsíců od rozhodnutí</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">hlasy z plánování výletu</td>
                  <td className="py-2.5">součást záznamu výletu, po dobu provozu služby</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">
                    nepotvrzené hlasy z plánování (jméno, výběr, účet, který je má potvrdit)
                  </td>
                  <td className="py-2.5">
                    smažeme do 12 měsíců od potvrzení, nejpozději do 12 měsíců od vyúčtování
                    výletu
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">přihlašovací odkazy (tokeny)</td>
                  <td className="py-2.5">platí 15 minut, poté jsou neplatné</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">odkaz k potvrzení hlasu z plánování</td>
                  <td className="py-2.5">
                    platí 7 dní; hlas sám nepropadá, uloží se při jakémkoli přihlášení
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">surové statistické události</td>
                  <td className="py-2.5">12 měsíců, poté jen souhrnná čísla</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4">provozní logy hostingu</td>
                  <td className="py-2.5">krátkodobě, podle nastavení poskytovatele</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Smazání účtu ani bankovního spojení nemění spočítané vyúčtování: částky a podíly
            zůstávají, jen bez údajů, které už nejsou potřeba.
          </p>
        </Section>

        <Section id="prava" title="10. Vaše práva" icon={<Gavel size={20} />}>
          <p>
            Máte právo na přístup ke svým údajům (a jejich kopii), na opravu, na výmaz, na
            omezení zpracování, na přenositelnost a právo vznést námitku proti zpracování
            založenému na oprávněném zájmu. Nic z toho není podmíněno účtem: i účastník, kterého
            zapsal správce chaty, může napsat na{' '}
            <a href="mailto:mail@vojtechzicha.com" className={link}>
              mail@vojtechzicha.com
            </a>{' '}
            a my žádost vyřídíme nejpozději do měsíce. Totožnost si ověříme, abychom údaje
            nevydali někomu jinému.
          </p>
          <p>
            U výmazu je jedna mez: výlet je společný finanční záznam celé party. Vaše jméno a
            kontaktní údaje umíme odstranit nebo anonymizovat, ale zaplacené částky a podíly v
            součtech zůstat musí, jinak by přestalo sedět vyúčtování ostatních. O tom, co přesně
            jsme smazali, vás vyrozumíme.
          </p>
          <p>
            Smazaná data mohou po omezenou dobu přežívat v zálohách databáze; ze záloh je
            jednotlivě mazat neumíme, zálohy se ale samy přepisují.
          </p>
          <p>
            Pokud si myslíte, že s vašimi údaji nakládáme špatně, můžete podat stížnost u Úřadu
            pro ochranu osobních údajů, Pplk. Sochora 27, 170 00 Praha 7,{' '}
            <a
              href="https://www.uoou.gov.cz"
              target="_blank"
              rel="noopener noreferrer"
              className={link}
            >
              www.uoou.gov.cz
            </a>
            . Budeme rádi, když napíšete nejdřív nám.
          </p>
        </Section>

        <Section
          id="cookies"
          title="11. Cookies a další data v prohlížeči"
          icon={<Cookie size={20} />}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold">Cookie</th>
                  <th className="py-2 pr-4 font-semibold">K čemu slouží</th>
                  <th className="py-2 pr-4 font-semibold">Platnost</th>
                  <th className="py-2 font-semibold">Souhlas</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">payload-token</td>
                  <td className="py-2.5 pr-4">drží vaše přihlášení</td>
                  <td className="py-2.5 pr-4">30 dní (2 h pro správce)</td>
                  <td className="py-2.5">nezbytná pro přihlášení</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">zt_consent</td>
                  <td className="py-2.5 pr-4">pamatuje si vaši volbu v liště souhlasu</td>
                  <td className="py-2.5 pr-4">12 měsíců</td>
                  <td className="py-2.5">nezbytná, je sama záznamem souhlasu</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">NEXT_LOCALE</td>
                  <td className="py-2.5 pr-4">pamatuje si zvolený jazyk</td>
                  <td className="py-2.5 pr-4">12 měsíců</td>
                  <td className="py-2.5">nezbytná, ukládá se po vaší volbě v patičce</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">oauth-state</td>
                  <td className="py-2.5 pr-4">
                    náhodný bezpečnostní kód, který chrání přihlášení přes Microsoft, Google
                    nebo Apple před podvržením
                  </td>
                  <td className="py-2.5 pr-4">10 minut</td>
                  <td className="py-2.5">nezbytná</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">oauth-return-to</td>
                  <td className="py-2.5 pr-4">
                    drží návratovou adresu během přihlášení přes Microsoft, Google nebo Apple
                  </td>
                  <td className="py-2.5 pr-4">10 minut, jen po dobu přihlašování</td>
                  <td className="py-2.5">nezbytná</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">oauth-vote-intent</td>
                  <td className="py-2.5 pr-4">
                    drží váš hlas z plánování (jméno, termíny, chalupy) během přihlášení přes
                    Microsoft, Google nebo Apple, které jste spustili z hlasovacího formuláře
                  </td>
                  <td className="py-2.5 pr-4">10 minut, jen po dobu přihlašování</td>
                  <td className="py-2.5">nezbytná</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">zt_login_evt</td>
                  <td className="py-2.5 pr-4">
                    jednorázová značka „přihlášení proběhlo“ pro statistiky, hned se maže
                  </td>
                  <td className="py-2.5 pr-4">sekundy</td>
                  <td className="py-2.5">nezbytná technická</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-[13px]">ph_*</td>
                  <td className="py-2.5 pr-4">
                    stabilní anonymní identifikátor pro statistiky
                  </td>
                  <td className="py-2.5 pr-4">12 měsíců</td>
                  <td className="py-2.5">
                    <strong>jen s vaším souhlasem</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Přihlašovací, jazyková a souhlasová cookie platí pro celý web včetně adres
            jednotlivých chat (např. <span className="font-mono text-[13px]">lipno.zicha.travel</span>
            ), takže jedno rozhodnutí platí všude a lišta se neptá na každé adrese znovu.
          </p>
          <p>
            Vedle cookies si stránka ukládá pár drobností do úložiště vašeho prohlížeče
            (localStorage). Zůstávají jen ve vašem zařízení, na server se neposílají a zapisují
            se až po vaší volbě, proto nevyžadují souhlas:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold">Klíč</th>
                  <th className="py-2 font-semibold">K čemu slouží</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">zt_theme</td>
                  <td className="py-2.5">zvolený tmavý nebo světlý režim</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">chata-overview-mode</td>
                  <td className="py-2.5">zvolené zobrazení přehledu (tabulka, nebo karty)</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-[13px]">
                    chata-selected-participant-*
                  </td>
                  <td className="py-2.5">
                    čí finance jste si na dané chatě naposledy otevřeli, aby se záložka otevřela
                    stejně
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Se souhlasem se statistikami si PostHog ukládá svůj anonymní identifikátor kromě
            cookie i do localStorage (klíče{' '}
            <span className="font-mono text-[13px]">ph_*</span>); odvoláním souhlasu se maže
            obojí. Widget Turnstile na veřejných formulářích si může ve svém rámu na doméně
            Cloudflare ukládat vlastní technická data potřebná k rozpoznání robotů.
          </p>
        </Section>

        <Section id="mereni" title="12. Měření návštěvnosti" icon={<BarChart3 size={20} />}>
          <p>
            Zajímá nás jediné: jestli web funguje a jestli věci, které stavíme, někomu pomáhají.
            Sbíráme anonymní statistiky: návštěvy stránek a záložek, použití funkcí (někdo si
            otevřel přehled nebo QR kód) a technické chyby (že se něco nepodařilo uložit, nikdy
            ne co).
          </p>
          <p>
            Bez souhlasu s cookies k tomu slouží pseudonymní identifikátor, který se každý den
            mění; nejde z něj poznat, kdo jste, ani spojit dvě návštěvy v různých dnech. Když
            cookies povolíte, dostane váš prohlížeč stabilní anonymní identifikátor, díky
            kterému uvidíme i to, kde se rozdělaná akce zasekla. Pořád nevíme, kdo jste.
          </p>
          <p>
            Do statistik nikdy neposíláme jména, e-maily, čísla účtů, částky, obsah formulářů
            ani to, čí finance si zobrazujete; identifikátory účastníků se z adres před
            odesláním odstraňují. Statistiky se nikdy nespojují s vaším účtem; i přihlášení v
            nich vystupují jen jako anonymní návštěvník s hrubou rolí (návštěvník, účastník,
            správce). Nic se neměří v administraci ani na náhledových verzích webu.
          </p>
          <p>
            Souhlas můžete kdykoli odvolat nebo udělit tlačítkem „Nastavení soukromí“ v patičce
            každé stránky. Odvoláním se statistické cookies smažou.
          </p>
          {analyticsEnabled() ? (
            <PrivacySettingsLink
              className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[15px]
                         font-semibold text-white bg-primary hover:bg-primary-dark transition-colors"
            >
              <SlidersHorizontal size={16} />
              Otevřít nastavení soukromí
            </PrivacySettingsLink>
          ) : (
            <Callout>Měření návštěvnosti teď není zapnuté, takže není co nastavovat.</Callout>
          )}
        </Section>

        <Section id="deti" title="13. Děti" icon={<Baby size={20} />}>
          <p>
            Na výlety jezdí i děti, takže systém zná jejich jméno, postel, místo v autě a podíl
            na výdajích. Tyto údaje zadává rodič nebo správce chaty se souhlasem rodiče. Dětem
            účty nezakládáme; účet smí mít jen zletilá osoba. Bankovní spojení se u dětí
            nevyplňuje, platí za ně rodič.
          </p>
        </Section>

        <Section id="zabezpeceni" title="14. Zabezpečení" icon={<Lock size={20} />}>
          <p>
            Data přenášíme šifrovaně (HTTPS), přístup do administrace mají jen správci s
            vlastním přihlášením a krátkou platností přihlášení (2 hodiny), bankovní spojení a
            účtenky nejsou veřejně čitelné a veřejné formuláře chráníme před roboty a omezením
            počtu pokusů. Do aplikačních logů nezapisujeme osobní údaje. Databáze i soubory leží
            u poskytovatelů uvedených v kapitole 7 a jsou chráněny přístupovými klíči.
          </p>
          <p>
            Kdyby přes to všechno došlo k úniku dat, který pro vás znamená riziko, ohlásíme ho
            Úřadu pro ochranu osobních údajů do 72 hodin a vás budeme přímo informovat, pokud je
            riziko vysoké.
          </p>
        </Section>

        <Section
          id="ai"
          title="15. Automatizované rozhodování a umělá inteligence"
          icon={<Bot size={20} />}
        >
          <p>
            Služba nepoužívá žádný systém umělé inteligence ve smyslu nařízení (EU) 2024/1689
            (akt o umělé inteligenci). Neprobíhá žádné automatizované rozhodování ani
            profilování ve smyslu čl. 22 GDPR: výpočet vyrovnání je prostá aritmetika podle
            zadaných podílů a stejná pravidla platí pro každého. Pokud bychom někdy nějakou
            funkci umělé inteligence přidali (třeba čtení účtenek), nejdřív aktualizujeme tyto
            zásady a dozvíte se to dřív, než se funkce zapne.
          </p>
        </Section>

        <Section id="zmeny" title="16. Změny těchto zásad" icon={<History size={20} />}>
          <p>
            Když se zásady změní, zveřejníme novou verzi s datem účinnosti na této stránce; co
            se mezi verzemi změnilo, ukazuje kapitola 18. O podstatných změnách (nový příjemce
            údajů, nový účel, změna doby uchování) dáme vědět i na webu, u podstatného rozšíření
            zpracování e-mailem těm, kterých se týká.
          </p>
        </Section>

        <Section id="kontakt" title="17. Kontakt" icon={<Mail size={20} />}>
          <p>
            Vojtěch Zicha,{' '}
            <a href="mailto:mail@vojtechzicha.com" className={link}>
              mail@vojtechzicha.com
            </a>
            .
          </p>
        </Section>

        <Section id="historie" title="18. Historie verzí" icon={<FileClock size={20} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold">Verze</th>
                  <th className="py-2 pr-4 font-semibold">Účinnost</th>
                  <th className="py-2 font-semibold">Co se změnilo</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">4</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">30. 8. 2026</td>
                  <td className="py-2.5">
                    Nepotvrzené hlasy z plánování: hlas zadaný bez přihlášení čeká na potvrzení
                    jako samostatný záznam a uloží se při jakémkoli přihlášení; potvrzovací
                    e-mail, cookie <span className="font-mono text-[13px]">oauth-vote-intent</span> a
                    doplnění kapitol 4, 9 a 12.
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">3</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">27. 8. 2026</td>
                  <td className="py-2.5">
                    Soukromé výdaje: nový typ výdaje viditelný jen jeho členům, doplnění kapitoly
                    6 včetně zobrazení bankovního spojení plátce členům jeho rozdělení.
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">2</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">25. 8. 2026</td>
                  <td className="py-2.5">
                    Fáze plánování výletu: hlasování o termínu a ubytování jako nová kategorie
                    údajů, možnost přidat se k výletu hlasovacím formulářem a s tím spojené
                    doplnění kapitol 2, 3, 5, 6 a 9.
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4">1</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">16. 8. 2026</td>
                  <td className="py-2.5">První zveřejněná verze.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>Plné znění starší verze pošleme na vyžádání.</p>
        </Section>
      </div>
    </HelpShell>
  )
}

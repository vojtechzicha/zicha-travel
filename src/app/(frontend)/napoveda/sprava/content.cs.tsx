// Czech content, moved verbatim from page.tsx when the frontend went
// bilingual. Edit wording here; page.tsx only picks a locale.

import { Crown, Settings, ShieldCheck, UserCog, UserPlus, Wallet } from 'lucide-react'
import { Callout, HelpShell, List, PageCards, Screenshot, Section, Steps } from '../ui'

export default function SpravaContentCs() {
  return (
    <HelpShell
      title="Pro správce chaty"
      lead="Administrace je oddělená část na adrese /admin. Správce se do ní dostane jen ke svým chatám, superadmin ke všemu."
    >
      <div className="flex flex-col gap-6">
        <Section title="Založení chaty a její nastavení" icon={<Settings size={20} />}>
          <Screenshot
            name="admin-chata"
            caption="Formulář chaty. Zakládat a mazat chaty smí jen superadmin, obsah pak upravuje přiřazený správce."
          />
          <List
            items={[
              <>
                <strong>Name, Short Name, Location</strong>: název v hlavičce, krátký tvar do QR
                plateb a místo.
              </>,
              <>
                <strong>Slug</strong>: část adresy, na které chata běží.
              </>,
              <>
                <strong>Domains</strong>: vlastní adresa, třeba <code>lipno.zicha.travel</code>.
                Návštěvníkovi se pak otevře rovnou tahle chata a na jinou se přes ni nedostane.
              </>,
              <>
                Zaškrtávátka dál ve formuláři rozhodují, jestli se v aplikaci objeví Informace a
                Organizace. Co nevyplníš, se nezobrazí.
              </>,
              <>
                Barva a pozadí chaty se nastavují ve stejném formuláři a mění vzhled celé stránky.
              </>,
            ]}
          />
        </Section>

        <Section title="Účastníci" icon={<UserPlus size={20} />}>
          <p>
            Lidé se mezi akcemi opakují, takže se dají překopírovat i s bankovními údaji. Věci,
            které neplatí trvale, jako je pokoj nebo auto, se nikdy nekopírují.
          </p>
          <Steps
            items={[
              <>
                Ve formuláři chaty použij <strong>Prefill participants from previous chatas</strong>
                , vyber lidi z minulých akcí a potvrď. Jména, která už v chatě jsou, se
                přeskočí.
              </>,
              <>
                Jednotlivce jde založit i ručně. Na novém účastníkovi je tlačítko{' '}
                <strong>Copy from</strong>, které předvyplní jméno, skloňování i bankovní údaje
                podle někoho z jiné chaty.
              </>,
              <>
                Nakonec v chatě vyber <strong>pokladníka</strong>. Po jeho zvolení se předvyplní
                číslo účtu a IBAN, obojí jde přepsat. Když vyplníš jen jedno, aplikace dopočítá
                druhé.
              </>,
            ]}
          />
          <Callout>
            Než je chata uložená, nabídky účastníků jsou prázdné. Postup je tedy: uložit chatu,
            přidat lidi, teprve pak vybrat pokladníka a rozdělit pokoje.
          </Callout>
        </Section>

        <Section title="Děti a „platí za něj/ni“" icon={<UserCog size={20} />}>
          <Screenshot
            name="admin-ucastnik"
            caption="U účastníka se nastavuje skloňování jména, kdo za něj platí, a jeho bankovní údaje."
          />
          <List
            items={[
              <>
                <strong>Akuzativ</strong> a <strong>Vokativ</strong> jsou tvary jména do vět jako
                „Vojta zve Katku“. Když je nevyplníš, použije se základní tvar.
              </>,
              <>
                <strong>Paid By</strong> říká, že podíly tohoto člověka trvale přebírá někdo jiný.
                Nové výdaje ho pak započítají samy.
              </>,
              <>
                Tlačítko <strong>Apply retroactively to existing expenses</strong> doplní totéž do
                výdajů, které v chatě už jsou. Použij ho po uložení změny.
              </>,
              <>
                <strong>Account</strong> propojuje účastníka s přihlašovacím účtem. Tlačítkem{' '}
                <em>Create account from email</em> se účet rovnou založí. Nikomu se v tu chvíli nic
                neposílá.
              </>,
            ]}
          />
        </Section>

        <Section title="Výdaje, zálohy a společné účty" icon={<Wallet size={20} />}>
          <List
            items={[
              <>
                <strong>Expenses</strong>: co se zaplatilo. Plátcem může být účastník i společný
                účet, dělení je buď rovným dílem, nebo vahami. Pole s pozváními přesouvá podíl na
                hostitele.
              </>,
              <>
                <strong>Prepayments</strong>: zálohy, doplatky a vrácené přeplatky mezi člověkem a
                pokladníkem. Tohle je místo, kam se zapisuje, že někdo poslal peníze.
              </>,
              <>
                <strong>Joint Accounts</strong>: společný účet dvou a víc lidí. Co se z něj zaplatí,
                rozdělí se mezi členy rovným dílem.
              </>,
              <>
                <strong>Expense Attachments</strong>: účtenky. Nahrané soubory jsou veřejně dostupné
                přes svou adresu, stejně jako ostatní obsah.
              </>,
            ]}
          />
          <Callout tone="warn">
            Aplikace nesleduje bankovní účet. Dokud přijatou platbu nezapíšeš jako zálohu nebo
            doplatek, zůstane dlužníkovi viset dluh.
          </Callout>
        </Section>

        <Section title="Žádosti o propojení" icon={<ShieldCheck size={20} />}>
          <p>
            Když někdo klepne na „Jsi to ty?“, přijde ti e-mail s odkazem na rozhodovací stránku.
            Odkaz platí sedm dní a patří jen tobě.
          </p>
          <Screenshot
            name="claim-rozhodnuti"
            caption="Rozhodovací stránka: kdo se hlásí, k jakému jménu a jestli čekají další žádosti."
          />
          <List
            items={[
              <>
                <strong>Ano, schválit</strong> propojí účet se jménem a případné konkurenční žádosti
                automaticky zamítne.
              </>,
              <>
                <strong>Zamítnout</strong> chce důvod. Ten se pošle žadateli, ať ví, na čem je.
              </>,
              <>
                Když se na žádost zapomene, po třech dnech přijde jedna připomínka. Rozhodnout jde i
                v administraci v <em>Claim Requests</em>.
              </>,
              <>
                Lidi, které aplikace zná z jiné chaty, propojí sama a nic ti nepřijde.
              </>,
            ]}
          />
        </Section>

        <Section title="Superadmin" icon={<Crown size={20} />}>
          <List
            items={[
              <>Zakládá a maže chaty a přiřazuje k nim správce.</>,
              <>Spravuje účty a role. Roli může měnit jen on.</>,
              <>Stará se o ikony, pozadí a média.</>,
              <>
                Přihlašuje se výhradně přes Microsoft, Google nebo Apple. Když si vyžádá odkaz
                e-mailem, přijde mu
                místo něj vysvětlení.
              </>,
            ]}
          />
          <p>
            Správce chaty vidí v administraci jen dokumenty svých chat. Přihlášení mu vydrží dvě
            hodiny, běžnému účtu 30 dní.
          </p>
        </Section>

        <Section title="Další stránky nápovědy" icon={<Settings size={20} />}>
          <PageCards exclude="/napoveda/sprava" />
        </Section>
      </div>
    </HelpShell>
  )
}

// Czech content of the Claude connector guide (docs/MCP.md). Edit wording
// here; page.tsx only picks a locale.

import { Bot, MessagesSquare, Monitor, Plug, Settings, ShieldCheck, Terminal, Unplug } from 'lucide-react'
import { Callout, HelpShell, List, PageCards, Section, Steps } from '../ui'

const MCP_URL = 'https://zicha.travel/api/mcp'
const COMMAND = `claude mcp add --transport http --scope user zicha-travel ${MCP_URL}`

export default function ClaudeContentCs() {
  return (
    <HelpShell
      title="Propojení s Claude"
      lead="Claude se připojí k tvému účtu. Ptáš se ho na svoje chaty a on za tebe může i něco zapsat."
    >
      <div className="flex flex-col gap-6">
        <Section title="Co to je" icon={<Bot size={20} />}>
          <p>
            Claude je AI asistent od společnosti Anthropic. Přes konektor se připojí k tvému účtu
            na zicha.travel a pracuje s tvými chatami tak, jako bys klikal/a na webu ty.
          </p>
          <p>
            Vidí a smí jen to, co ty. Čísla lidí, kteří mají finance jen pro sebe, mu zůstanou
            skrytá stejně jako tobě. Cizí výdaj neupraví, protože ty bys ho upravit nemohl/a.
            Když něco nejde, Claude ti to řekne a nehledá oklikou jinou cestu.
          </p>
        </Section>

        <Section title="Připojení v Claude na webu, v mobilu a v aplikaci" icon={<Plug size={20} />}>
          <Steps
            items={[
              <>
                V Claude otevři <strong>Nastavení</strong>, pak <strong>Konektory</strong> a{' '}
                <strong>Přidat vlastní konektor</strong>.
              </>,
              <>
                Jako adresu vlož <code className="break-all">{MCP_URL}</code> a potvrď.
              </>,
              <>
                Claude tě pošle na zicha.travel. Když nejsi přihlášený/á, nejdřív se přihlas
                stejně jako jindy.
              </>,
              <>
                Vyber, co Claude smí: <strong>Číst i upravovat</strong>, nebo{' '}
                <strong>Jen číst</strong>. Pak klepni na <strong>Povolit</strong>.
              </>,
            ]}
          />
          <p>
            Adresu i příkaz pro terminál najdeš taky na stránce{' '}
            <a className="underline" href="/claude">
              Propojení s Claude
            </a>
            , kam vede odkaz v patičce.
          </p>
        </Section>

        <Section title="Připojení v Claude Code" icon={<Terminal size={20} />}>
          <p>V terminálu spusť:</p>
          <pre className="whitespace-pre-wrap break-all rounded-xl bg-gray-100 p-3 text-[13px] text-gray-900">
            {COMMAND}
          </pre>
          <p>
            Pak v Claude Code napiš <code>/mcp</code>, vyber zicha-travel a přihlas se. Dál je to
            stejné jako na webu.
          </p>
        </Section>

        <Section title="Na co se můžeš zeptat" icon={<MessagesSquare size={20} />}>
          <List
            items={[
              <>„Kolik dlužím a komu?“</>,
              <>„Kde spím a s kým?“</>,
              <>„Kdo jede kterým autem a kolik je tam volných míst?“</>,
              <>„Přidej výdaj za benzín 1 200 Kč, rozdělit rovným dílem.“</>,
              <>„Zapiš mě do Martinova auta dozadu.“</>,
              <>„Přidej na nákup chleba.“</>,
              <>„Mám tu nějaký výdaj k potvrzení? Ten za benzín sedí, potvrď ho.“</>,
            ]}
          />
          <p>Na webu zůstává:</p>
          <List
            items={[
              <>fotky účtenek,</>,
              <>propojení s Rohlíkem,</>,
              <>práce v administraci: účastníci, zálohy a nastavení chaty.</>,
            ]}
          />
        </Section>

        <Section title="Bezpečnost" icon={<ShieldCheck size={20} />}>
          <List
            items={[
              <>
                Co Claude zapíše, je skutečné. Uvidí to všichni v chatě a některé změny posílají
                e-mail, třeba žádost o potvrzení výdaje.
              </>,
              <>
                Claude má pokyn nejdřív si změnu zkusit nanečisto a před mazáním se tě zeptat.
                Kontroluj, co ti navrhuje.
              </>,
              <>
                Každá změna přes Claude se zapisuje. Zeptej se ho „Co jsi u mě změnil?“ a ukáže ti
                stav před změnou i po ní.
              </>,
              <>Když se chceš jen ptát, stačí povolit <strong>Jen číst</strong>.</>,
            ]}
          />
        </Section>

        <Section title="Soukromí" icon={<Monitor size={20} />}>
          <p>
            Co si Claude přes konektor přečte, posílá společnosti Anthropic. Jsou v tom i jména a
            částky ostatních lidí z tvých chat. Anthropic tu pracuje pro tebe, ne pro
            zicha.travel, proto zvaž, na co se ho ptáš.
          </p>
          <Callout>
            Víc v{' '}
            <a className="underline" href="/soukromi#claude">
              zásadách ochrany osobních údajů
            </a>
            .
          </Callout>
        </Section>

        <Section title="Odpojení" icon={<Unplug size={20} />}>
          <List
            items={[
              <>
                V patičce otevři <strong>Propojení s Claude</strong> a u aplikace klepni na{' '}
                <strong>Odpojit</strong>. Přístup končí hned.
              </>,
              <>Smazáním účtu se odpojí všechno najednou.</>,
              <>Připojení, které 60 dní nikdo nepoužije, samo vyprší.</>,
            ]}
          />
        </Section>

        <Section title="Další stránky nápovědy" icon={<Settings size={20} />}>
          <PageCards exclude="/napoveda/claude" />
        </Section>
      </div>
    </HelpShell>
  )
}

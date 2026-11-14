// English content of the Claude connector guide (docs/MCP.md). Edit
// wording here; page.tsx only picks a locale.

import { Bot, MessagesSquare, Monitor, Plug, Settings, ShieldCheck, Terminal, Unplug } from 'lucide-react'
import { Callout, HelpShell, List, PageCards, Section, Steps } from '../ui'

const MCP_URL = 'https://zicha.travel/api/mcp'
const COMMAND = `claude mcp add --transport http --scope user zicha-travel ${MCP_URL}`

export default function ClaudeContentEn() {
  return (
    <HelpShell
      title="Connect Claude"
      lead="Claude connects to your account. You ask it about your trips, and it can also enter things for you."
    >
      <div className="flex flex-col gap-6">
        <Section title="What it is" icon={<Bot size={20} />}>
          <p>
            Claude is an AI assistant made by Anthropic. Through the connector it joins your
            zicha.travel account and works with your chatas the way you would on the web.
          </p>
          <p>
            It sees and does only what you can. People who keep their finances to themselves stay
            hidden from it just as they do from you. It can&apos;t edit somebody else&apos;s
            expense, because you couldn&apos;t either. When something isn&apos;t allowed, Claude
            tells you instead of looking for a way around it.
          </p>
        </Section>

        <Section title="Connecting in Claude on the web, mobile and desktop" icon={<Plug size={20} />}>
          <Steps
            items={[
              <>
                In Claude, open <strong>Settings</strong>, then <strong>Connectors</strong>, and{' '}
                <strong>Add custom connector</strong>.
              </>,
              <>
                Paste <code className="break-all">{MCP_URL}</code> as the address and confirm.
              </>,
              <>
                Claude sends you to zicha.travel. If you aren&apos;t signed in, sign in first the
                usual way.
              </>,
              <>
                Choose what Claude may do: <strong>Read and edit</strong> or{' '}
                <strong>Read only</strong>. Then tap <strong>Allow</strong>.
              </>,
            ]}
          />
          <p>
            You&apos;ll also find the address and the terminal command on the{' '}
            <a className="underline" href="/claude">
              Connect Claude
            </a>{' '}
            page, linked from the footer.
          </p>
        </Section>

        <Section title="Connecting in Claude Code" icon={<Terminal size={20} />}>
          <p>In a terminal, run:</p>
          <pre className="whitespace-pre-wrap break-all rounded-xl bg-gray-100 p-3 text-[13px] text-gray-900">
            {COMMAND}
          </pre>
          <p>
            Then type <code>/mcp</code> in Claude Code, pick zicha-travel and sign in. From there
            it works the same as on the web.
          </p>
        </Section>

        <Section title="What you can ask" icon={<MessagesSquare size={20} />}>
          <List
            items={[
              <>&quot;How much do I owe, and to whom?&quot;</>,
              <>&quot;Where am I sleeping, and with whom?&quot;</>,
              <>&quot;Who rides in which car, and how many seats are free?&quot;</>,
              <>&quot;Add an expense for petrol, CZK 1,200, split equally.&quot;</>,
              <>&quot;Put me in the back of Martin&apos;s car.&quot;</>,
              <>&quot;Add bread to the shopping list.&quot;</>,
              <>
                &quot;Is there an expense waiting for me to confirm? The petrol one is right,
                confirm it.&quot;
              </>,
            ]}
          />
          <p>These stay on the web:</p>
          <List
            items={[
              <>receipt photos,</>,
              <>connecting Rohlík,</>,
              <>work in the admin panel: participants, advances and chata settings.</>,
            ]}
          />
        </Section>

        <Section title="Safety" icon={<ShieldCheck size={20} />}>
          <List
            items={[
              <>
                What Claude writes is real. Everyone in the chata sees it, and some changes send an
                email, such as a request to confirm an expense.
              </>,
              <>
                Claude is told to try a change as a dry run first and to ask you before deleting
                anything. Check what it proposes.
              </>,
              <>
                Every change made through Claude is logged. Ask it &quot;What did you change for
                me?&quot; and it shows you the record before and after.
              </>,
              <>
                If you only want to ask questions, <strong>Read only</strong> is enough.
              </>,
            ]}
          />
        </Section>

        <Section title="Privacy" icon={<Monitor size={20} />}>
          <p>
            Whatever Claude reads through the connector goes to Anthropic, including the names and
            amounts of other people on your trips. Anthropic works for you here, not for
            zicha.travel, so think about what you ask it.
          </p>
          <Callout>
            More in the{' '}
            <a className="underline" href="/soukromi#claude">
              privacy policy
            </a>
            .
          </Callout>
        </Section>

        <Section title="Disconnecting" icon={<Unplug size={20} />}>
          <List
            items={[
              <>
                Open <strong>Connect Claude</strong> in the footer and tap{' '}
                <strong>Disconnect</strong> next to the app. Access ends at once.
              </>,
              <>Deleting your account disconnects everything at once.</>,
              <>A connection nobody uses for 60 days expires on its own.</>,
            ]}
          />
        </Section>

        <Section title="Other help pages" icon={<Settings size={20} />}>
          <PageCards exclude="/napoveda/claude" />
        </Section>
      </div>
    </HelpShell>
  )
}

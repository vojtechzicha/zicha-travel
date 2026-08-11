// English content of the help hub. A translation of content.cs.tsx — same
// structure, same screenshots (which show the Czech UI), idiomatic English.

import {
  BookOpen,
  Calculator,
  Compass,
  Crown,
  Eye,
  LifeBuoy,
  Map,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import { Callout, HelpShell, List, PageCards, Screenshot, Section } from './ui'

const NAV = [
  { href: '#prehled', label: 'What is where' },
  { href: '#bez-prihlaseni', label: 'Without signing in' },
  { href: '#ucastnik', label: 'Participant with an account' },
  { href: '#spravce', label: 'Chata admin' },
  { href: '#superadmin', label: 'Superadmin' },
  { href: '#pocty', label: 'How the money is counted' },
  { href: '#slovnicek', label: 'Glossary' },
]

export default function HelpContentEn() {
  return (
    <HelpShell
      isHub
      title="Help"
      lead="What the app can do for you as a visitor without an account, as a signed-in participant, and as a chata admin."
    >
      <nav className="flex flex-wrap justify-center gap-2 mb-8">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white/85 bg-white/15
                       border border-white/20 backdrop-blur-md hover:bg-white/25 hover:text-white
                       transition-colors"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-6">
        <Section id="uvod" title="What this is all for" icon={<Compass size={20} />}>
          <p>
            zicha.travel is the page of one shared trip. It keeps everything in one place: the
            dates and location, who sleeps where and who rides in which car, the list of people,
            and above all the money: who paid for what, how much of it falls on whom, and who
            sends how much to whom at the end.
          </p>
          <p>
            Each chata has its own address and its own participants. Data never mixes between
            chatas; only the people tend to repeat. Once you sign in, the home page shows the
            chatas you take part in, sorted by whether they are happening right now, still ahead,
            or already behind you.
          </p>
        </Section>

        <Section title="Detailed guides" icon={<Map size={20} />}>
          <p>
            This page is a quick overview. Each part has its own guide with pictures and a
            description of what happens when you click.
          </p>
          <PageCards />
        </Section>

        <Section id="prehled" title="What is where" icon={<BookOpen size={20} />}>
          <p>
            The switcher under the chata name moves between the individual views. Some of them stay
            hidden if the chata admin has not filled them in.
          </p>
          <List
            items={[
              <>
                <strong>Information</strong>: dates, location, description, photos and travel. Bus
                and train connections have a button that saves the journey, transfers included, to
                your Google calendar.
              </>,
              <>
                <strong>Organization</strong>: rooms and beds, including who sleeps in which, and
                shared cars with the driver, passengers and free seats.
              </>,
              <>
                <strong>Participants</strong>: who is coming and for how many nights. It appears
                once the chata has more than two people.
              </>,
              <>
                <strong>Finances</strong>: the main view of the money. Pick a name and you will see
                the expense journal, your fair share, advances and the result.
              </>,
              <>
                <strong>Detailed overview</strong>: a link below Finances. It lays out every
                participant and every expense in one table, which comes in handy when someone's
                numbers do not add up.
              </>,
            ]}
          />
          <p className="text-sm text-gray-500">
            Covered in detail in the guide{' '}
            <a className="underline" href="/napoveda/orientace">Finding your way around</a>.
          </p>
        </Section>

        <Section id="bez-prihlaseni" title="Without signing in" icon={<Eye size={20} />}>
          <p>
            Just open the chata link. You do not have to register or confirm anything. Anyone who
            knows the address can browse the information, the organization and the participant
            list.
          </p>
          <p className="text-sm text-gray-500">
            The screenshots in these guides show the interface in Czech; the layout is the same in
            English.
          </p>
          <Screenshot
            name="vyber-ucastnika"
            caption="In Finances you pick a name and see the same numbers that person sees themselves."
          />
          <List
            items={[
              <>
                You will see the fair share, advances, the result and instructions on who to pay
                how much.
              </>,
              <>
                One exception: anyone who has signed in to the app at least once is locked in the
                picker. Their name stays visible but greyed out, and tapping it reveals a masked
                email so its owner knows which account to sign in with.
              </>,
              <>
                You cannot add an expense of your own. The expense journal shows an offer to sign
                in instead.
              </>,
              <>
                If you find yourself among the names, open it: an &quot;Is that you?&quot; prompt
                appears under the header. That is the way to an account.
              </>,
            ]}
          />
          <Callout>
            Locked names are a courtesy in the interface, not a vault. Things that cannot bear
            strangers&apos; eyes do not belong in a shared kitty.
          </Callout>
        </Section>

        <Section id="ucastnik" title="Participant with an account" icon={<UserCheck size={20} />}>
          <p>
            An account is just an email and a one-time sign-in link. There is no password to make
            up. Either the chata admin creates it for you, or you ask for a link yourself via
            &quot;Is that you?&quot;.
          </p>
          <List
            items={[
              <>
                Finances opens straight on your own name. If the admin has attached your children or
                partner to your account as well, you switch between them.
              </>,
              <>
                An <strong>Add expense</strong> button appears in the bottom right. On a phone it
                walks you through three steps; on a computer it is a single dialog.
              </>,
              <>
                Expenses can be split equally, by shares, or by exact amounts. You can photograph
                the receipt right from the form.
              </>,
              <>
                Your own expenses carry an &quot;Added by you&quot; footer and you can edit or
                delete them. Other people&apos;s expenses are off limits.
              </>,
            ]}
          />
          <p className="text-sm text-gray-500">
            Covered in detail in the guides{' '}
            <a className="underline" href="/napoveda/ucet">
              Account and signing in
            </a>{' '}
            and{' '}
            <a className="underline" href="/napoveda/vydaje">
              Adding and editing expenses
            </a>
            .
          </p>
        </Section>

        <Section id="spravce" title="Chata admin" icon={<ShieldCheck size={20} />}>
          <p>
            An admin can enter the admin panel, but only for the chatas a superadmin has assigned
            to them. In Finances on the site they see all participants and can switch between them.
          </p>
          <List
            items={[
              <>
                Creates participants, copies them in bulk from past chatas, and picks the banker.
              </>,
              <>
                Records expenses, advances, top-ups and returned overpayments, and manages joint
                accounts and invitations.
              </>,
              <>Decides link requests and creates accounts from an email address.</>,
              <>Configures what the chata shows, how it looks and which address it runs on.</>,
            ]}
          />
          <p className="text-sm text-gray-500">
            Covered in detail in the guide{' '}
            <a className="underline" href="/napoveda/sprava">
              For chata admins
            </a>
            .
          </p>
        </Section>

        <Section id="superadmin" title="Superadmin" icon={<Crown size={20} />}>
          <p>The superadmin looks after the app as a whole, across all chatas.</p>
          <List
            items={[
              <>Creates and deletes chatas and assigns admins to them.</>,
              <>
                Manages user accounts and roles. Only a superadmin can change a role; a chata admin
                cannot reach it.
              </>,
              <>Takes care of icons, backgrounds and other media.</>,
              <>
                Signs in exclusively through Microsoft. They can ask for a sign-in link by email,
                but an explanation arrives instead.
              </>,
            ]}
          />
        </Section>

        <Section id="pocty" title="How the money is counted" icon={<Calculator size={20} />}>
          <p>
            Every expense has someone who paid it and a split among the participants. The sum of
            your shares across all expenses is your fair share. Against it stands what you paid
            yourself and the advances you sent to the banker.
          </p>
          <List
            items={[
              <>
                An equal split spreads the expense evenly among the selected people. Shares can
                reflect that someone consumes more: two shares count twice as much as one. Exact
                amounts spell the item out to the crown.
              </>,
              <>
                Advances, top-ups and returned overpayments are transfers between a participant
                and the banker, not payments for a particular thing. The banker&apos;s own
                contribution is not counted twice.
              </>,
              <>
                When a joint account pays, the payment is split equally among its members. Money
                is always settled between people, though.
              </>,
              <>
                An invitation moves the guest&apos;s share to the host. It moves by one step only:
                if the invited person invites someone themselves, their own share travels no
                further.
              </>,
            ]}
          />
          <p>
            In the end there is a single number. Either you still owe, or you get money back.
            Differences of up to one crown count as settled, so rounding never makes anyone send
            hellers around.
          </p>
          <p className="text-sm text-gray-500">
            Spelled out with an example in the guide{' '}
            <a className="underline" href="/napoveda/prehled">
              Detailed overview and the math
            </a>
            .
          </p>
        </Section>

        <Section id="slovnicek" title="Glossary" icon={<BookOpen size={20} />}>
          <dl className="flex flex-col gap-3 m-0">
            {[
              ['Chata', 'One trip. Its own address, its own participants, its own kitty.'],
              [
                'Banker',
                'The person holding the shared kitty. They collect advances and, at the end, send everyone what is left over.',
              ],
              [
                'Participant',
                'A name in one chata. They may or may not have an account. Without one, their finance summary is open to anyone with the link.',
              ],
              [
                'Account',
                'Signing in by email. One account can hold several participants, even within one chata (say a parent and their children).',
              ],
              ['Share', 'The number an expense is divided by. Two shares mean twice as much as one.'],
              [
                'Advance, top-up, overpayment returned',
                'Money between a participant and the banker that belongs to no particular expense.',
              ],
              [
                'Joint account',
                'A bank account of two or more people. Whatever it pays for is split equally among them.',
              ],
              ['Invitation', "The host takes their guest's share upon themselves."],
              [
                'Linking',
                'Connecting an account to a participant. Only then does the app know who you are and open your finances directly.',
              ],
            ].map(([term, meaning]) => (
              <div key={term}>
                <dt className="font-semibold text-gray-900">{term}</dt>
                <dd className="m-0">{meaning}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="nesedi" title="When something does not add up" icon={<LifeBuoy size={20} />}>
          <p>
            Start with the detailed overview below Finances. It shows all expenses and all people
            at once, so it usually reveals where the numbers went apart: a missing receipt, wrongly
            set shares, a forgotten advance.
          </p>
          <p>
            You can fix your own expense yourself. For everything else, the person who set up the
            chata can help. The banker, the person holding the shared kitty, is named in the
            header next to the chata name. And if you are looking at someone else&apos;s finances
            where your own name should be, ask for a link via &quot;Is that you?&quot;.
          </p>
        </Section>
      </div>
    </HelpShell>
  )
}

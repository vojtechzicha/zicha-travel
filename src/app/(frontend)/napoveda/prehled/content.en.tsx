// English content. A translation of content.cs.tsx — same structure, same
// screenshots (which show the Czech UI), idiomatic English. Amounts stay the
// same figures, written CZK-style.

import { Calculator, HeartHandshake, Sigma, Table2, Users, Wallet } from 'lucide-react'
import { Callout, HelpShell, List, NextPage, Screenshot, Section, Steps } from '../ui'

export default function PrehledContentEn() {
  return (
    <HelpShell
      title="Detailed overview and the math"
      lead="When someone's numbers do not add up, open the table that shows everything at once. And here is the math behind it, too."
    >
      <div className="flex flex-col gap-6">
        <Section title="Where to find the overview" icon={<Table2 size={20} />}>
          <p>
            In Finances, below the content, there is a line reading &quot;Numbers not adding up, or
            want to see everything at once?&quot; with the link{' '}
            <strong>Detailed overview of all participants →</strong>. It is open to anyone, even
            without signing in.
          </p>
          <p className="text-sm text-gray-500">
            The screenshot shows the interface in Czech; the layout is the same in English.
          </p>
          <Screenshot
            name="prehled"
            caption="A column per person, a row per item. The Σ check column on the right, everyone's result at the bottom."
          />
        </Section>

        <Section title="How to read the table" icon={<Sigma size={20} />}>
          <List
            items={[
              <>
                <strong>Paid for others</strong>: what that person paid out of their own pocket.
                With a joint account, the amount is split among its members.
              </>,
              <>
                <strong>Advance and top-up to the banker</strong>: positive for the sender,
                negative for the banker who collected it. The row therefore sums to zero.
              </>,
              <>
                <strong>Fair share</strong>: one row per expense. Each column holds that
                person&apos;s share, with a note when someone else paid it for them.
              </>,
              <>
                <strong>Σ check</strong> on the right: the row total. For expenses it must match
                the expense&apos;s price; for transfers to the banker, zero.
              </>,
              <>
                <strong>The result</strong> at the bottom: how much each person gets back or still
                owes. The whole row adds up to zero; otherwise money would be leaking somewhere.
              </>,
            ]}
          />
          <p>
            Wide screens open the table, phones open cards. You can switch with the buttons at the
            top, and the choice is remembered.
          </p>
        </Section>

        <Section title="Where your share comes from" icon={<Calculator size={20} />}>
          <p>
            Every expense is spread among people in one of three ways. The sum of all your shares
            is your fair share.
          </p>
          <Steps
            items={[
              <>
                <strong>Equally.</strong> The price divided by the number of people. A cottage
                rental of CZK 7,200 among six people makes CZK 1,200 per person.
              </>,
              <>
                <strong>By shares.</strong> The price divided by the sum of the shares. Beer and
                wine for CZK 1,250 was split 1 + 2 + 1 + 2 shares, so CZK 208 per share. Whoever
                had two pays CZK 417.
              </>,
              <>
                <strong>Exact amounts.</strong> Shares entered in crowns. Whatever is left blank is
                spread evenly among the rest.
              </>,
            ]}
          />
        </Section>

        <Section title="Invitations and children" icon={<HeartHandshake size={20} />}>
          <p>
            An invitation moves the guest&apos;s share to the host. The table shows it from both
            sides: a zero for the guest with a note saying who pays for them, and an increased
            amount for the host with a note saying for whom.
          </p>
          <List
            items={[
              <>
                Ela has a zero on every expense with a note that Katka pays for her. Katka&apos;s
                shares therefore add up for two.
              </>,
              <>
                It is always the original share that moves, and only by one step. If the invited
                person invites someone themselves, the chain does not accumulate further.
              </>,
              <>Standing arrangements (who pays for whom) are set by the chata admin on the participant.</>,
            ]}
          />
        </Section>

        <Section title="Advances, the banker and joint accounts" icon={<Wallet size={20} />}>
          <List
            items={[
              <>
                An advance, a top-up and a returned overpayment are transfers between a person and
                the banker, not payments for a particular thing.
              </>,
              <>
                The banker&apos;s own contribution is not counted twice. It is a movement inside
                the shared kitty, which is why their balance usually looks deeply negative: they
                are holding other people&apos;s money.
              </>,
              <>
                An expense paid from a joint account is credited equally to its members. Settling,
                however, always happens between people; nothing is ever sent to the joint account
                itself.
              </>,
            ]}
          />
          <Callout>
            Differences of up to one crown count as settled. That is deliberate: rounding of shares
            would otherwise leave heller-sized debts hanging around.
          </Callout>
        </Section>

        <Section title="When the numbers still do not add up" icon={<Users size={20} />}>
          <List
            items={[
              <>
                Go through the <strong>Σ check</strong> column row by row. Wherever the total does
                not match the expense&apos;s price, the split was entered wrong.
              </>,
              <>Check whether an advance is missing, or a receipt someone paid on the side.</>,
              <>
                Planned expenses do not count towards the settlement. If they are already paid,
                someone has to switch them to a regular expense.
              </>,
              <>You can fix your own expense yourself; for the others, the chata admin can help.</>,
            ]}
          />
        </Section>

        <NextPage href="/napoveda/sprava" />
      </div>
    </HelpShell>
  )
}

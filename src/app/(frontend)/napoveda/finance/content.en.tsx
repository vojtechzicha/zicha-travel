// English content. A translation of content.cs.tsx — same structure, same
// screenshots (which show the Czech UI), idiomatic English.

import { Banknote, ClipboardList, Crown, ListTree, Receipt, UserSearch, Wallet } from 'lucide-react'
import { Callout, HelpShell, List, NextPage, Screenshot, ScreenshotRow, Section, Steps } from '../ui'

export default function FinanceContentEn() {
  return (
    <HelpShell
      title="Finances line by line"
      lead="Pick a name and you get one screen with five to seven numbers. Here is what each of them means."
    >
      <div className="flex flex-col gap-6">
        <Section title="First, pick a name" icon={<UserSearch size={20} />}>
          <p className="text-sm text-gray-500">
            The screenshots in this guide show the interface in Czech; the layout is the same in
            English.
          </p>
          <Screenshot
            name="vyber-ucastnika"
            caption="The participant picker. The crown marks the banker; a &quot;no account&quot; note means the person has not linked a sign-in yet."
          />
          <Steps
            items={[
              <>
                Tap your name. When there are many people, use the <em>Search participants</em>{' '}
                field.
              </>,
              <>
                Your browser remembers the choice, so next time you land straight on yourself. You
                can change it with the <strong>Change</strong> button in the name bar.
              </>,
              <>
                Signed-in users skip this step: their own name opens directly. A chata admin, on
                the other hand, can switch between everyone.
              </>,
            ]}
          />
          <Callout>
            The greyed-out names at the end of the list belong to people who have signed in at some
            point. Only they can see those finances, and only after signing in. Tapping such a name
            shows a hint about which email to sign in with.
          </Callout>
        </Section>

        <Section title="The summary box: where the result comes from" icon={<Wallet size={20} />}>
          <p>
            The colour of the box tells you before the numbers do. Green means you are even or
            getting money back, red means you still owe, blue belongs to the banker.
          </p>
          <Screenshot
            name="finance-souhrn"
            caption="Míša shopped for the whole chata, so he comes out ahead: he gets CZK 3,360 back."
          />
          <p>Rows only appear when they have something to show:</p>
          <List
            items={[
              <>
                <strong>Paid for others</strong>: the sum of the expenses you paid. When a joint
                account paid, half of it counts towards you (or your fraction, by the number of
                members).
              </>,
              <>
                <strong>Advance</strong> and <strong>Top-up</strong>: what you sent to the banker.
                It counts in your favour.
              </>,
              <>
                <strong>Overpayment returned</strong>: money the banker has already sent back to
                you. It is subtracted.
              </>,
              <>
                <strong>Your fair share</strong>: the sum of your shares across all expenses. This
                is what the chata really costs you. The row can be expanded.
              </>,
              <>
                <strong>Planned fair share</strong>: a yellow row for expenses that are still just
                plans. You see where things are heading, but it does not count towards the
                settlement yet.
              </>,
              <>
                <strong>The result</strong> below the line: either <em>You owe</em> or{' '}
                <em>You get back</em>. Differences of up to one crown count as settled.
              </>,
            ]}
          />
        </Section>

        <Section title="Fair share breakdown" icon={<ListTree size={20} />}>
          <p>
            Tapping the <strong>Your fair share</strong> row unfolds a list showing how much of
            each expense fell on you.
          </p>
          <Screenshot
            name="finance-rozpad"
            caption="Each item shows the amount and, in parentheses, the share it was split by."
          />
          <List
            items={[
              <>
                In an equal split, everyone has one share. On weighted expenses you might see two
                shares; with exact amounts, the specific sum directly.
              </>,
              <>
                When someone took over your share, the item carries a note saying who invited you
                and the amount is green. When you paid for someone else instead, their share is
                added to yours with their name next to it.
              </>,
              <>Planned expenses have their own breakdown in the yellow row below.</>,
            ]}
          />
        </Section>

        <Section title="The expense journal" icon={<ClipboardList size={20} />}>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <Screenshot name="denik-vydaju" caption="The expense column; on a phone it sits below the summary." />
            <div className="flex flex-col gap-4 flex-1">
              <p>
                On the left (on a phone, at the bottom) runs the list of expenses. The{' '}
                <strong>mine</strong> / <strong>all</strong> switch in its header decides whether
                you see only the expenses concerning the selected person, or the whole chata.
              </p>
              <List
                items={[
                  <>Expenses are sorted oldest first, in the order they were added.</>,
                  <>
                    In <em>all</em> mode, expenses that do not concern you are faded out.
                  </>,
                  <>
                    A yellow dashed border and a <em>Planned</em> badge mean an expense that is
                    still to come.
                  </>,
                ]}
              />
            </div>
          </div>
        </Section>

        <Section title="What an expense card shows" icon={<Receipt size={20} />}>
          <ScreenshotRow>
            <Screenshot
              name="karta-vydaje"
              caption="A weighted expense: Vojta and Petr carry a double share."
            />
            <Screenshot
              name="karta-pozvani"
              caption="The pink badge says the host took over the invited person's share."
            />
          </ScreenshotRow>
          <List
            items={[
              <>The name, the amount and who paid. A joint account shows both names.</>,
              <>
                The badges below show the split: either <em>Everyone splits equally</em>, or
                individual names with a number of shares or an amount.
              </>,
              <>
                When there are too many names, they collapse into <em>+ N more</em>. Tap to unfold.
              </>,
              <>
                Receipts hang there as small thumbnails. An image opens full screen when tapped, a
                PDF opens in a new tab.
              </>,
            ]}
          />
        </Section>

        <Section title="Payment history" icon={<Banknote size={20} />}>
          <Screenshot name="historie" caption="Transfers between you and the banker, plus your payments." />
          <p>
            The last block sums up what happened with your money: advances and top-ups you sent,
            overpayments returned to you, and expenses you paid. It is there for checking when you
            are not sure something was counted.
          </p>
        </Section>

        <Section title="How to settle up" icon={<Crown size={20} />}>
          <Screenshot
            name="vyrovnani"
            caption="A debtor sees a QR code, the banker's account number, the IBAN and the amount. Every value can be copied."
          />
          <p>Depending on where you stand, you will see one of three variants:</p>
          <List
            items={[
              <>
                <strong>You owe</strong>: a QR code for the exact amount, with the details for
                manual entry below it. The payment goes to the banker.
              </>,
              <>
                <strong>You get back</strong>: just a note that the banker will send you the money
                once the debts are collected. There is nothing for you to do.
              </>,
              <>
                <strong>All settled</strong>: confirmation that it is done.
              </>,
            ]}
          />
          <p>
            The banker gets a different screen: one column lists who still owes them, the other who
            they should pay. For each creditor they can unfold a QR code with that person&apos;s
            account number. Anyone who left their banking details blank appears in a yellow box
            with a note to pay them in cash.
          </p>
          <Callout tone="warn">
            The app does not track payments. When someone sends money, the banker has to record it
            as an advance or a top-up. Otherwise the debt keeps hanging in the overview.
          </Callout>
        </Section>

        <NextPage href="/napoveda/vydaje" />
      </div>
    </HelpShell>
  )
}

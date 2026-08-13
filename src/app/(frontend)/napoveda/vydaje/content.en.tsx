// English content. A translation of content.cs.tsx — same structure, same
// screenshots (which show the Czech UI), idiomatic English.

import { Camera, Clock, HeartHandshake, Monitor, PencilLine, Plus, Scale, Smartphone } from 'lucide-react'
import { Callout, HelpShell, List, NextPage, Screenshot, ScreenshotRow, Section, Steps } from '../ui'

export default function VydajeContentEn() {
  return (
    <HelpShell
      title="Adding and editing expenses"
      lead="Paid for something for the group? Record it yourself instead of messaging the banker about it."
    >
      <div className="flex flex-col gap-6">
        <Section title="Who can add expenses" icon={<Plus size={20} />}>
          <p>
            A signed-in participant, meaning someone whose account is linked to one of the names in
            this chata. An anonymous visitor does not see the button, only an offer to sign in.
          </p>
          <p className="text-sm text-gray-500">
            The screenshots in this guide show the interface in Czech; the layout is the same in
            English.
          </p>
          <ScreenshotRow>
            <Screenshot
              name="prihlasene-finance"
              className="flex-1 min-w-[320px] max-w-[640px]"
              caption="On a computer the button has a label and sits in the bottom right."
            />
            <Screenshot name="mobil-tlacitko" caption="On a phone it becomes a round button near your thumb." />
          </ScreenshotRow>
          <p>
            Where you record the expense from makes no difference. The form is the same either way,
            just laid out differently.
          </p>
        </Section>

        <Section title="On a phone: three steps" icon={<Smartphone size={20} />}>
          <p>
            After tapping, a sheet slides up from the bottom asking how you want to start.
            &quot;Snap the receipt&quot; opens the camera straight away; &quot;Enter it
            manually&quot; goes directly to the form.
          </p>
          <ScreenshotRow>
            <Screenshot name="composer-vstup" caption="Snap the receipt, or enter it manually." />
            <Screenshot name="composer-krok1" caption="Step 1: what and how much." />
            <Screenshot name="composer-krok2" caption="Step 2: who shares it." />
            <Screenshot name="composer-krok3" caption="Step 3: summary and invitations." />
          </ScreenshotRow>
          <Steps
            items={[
              <>
                <strong>What and how much.</strong> The expense name, the amount and the date. Use
                the <em>You got money back (a refund)</em> switch when it is a refund, say the pub
                gave you something back. If you belong to a joint account, this is also where you
                choose whether you paid, or the account did.
              </>,
              <>
                <strong>Who shares it.</strong> By default everyone splits it equally and the app
                shows right away how much that makes per person. Switching to{' '}
                <em>Choose shares</em> lets you leave someone out or give them a bigger share.
              </>,
              <>
                <strong>Review and save.</strong> A summary of the whole expense, a chance to add a
                receipt photo, and the invitation fields. The <strong>Save expense</strong> button
                finishes it.
              </>,
            ]}
          />
          <p>
            A three-part progress bar runs along the top, so you always know where you are. The
            left arrow takes you one step back; <em>Cancel</em> discards the work in progress.
          </p>
        </Section>

        <Section title="On a computer: one dialog" icon={<Monitor size={20} />}>
          <Screenshot
            name="composer-desktop"
            caption="The same fields as on a phone, just stacked in one dialog."
          />
          <p>
            On a wider screen the steps do not hide. Name, amount and date at the top, payer and
            receipts in the middle, the split and invitations at the bottom. It saves with the
            button in the bottom right.
          </p>
        </Section>

        <Section title="Three ways to split" icon={<Scale size={20} />}>
          <p>
            <strong>Everyone splits equally</strong> is the default and the most common: the amount
            is spread evenly across all participants of the chata.
          </p>
          <ScreenshotRow>
            <Screenshot
              name="deleni-podily"
              caption="Shares: plus and minus next to each name. Two shares mean double."
            />
            <Screenshot
              name="deleni-castky"
              caption="Exact amounts: whatever you leave blank, the app calculates and marks."
            />
          </ScreenshotRow>
          <List
            items={[
              <>
                <strong>Shares</strong> come in handy when someone consumed more. Unticking the
                checkbox removes a person from the expense entirely.
              </>,
              <>
                <strong>Exact amounts</strong> are for when you have an itemized receipt. Fill in
                what you know; the rest is spread evenly among the others and marked{' '}
                <em>auto-filled</em>.
              </>,
              <>
                The total is checked continuously at the bottom. As long as it matches the full
                amount, <em>Left to split: CZK 0</em> lights up and the expense can be saved.
              </>,
            ]}
          />
        </Section>

        <Section title="Receipts" icon={<Camera size={20} />}>
          <p>
            You can attach any number of photos or PDFs to an expense. On a phone the button opens
            the camera directly; on a computer you drag files into the marked box.
          </p>
          <List
            items={[
              <>Photos are shrunk right in the browser before uploading, so it does not take forever.</>,
              <>On the expense card they then appear as small thumbnails that open full screen.</>,
              <>You can remove an attached receipt at any time with the cross.</>,
            ]}
          />
        </Section>

        <Section title="Planned expense: not paid yet" icon={<Clock size={20} />}>
          <p>
            The <em>Not paid yet</em> switch right below the amount says the expense is still ahead
            of you. The chata is booked, but it gets paid on arrival. In the journal such a card has
            a dashed amber border and a <em>Planned</em> tag, and the totals keep it apart, so it
            stays clear what has already happened and what is still coming.
          </p>
          <List
            items={[
              <>
                Once the money really leaves, tap <strong>Paid now</strong> on the card. The expense
                summary opens, where you can still correct the amount to what it really was and add
                the receipt.
              </>,
              <>
                The date moves to today, the day it was paid. You can always set it back by hand.
              </>,
              <>
                There is no way back. Once an expense is paid, editing no longer offers the switch,
                so nobody can drop it back among the plans by accident. If you get it wrong, delete
                the expense and add it again.
              </>,
              <>
                Other people&apos;s planned expenses, the chata admin&apos;s for instance, cannot be
                switched. Those stay with their author.
              </>,
            ]}
          />
        </Section>

        <Section title="Invitations: I am paying for someone else" icon={<HeartHandshake size={20} />}>
          <p>
            An invitation means someone else takes over a person&apos;s share. It is set in the
            last step with two dropdowns: who invites, and whom.
          </p>
          <List
            items={[
              <>
                The pink <em>Automatic</em> bar appears when you have a standing arrangement to pay
                for someone, typically a child. That one is added by itself; you do not have to
                think about it.
              </>,
              <>One host can invite several people, but each of them only once per expense.</>,
              <>
                A share moves by one step only. If the invited person invites someone themselves,
                their own share travels no further.
              </>,
            ]}
          />
        </Section>

        <Section title="Editing and deleting" icon={<PencilLine size={20} />}>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <Screenshot
              name="vlastni-vydaj"
              caption="You recognize your own expense by the footer with the Edit and Delete links."
            />
            <div className="flex flex-col gap-4 flex-1">
              <p>
                Expenses you recorded carry an <em>Added by you</em> footer in the journal. From
                there the same form opens as when creating one, just with the values filled in.
              </p>
              <List
                items={[
                  <>
                    Deleting asks for confirmation right on the card (&quot;Really delete?&quot;),
                    not in a pop-up window.
                  </>,
                  <>
                    Other people&apos;s expenses cannot be edited. If there is a mistake in one,
                    ask its author or the chata admin.
                  </>,
                  <>
                    The chata of an expense cannot be changed, and the payer can only be your own
                    name or your joint account.
                  </>,
                ]}
              />
            </div>
          </div>
          <Callout>
            The numbers recalculate immediately after saving. A new expense shows up right away in
            the fair share of everyone it concerns, and in their settlement.
          </Callout>
        </Section>

        <NextPage href="/napoveda/ucet" />
      </div>
    </HelpShell>
  )
}

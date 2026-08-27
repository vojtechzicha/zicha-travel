// English content. A translation of content.cs.tsx — same structure, same
// screenshots (which show the Czech UI). Quoted admin-panel labels (Name,
// Slug, Paid By, ...) are the actual English labels of the admin UI.

import { Crown, Settings, ShieldCheck, UserCog, UserPlus, Vote, Wallet } from 'lucide-react'
import { Callout, HelpShell, List, PageCards, Screenshot, Section, Steps } from '../ui'

export default function SpravaContentEn() {
  return (
    <HelpShell
      title="For chata admins"
      lead="The admin panel is a separate area at /admin. An admin only gets into their own chatas; a superadmin into everything."
    >
      <div className="flex flex-col gap-6">
        <Section title="Creating a chata and setting it up" icon={<Settings size={20} />}>
          <p className="text-sm text-gray-500">
            The screenshots in this guide show the interface in Czech (the admin panel itself is in
            English); the layout is the same either way.
          </p>
          <Screenshot
            name="admin-chata"
            caption="The chata form. Only a superadmin may create and delete chatas; the assigned admin then edits the content."
          />
          <List
            items={[
              <>
                <strong>Name, Short Name, Location</strong>: the name in the header, the short form
                used in QR payments, and the place.
              </>,
              <>
                <strong>Slug</strong>: the part of the address the chata runs on.
              </>,
              <>
                <strong>Domains</strong>: a dedicated address, say <code>lipno.zicha.travel</code>.
                Visitors then land straight on this chata and cannot reach any other through it.
              </>,
              <>
                The checkboxes further down the form decide whether Information and Organization
                appear in the app. Whatever you leave empty is not shown.
              </>,
              <>
                The chata&apos;s colour and background are set in the same form and change the look
                of the whole site.
              </>,
            ]}
          />
        </Section>

        <Section title="Planning phase and voting" icon={<Vote size={20} />}>
          <p>
            Until the trip is booked, a chata can run as a poll: people vote on the page for the
            dates they can make and the cottages they like, and by voting they add themselves as
            participants.
          </p>
          <List
            items={[
              <>
                Tick <strong>Planning phase (voting) is on</strong> in the chata form and write
                the intro text. The public page then shows only the planning view.
              </>,
              <>
                The candidate dates and cottages live in the <strong>Planning</strong> admin
                group. A cottage can be limited to some of the dates; an empty field means it
                works for all of them.
              </>,
              <>
                Results are visible only to the chata&apos;s signed-in participants and its
                admins. Once the group decides, untick the box and set the real dates. The
                voters already exist as participants.
              </>,
            ]}
          />
          <p>
            <strong>A vote for someone who doesn&apos;t use the web</strong> (say they told you
            on the phone) can be entered by hand:
          </p>
          <Steps
            items={[
              <>
                Create them as a participant: <strong>Participants</strong>, a name and the
                chata are enough, no account needed.
              </>,
              <>
                In <strong>Planning → Planning votes</strong> create a new vote, pick the
                participant and save. That fills in the chata and reveals the date and place
                fields.
              </>,
              <>
                Tick what works for them and save again. The vote counts right away and the
                name shows up under &ldquo;Who&apos;s in&rdquo;.
              </>,
            ]}
          />
          <Callout>
            Each participant has at most one vote. If they change their mind, edit their
            existing vote instead of creating a second one.
          </Callout>
        </Section>

        <Section title="Participants" icon={<UserPlus size={20} />}>
          <p>
            People repeat between trips, so they can be copied over, banking details included.
            Things tied to one trip, like a room or a car, are never copied.
          </p>
          <Steps
            items={[
              <>
                In the chata form, use <strong>Prefill participants from previous chatas</strong>,
                pick people from past trips and confirm. Names already present in the chata are
                skipped.
              </>,
              <>
                Individuals can also be created by hand. A new participant has a{' '}
                <strong>Copy from</strong> button that prefills the name, the declension forms and
                the banking details from someone in another chata.
              </>,
              <>
                Finally, pick the <strong>banker</strong> in the chata. Once chosen, the account
                number and IBAN are prefilled; both can be overwritten. Fill in just one and the
                app derives the other.
              </>,
            ]}
          />
          <Callout>
            Until the chata is saved, the participant dropdowns are empty. So the order is: save
            the chata, add the people, and only then pick the banker and assign the rooms.
          </Callout>
        </Section>

        <Section title="Children and &quot;paid by&quot;" icon={<UserCog size={20} />}>
          <Screenshot
            name="admin-ucastnik"
            caption="On a participant you set the name's declension, who pays for them, and their banking details."
          />
          <List
            items={[
              <>
                <strong>Akuzativ</strong> and <strong>Vokativ</strong> are Czech declension forms
                of the name for sentences like &quot;Vojta zve Katku&quot; (&quot;Vojta invites
                Katka&quot;). Left empty, the base form is used.
              </>,
              <>
                <strong>Paid By</strong> says this person&apos;s shares are permanently taken over
                by someone else. New expenses then account for it automatically.
              </>,
              <>
                The <strong>Apply retroactively to existing expenses</strong> button adds the same
                to expenses the chata already has. Use it after saving the change.
              </>,
              <>
                <strong>Account</strong> links the participant to a sign-in account. The{' '}
                <em>Create account from email</em> button creates the account on the spot. Nothing
                is sent to anyone at that moment.
              </>,
            ]}
          />
        </Section>

        <Section title="Expenses, advances and joint accounts" icon={<Wallet size={20} />}>
          <List
            items={[
              <>
                <strong>Expenses</strong>: what was paid. The payer can be a participant or a joint
                account; the split is either equal or weighted. The invitations field moves a share
                onto a host.
              </>,
              <>
                <strong>Prepayments</strong>: advances, top-ups and returned overpayments between a
                person and the banker. This is where you record that someone sent money.
              </>,
              <>
                <strong>Joint Accounts</strong>: a shared account of two or more people. Whatever
                it pays for is split equally among the members.
              </>,
              <>
                <strong>Expense Attachments</strong>: receipts. Uploaded files are publicly
                reachable by their URL, like all the other content.
              </>,
            ]}
          />
          <Callout tone="warn">
            The app does not watch the bank account. Until you record a received payment as an
            advance or a top-up, the debtor keeps their debt hanging.
          </Callout>
        </Section>

        <Section title="Link requests" icon={<ShieldCheck size={20} />}>
          <p>
            When someone taps &quot;Is that you?&quot;, you get an email with a link to a decision
            page. The link is valid for seven days and belongs to you alone.
          </p>
          <Screenshot
            name="claim-rozhodnuti"
            caption="The decision page: who is claiming, which name, and whether other requests are waiting."
          />
          <List
            items={[
              <>
                <strong>Yes, approve</strong> links the account to the name and automatically
                rejects any rival requests.
              </>,
              <>
                <strong>Reject with this reason</strong> requires writing one. It is sent to the
                requester so they know where they stand.
              </>,
              <>
                If a request is forgotten, a single reminder arrives after three days. You can also
                decide in the admin panel under <em>Claim Requests</em>.
              </>,
              <>
                People the app already knows from another chata are linked automatically and no
                email comes to you.
              </>,
            ]}
          />
        </Section>

        <Section title="Superadmin" icon={<Crown size={20} />}>
          <List
            items={[
              <>Creates and deletes chatas and assigns admins to them.</>,
              <>Manages accounts and roles. Only they can change a role.</>,
              <>Takes care of icons, backgrounds and media.</>,
              <>
                Signs in exclusively through Microsoft, Google or Apple. If they request a link
                by email, an
                explanation arrives instead.
              </>,
            ]}
          />
          <p>
            A chata admin sees only their own chatas&apos; documents in the admin panel. Their
            session lasts two hours; a regular account&apos;s, 30 days.
          </p>
        </Section>

        <Section title="Other help pages" icon={<Settings size={20} />}>
          <PageCards exclude="/napoveda/sprava" />
        </Section>
      </div>
    </HelpShell>
  )
}

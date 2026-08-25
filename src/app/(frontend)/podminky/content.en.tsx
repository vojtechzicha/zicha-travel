// English content of /podminky: the terms of use, transcribed from
// docs/legal/terms-of-use.en.md (effective 2026-08-16). Edit wording
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

export default function TermsContentEn() {
  return (
    <HelpShell
      isHub
      icon={<ScrollText size={44} className="text-primary-light" />}
      title="Terms of use"
      lead="zicha.travel · Effective from 16 August 2026"
    >
      <div className="flex flex-col gap-6">
        <Section
          id="sluzba"
          title="1. What zicha.travel is and who runs it"
          icon={<Info size={20} />}
        >
          <p>
            zicha.travel is a private web app for groups of friends and families: it helps
            organize a shared trip to a chata and split the shared expenses fairly. It is run by
            Vojtěch Zicha,{' '}
            <a href="mailto:mail@vojtechzicha.com" className={link}>
              mail@vojtechzicha.com
            </a>{' '}
            (&ldquo;we&rdquo;).
          </p>
          <p>
            The service is free and non-commercial. You pay nothing, we sell no advertising and
            we sell no data. We run it in our spare time for a closed circle of people; the
            scope of warranties in section 9 matches that.
          </p>
          <p>
            These terms are a contract between you and us. By using the service (and, for an
            account, by creating one) you accept them. Personal data processing is described in
            the separate{' '}
            <a href="/soukromi" className={link}>
              privacy policy
            </a>
            ; these terms build on it.
          </p>
        </Section>

        <Section id="pojmy" title="2. Definitions" icon={<BookOpen size={20} />}>
          <p>
            A <strong>chata</strong> is one trip or event with its own page, participants and
            settlement. A <strong>participant</strong> is a person entered on a trip; they need
            not have an account. A <strong>user</strong> is a person with an account. A{' '}
            <strong>chata admin</strong> is a user with admin access to their chata. The{' '}
            <strong>banker</strong> is the participant through whom the group&rsquo;s money
            flows.
          </p>
        </Section>

        <Section id="prohlizeni" title="3. Browsing without signing in" icon={<Eye size={20} />}>
          <p>
            Chata pages are available to anyone who knows their address; what exactly is visible
            without signing in is described in{' '}
            <a href="/soukromi#viditelnost" className={link}>
              section 6 of the privacy policy
            </a>
            . Even without an account, the rules apply:
          </p>
          <List
            items={[
              <>
                the data you see on the pages is personal data of real people in the group. Use
                it only in connection with the trip; copying it, publishing it elsewhere or
                scraping it is prohibited,
              </>,
              <>
                you must not try to bypass access restrictions, guess the addresses of other
                people&rsquo;s chatas, or probe what extra the API might return,
              </>,
              <>share a chata&rsquo;s address only within the group.</>,
            ]}
          />
        </Section>

        <Section id="ucty" title="4. Accounts" icon={<KeyRound size={20} />}>
          <p>
            An account is created for you by a chata admin, through &ldquo;That&rsquo;s
            me&rdquo; (a claim request linking you to a participant name), through &ldquo;I&rsquo;m
            new here&rdquo;, or by voting while a trip is being planned. Sign-in uses a
            one-time link sent by email, or Microsoft, Google or
            Apple; there is no password with us, so protect your mailbox: whoever controls it
            controls your account.
          </p>
          <p>
            An account is personal and only an adult may hold one. In a claim request, state
            only your own identity; claiming somebody else&rsquo;s name is a breach of these
            terms.
          </p>
          <p>
            You can cancel your account at any time by emailing us. We may cancel or suspend an
            account for a breach of these terms, after 2 years of inactivity (see the retention
            periods in the privacy policy), or if the service shuts down.
          </p>
        </Section>

        <Section
          id="uzivatele"
          title="5. Rules for signed-in users"
          icon={<Receipt size={20} />}
        >
          <p>
            A signed-in user can enter their chata&rsquo;s expenses, edit and delete their own,
            upload receipts, and confirm or reject expenses somebody recorded on their behalf.
            The rules:
          </p>
          <List
            items={[
              <>
                enter only real expenses with real amounts; the whole group&rsquo;s settlement
                depends on the numbers being right,
              </>,
              <>
                record an expense &ldquo;paid by somebody else&rdquo; only when it really
                happened; the person concerned has to confirm it, and a false entry is a breach
                of these terms,
              </>,
              <>
                upload only receipts for shared expenses. Do not upload documents with sensitive
                items (medication, health services) or files you have no rights to,
              </>,
              <>by confirming an expense you affirm it matches what happened.</>,
            ]}
          />
          <p>
            Content you upload remains yours. You give us a licence to store it and show it to
            the chata&rsquo;s members, because the service cannot work otherwise; the licence
            lasts until you delete the content or its retention period runs out.
          </p>
        </Section>

        <Section id="spravci" title="6. Rules for chata admins" icon={<UserCog size={20} />}>
          <p>
            A chata admin enters other people&rsquo;s data, so on top of the ordinary rules they
            have these duties:
          </p>
          <List
            items={[
              <>
                enter only people who are actually going on the trip or signing up for it, and
                only the data the trip needs,
              </>,
              <>
                when you enter a participant, send them a link to the{' '}
                <a href="/soukromi" className={link}>
                  privacy policy
                </a>{' '}
                (a message in the group chat is enough). The policy counts on this step; without
                it the participant has no way of learning they are in the system,
              </>,
              <>enter children&rsquo;s data only with a parent&rsquo;s agreement,</>,
              <>
                when a participant asks you to correct or delete their data, do it or pass the
                request to us,
              </>,
              <>
                do not copy participants&rsquo; bank details or the &ldquo;Keys and
                Wi-Fi&rdquo; section anywhere else,
              </>,
              <>
                when handling personal data you act under our instructions and the privacy
                policy; the admin role does not entitle you to use the data for anything beyond
                organizing the trip.
              </>,
            ]}
          />
          <p>Breaching these duties is grounds for removing the admin role.</p>
        </Section>

        <Section
          id="vyuctovani"
          title="7. The settlement is an aid, not an arbiter"
          icon={<Calculator size={20} />}
        >
          <p>
            The settlement is plain arithmetic over the entered shares. We do not guarantee that
            the entered amounts match reality; that is the group&rsquo;s business. Who sends
            whom how much is an agreement between participants; we are not a party to those
            payments, we hold no money, and money disputes are for the group to settle. The
            settlement is neither a tax document nor financial advice. Differences within 1 CZK
            count as settled.
          </p>
        </Section>

        <Section
          id="dostupnost"
          title="8. Availability and changes to the service"
          icon={<Wrench size={20} />}
        >
          <p>
            The service runs with no availability guarantee; there may be outages and downtime.
            We may change, add or remove features. If we were shutting the service down, or
            removing a feature that would take your data with it, we would announce it in
            advance on the site and by email to users, so you have time to request your data
            (under the privacy policy you can ask for a copy at any time).
          </p>
        </Section>

        <Section id="odpovednost" title="9. Liability" icon={<ShieldAlert size={20} />}>
          <p>
            The service is provided as is, free of charge and without warranty. To the extent
            Czech law allows, we are not liable for damage arising from use of the service, in
            particular damage from wrongly entered data, from other participants&rsquo; conduct
            or from an outage. This does not affect liability that cannot be excluded by law
            (harm caused intentionally or by gross negligence, harm to a person&rsquo;s natural
            rights, Section 2898 of the Czech Civil Code).
          </p>
          <p>
            You are responsible for the content you enter and for not violating other
            people&rsquo;s rights with it.
          </p>
        </Section>

        <Section id="ukonceni" title="10. Termination" icon={<LogOut size={20} />}>
          <p>
            You can stop using the service at any time. Account cancellation and data deletion
            follow the{' '}
            <a href="/soukromi" className={link}>
              privacy policy
            </a>{' '}
            (its sections 9 and 10). Provisions that by their nature should survive (the licence
            for already displayed settlements, liability, governing law) survive termination.
          </p>
        </Section>

        <Section id="zmeny" title="11. Changes to these terms" icon={<History size={20} />}>
          <p>
            We may change these terms, for example when a feature is added or the law requires
            it. We publish the new version on the site with its effective date; we announce
            substantial changes to users in advance, by email or on the site. If you do not
            agree with the new version, you can cancel your account; continued use after the
            effective date means acceptance.
          </p>
        </Section>

        <Section id="pravo" title="12. Governing law" icon={<Landmark size={20} />}>
          <p>
            These terms are governed by Czech law. Disputes are decided by Czech courts. If you
            are a consumer, nothing in these terms reduces the rights the law gives you;
            out-of-court resolution of consumer disputes is handled by the Czech Trade
            Inspection Authority (
            <a
              href="https://www.coi.cz"
              target="_blank"
              rel="noopener noreferrer"
              className={link}
            >
              www.coi.cz
            </a>
            ). If any provision is invalid, the rest of the terms remain in force.
          </p>
        </Section>

        <Section id="kontakt" title="13. Contact" icon={<Mail size={20} />}>
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

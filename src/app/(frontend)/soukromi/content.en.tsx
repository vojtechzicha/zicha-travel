// English content of /soukromi: the full privacy policy, transcribed from
// docs/legal/privacy-policy.en.md (version 2, effective 2026-08-25; the
// version history section tracks the changes). Edit wording
// there first, then mirror it here; page.tsx only picks a locale. The one
// interactive element is the consent button in section 12.

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

export default function PrivacyContentEn() {
  return (
    <HelpShell
      isHub
      icon={<ShieldCheck size={44} className="text-primary-light" />}
      title="Privacy policy"
      lead="zicha.travel · Effective from 25 August 2026 (version 2)"
    >
      <div className="flex flex-col gap-6">
        <Section id="spravce" title="1. Who the controller is" icon={<UserCog size={20} />}>
          <p>
            The controller of your personal data is Vojtěch Zicha (&ldquo;we&rdquo;). For
            anything concerning your data, write to{' '}
            <a href="mailto:mail@vojtechzicha.com" className={link}>
              mail@vojtechzicha.com
            </a>
            . We reply within one month at the latest.
          </p>
          <p>
            Chata admins (the people who set up trips in the admin panel and enter participants)
            process data under our instructions and under this policy. They are not separate
            controllers; the responsibility towards you is ours.
          </p>
        </Section>

        <Section
          id="sluzba"
          title="2. What the service is and whose data we process"
          icon={<Users size={20} />}
        >
          <p>
            zicha.travel is a private, free app for groups of friends and families who travel to
            chatas together and want to split shared expenses fairly. It is not a public
            service: a chata is created by its admin, who enters the participants personally.
            The planning phase is the one exception: while the group is voting on the date and
            the place, you can join the trip yourself through the vote form.
          </p>
          <p>We process data about four groups of people:</p>
          <List
            items={[
              <>
                <strong>trip participants</strong>, entered into the system by a chata admin.
                Most of them have no account, and many did not know about the entry until the
                admin told them. That is what section 5 is for,
              </>,
              <>
                <strong>signed-in users</strong>, people with an account (participants who had
                an account created for them, who claimed their name through &ldquo;That&rsquo;s
                me&rdquo;, or who joined by voting while the trip was being planned),
              </>,
              <>
                <strong>chata admins</strong> and site administrators,
              </>,
              <>
                <strong>visitors</strong> to the pages, including anonymous ones.
              </>,
            ]}
          />
        </Section>

        <Section id="udaje" title="3. What data we process" icon={<Database size={20} />}>
          <p>
            <strong>About participants:</strong> name and its Czech grammatical forms, email (if
            the chata admin entered one), bank account number or IBAN for settlement, whether
            they bring a pet, the &ldquo;someone else pays for them&rdquo; link (typically a
            parent paying for a child), room and bed assignment, seat in a car or on public
            transport, expense shares, advances and refunds, joint account membership, and the
            resulting settlement (who owes whom how much). When the trip was put to a vote,
            this also includes the vote: which dates work for the participant and which places
            they like.
          </p>
          <p>
            <strong>About signed-in users, in addition:</strong> the account email, last login
            time, and, when you sign in with Microsoft, Google or Apple, the identifier and
            email from your account with that provider; the expenses you entered; and claim
            requests linking you to a
            participant name, including a rejection reason where one was given.
          </p>
          <p>
            <strong>Receipts:</strong> a photo or PDF of a receipt can be attached to an
            expense. A receipt may incidentally contain other data (purchased items, part of a
            card number, a shop address). Upload only receipts for shared expenses; documents
            with health-related or otherwise sensitive items do not belong here.
          </p>
          <p>
            <strong>About visitors:</strong> technical request records (IP address in the
            hosting provider&rsquo;s operational logs), the cookies described in section 11 and
            the anonymous statistics described in section 12. On public forms (sign-in, claim
            request), Cloudflare Turnstile processes browser signals to keep bots out.
          </p>
          <p>
            We do not intentionally process any special categories of data (health, beliefs and
            so on), and we do not want them on receipts either.
          </p>
        </Section>

        <Section
          id="zaklad"
          title="4. Why we process data and on what legal basis"
          icon={<Scale size={20} />}
        >
          <p>
            <strong>Shared trip accounting.</strong> We process names, expense shares, advances,
            bank details and settlements so that the group can split costs fairly and send each
            other money. For participants without an account the basis is our legitimate
            interest, and the whole group&rsquo;s, in a working shared settlement (Art. 6(1)(f)
            GDPR). You can object to this processing (section 10).
          </p>
          <p>
            <strong>Trip organization.</strong> Bed, car and transport assignments, the program
            and the packing list rest on the same legitimate interest: making the trip happen.
          </p>
          <p>
            <strong>Running your account.</strong> For signed-in users the basis is performance
            of a contract, namely the{' '}
            <a href="/podminky" className={link}>
              terms of use
            </a>{' '}
            (Art. 6(1)(b) GDPR): without your email we cannot send you a login link, and without
            a record of your expenses the rule that you can edit your own does not work.
          </p>
          <p>
            <strong>Emails.</strong> We send operational messages only: login links,
            confirmations of a trip planning vote, decisions on claim requests, and requests to
            confirm an expense somebody recorded on your behalf. No marketing.
          </p>
          <p>
            <strong>Statistics.</strong> Anonymous usage measurement rests on our legitimate
            interest in knowing whether the site works. Statistics cookies are stored only with
            your consent (Section 89(3) of Czech Act No. 127/2005 Coll.), see section 12.
          </p>
          <p>
            <strong>Protecting the service.</strong> Operational logs and bot protection on
            public forms rest on our legitimate interest in keeping the service secure.
          </p>
        </Section>

        <Section id="zdroj" title="5. Where the data comes from" icon={<Inbox size={20} />}>
          <p>
            Most participant data is not entered by you but by your chata&rsquo;s admin, who
            knows you and organizes the trip. Under Art. 14 GDPR you have the right to be told
            about this. We handle it as follows: the{' '}
            <a href="/podminky" className={link}>
              terms of use
            </a>{' '}
            oblige the chata admin to send you a link to this policy when entering you
            (typically in the group chat), and the policy is linked in the footer of every page.
            If you believe somebody entered you wrongly, write to us and we will look into the
            record.
          </p>
          <p>
            Data about signed-in users, and about participants who joined by voting while the
            trip was being planned, comes from those people themselves, or from their
            Microsoft, Google or Apple account when they sign in with one of them.
          </p>
        </Section>

        <Section id="viditelnost" title="6. Who can see your data" icon={<Eye size={20} />}>
          <p>
            A chata&rsquo;s page is available to anyone who knows its address. We expect the
            group to share the address among themselves; the pages are not secret, though.
            Search engines get only part of it: the homepage and the trip&rsquo;s basic
            information carry no names and may be indexed, while the tabs with names and
            finances (Organization, Participants, Finance, Overview) are marked so that search
            engines do not index them.
          </p>
          <p>
            Without signing in, a visitor with the link can see: the trip&rsquo;s name and
            dates, participant names, the program, bed and car assignments, expenses and their
            amounts, advances, the resulting settlement (who sends whom how much) and the
            banker&rsquo;s payment details, so that paying by QR code works. The finance detail
            of a participant whose account has already been used to sign in is not shown to
            anonymous visitors: signing in once is therefore how you hide your own breakdown and
            balance. Your name stays with the trip either way.
          </p>
          <p>
            Without signing in, a visitor can never see: anyone&rsquo;s bank details except the
            banker&rsquo;s, receipts, email addresses, the &ldquo;Keys and Wi-Fi&rdquo; section,
            expenses waiting for confirmation, private expenses, or planning votes (who joined
            and what suits them); votes are visible only to the chata&rsquo;s signed-in
            participants and its admins. A participant&rsquo;s bank details are visible
            only to that participant (through their account), the signed-in banker and the
            admins of that chata; the banker&rsquo;s bank details are public because the
            anonymous QR settlement cannot work without them (the banker takes that on with the
            role). Receipts are visible to signed-in users only.
          </p>
          <p>
            A private expense (a gift or a surprise) is a stricter exception: only its payer,
            the participants in its split and the site superadmin can see it. Neither the
            chata&rsquo;s admins nor the banker see it unless they are in the split themselves.
            Because such an expense is paid straight to the payer, the members of its split are
            shown the payer&rsquo;s bank details; by creating a private expense the payer
            accepts that.
          </p>
          <p>
            A chata&rsquo;s admins see all of that chata&rsquo;s data. As the operator we have
            access to everything, but we use it only to run the service, provide support and
            honour this policy.
          </p>
        </Section>

        <Section
          id="zpracovatele"
          title="7. Who processes data on our behalf"
          icon={<Building2 size={20} />}
        >
          <p>The service runs on these processors and recipients:</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold">Who</th>
                  <th className="py-2 pr-4 font-semibold">What happens there</th>
                  <th className="py-2 font-semibold">Where</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Supabase</td>
                  <td className="py-2.5 pr-4">database and file storage, including receipts</td>
                  <td className="py-2.5">EU</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Vercel</td>
                  <td className="py-2.5 pr-4">web hosting, operational logs with IP addresses</td>
                  <td className="py-2.5">EU/US</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Resend</td>
                  <td className="py-2.5 pr-4">sending emails (addresses and message content)</td>
                  <td className="py-2.5">US</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">PostHog</td>
                  <td className="py-2.5 pr-4">anonymous usage statistics</td>
                  <td className="py-2.5">EU (Frankfurt)</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Cloudflare</td>
                  <td className="py-2.5 pr-4">bot protection on public forms (Turnstile)</td>
                  <td className="py-2.5">EU/US</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Microsoft</td>
                  <td className="py-2.5 pr-4">Microsoft sign-in, if you use it</td>
                  <td className="py-2.5">EU/US</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Google</td>
                  <td className="py-2.5 pr-4">Google sign-in, if you use it</td>
                  <td className="py-2.5">EU/US</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Apple</td>
                  <td className="py-2.5 pr-4">Apple sign-in, if you use it</td>
                  <td className="py-2.5">EU/US</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4">Paylibo</td>
                  <td className="py-2.5 pr-4">
                    generating the settlement payment QR code: the recipient&rsquo;s account
                    number, amount and payment message, plus the IP address and browser of
                    anyone who views the QR
                  </td>
                  <td className="py-2.5">EU (CZ)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            In addition, when the trip&rsquo;s weather forecast is shown, your browser fetches
            data from Open-Meteo (which learns your IP address; none of your data is sent to
            it). Links to Google Calendar and Google Maps are opened by you; until then, nothing
            goes to Google.
          </p>
          <p>We do not sell data to anyone and pass it to no one for advertising.</p>
        </Section>

        <Section id="mimo-eu" title="8. Transfers outside the EU" icon={<Globe size={20} />}>
          <p>
            We keep data in the EU where we can (database, files, statistics). Some providers
            (Vercel, Resend, Cloudflare, Microsoft, Google, Apple) are US companies; the
            transfer is covered by
            the European Commission&rsquo;s adequacy decision (the Data Privacy Framework) or by
            standard contractual clauses. We will send you the details for a specific provider
            on request.
          </p>
        </Section>

        <Section id="uchovani" title="9. How long we keep data" icon={<Hourglass size={20} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold">Data</th>
                  <th className="py-2 font-semibold">How long</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">
                    the trip record (names, program, expenses, advances, settlement)
                  </td>
                  <td className="py-2.5">
                    for as long as the service runs, as the group&rsquo;s shared archive
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">participants&rsquo; bank details</td>
                  <td className="py-2.5">deleted within 12 months of the trip being settled</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">receipts</td>
                  <td className="py-2.5">deleted within 12 months of the trip being settled</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">an account with no login for 2 years</td>
                  <td className="py-2.5">deleted, including its links</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">claim requests, including rejection reasons</td>
                  <td className="py-2.5">deleted within 12 months of the decision</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">planning votes</td>
                  <td className="py-2.5">part of the trip record, for as long as the service runs</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">
                    pending planning votes (name, selection, the account meant to confirm it)
                  </td>
                  <td className="py-2.5">
                    deleted within 12 months of confirmation, and within 12 months of the trip
                    being settled at the latest
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">login links (tokens)</td>
                  <td className="py-2.5">valid for 15 minutes, then void</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">planning vote confirmation link</td>
                  <td className="py-2.5">
                    valid for 7 days; the vote itself does not lapse, it is saved on any sign-in
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">raw statistics events</td>
                  <td className="py-2.5">12 months, then only aggregate numbers</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4">hosting operational logs</td>
                  <td className="py-2.5">short-term, per the provider&rsquo;s settings</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Deleting an account or bank details does not change the computed settlement: amounts
            and shares stay, just without the data that is no longer needed.
          </p>
        </Section>

        <Section id="prava" title="10. Your rights" icon={<Gavel size={20} />}>
          <p>
            You have the right of access to your data (and a copy of it), to rectification, to
            erasure, to restriction of processing, to data portability, and the right to object
            to processing based on legitimate interest. None of this requires an account: a
            participant entered by a chata admin can simply write to{' '}
            <a href="mailto:mail@vojtechzicha.com" className={link}>
              mail@vojtechzicha.com
            </a>{' '}
            and we will handle the request within a month at the latest. We will verify your
            identity so we do not hand your data to somebody else.
          </p>
          <p>
            Erasure has one limit: a trip is the whole group&rsquo;s shared financial record. We
            can remove or anonymize your name and contact details, but paid amounts and shares
            have to stay in the totals, otherwise everyone else&rsquo;s settlement would stop
            adding up. We will tell you exactly what we deleted.
          </p>
          <p>
            Deleted data may survive for a limited time in database backups; we cannot delete
            individual records from backups, but backups overwrite themselves.
          </p>
          <p>
            If you believe we handle your data badly, you can complain to the Czech Office for
            Personal Data Protection (Úřad pro ochranu osobních údajů), Pplk. Sochora 27, 170 00
            Praha 7,{' '}
            <a
              href="https://www.uoou.gov.cz"
              target="_blank"
              rel="noopener noreferrer"
              className={link}
            >
              www.uoou.gov.cz
            </a>
            . We would appreciate you writing to us first.
          </p>
        </Section>

        <Section
          id="cookies"
          title="11. Cookies and other browser data"
          icon={<Cookie size={20} />}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold">Cookie</th>
                  <th className="py-2 pr-4 font-semibold">Purpose</th>
                  <th className="py-2 pr-4 font-semibold">Lifetime</th>
                  <th className="py-2 font-semibold">Consent</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">payload-token</td>
                  <td className="py-2.5 pr-4">keeps you signed in</td>
                  <td className="py-2.5 pr-4">30 days (2 h for admins)</td>
                  <td className="py-2.5">necessary for sign-in</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">zt_consent</td>
                  <td className="py-2.5 pr-4">remembers your choice in the consent bar</td>
                  <td className="py-2.5 pr-4">12 months</td>
                  <td className="py-2.5">necessary, it is itself the record of consent</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">NEXT_LOCALE</td>
                  <td className="py-2.5 pr-4">remembers the chosen language</td>
                  <td className="py-2.5 pr-4">12 months</td>
                  <td className="py-2.5">necessary, stored after your choice in the footer</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">oauth-state</td>
                  <td className="py-2.5 pr-4">
                    random security code protecting Microsoft, Google and Apple sign-in
                    against forgery
                  </td>
                  <td className="py-2.5 pr-4">10 minutes</td>
                  <td className="py-2.5">necessary</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">oauth-return-to</td>
                  <td className="py-2.5 pr-4">
                    holds the return address during Microsoft, Google or Apple sign-in
                  </td>
                  <td className="py-2.5 pr-4">10 minutes, only while signing in</td>
                  <td className="py-2.5">necessary</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">oauth-vote-intent</td>
                  <td className="py-2.5 pr-4">
                    holds your planning vote (name, dates, cottages) during a Microsoft, Google
                    or Apple sign-in started from the vote form
                  </td>
                  <td className="py-2.5 pr-4">10 minutes, only while signing in</td>
                  <td className="py-2.5">necessary</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">zt_login_evt</td>
                  <td className="py-2.5 pr-4">
                    one-shot &ldquo;sign-in happened&rdquo; marker for statistics, deleted
                    immediately
                  </td>
                  <td className="py-2.5 pr-4">seconds</td>
                  <td className="py-2.5">necessary, technical</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-[13px]">ph_*</td>
                  <td className="py-2.5 pr-4">
                    stable anonymous visitor identifier for statistics
                  </td>
                  <td className="py-2.5 pr-4">12 months</td>
                  <td className="py-2.5">
                    <strong>only with your consent</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            The sign-in, language and consent cookies cover the whole site including individual
            chata addresses (e.g.{' '}
            <span className="font-mono text-[13px]">lipno.zicha.travel</span>), so one decision
            applies everywhere and the bar does not ask again on every address.
          </p>
          <p>
            Besides cookies, the page keeps a few small things in your browser&rsquo;s storage
            (localStorage). They stay on your device, are never sent to the server, and are
            written only after you make a choice, so they need no consent:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold">Key</th>
                  <th className="py-2 font-semibold">Purpose</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">zt_theme</td>
                  <td className="py-2.5">your dark or light mode choice</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">chata-overview-mode</td>
                  <td className="py-2.5">your chosen overview layout (table or cards)</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-[13px]">
                    chata-selected-participant-*
                  </td>
                  <td className="py-2.5">
                    whose finances you last had open on a given chata, so the tab reopens the
                    same way
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            With statistics consent, PostHog stores its anonymous identifier in localStorage as
            well as the cookie (keys <span className="font-mono text-[13px]">ph_*</span>);
            withdrawing consent deletes both. The Turnstile widget on public forms may keep its
            own technical data, needed to tell people from bots, inside its frame on the
            Cloudflare domain.
          </p>
        </Section>

        <Section id="mereni" title="12. Usage statistics" icon={<BarChart3 size={20} />}>
          <p>
            We care about one thing: whether the site works and whether the things we build help
            anyone. We collect anonymous statistics: page and tab visits, feature usage (someone
            opened the overview or a QR code) and technical errors (that something failed to
            save, never what).
          </p>
          <p>
            Without cookie consent this uses a pseudonymous identifier that changes every day;
            it cannot tell us who you are or connect two visits on different days. If you allow
            cookies, your browser gets a stable anonymous identifier that also shows us where an
            unfinished action got stuck. We still do not know who you are.
          </p>
          <p>
            We never send names, emails, account numbers, amounts, form content or whose
            finances you are viewing; participant identifiers are stripped from addresses before
            sending. Statistics are never joined to your account; even signed-in people appear
            only as an anonymous visitor with a coarse role (visitor, participant, admin).
            Nothing is measured in the admin panel or on preview deployments.
          </p>
          <p>
            You can withdraw or grant consent at any time with the &ldquo;Privacy
            settings&rdquo; button in the footer of every page. Withdrawing deletes the
            statistics cookies.
          </p>
          {analyticsEnabled() ? (
            <PrivacySettingsLink
              className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[15px]
                         font-semibold text-white bg-primary hover:bg-primary-dark transition-colors"
            >
              <SlidersHorizontal size={16} />
              Open privacy settings
            </PrivacySettingsLink>
          ) : (
            <Callout>Analytics is not switched on right now, so there is nothing to set.</Callout>
          )}
        </Section>

        <Section id="deti" title="13. Children" icon={<Baby size={20} />}>
          <p>
            Children come along on trips, so the system knows their name, bed, seat in a car and
            share of expenses. This data is entered by a parent, or by the chata admin with the
            parent&rsquo;s agreement. We do not create accounts for children; only adults may
            hold an account. Bank details are not filled in for children; a parent pays for
            them.
          </p>
        </Section>

        <Section id="zabezpeceni" title="14. Security" icon={<Lock size={20} />}>
          <p>
            Data travels encrypted (HTTPS), the admin panel is open only to admins with their
            own sign-in and a short session (2 hours), bank details and receipts are not
            publicly readable, and public forms are protected against bots and by rate limiting.
            We do not write personal data into application logs. The database and files sit with
            the providers listed in section 7 and are protected by access keys.
          </p>
          <p>
            If, despite all this, a data breach occurred that poses a risk to you, we would
            report it to the Office for Personal Data Protection within 72 hours and inform you
            directly if the risk is high.
          </p>
        </Section>

        <Section
          id="ai"
          title="15. Automated decision-making and artificial intelligence"
          icon={<Bot size={20} />}
        >
          <p>
            The service uses no artificial intelligence system within the meaning of Regulation
            (EU) 2024/1689 (the AI Act). There is no automated decision-making or profiling
            within the meaning of Art. 22 GDPR: the settlement is plain arithmetic over the
            entered shares, and the same rules apply to everyone. If we ever add an AI feature
            (say, reading receipts), we will update this policy first, so you will know before
            the feature turns on.
          </p>
        </Section>

        <Section id="zmeny" title="16. Changes to this policy" icon={<History size={20} />}>
          <p>
            When the policy changes, we publish the new version with its effective date on this
            page; section 18 shows what changed between versions. We will announce substantial
            changes (a new data recipient, a new purpose, a changed retention period) on the
            site as well, and email the people affected when the processing expands
            substantially.
          </p>
        </Section>

        <Section id="kontakt" title="17. Contact" icon={<Mail size={20} />}>
          <p>
            Vojtěch Zicha,{' '}
            <a href="mailto:mail@vojtechzicha.com" className={link}>
              mail@vojtechzicha.com
            </a>
            .
          </p>
        </Section>

        <Section id="historie" title="18. Version history" icon={<FileClock size={20} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold">Version</th>
                  <th className="py-2 pr-4 font-semibold">Effective</th>
                  <th className="py-2 font-semibold">What changed</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">4</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">30 August 2026</td>
                  <td className="py-2.5">
                    Pending planning votes: a vote cast without signing in waits for confirmation
                    as its own record and is saved on any sign-in; the confirmation email, the{' '}
                    <span className="font-mono text-[13px]">oauth-vote-intent</span> cookie and
                    additions to sections 4, 9 and 12.
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">3</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">27 August 2026</td>
                  <td className="py-2.5">
                    Private expenses: a new expense type visible only to its members, additions
                    to section 6 including showing the payer&rsquo;s bank details to the members
                    of its split.
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">2</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">25 August 2026</td>
                  <td className="py-2.5">
                    Trip planning phase: the date and accommodation vote as a new data category,
                    the option to join a trip through the vote form, and the related additions
                    to sections 2, 3, 5, 6 and 9.
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4">1</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">16 August 2026</td>
                  <td className="py-2.5">First published version.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>We will send the full text of an older version on request.</p>
        </Section>
      </div>
    </HelpShell>
  )
}

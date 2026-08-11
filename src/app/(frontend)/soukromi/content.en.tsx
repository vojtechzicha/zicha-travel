// English content of the privacy page. A translation of content.cs.tsx —
// same structure, idiomatic English. The legal references (GDPR, the Czech
// Electronic Communications Act) stay the same provisions.

import { BarChart3, Cookie, EyeOff, Mail, Scale, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { analyticsEnabled } from '@/lib/consent'
import { Callout, HelpShell, List, Section } from '../napoveda/ui'
import { PrivacySettingsLink } from '../components/PrivacySettingsLink'

export default function PrivacyContentEn() {
  return (
    <HelpShell
      isHub
      icon={<ShieldCheck size={44} className="text-primary-light" />}
      title="Privacy"
      lead="What we measure on this site, what we never measure, and how you can change your decision at any time."
    >
      <div className="flex flex-col gap-6">
        <Section id="mereni" title="What we measure" icon={<BarChart3 size={20} />}>
          <p>
            We care about one thing only: whether the site works and whether the things we build on
            it actually help anyone. For that we always collect{' '}
            <strong>anonymous statistics</strong>, even without cookies:
          </p>
          <List
            items={[
              <>visits to individual pages and tabs (how many people, from which kind of device),</>,
              <>feature usage, e.g. that someone opened the overview, expanded a cost breakdown or
                displayed a payment QR code,</>,
              <>technical errors (that something failed to save, never what).</>,
            ]}
          />
          <p>
            Without cookies this relies on a pseudonymous identifier that changes every day. It
            cannot tell who you are, nor connect two of your visits on different days.
          </p>
          <p>
            If you <strong>allow cookies</strong> in the banner, your browser gets a stable
            anonymous identifier. With it we can also see when an action in progress (signing in,
            adding an expense) was not finished and where it got stuck, and fix it. We still do
            not know who you are.
          </p>
        </Section>

        <Section id="nemerime" title="What we never measure" icon={<EyeOff size={20} />}>
          <List
            items={[
              <>
                <strong>no names, emails or phone numbers,</strong>
              </>,
              <>
                <strong>no account numbers or IBANs,</strong>
              </>,
              <>
                <strong>no amounts in crowns</strong>: who owes whom how much is the most
                sensitive thing here and has no place in statistics,
              </>,
              <>whose finances you are viewing in particular (participant identifiers are stripped
                from page addresses before anything is sent),</>,
              <>page content, or anything you type into forms,</>,
              <>nothing from the admin panel (/admin) and nothing from preview versions of the site.</>,
            ]}
          />
          <Callout>
            Statistics are never connected to your account. Even when you are signed in, you appear
            in them only as an anonymous visitor with a coarse role (visitor / participant /
            admin).
          </Callout>
        </Section>

        <Section id="cookies" title="Which cookies we use" icon={<Cookie size={20} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold">Cookie</th>
                  <th className="py-2 pr-4 font-semibold">What it does</th>
                  <th className="py-2 pr-4 font-semibold">Lifetime</th>
                  <th className="py-2 font-semibold">Consent</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">zt_consent</td>
                  <td className="py-2.5 pr-4">remembers your answer in the consent banner</td>
                  <td className="py-2.5 pr-4">12 months</td>
                  <td className="py-2.5">necessary; it is itself the record of your consent</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">ph_*</td>
                  <td className="py-2.5 pr-4">a stable anonymous visitor identifier for
                    statistics</td>
                  <td className="py-2.5 pr-4">12 months</td>
                  <td className="py-2.5">
                    <strong>only with your consent</strong>
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">payload-token</td>
                  <td className="py-2.5 pr-4">keeps you signed in</td>
                  <td className="py-2.5 pr-4">30 days (2 h for admins)</td>
                  <td className="py-2.5">necessary for signing in</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-[13px]">NEXT_LOCALE</td>
                  <td className="py-2.5 pr-4">remembers your language choice (Czech/English)</td>
                  <td className="py-2.5 pr-4">12 months</td>
                  <td className="py-2.5">necessary; stored only after you pick a language in the footer</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            One decision applies to the whole site, including the addresses of individual chatas
            (e.g. <span className="font-mono text-[13px]">lipno.zicha.travel</span>). We do not
            ask on each one separately.
          </p>
        </Section>

        <Section id="zpracovani" title="Who processes the data, and for how long" icon={<Scale size={20} />}>
          <List
            items={[
              <>
                Statistics are processed for us by <strong>PostHog</strong> (PostHog EU, Frankfurt
                data centre, EU); the data never leaves the European Union.
              </>,
              <>We keep raw events for at most 12 months; after that, only aggregate numbers remain.</>,
              <>
                Legal basis: we process anonymous statistics on the grounds of legitimate interest
                (Art. 6(1)(f) GDPR), namely knowing whether the site works. Cookies are stored only
                with your consent (Section 89(3) of Czech Act No. 127/2005 Coll.).
              </>,
              <>We never sell or pass the statistics to anyone; they serve the site operator only.</>,
            ]}
          />
        </Section>

        <Section id="volba" title="Changing your decision" icon={<SlidersHorizontal size={20} />}>
          <p>
            You can withdraw your consent at any time (or grant it), just as easily as you gave
            it. Withdrawing it also deletes the statistics cookies.
          </p>
          {analyticsEnabled() ? (
            <>
              <PrivacySettingsLink
                className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[15px]
                           font-semibold text-white bg-primary hover:bg-primary-dark transition-colors"
              >
                <SlidersHorizontal size={16} />
                Open privacy settings
              </PrivacySettingsLink>
              <p>
                The same button (&quot;Privacy settings&quot;) lives permanently in the footer of
                every page.
              </p>
            </>
          ) : (
            <Callout>Analytics is not switched on right now, so there is nothing to set.</Callout>
          )}
        </Section>

        <Section id="kontakt" title="Contact" icon={<Mail size={20} />}>
          <p>
            The site is run by Vojtěch Zicha. For anything concerning your privacy and your data,
            write to{' '}
            <a
              href="mailto:mail@vojtechzicha.com"
              className="text-primary underline underline-offset-2"
            >
              mail@vojtechzicha.com
            </a>
            .
          </p>
        </Section>
      </div>
    </HelpShell>
  )
}

// Czech content of the privacy page required by docs/PRD-analytika.md,
// moved verbatim from page.tsx when the frontend went bilingual. Edit
// wording here; page.tsx only picks a locale.

import { BarChart3, Cookie, EyeOff, Mail, Scale, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { analyticsEnabled } from '@/lib/consent'
import { Callout, HelpShell, List, Section } from '../napoveda/ui'
import { PrivacySettingsLink } from '../components/PrivacySettingsLink'

export default function PrivacyContentCs() {
  return (
    <HelpShell
      isHub
      icon={<ShieldCheck size={44} className="text-primary-light" />}
      title="Soukromí"
      lead="Co na téhle stránce měříme, co nikdy neměříme a jak můžete své rozhodnutí kdykoli změnit."
    >
      <div className="flex flex-col gap-6">
        <Section id="mereni" title="Co měříme" icon={<BarChart3 size={20} />}>
          <p>
            Zajímá nás jediné: jestli stránka funguje a jestli věci, které na ní stavíme, někomu
            pomáhají. K tomu sbíráme <strong>anonymní statistiky</strong> — vždy, i bez cookies:
          </p>
          <List
            items={[
              <>návštěvy jednotlivých stránek a záložek (kolik lidí, ze kterého zařízení),</>,
              <>použití funkcí — např. že si někdo otevřel přehled, rozbalil rozpis nákladů nebo
                zobrazil QR kód k platbě,</>,
              <>technické chyby (že se něco nepodařilo uložit — nikdy ne co).</>,
            ]}
          />
          <p>
            Bez cookies k tomu slouží pseudonymní identifikátor, který se každý den mění — nejde
            z něj poznat, kdo jste, ani propojit dvě vaše návštěvy v různých dnech.
          </p>
          <p>
            Když v liště <strong>povolíte cookies</strong>, dostane váš prohlížeč stabilní
            anonymní identifikátor. Díky němu uvidíme i to, jestli se rozdělaná akce (přihlášení,
            přidání výdaje) nedokončila a kde se zasekla — a budeme to umět spravit. Pořád ale
            nevíme, kdo jste.
          </p>
        </Section>

        <Section id="nemerime" title="Co nikdy neměříme" icon={<EyeOff size={20} />}>
          <List
            items={[
              <>
                <strong>žádná jména, e-maily ani telefonní čísla,</strong>
              </>,
              <>
                <strong>žádná čísla účtů ani IBAN,</strong>
              </>,
              <>
                <strong>žádné částky v korunách</strong> — kdo komu kolik dluží je to
                nejcitlivější, co tu je, a do statistik nepatří,
              </>,
              <>koho konkrétně si v přehledu financí zobrazujete — identifikátory účastníků se
                z adres stránek před odesláním odstraňují,</>,
              <>obsah stránek ani nic z toho, co do formulářů píšete,</>,
              <>nic z administrace (/admin) a nic z náhledových verzí webu.</>,
            ]}
          />
          <Callout>
            Statistiky se nikdy nespojují s vaším účtem. I když jste přihlášení, ve statistikách
            vystupujete jen jako anonymní návštěvník s hrubou rolí (návštěvník / účastník /
            správce).
          </Callout>
        </Section>

        <Section id="cookies" title="Jaké cookies používáme" icon={<Cookie size={20} />}>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold">Cookie</th>
                  <th className="py-2 pr-4 font-semibold">K čemu slouží</th>
                  <th className="py-2 pr-4 font-semibold">Platnost</th>
                  <th className="py-2 font-semibold">Souhlas</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">zt_consent</td>
                  <td className="py-2.5 pr-4">pamatuje si vaši odpověď v liště souhlasu</td>
                  <td className="py-2.5 pr-4">12 měsíců</td>
                  <td className="py-2.5">nutná — je sama záznamem souhlasu</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 font-mono text-[13px]">ph_*</td>
                  <td className="py-2.5 pr-4">stabilní anonymní identifikátor návštěvníka pro
                    statistiky</td>
                  <td className="py-2.5 pr-4">12 měsíců</td>
                  <td className="py-2.5">
                    <strong>jen s vaším souhlasem</strong>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-mono text-[13px]">payload-token</td>
                  <td className="py-2.5 pr-4">drží vaše přihlášení</td>
                  <td className="py-2.5 pr-4">30 dní (2 h pro správce)</td>
                  <td className="py-2.5">nutná pro přihlášení</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Jedno rozhodnutí platí pro celý web včetně adres jednotlivých chat (např.{' '}
            <span className="font-mono text-[13px]">lipno.zicha.travel</span>) — neptáme se na
            každé zvlášť.
          </p>
        </Section>

        <Section id="zpracovani" title="Kdo data zpracovává a jak dlouho" icon={<Scale size={20} />}>
          <List
            items={[
              <>
                Statistiky za nás zpracovává <strong>PostHog</strong> (PostHog EU, datové centrum
                Frankfurt, EU) — data neopouštějí Evropskou unii.
              </>,
              <>Surové události uchováváme nejdéle 12 měsíců; poté zůstávají jen souhrnná čísla.</>,
              <>
                Právní základ: anonymní statistiky zpracováváme na základě oprávněného zájmu
                (čl. 6 odst. 1 písm. f GDPR) — vědět, jestli web funguje. Cookies ukládáme jen
                s vaším souhlasem (§ 89 odst. 3 zákona č. 127/2005 Sb.).
              </>,
              <>Statistiky nikomu neprodáváme ani nepředáváme; slouží jen správci webu.</>,
            ]}
          />
        </Section>

        <Section id="volba" title="Změna rozhodnutí" icon={<SlidersHorizontal size={20} />}>
          <p>
            Souhlas můžete kdykoli odvolat (nebo naopak udělit) — stejně snadno, jako jste ho
            dali. Odvoláním se smažou i statistické cookies.
          </p>
          {analyticsEnabled() ? (
            <>
              <PrivacySettingsLink
                className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[15px]
                           font-semibold text-white bg-primary hover:bg-primary-dark transition-colors"
              >
                <SlidersHorizontal size={16} />
                Otevřít nastavení soukromí
              </PrivacySettingsLink>
              <p>
                Stejné tlačítko („Nastavení soukromí“) najdete trvale v patičce každé stránky.
              </p>
            </>
          ) : (
            <Callout>Měření návštěvnosti teď není zapnuté, takže není co nastavovat.</Callout>
          )}
        </Section>

        <Section id="kontakt" title="Kontakt" icon={<Mail size={20} />}>
          <p>
            Web provozuje Vojtěch Zicha. S čímkoli ohledně soukromí a vašich dat se ozvěte na{' '}
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

# Privacy policy

zicha.travel

Effective from: 25 August 2026 (version 2)

## 1. Who the controller is

The controller of your personal data is Vojtěch Zicha ("we"). For anything
concerning your data, write to
[mail@vojtechzicha.com](mailto:mail@vojtechzicha.com). We reply within one
month at the latest.

Chata admins (the people who set up trips in the admin panel and enter
participants) process data under our instructions and under this policy.
They are not separate controllers; the responsibility towards you is ours.

## 2. What the service is and whose data we process

zicha.travel is a private, free app for groups of friends and families who
travel to chatas together and want to split shared expenses fairly. It is
not a public service: a chata is created by its admin, who enters the
participants personally. The planning phase is the one exception: while the
group is voting on the date and the place, you can join the trip yourself
through the vote form.

We process data about four groups of people:

- **trip participants**, entered into the system by a chata admin. Most of
  them have no account, and many did not know about the entry until the
  admin told them. That is what section 5 is for,
- **signed-in users**, people with an account (participants who had an
  account created for them, who claimed their name through "That's me", or
  who joined by voting while the trip was being planned),
- **chata admins** and site administrators,
- **visitors** to the pages, including anonymous ones.

## 3. What data we process

**About participants:** name and its Czech grammatical forms, email (if the
chata admin entered one), bank account number or IBAN for settlement,
whether they bring a pet, the "someone else pays for them" link (typically a
parent paying for a child), room and bed assignment, seat in a car or on
public transport, expense shares, advances and refunds, joint account
membership, and the resulting settlement (who owes whom how much). When the
trip was put to a vote, this also includes the vote: which dates work for
the participant and which places they like.

**About signed-in users, in addition:** the account email, last login time,
and, when you sign in with Microsoft, Google or Apple, the identifier and
email from your account with that provider; the expenses you entered; and claim requests linking you
to a participant name, including a rejection reason where one was given.

**Receipts:** a photo or PDF of a receipt can be attached to an expense. A
receipt may incidentally contain other data (purchased items, part of a card
number, a shop address). Upload only receipts for shared expenses; documents
with health-related or otherwise sensitive items do not belong here.

**About visitors:** technical request records (IP address in the hosting
provider's operational logs), the cookies described in section 11 and the
anonymous statistics described in section 12. On public forms (sign-in,
claim request), Cloudflare Turnstile processes browser signals to keep bots
out.

We do not intentionally process any special categories of data (health,
beliefs and so on), and we do not want them on receipts either.

## 4. Why we process data and on what legal basis

**Shared trip accounting.** We process names, expense shares, advances, bank
details and settlements so that the group can split costs fairly and send
each other money. For participants without an account the basis is our
legitimate interest, and the whole group's, in a working shared settlement
(Art. 6(1)(f) GDPR). You can object to this processing (section 10).

**Trip organization.** Bed, car and transport assignments, the program and
the packing list rest on the same legitimate interest: making the trip
happen.

**Running your account.** For signed-in users the basis is performance of a
contract, namely the terms of use (Art. 6(1)(b) GDPR): without your email we
cannot send you a login link, and without a record of your expenses the rule
that you can edit your own does not work.

**Emails.** We send operational messages only: login links, decisions on
claim requests, and requests to confirm an expense somebody recorded on your
behalf. No marketing.

**Statistics.** Anonymous usage measurement rests on our legitimate interest
in knowing whether the site works. Statistics cookies are stored only with
your consent (Section 89(3) of Czech Act No. 127/2005 Coll.), see
section 12.

**Protecting the service.** Operational logs and bot protection on public
forms rest on our legitimate interest in keeping the service secure.

## 5. Where the data comes from

Most participant data is not entered by you but by your chata's admin, who
knows you and organizes the trip. Under Art. 14 GDPR you have the right to
be told about this. We handle it as follows: the terms of use oblige the
chata admin to send you a link to this policy when entering you (typically
in the group chat), and the policy is linked in the footer of every page. If
you believe somebody entered you wrongly, write to us and we will look into
the record.

Data about signed-in users, and about participants who joined by voting
while the trip was being planned, comes from those people themselves, or
from their Microsoft, Google or Apple account when they sign in with one of
them.

## 6. Who can see your data

A chata's page is available to anyone who knows its address. We expect the
group to share the address among themselves; the pages are not secret,
though. Search engines get only part of it: the homepage and the trip's
basic information carry no names and may be indexed, while the tabs with
names and finances (Organization, Participants, Finance, Overview) are
marked so that search engines do not index them.

Without signing in, a visitor with the link can see: the trip's name and
dates, participant names, the program, bed and car assignments, expenses
and their amounts, advances, the resulting settlement (who sends whom how
much) and the banker's payment details, so that paying by QR code works.
The finance detail of a participant whose account has already been used
to sign in is not shown to anonymous visitors: signing in once is
therefore how you hide your own breakdown and balance. Your name stays
with the trip either way.

Without signing in, a visitor can never see: anyone's bank details except
the banker's, receipts, email addresses, the "Keys and Wi-Fi" section,
expenses waiting for confirmation, private expenses, or planning votes
(who joined and what suits them); votes are visible only to the chata's
signed-in participants and its admins. A participant's bank details are
visible only to that participant (through their account), the signed-in
banker and the admins of that chata; the banker's bank details are public
because the anonymous QR settlement cannot work without them (the banker
takes that on with the role). Receipts are visible to signed-in users
only.

A private expense (a gift or a surprise) is a stricter exception: only its
payer, the participants in its split and the site superadmin can see it.
Neither the chata's admins nor the banker see it unless they are in the
split themselves. Because such an expense is paid straight to the payer,
the members of its split are shown the payer's bank details; by creating a
private expense the payer accepts that.

A chata's admins see all of that chata's data. As the operator we have
access to everything, but we use it only to run the service, provide
support and honour this policy.

## 7. Who processes data on our behalf

The service runs on these processors and recipients:

| Who | What happens there | Where |
| --- | --- | --- |
| Supabase | database and file storage, including receipts | EU |
| Vercel | web hosting, operational logs with IP addresses | EU/US |
| Resend | sending emails (addresses and message content) | US |
| PostHog | anonymous usage statistics | EU (Frankfurt) |
| Cloudflare | bot protection on public forms (Turnstile) | EU/US |
| Microsoft | Microsoft sign-in, if you use it | EU/US |
| Google | Google sign-in, if you use it | EU/US |
| Apple | Apple sign-in, if you use it | EU/US |
| Paylibo | generating the settlement payment QR code: the recipient's account number, amount and payment message, plus the IP address and browser of anyone who views the QR | EU (CZ) |

In addition, when the trip's weather forecast is shown, your browser fetches
data from Open-Meteo (which learns your IP address; none of your data is
sent to it). Links to Google Calendar and Google Maps are opened by you;
until then, nothing goes to Google.

We do not sell data to anyone and pass it to no one for advertising.

## 8. Transfers outside the EU

We keep data in the EU where we can (database, files, statistics). Some
providers (Vercel, Resend, Cloudflare, Microsoft, Google, Apple) are US
companies; the
transfer is covered by the European Commission's adequacy decision (the
Data Privacy Framework) or by standard contractual clauses. We will send
you the details for a specific provider on request.

## 9. How long we keep data

| Data | How long |
| --- | --- |
| the trip record (names, program, expenses, advances, settlement) | for as long as the service runs, as the group's shared archive |
| participants' bank details | deleted within 12 months of the trip being settled |
| receipts | deleted within 12 months of the trip being settled |
| an account with no login for 2 years | deleted, including its links |
| claim requests, including rejection reasons | deleted within 12 months of the decision |
| planning votes | part of the trip record, for as long as the service runs |
| login links (tokens) | valid for 15 minutes, then void |
| raw statistics events | 12 months, then only aggregate numbers |
| hosting operational logs | short-term, per the provider's settings |

Deleting an account or bank details does not change the computed settlement:
amounts and shares stay, just without the data that is no longer needed.

## 10. Your rights

You have the right of access to your data (and a copy of it), to
rectification, to erasure, to restriction of processing, to data
portability, and the right to object to processing based on legitimate
interest. None of this requires an account: a participant entered by a
chata admin can simply write to
[mail@vojtechzicha.com](mailto:mail@vojtechzicha.com) and we will handle the
request within a month at the latest. We will verify your identity so we do
not hand your data to somebody else.

Erasure has one limit: a trip is the whole group's shared financial record.
We can remove or anonymize your name and contact details, but paid amounts
and shares have to stay in the totals, otherwise everyone else's settlement
would stop adding up. We will tell you exactly what we deleted.

Deleted data may survive for a limited time in database backups; we cannot
delete individual records from backups, but backups overwrite themselves.

If you believe we handle your data badly, you can complain to the Czech
Office for Personal Data Protection (Úřad pro ochranu osobních údajů),
Pplk. Sochora 27, 170 00 Praha 7,
[www.uoou.gov.cz](https://www.uoou.gov.cz). We would appreciate you writing
to us first.

## 11. Cookies and other browser data

| Cookie | Purpose | Lifetime | Consent |
| --- | --- | --- | --- |
| `payload-token` | keeps you signed in | 30 days (2 h for admins) | necessary for sign-in |
| `zt_consent` | remembers your choice in the consent bar | 12 months | necessary, it is itself the record of consent |
| `NEXT_LOCALE` | remembers the chosen language | 12 months | necessary, stored after your choice in the footer |
| `oauth-state` | random security code protecting Microsoft, Google and Apple sign-in against forgery | 10 minutes | necessary |
| `oauth-return-to` | holds the return address during Microsoft, Google or Apple sign-in | 10 minutes, only while signing in | necessary |
| `zt_login_evt` | one-shot "sign-in happened" marker for statistics, deleted immediately | seconds | necessary, technical |
| `ph_*` | stable anonymous visitor identifier for statistics | 12 months | only with your consent |

The sign-in, language and consent cookies cover the whole site including
individual chata addresses (e.g. `lipno.zicha.travel`), so one decision
applies everywhere and the bar does not ask again on every address.

Besides cookies, the page keeps a few small things in your browser's
storage (localStorage). They stay on your device, are never sent to the
server, and are written only after you make a choice, so they need no
consent:

| Key | Purpose |
| --- | --- |
| `zt_theme` | your dark or light mode choice |
| `chata-overview-mode` | your chosen overview layout (table or cards) |
| `chata-selected-participant-*` | whose finances you last had open on a given chata, so the tab reopens the same way |

With statistics consent, PostHog stores its anonymous identifier in
localStorage as well as the cookie (keys `ph_*`); withdrawing consent
deletes both. The Turnstile widget on public forms may keep its own
technical data, needed to tell people from bots, inside its frame on the
Cloudflare domain.

## 12. Usage statistics

We care about one thing: whether the site works and whether the things we
build help anyone. We collect anonymous statistics: page and tab visits,
feature usage (someone opened the overview or a QR code) and technical
errors (that something failed to save, never what).

Without cookie consent this uses a pseudonymous identifier that changes
every day; it cannot tell us who you are or connect two visits on different
days. If you allow cookies, your browser gets a stable anonymous identifier
that also shows us where an unfinished action got stuck. We still do not
know who you are.

We never send names, emails, account numbers, amounts, form content or
whose finances you are viewing; participant identifiers are stripped from
addresses before sending. Statistics are never joined to your account; even
signed-in people appear only as an anonymous visitor with a coarse role
(visitor, participant, admin). Nothing is measured in the admin panel or on
preview deployments.

You can withdraw or grant consent at any time with the "Privacy settings"
button in the footer of every page. Withdrawing deletes the statistics
cookies.

## 13. Children

Children come along on trips, so the system knows their name, bed, seat in a
car and share of expenses. This data is entered by a parent, or by the chata
admin with the parent's agreement. We do not create accounts for children;
only adults may hold an account. Bank details are not filled in for
children; a parent pays for them.

## 14. Security

Data travels encrypted (HTTPS), the admin panel is open only to admins with
their own sign-in and a short session (2 hours), bank details and receipts
are not publicly readable, and public forms are protected against bots and
by rate limiting. We do not write personal data into application logs. The
database and files sit with the providers listed in section 7 and are
protected by access keys.

If, despite all this, a data breach occurred that poses a risk to you, we
would report it to the Office for Personal Data Protection within 72 hours
and inform you directly if the risk is high.

## 15. Automated decision-making and artificial intelligence

The service uses no artificial intelligence system within the meaning of
Regulation (EU) 2024/1689 (the AI Act). There is no automated
decision-making or profiling within the meaning of Art. 22 GDPR: the
settlement is plain arithmetic over the entered shares, and the same rules
apply to everyone. If we ever add an AI feature (say, reading receipts), we
will update this policy first, so you will know before the feature turns
on.

## 16. Changes to this policy

When the policy changes, we publish the new version with its effective date
on this page; section 18 shows what changed between versions. We will
announce substantial changes (a new data recipient, a new purpose, a
changed retention period) on the site as well, and email the people
affected when the processing expands substantially.

## 17. Contact

Vojtěch Zicha,
[mail@vojtechzicha.com](mailto:mail@vojtechzicha.com).

## 18. Version history

| Version | Effective | What changed |
| --- | --- | --- |
| 3 | 27 August 2026 | Private expenses: a new expense type visible only to its members, additions to section 6 including showing the payer's bank details to the members of its split. |
| 2 | 25 August 2026 | Trip planning phase: the date and accommodation vote as a new data category, the option to join a trip through the vote form, and the related additions to sections 2, 3, 5, 6 and 9. |
| 1 | 16 August 2026 | First published version. |

We will send the full text of an older version on request.

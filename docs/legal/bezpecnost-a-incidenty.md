# Bezpečnost a postup při incidentu

Datum: 2026-08-16. Pokrývá položky 11 a 13–15 z `compliance-gaps.md`.

## Opatření (čl. 32 baseline)

- HTTPS všude; bezpečnostní hlavičky + CSP v `next.config.mjs` (HSTS,
  nosniff, referrer policy, frame ancestors, povolené vnější cíle jen
  Turnstile, Open-Meteo, S3 úložiště).
- Přístupová kontrola na API: bankovní údaje jen vlastník/pokladník/
  správci (field access), účtenky jen přihlášení, e-maily nikdy anonymně,
  GraphQL playground v produkci zavřený.
- RLS na všech tabulkách v `public` (Supabase Data API nic nevydá).
- Administrace jen pro role správců, session 2 h; superadmin jen přes
  Microsoft.
- Rate limiting + Turnstile na veřejných POST formulářích; cooldown na
  opakované přihlašovací e-maily.
- Žádné osobní údaje v aplikačních lozích (blocker 4); ladicí logy
  middleware jen s `DEBUG_MIDDLEWARE`.
- Retenční cron denně (`/api/retention`).

## Zálohy (k ověření správcem)

Zálohy databáze dělá Supabase. **Ověřit v dashboardu a doplnit sem:**
- [ ] typ záloh (denní / PITR) a doba uchování,
- [ ] šifrování at rest (Supabase standardně ano),
- [ ] soulad se zásadami kap. 10 („zálohy se samy přepisují") — pokud by
      zálohy žily déle než retenční lhůty, upravit zásady nebo nastavení.

## Ukradené přihlášení (přijaté riziko, položka 15)

`payload-token` je JWT, které nejde před vypršením odvolat; „odhlásit
všude" neexistuje. Dopad omezuje: 2h platnost pro správcovské role,
30 dní jen pro role user (která nic nespravuje), cookie HttpOnly +
Secure, žádná hesla (převzetí schránky je řešeno u poskytovatele
schránky). Riziko přijato; kdyby se objevil zneužitý token, okamžitá
rotace `PAYLOAD_SECRET` zneplatní všechny sessiony najednou.

## Postup při porušení zabezpečení (čl. 33–34)

1. **Kdo:** posuzuje a rozhoduje Vojtěch Zicha (správce). Nikdo jiný
   rozhodovací roli nemá.
2. **Hned:** zastavit únik (rotace `PAYLOAD_SECRET`, klíčů S3/DB v
   Supabase a Vercel, případně vypnout deployment), zapsat čas zjištění a
   co je známo.
3. **Do 72 hodin od zjištění:** posoudit riziko pro subjekty. Pokud
   porušení znamená riziko, ohlásit ÚOOÚ (https://uoou.gov.cz, datová
   schránka qkbaa2n) — obsah dle čl. 33 odst. 3: povaha, kategorie a
   počty, kontakt, důsledky, opatření.
4. **Vysoké riziko** (unikla bankovní spojení, e-maily s vazbami, účtenky):
   informovat přímo dotčené osoby e-mailem, prostou řečí, s tím, co mají
   udělat.
5. **Vždy:** zapsat incident (co, kdy, dopad, opatření) do tohoto adresáře
   — evidence podle čl. 33 odst. 5 se vede i pro neohlášené incidenty.

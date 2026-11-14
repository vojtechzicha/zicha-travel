# Bezpečnost a postup při incidentu

Datum: 2026-08-16. Pokrývá položky 11 a 13–15 z `compliance-gaps.md`.

## Opatření (čl. 32 baseline)

- HTTPS všude; bezpečnostní hlavičky + CSP v `next.config.mjs` (HSTS,
  nosniff, referrer policy, frame ancestors, povolené vnější cíle jen
  Turnstile, Open-Meteo, S3 úložiště).
- Přístupová kontrola na API: bankovní údaje jen vlastník/pokladník/
  správci (field access), účtenky jen přihlášení, e-maily nikdy anonymně,
  GraphQL playground v produkci zavřený.
- RLS na všech tabulkách v `public`; Supabase Data API je navíc vypnuté
  a role `anon`/`authenticated` nemají v `public` žádná práva.
- Aplikace se k databázi připojuje jako role `zicha_travel_app` (vlastník
  tabulek v `public`, bez přístupu ke schématům `auth`, `storage`,
  `vault`), ne jako `postgres`. Spojení jen přes TLS (vynucené na straně
  Supabase, certifikát ověřený proti kořenové CA Supabase).
- Preview nasazení má vlastní Supabase projekt s anonymizovanou kopií dat
  (stejné úpravy jako `pnpm migrate-from-prod`, bez účtenek a bez tokenů
  Rohlíku), vlastním úložištěm a vlastním `PAYLOAD_SECRET`.
- Administrace jen pro role správců, session 2 h; superadmin jen přes
  OAuth (Microsoft, Google nebo Apple).
- Rate limiting + Turnstile na veřejných POST formulářích; cooldown na
  opakované přihlašovací e-maily.
- Žádné osobní údaje v aplikačních lozích (blocker 4); ladicí logy
  middleware jen s `DEBUG_MIDDLEWARE`.
- Retenční cron denně (`/api/retention`).
- Konektor Claude (`/api/mcp`, docs/MCP.md): OAuth 2.1 s PKCE, přesměrování
  jen na adresy Claude a loopback, tokeny jen jako SHA-256 otisky,
  přístupový token 1 h, obnovovací 60 dní s rotací a odhalením znovupoužití
  (celé připojení se zruší), vázání tokenu na origin (produkční nefunguje
  na preview). Nástroje volají stejné API jako web, přihlášené jako daný
  účet, takže platí tytéž kontroly přístupu; každý zápis jde do
  `mcp-audit`.

## Zálohy

Ověřeno 2026-11-01. Projekt je na plánu Free, který žádné použitelné
zálohy nenabízí (žádné denní zálohy ke stažení, PITR vypnuté). Zálohy
proto dělá správce sám:
- [x] **typ a doba uchování:** každou noc (02:30) úloha na vlastním NAS
      správce (Synology v ČR) uloží `pg_dump` schématu `public` produkce i
      preview a kopii jejich úložiště souborů; uchovává se 30 dní, starší
      noci úloha maže. Sdílená složka se zálohami má navíc vlastní
      snapshoty NAS, jejichž dobu uchování je třeba držet v souladu
      s tímto limitem.
- [x] **šifrování at rest:** u Supabase standardně ano; zálohy na NAS
      leží na disku správce, přístup jen správce.
- [x] **soulad se zásadami kap. 10:** zálohy se po 30 dnech samy
      přepisují, takže smazaná data v nich přežijí jen omezenou dobu, jak
      zásady slibují. Jednorázová úplná záloha před úpravami
      (2026-11-01, včetně účtenek) leží v OneDrive správce a smaže se,
      až noční zálohy běží spolehlivě.

NAS ani OneDrive správce nejsou zpracovatelé třetí strany: jde
o vlastní úložiště správce, proto nejsou v tabulce příjemců.

## Ukradené přihlášení (přijaté riziko, položka 15)

`payload-token` je JWT, které nejde před vypršením odvolat; „odhlásit
všude" neexistuje. Dopad omezuje: 2h platnost pro správcovské role,
1 rok (s obnovou při použití, kvůli instalované aplikaci) jen pro role
user (která nic nespravuje), cookie HttpOnly +
Secure, žádná hesla (převzetí schránky je řešeno u poskytovatele
schránky). Riziko přijato; kdyby se objevil zneužitý token, okamžitá
rotace `PAYLOAD_SECRET` zneplatní všechny sessiony najednou.

Tokeny konektoru Claude nejsou JWT, ale náhodné řetězce uložené jako
otisky, takže **rotace `PAYLOAD_SECRET` je neruší**. Odvolat jde každé
připojení zvlášť (stránka `/claude`, nebo smazáním řádku v kolekci
„Propojení s Claude" v administraci). Přijaté riziko: připojení správce
nebo superadministrátora platí až 60 dní od posledního použití, ačkoli
jeho session v administraci jen 2 hodiny. Konektor ale nabízí jen
operace webu (žádnou práci administrace) a obnovovací token se při
každém použití mění.

## Postup při porušení zabezpečení (čl. 33–34)

1. **Kdo:** posuzuje a rozhoduje Vojtěch Zicha (správce). Nikdo jiný
   rozhodovací roli nemá.
2. **Hned:** zastavit únik (rotace `PAYLOAD_SECRET`, klíčů S3/DB v
   Supabase a Vercel, případně vypnout deployment; při podezření na únik
   tokenů konektoru Claude odvolat všechna připojení:
   `UPDATE mcp_grants SET revoked_at = now(); DELETE FROM mcp_tokens;`),
   zapsat čas zjištění a co je známo.
3. **Do 72 hodin od zjištění:** posoudit riziko pro subjekty. Pokud
   porušení znamená riziko, ohlásit ÚOOÚ (https://uoou.gov.cz, datová
   schránka qkbaa2n) — obsah dle čl. 33 odst. 3: povaha, kategorie a
   počty, kontakt, důsledky, opatření.
4. **Vysoké riziko** (unikla bankovní spojení, e-maily s vazbami, účtenky):
   informovat přímo dotčené osoby e-mailem, prostou řečí, s tím, co mají
   udělat.
5. **Vždy:** zapsat incident (co, kdy, dopad, opatření) do tohoto adresáře
   — evidence podle čl. 33 odst. 5 se vede i pro neohlášené incidenty.

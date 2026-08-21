# Záznamy o činnostech zpracování (čl. 30 GDPR)

Správce: Vojtěch Zicha, mail@vojtechzicha.com (jediný správce, rozhodnutí 1
v `compliance-gaps.md`). Výjimka pro malé organizace se nepoužije:
zpracování není příležitostné a zahrnuje finanční údaje.

Poslední revize: 2026-08-16. Pravidlo údržby: každá nová kategorie údajů,
nový příjemce nebo nový účel se propíše sem, do zásad (`/soukromi`) a do
inventáře (`inventar-odchozich-volani.md`) ve stejném PR.

## 1. Společné vyúčtování a organizace výletu

- **Subjekty:** účastníci výletů (i bez účtu), včetně dětí (zapisuje rodič
  nebo správce chaty se souhlasem rodiče).
- **Údaje:** jméno + skloňované tvary, bankovní spojení, zvíře, „platí za
  něj", postel/auto/spoj, podíly, zálohy, vyrovnání; účtenky k výdajům.
- **Účel:** férové rozdělení nákladů a organizace výletu.
- **Základ:** oprávněný zájem (čl. 6 odst. 1 písm. f) — balanční test v
  `balancni-test.md`.
- **Příjemci:** Supabase (DB + soubory), Vercel (hosting), Paylibo (údaje
  platebního QR), viz `zpracovatele-a-predavani.md`.
- **Výmaz:** bankovní spojení a účtenky 12 měsíců po „Vyúčtováno dne"
  (retenční cron `/api/retention`); záznam výletu po dobu provozu služby
  jako archiv party; anonymizace na žádost (tlačítko v administraci).

## 2. Uživatelské účty a přihlašování

- **Subjekty:** uživatelé s účtem, správci.
- **Údaje:** e-mail, zobrazované jméno, role, čas posledního přihlášení,
  hash přihlašovacího tokenu (15 min), Microsoft identifikátor při OAuth;
  žádosti o propojení včetně důvodu zamítnutí; žádosti subjektů údajů
  (kolekce Data Requests).
- **Účel:** vedení účtu, přihlášení, propojení účastníků, doložení
  vyřízení žádostí.
- **Základ:** plnění smlouvy (podmínky užití); u evidence žádostí právní
  povinnost/oprávněný zájem na doložitelnosti.
- **Příjemci:** Supabase, Vercel, Resend (e-maily), Microsoft (vlastní
  správce svého přihlášení).
- **Výmaz:** účet 2 roky bez přihlášení (cron, včetně vazeb); rozhodnuté
  žádosti o propojení 12 měsíců po rozhodnutí.

## 3. Provoz, bezpečnost a statistiky

- **Subjekty:** návštěvníci webu.
- **Údaje:** IP v provozních lozích hostingu (krátkodobě, u poskytovatele),
  signály Turnstile, anonymní statistiky PostHog (bez identifikace, viz
  zásady kap. 12), IP + prohlížeč u Paylibo při zobrazení QR.
- **Účel:** provoz, ochrana před roboty, vědět jestli web funguje.
- **Základ:** oprávněný zájem; statistické cookies jen se souhlasem.
- **Výmaz:** surové události 12 měsíců (PostHog), logy dle poskytovatele.

## 4. Vývojová kopie dat (interní pravidlo)

`pnpm migrate-from-prod` kopíruje produkční databázi na vývojový stroj.
Výchozí režim je **anonymizovaný** (jména, e-maily, bankovní spojení,
tokeny, texty žádostí, hodnoty „Klíče a Wi-Fi" a poznámky ke schválení
výdaje se po obnově přepíší; účtenky se nestahují). Výjimka: účty s rolí
superadmin si ponechávají skutečný e-mail a jméno — patří vývojáři, který
skript spouští, a přepsaný e-mail by ho odřízl od lokální administrace
(OAuth páruje účet podle e-mailu); přihlašovací tokeny se mažou i jim. Režim
`--keep-real-data` je dovolen jen pro ladění chyby, která reálná data
vyžaduje; kopie se po skončení práce maže. Zbytkové riziko: názvy výdajů
a poznámky u záloh mohou obsahovat jména („Oběd za Katku") a anonymizace
je nepřepisuje — přijato, názvy jsou potřeba pro ladění deníku.

## 5. Technická a organizační opatření (odkaz)

HTTPS všude, přístup do administrace jen pro správce (2h session), field
access na bankovní údaje, autentizace u účtenek, RLS na všech tabulkách,
rate limiting + Turnstile na veřejných formulářích, bezpečnostní hlavičky
a CSP, žádné osobní údaje v aplikačních lozích, retenční cron. Podrobněji
`bezpecnost-a-incidenty.md`.

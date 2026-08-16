# Balanční test oprávněného zájmu (účastníci bez účtu)

Datum: 2026-08-16. Souvisí s `compliance-gaps.md` (rozhodnutí 5 a 6,
blockery 1, 3 a 8 — test platí až s nimi, všechny k tomuto datu landed).

## 1. Účel a zájem

Parta přátel a rodin si dělí náklady společného výletu. Zájem správce i
celé party: funkční společné vyúčtování a organizace (kdo spí kde, kdo
jede čím, kdo komu kolik pošle). Většina účastníků si účet nikdy nezaloží
— vyrovnání musí fungovat i pro ně, proto je stránka chaty čitelná s
odkazem i bez přihlášení.

## 2. Nezbytnost

Mírnější cesta byla zvážena a zamítnuta s důvody (PRD-gdpr §13.2,
rozhodnutí 6): stránky jen pro přihlášené by vyloučily právě ty, pro
které se vyrovnání dělá; tajný token v URL se v partě stejně rozešle a
ztratí. Minimalizace je řešena rozsahem: bez přihlášení jsou vidět jen
jména, podíly, vyrovnání a platební údaje pokladníka — nikdy bankovní
spojení ostatních, e-maily ani účtenky (vynuceno na API, blocker 1).

## 3. Zájmy subjektů a záruky

Dotčení jsou členové party, které zapsal jejich vlastní organizátor;
kontext je soukromý a očekávatelný. Rizika: viditelnost jména a zůstatku
komukoli s odkazem; indexace vyhledávači; citlivé položky na účtenkách.

Záruky (kompenzační opatření):

- indexovatelná plocha nenese žádná jména (blocker 3); záložky se jmény a
  financemi mají noindex,
- účtenky, e-maily, cizí bankovní spojení a data držitelů aktivních účtů
  nejsou bez přihlášení dostupná ani přes API (blocker 1),
- čl. 14: správce chaty posílá zapsaným odkaz na zásady (povinnost v
  podmínkách, kopírovatelná zpráva v administraci — blocker 8); zpráva
  říká i to, že jedno přihlášení detail financí schová,
- opt-out: jedno přihlášení skryje rozpis a zůstatek (locked pravidlo,
  vynuceno serverově); námitka podle čl. 21 a anonymizace kdykoli
  e-mailem, s limitem zachování aritmetiky (zásady kap. 10),
- retence: bankovní spojení a účtenky mizí 12 měsíců po vyúčtování.

## 4. Závěr

Zájem trvá, mírnější prostředky by účel zmařily, záruky snižují dopad na
akceptovatelnou míru. Oprávněný zájem podle čl. 6 odst. 1 písm. f) GDPR
obstojí. Revize při každé změně viditelnosti dat nebo po případném
incidentu.

# Provozní runbook ke compliance (položky 13, 16, 22 a 23)

Datum: 2026-08-16.

## Jednorázově po nasazení této práce (checklist správce)

- [ ] Supabase: ověřit **region projektu v EU** (Settings → General);
      pokud ne, opravit zásady kap. 7/8 a `zpracovatele-a-predavani.md`.
- [ ] Supabase: zapsat do `bezpecnost-a-incidenty.md` typ a dobu záloh
      (Settings → Database → Backups) a srovnat se zásadami kap. 10.
- [ ] Supabase Storage: přepnout bucket na **private** — soubory se od
      teď servírují přes `/api/*/file/...` s přístupovou kontrolou; u
      účtenek je to podmínka, aby „nejsou veřejně čitelné" platilo i pro
      přímé URL bucketu. (Média/pozadí mohou zůstat veřejná, pokud je
      bucket společný, ale privátní bucket ničemu nevadí.)
- [ ] Vercel: ověřit, že `CRON_SECRET` je nastavený (retenční cron a
      claim reminder ho vyžadují) a že cron `/api/retention` běží.
- [ ] Spustit `pnpm backgrounds:selfhost` proti produkci (převod starých
      externích pozadí, viz `inventar-odchozich-volani.md`).
- [ ] Projít `zpracovatele-a-predavani.md` a odškrtat DPA.
- [ ] Supabase: zvážit vypnutí Data API (Settings → API) — RLS už ho
      blokuje, vypnutí je belt-and-braces (viz CLAUDE.md).

## Průběžné povinnosti

- **Vyúčtování:** po vyrovnání výletu nastavit na chatě „Vyúčtováno dne"
  — bez toho retenční hodiny nikdy nezačnou běžet.
- **Žádosti subjektů:** každou žádost zapsat do administrace (Systém →
  Žádosti o údaje) a vyřídit do měsíce; export a anonymizace jsou
  tlačítka na formuláři účastníka.
- **Noví účastníci:** poslat jim zprávu z boxu „Dejte vědět, že tu je"
  na formuláři účastníka (čl. 14).

## Sliby, které musí přežít změny (položka 23)

- **Ukončení služby / odebrání funkce s daty:** oznámit předem na webu a
  uživatelům e-mailem, s časem na vyžádání kopie dat (podmínky kap. 8).
- **Změna zásad nebo podmínek:** nová verze s datem účinnosti na webu;
  podstatné změny ohlásit na webu, podstatné rozšíření zpracování
  e-mailem dotčeným (zásady kap. 16, podmínky kap. 11).
- **Přidání AI funkce:** nejdřív aktualizovat zásady (kap. 15) a otevřít
  `dpia.md`; teprve pak zapnout.
- **Náhrada Paylibo lokálním generátorem QR:** po nasazení odstranit
  řádek Paylibo ze zásad kap. 7, z `zpracovatele-a-predavani.md`, z
  inventáře a z CSP.

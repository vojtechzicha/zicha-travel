# Zpracovatelé, příjemci a předávání (položky 16 a 19)

Datum: 2026-08-16. Standardní online DPA poskytovatelů postačují; u
každého je co ověřit — zaškrtnout po kontrole.

| Poskytovatel | Role | Co zpracovává | DPA | Předání mimo EU |
| --- | --- | --- | --- | --- |
| Supabase | zpracovatel | databáze, soubory (účtenky, média) | [ ] DPA přijato (součást podmínek, supabase.com/legal/dpa) | region projektu EU — **[ ] ověřit v dashboardu, že projekt sedí v EU regionu**; jinak přepsat zásady kap. 7/8 |
| Vercel | zpracovatel | hosting, provozní logy s IP | [ ] DPA (vercel.com/legal/dpa) | USA možné — DPF člen, jinak SCC |
| Resend | zpracovatel | odchozí e-maily (adresy, obsah) | [ ] DPA (resend.com/legal/dpa) | USA — DPF/SCC |
| PostHog | zpracovatel | anonymní statistiky | [ ] DPA (posthog.com/handbook/growth/sales/dpa) | EU hosting (Frankfurt) — data neopouštějí EU |
| Cloudflare | zpracovatel | Turnstile signály prohlížeče | [ ] DPA (cloudflare.com/cloudflare-customer-dpa) | USA možné — DPF/SCC |
| Microsoft | samostatný správce | přihlášení Microsoft účtem | — (vlastní podmínky Microsoftu) | dle Microsoftu (DPF) |
| Google | samostatný správce | přihlášení Google účtem | — (vlastní podmínky Googlu) | dle Googlu (DPF) |
| Apple | samostatný správce | přihlášení Apple účtem | — (vlastní podmínky Applu) | dle Applu (DPF) |
| Paylibo | příjemce | číslo účtu příjemce, částka, zpráva, IP + prohlížeč při zobrazení QR | — (veřejné API bez smluvního vztahu; uvedeno v zásadách kap. 7) | ČR/EU |
| Open-Meteo | příjemce | IP prohlížeče při načtení počasí | — (klientské volání, bez našich dat) | EU |
| Google (Fotky) | příjemce | IP prohlížeče přihlášeného návštěvníka při načtení náhledů ze sdíleného alba (`lh3.googleusercontent.com`); server načítá jen veřejnou stránku alba, bez osobních údajů | — (klientské volání, bez našich dat) | dle Googlu (DPF) |

Pravidla:

- Nový poskytovatel = nový řádek zde + v zásadách kap. 7 + v CSP + v
  inventáři, ve stejném PR.
- Paylibo je dočasné (rozhodnutí 10): až bude lokální generátor SPD QR,
  řádek se odstraní ze všech čtyř míst.
- Na vyžádání subjektu se pošlou detaily konkrétního předání (zásady
  kap. 8) — odkazy výše.

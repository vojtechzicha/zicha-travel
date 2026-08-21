# Inventář odchozích volání a úložiště v prohlížeči (položka 21)

Datum: 2026-08-16. **Pravidlo:** nový endpoint, cookie nebo klíč
localStorage = aktualizace tohoto souboru, zásad (`/soukromi` kap. 7 a
11), CSP v `next.config.mjs` a případně `zpracovatele-a-predavani.md` —
ve stejném PR.

## Odchozí volání (server)

| Cíl | Odkud | Co odchází |
| --- | --- | --- |
| Supabase (pooler, S3 API) | server | veškerá data aplikace |
| Resend API | server (`lib/email.ts`) | e-maily |
| Cloudflare `siteverify` | server (`lib/turnstile.ts`) | Turnstile token + IP |
| Microsoft `login.microsoftonline.com` | server + redirect | OAuth výměna |
| Google `accounts.google.com` + `oauth2.googleapis.com` | server + redirect | OAuth výměna |
| Apple `appleid.apple.com` | server + redirect (callback přichází jako POST od Applu) | OAuth výměna |
| PostHog EU | server-side jen přes rewrites `/ingest` | statistické události |

## Odchozí volání (prohlížeč návštěvníka)

| Cíl | Odkud | Co odchází |
| --- | --- | --- |
| `/ingest` (first-party proxy → PostHog EU) | AnalyticsProvider | anonymní události |
| `challenges.cloudflare.com` | TurnstileWidget (login, claim) | signály prohlížeče |
| `api.open-meteo.com` | TripWeather (jen s koordináty + blízkým termínem) | souřadnice, IP |
| `api.paylibo.com` | QRPayment (`<img>`) | účet příjemce, částka, zpráva, IP |
| bucket S3 (presigned PUT) | ExpenseComposer upload | soubor účtenky |
| Google (Kalendář/Mapy) | až po kliknutí na odkaz | obsah odkazu |

Pozadí chat se od blockeru 10 hostují lokálně (fetch-and-store); staré
externí řádky převede `pnpm backgrounds:selfhost`. Admin fonty jsou v
`public/fonts`.

## Cookies

`payload-token` (30 d / 2 h správci), `zt_consent` (12 m),
`NEXT_LOCALE` (12 m), `oauth-state` + `oauth-return-to` (10 min),
`zt_login_evt` (sekundy), `ph_*` (12 m, jen se souhlasem). Detaily a
právní režim: zásady kap. 11.

## localStorage

`zt_theme`, `chata-overview-mode`, `chata-selected-participant-*`,
PostHog `ph_*` (jen se souhlasem).

# DeerAge

**Know before you pull the trigger.**

DeerAge is the live iOS app (`com.vibecode.deerage-qj3cfq`, version 1.0.8) for estimating a buck's age and rack. This repo is the Expo SDK 54 app plus a small Vercel proxy. The phone never holds an OpenAI key.

## Layout

- `mobile/` — Expo app
- `server/` — Vercel proxy (`POST /api/analyze`). See `server/README.md` for deploy steps and environment variable names.
- `eval/` — accuracy harness and `labels.csv`. `node --experimental-strip-types eval/run.ts --dry-run` runs without keys.
- `privacy-policy` — App Store privacy policy

## Mobile

```bash
cd mobile
cp .env.example .env
npm install
npx expo start
```

`.env` needs two public values:

- `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` — RevenueCat Apple public SDK key
- `EXPO_PUBLIC_API_BASE_URL` — proxy origin, no trailing slash

Store builds read the same names from EAS secrets. `eas.json` does not set them. An empty value in `eas.json` would override the secret.

Do not run `eas submit` from this repo until the owner asks. Version 1.0.8, iOS build 14, is for review and TestFlight only when the owner ships it.

## Plans

The paywall reads prices from the RevenueCat **current** offering. It does not hardcode a price.

Intended new products, created later in App Store Connect:

- `season_annual` — Season Pass, $19.99/year, 7-day free trial, entitlement `deerage_pro`
- `deerage_monthly` — Monthly, $4.99/month, entitlement `deerage_pro`

Existing subscribers keep access through `scout`, `hunter`, `trophy`, `outfitter`, or `pro`. Those products (`scout_monthly`, `hunter_monthly`, `trophy_monthly`, `outfitter_monthly` in the `tiers` offering) show under More plans only when the offering still contains them.

Free hunters get 3 lifetime analyses, shared by Quick Check, Age, and Score. The count lives on the RevenueCat subscriber as `deerage_free_uses`. The server checks it. A missing key fails closed.

## Secrets

| Where | Names |
| --- | --- |
| EAS | `EXPO_PUBLIC_REVENUECAT_APPLE_KEY`, `EXPO_PUBLIC_API_BASE_URL` |
| Vercel | `OPENAI_API_KEY`, `REVENUECAT_SECRET_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, optional `OPENAI_MODEL`, `DEERAGE_EVAL_TOKEN`, `MIN_APP_VERSION`, `LATEST_APP_VERSION`, `FAIR_USE_DAILY`, `FAIR_USE_MONTHLY`, `DAILY_SPEND_CAP_USD`, `OPENAI_INPUT_USD_PER_MILLION`, `OPENAI_OUTPUT_USD_PER_MILLION` |

Never commit a filled-in `.env`. The repo stays public.

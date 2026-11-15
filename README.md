# DeerAge

**Know before you pull the trigger.**

DeerAge is the live iOS app (`com.vibecode.deerage-qj3cfq`, version 1.0.9) for estimating a buck's age and rack. This repo is the Expo SDK 54 app plus a small Vercel proxy. The phone never holds an OpenAI key.

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

Do not run `eas submit` from this repo until the owner asks. Version 1.0.9, iOS build 15, is for review and TestFlight only when the owner ships it.

`ITSAppUsesNonExemptEncryption` is `false`. The app uses standard HTTPS only.

### Push key (required before notifications can arrive)

The Apple account does not have an APNs key yet. Do not download a `.p8` into this repo, and do not commit a key id or team id.

At the next iOS build, let EAS create the key:

```bash
cd mobile
eas build --platform ios --profile production
```

When EAS asks to set up push notifications, accept **Set up a new push key** / let EAS generate it. EAS stores the key on its servers. If that prompt does not appear, run `eas credentials -p ios`, choose the production build credentials, then **Push Notifications: Manage your Apple Push Notifications Key** → **Set up a new key**, and let EAS generate it.

Until that key exists, a phone can still show the opt-in, but Apple will not deliver the notification. The server send endpoint is ready either way. Use `--dry-run` until a TestFlight build has registered real tokens.

### App Store privacy labels

When shipping 1.0.9, update App Privacy for these optional types. None are used for tracking, and none are required to use the app.

- **Contact Info → Email Address.** Optional. Collected only if the hunter signs up for rut-timing alerts and an end-of-season recap. Linked to the install (the RevenueCat app user id). Purpose: App Functionality. Not used for tracking.
- **Identifiers → Device ID.** Optional. The Expo push token, collected only if the hunter turns notifications on. Linked to the install. Purpose: App Functionality. Not used for tracking.
- **Location → Precise Location.** Optional. Only while he is using the app, and only if he allows it. On the phone it suggests today's hunt region and can be attached to a pre-shot record. The region name, not the GPS point, is sent with an analysis. Linked to his own records. Purpose: App Functionality. Not used for tracking. No background location.

Photos and purchases are unchanged.

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
| Vercel (`deerage-api`) | `OPENAI_API_KEY`, `REVENUECAT_SECRET_API_KEY`, `ADMIN_TOKEN`, `RECORD_SIGNING_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` and `KV_REST_API_TOKEN`), optional `EXPO_ACCESS_TOKEN`, `OPENAI_MODEL`, `DEERAGE_EVAL_TOKEN`, `MIN_APP_VERSION`, `LATEST_APP_VERSION`, `FAIR_USE_DAILY`, `FAIR_USE_MONTHLY`, `DAILY_SPEND_CAP_USD`, `OPENAI_INPUT_USD_PER_MILLION`, `OPENAI_OUTPUT_USD_PER_MILLION`, `VERIFY_RATE_LIMIT_PER_MINUTE` |

Set `ADMIN_TOKEN` before anyone posts an update. `server/README.md` has the curl examples and `npm run admin`.

The home card **What's new / Vote on what's next** appears when an announcement is published or a poll is open. Hunters on `scout_monthly`, `hunter_monthly`, `trophy_monthly`, or `outfitter_monthly` also see a one-time card, **Your plan still works**, which introduces Season Pass (`season_annual`, $19.99/year, 7-day trial, offering `default`). Their current plan is unchanged.

Never commit a filled-in `.env`. The repo stays public.

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

Do not run `eas submit` from this repo until the owner asks. The marketing version stays **1.0.9** in `mobile/app.json`. Production iOS build numbers are not taken from `ios.buildNumber`. `mobile/eas.json` sets `cli.appVersionSource` to `remote` and `autoIncrement` on the production profile, so EAS stores the build number and counts it up on each production build. The checked-in `ios.buildNumber` is only a local fallback. Before the first production build, set the remote app version to 1.0.9 (`eas build:version:set`). That command is not run from this repo. `autoIncrement` bumps the build number, not 1.0.9. Set `AGING_PIPELINE=openai` on the server to keep the gateway age pipeline instead.

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

- **Contact Info → Email Address.** Optional. Collected if the hunter signs up for rut-timing alerts and an end-of-season recap, or if he types an email on a wrong-call report or a cancel note. Linked to the install (the RevenueCat app user id). Purposes: App Functionality, and Customer Support for a report reply. Not used for tracking. Not used for marketing. Never required, and never filled in for him.
- **User Content → Photos.** A submitted wrong-call report keeps that scan's photo and the result, so the miss can be studied. A second look stores that photo and both ages. Linked to the install and the report. Purpose: App Functionality. Not used for tracking. Kept until the report is resolved plus 1 year, or until he taps Delete my report photo. The photo is not on a public URL.
- **Identifiers → Device ID.** Optional. The Expo push token, collected only if the hunter turns notifications on. Linked to the install. Purpose: App Functionality. Not used for tracking.
- **Location → Precise Location.** Optional. Only while he is using the app, and only if he allows it. On the phone it suggests today's hunt region and can be attached to a pre-shot record. The region name, not the GPS point, is sent with an analysis. Linked to his own records. Purpose: App Functionality. Not used for tracking. No background location.

A lease manager name or phone typed in Settings stays on the phone. DeerAge does not read the Contacts app and does not upload that number.

A wrong-call report keeps the scan photo and the result. A confirmed harvest age and a cancel or return note are stored with the scan id or the app user id. An optional follow-up email on a report or cancel note is stored with that report and is not mailed by the server. See the privacy policy.

## Plans

The paywall reads prices from the RevenueCat offering named in config (`default` unless `PAYWALL_OFFERING_ID` is set). It shows the store price string. It does not hardcode a price. Product ids are config, not hardcoded purchases.

Approved App Store prices to create and attach in RevenueCat. The app does not create these products:

- `deerage_season` — Season Pass, non-renewing, $39.99, no trial, entitlement `deerage_pro`.
- `deerage_monthly` — Monthly, $12.99, entitlement `deerage_pro`.
- `deerage_scans_10` — 10 scans, $2.99.
- `deerage_scans_30` — 30 scans, $7.99.
- A win-back or promotional offer on the Season Pass, identifier set later in `WIN_BACK_OFFER_ID`. The app will not show a discount until that offer exists on the product.

Existing subscribers keep access through `scout`, `hunter`, `trophy`, `outfitter`, or `pro`. Those products (`scout_monthly`, `hunter_monthly`, `trophy_monthly`, `outfitter_monthly` in the `tiers` offering) show under More plans only when the offering still contains them.

Free hunters get 3 lifetime analyses, shared by Quick Check, Age, and Score. The count lives on the RevenueCat subscriber as `deerage_free_uses`. The server checks it. A missing key fails closed.

## Secrets

| Where | Names |
| --- | --- |
| EAS | `EXPO_PUBLIC_REVENUECAT_APPLE_KEY`, `EXPO_PUBLIC_API_BASE_URL` |
| Vercel (`deerage-api`) | `OPENAI_API_KEY`, `AI_GATEWAY_API_KEY`, `GEMINI_API_KEY` (required for the Hydrogen age walk), `REVENUECAT_SECRET_API_KEY`, `ADMIN_TOKEN`, `RECORD_SIGNING_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` and `KV_REST_API_TOKEN`), optional `AGING_PIPELINE`, `GEMINI_INPUT_USD_PER_MILLION`, `GEMINI_OUTPUT_USD_PER_MILLION`, `EXPO_ACCESS_TOKEN`, `OPENAI_MODEL`, `DEERAGE_EVAL_TOKEN`, `MIN_APP_VERSION`, `LATEST_APP_VERSION`, `FAIR_USE_DAILY`, `FAIR_USE_MONTHLY`, `DAILY_SPEND_CAP_USD`, `OPENAI_INPUT_USD_PER_MILLION`, `OPENAI_OUTPUT_USD_PER_MILLION`, `VERIFY_RATE_LIMIT_PER_MINUTE` |

Set `ADMIN_TOKEN` before anyone posts an update. `server/README.md` has the curl examples and `npm run admin`.

The home card **What's new / Vote on what's next** appears when an announcement is published or a poll is open. Hunters on `scout_monthly`, `hunter_monthly`, `trophy_monthly`, or `outfitter_monthly` also see a one-time card, **Your plan still works**, which introduces Season Pass (`deerage_season`, offering `default`). Their current plan is unchanged.

Never commit a filled-in `.env`. The repo stays public.

## Over-the-air updates

`expo-updates` is configured with `runtimeVersion.policy` `appVersion`, so a 1.0.9 binary only takes updates published for 1.0.9. `eas.json` channels are `preview` and `production`. Nothing is published from this repo.

To ship a JS update later: `eas update --channel production` (or `preview`). To roll back that channel to the previous published update: `eas update:rollback --channel production`. A native module change still needs a new store build. Do not run either command until the owner asks.

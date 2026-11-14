# DeerAge analysis proxy

Small Vercel server that holds the OpenAI key and checks RevenueCat before any analysis runs. The iOS app never sees an AI key. It sends photos, an app user id, and the hunter's state or region. This service returns the age or score.

Set the Vercel project **Root Directory** to `server`. Framework preset: Other. Do not point Vercel at `mobile/`.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/analyze` | Quick Check, Age, or Score. Verifies entitlement and the free-use count, then calls OpenAI. |
| `GET` | `/api/config` | Minimum app version, model name, and the free-analysis count. No secrets. |
| `GET` | `/api/access?appUserId=` | Reads entitlement and remaining free analyses. Does not spend a use. |

`POST /api/analyze` body:

```json
{
  "mode": "quick",
  "appUserId": "$RCAnonymousID:...",
  "images": ["<jpeg base64, 1 to 4>"],
  "context": {
    "state": "TX",
    "ecoregion": "Hill Country/Edwards Plateau",
    "landType": "private",
    "minimumShooterAge": 4.5,
    "species": "whitetail",
    "month": 11
  }
}
```

`mode` is `quick`, `age`, or `score`. Age and score run one vision call per frame in parallel (up to 4), then take the median age or the median of each tine. Scale comes from nose-to-eye and ear-spread landmarks, not a fixed pixels-per-inch guess. Body cues decide age. The ecoregion only adjusts how much antler size is allowed to influence that call.

A successful response includes `model`, `latencyMs`, `entitled`, `freeUsesRemaining` (`null` for a subscriber), `fairUsePerDay`, and `estimatedCostUsd`.

Subscribers are capped at `FAIR_USE_DAILY` analyses per day (default 25) and `FAIR_USE_MONTHLY` per month (default 300). The counters live in Upstash Redis, keyed by the RevenueCat app user id, and reset on the `FAIR_USE_TIMEZONE` calendar (default `America/Chicago`). Hitting the daily cap returns `fair_use` and tells the hunter it resets tomorrow. The per-minute rate limit uses the same Redis, so it holds across instances. A global daily spend total, estimated from OpenAI `prompt_tokens` and `completion_tokens`, refuses new analyses with `busy` once it reaches `DAILY_SPEND_CAP_USD` (default 10).

Cost math, using the token counts OpenAI returns (image tokens are already inside `prompt_tokens`):

```
estimatedCostUsd = (prompt_tokens * OPENAI_INPUT_USD_PER_MILLION + completion_tokens * OPENAI_OUTPUT_USD_PER_MILLION) / 1_000_000
```

Defaults are gpt-4.1-mini public rates: input `0.40`, output `1.60` dollars per million tokens. A rough age scan of 4 low-detail frames is on the order of a cent. The proxy reserves that estimate before the call and replaces it with the actual cost after. If Redis is not configured, the proxy refuses the analysis instead of calling OpenAI.

Errors use a `code`, not a sentence the app has to pattern-match:

`invalid_request`, `not_configured`, `rate_limited`, `quota`, `fair_use`, `busy`, `not_deer`, `no_body`, `no_antlers`, `poor_quality`, `timeout`, `upstream`.

A photo that is not a deer does not spend a free analysis. A free analysis is reserved before the OpenAI call and refunded when the photo is rejected or the call fails. If the refund itself fails, the use stays spent.

## Environment variables (names only)

Set these in the Vercel project. Copy `server/.env.example` to `server/.env` for local work. Do not commit values.

| Name | Required | What it is |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | The owner's OpenAI key. The old Vibecode key is not used. |
| `REVENUECAT_SECRET_API_KEY` | yes, except eval | RevenueCat **secret** REST key (`sk_...`). Reads CustomerInfo-equivalent subscriber state and stores `deerage_free_uses`. |
| `OPENAI_MODEL` | no | Vision model. Default `gpt-4.1-mini`. |
| `DEERAGE_EVAL_TOKEN` | no | Shared secret for `/eval`. Requests that send it skip entitlement and do not change free-use counts. The app never sends it. |
| `MIN_APP_VERSION` | no | Builds older than this see the soft update prompt. Default `1.0.8`. |
| `LATEST_APP_VERSION` | no | Shown as the current release. Default `1.0.8`. |
| `UPSTASH_REDIS_REST_URL` | yes | Upstash Redis REST URL from the Vercel Marketplace integration. |
| `UPSTASH_REDIS_REST_TOKEN` | yes | Upstash Redis REST token. Server-side only. |
| `FAIR_USE_DAILY` | no | Subscriber analyses per day. Default `25`. |
| `FAIR_USE_MONTHLY` | no | Subscriber analyses per month. Default `300`. |
| `FAIR_USE_TIMEZONE` | no | Calendar for those caps. Default `America/Chicago`. |
| `RATE_LIMIT_PER_MINUTE` | no | Per app user id. Default `8`. |
| `EVAL_RATE_LIMIT_PER_MINUTE` | no | Same limit for the eval token. Default `120`. |
| `DAILY_SPEND_CAP_USD` | no | Global OpenAI spend for the day. Default `10`. |
| `OPENAI_INPUT_USD_PER_MILLION` | no | Input token price. Default `0.40` (gpt-4.1-mini). |
| `OPENAI_OUTPUT_USD_PER_MILLION` | no | Output token price. Default `1.60` (gpt-4.1-mini). |

The mobile app's EAS secrets are different and public-client values only: `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` and `EXPO_PUBLIC_API_BASE_URL`. See the repo README.

## Entitlement

Access is granted when the RevenueCat subscriber has an unexpired entitlement named one of:

`deerage_pro`, `scout`, `hunter`, `trophy`, `outfitter`, `pro`.

Anyone else gets 3 lifetime analyses, shared across Quick Check, Age, and Score. The count is the subscriber attribute `deerage_free_uses`, keyed by the RevenueCat app user id. Missing keys fail closed: the route returns `not_configured` and does not call OpenAI.

Rate limit: `RATE_LIMIT_PER_MINUTE` (default 8) per app user id, stored in Redis so every instance shares it. Eval tokens use `EVAL_RATE_LIMIT_PER_MINUTE` (default 120).

## Deploy

1. Create a Vercel project from this GitHub repo.
2. Set Root Directory to `server`.
3. Add the environment variables above for Production (and Preview if you want a staging URL).
4. Deploy. Copy the production URL, with no trailing slash, into the EAS secret `EXPO_PUBLIC_API_BASE_URL`.
5. In the Vercel Marketplace, add Upstash Redis (this is the current Vercel KV). That sets `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
6. Confirm `GET https://<host>/api/config` returns `minVersion`, `model`, and `fairUsePerDay`. It must not include any key.

Local:

```bash
cd server
cp .env.example .env
# fill OPENAI_API_KEY and REVENUECAT_SECRET_API_KEY
npm install
npm run dev
```

The dev server listens on port 3000. `npm run typecheck` typechecks the proxy without calling OpenAI.

Timeouts are about 10 seconds per frame, with one retry on Quick Check and on a retryable upstream error. Age and score fan out in parallel so a burst stays inside the 20 second release bar when the model responds.

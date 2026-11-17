# DeerAge analysis proxy

Small Vercel server that holds the model keys and checks RevenueCat before any analysis runs. The iOS app never sees an AI key. It sends photos, an app user id, and the hunter's state or region. This service returns the age or score.

App 1.0.9 (build 16) sends `appVersion`. Age then uses the Gemini 4 Hydrogen walk when `AGING_PIPELINE` is unset or `hydrogen`: photo check, baby gate, Step A, then the closers from 5.5 vs 4.5 down to 2.5 vs 1.5. A retake is job error `retake` and does not return an age. A range is `ageLabel` (`2.5–3.5`, `3.5–4.5`, or `4.5–5.5+`). Set `AGING_PIPELINE=openai` to keep the gateway age pipeline. Clients that do not send 1.0.9 stay on that gateway pipeline. Quick Check and Score always do. The Hydrogen key is `GEMINI_API_KEY`. The analyze function allows 300 seconds so the walk can finish.

Set the Vercel project **Root Directory** to `server`. Framework preset: Other. Do not point Vercel at `mobile/`.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/analyze` | Quick Check, Age, or Score. Verifies entitlement and the free-use count, then calls OpenAI. |
| `GET` | `/api/config` | Minimum app version, model name, and the free-analysis count. No secrets. |
| `GET` | `/api/access?appUserId=` | Reads entitlement and remaining free analyses. Does not spend a use. |
| `GET` | `/api/feed` | Published announcements and open polls. Optional `?appUserId=` adds `myVote`. |
| `POST` | `/api/poll-vote` | One vote per RevenueCat app user id. Body: `appUserId`, `pollId`, `optionId`. |
| `POST` | `/api/push-token` | Saves or removes an Expo push token for that app user id. |
| `POST` | `/api/email-optin` | Optional email plus a consent timestamp. |
| `POST` | `/api/email-unsubscribe` | Body `token` or `appUserId`. |
| `GET` `POST` `PATCH` | `/api/admin/announcements` | Admin. List, create, or edit. `status`: `draft`, `published`, `closed`. |
| `GET` `POST` `PATCH` | `/api/admin/polls` | Admin. List, create, or edit. `status`: `draft`, `open`, `closed`. |
| `GET` | `/api/admin/poll-results?pollId=` | Admin. Counts split into subscriber and free. |
| `POST` | `/api/admin/push` | Admin. Broadcast, or `dryRun: true` to count only. |
| `GET` | `/api/admin/emails` | Admin. CSV export. |
| `POST` | `/api/harvest` | Mark a scan harvested and store a confirmed age. |
| `GET` | `/api/verify-record?id=rec_…` | Confirms a pre-shot record's signature and server time. `?json=1` returns JSON. No photos. |
| `GET` | `/api/admin/harvests` | Admin. CSV of harvest checks. |
| `GET` `PATCH` | `/api/admin/config` | Admin. Versions, feature flags, and remote copy. |

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

The default model is `gpt-5.6-sol` with `OPENAI_REASONING_EFFORT=low`. GPT-5 chat completions reject `max_tokens` and `temperature`, so the proxy sends `max_completion_tokens` (the JSON budget plus `OPENAI_REASONING_TOKEN_HEADROOM`, default 4096) and `reasoning_effort`. Older models still get `max_tokens` and temperature 0.1. Each vision call waits 25 seconds. The app waits 30 seconds so that timeout can come back as an error. A timed-out call is not retried.

Subscribers are capped at `FAIR_USE_DAILY` analyses per day (default 10) and `FAIR_USE_MONTHLY` per month (default 40). The counters live in Upstash Redis, keyed by the RevenueCat app user id, and reset on the `FAIR_USE_TIMEZONE` calendar (default `America/Chicago`). Hitting the daily cap returns `fair_use` and tells the hunter it resets tomorrow. The per-minute rate limit uses the same Redis, so it holds across instances. A global daily spend total, estimated from OpenAI `prompt_tokens` and `completion_tokens`, refuses new analyses with `busy` once it reaches `DAILY_SPEND_CAP_USD` (default 25).

Cost math, using the token counts OpenAI returns (image tokens are already inside `prompt_tokens`):

```
estimatedCostUsd = (prompt_tokens * OPENAI_INPUT_USD_PER_MILLION + completion_tokens * OPENAI_OUTPUT_USD_PER_MILLION) / 1_000_000
```

Defaults are **$4 / 1M input** and **$20 / 1M output**. After Nov 30, 2026 the list price is about **$5 / $30**; set the two env vars when that takes effect. An off-repo run put a full age-plus-score scan on gpt-5.6-sol at about **$0.05** at the $4 / $20 rates. The same token mix at the later list price would be higher, mostly because output tokens go from $20 to $30. The proxy reserves an estimate before the call, including reasoning headroom, and replaces it with the actual cost after. If Redis is not configured, the proxy refuses the analysis instead of calling OpenAI.

A rack whose beams, tines, and spread are all zero is returned as `poor_quality` instead of a 0 score. `SCORE_CALIBRATION` multiplies the finished inches and defaults to 1. It is not fit to the public eval photos.

Errors use a `code`, not a sentence the app has to pattern-match:

`invalid_request`, `not_configured`, `rate_limited`, `quota`, `fair_use`, `busy`, `not_deer`, `no_body`, `no_antlers`, `poor_quality`, `timeout`, `upstream`.

A photo that is not a deer does not spend a free analysis. A free analysis is reserved before the OpenAI call and refunded when the photo is rejected or the call fails. If the refund itself fails, the use stays spent.

## Environment variables (names only)

Set these in the Vercel project. Copy `server/.env.example` to `server/.env` for local work. Do not commit values.

| Name | Required | What it is |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | The owner's OpenAI key. The old Vibecode key is not used. |
| `REVENUECAT_SECRET_API_KEY` | yes, except eval | RevenueCat **secret** REST key (`sk_...`). Reads CustomerInfo-equivalent subscriber state and stores `deerage_free_uses`. |
| `OPENAI_MODEL` | no | Vision model. Default `gpt-5.6-sol`. |
| `OPENAI_REASONING_EFFORT` | no | GPT-5 only. Default `low`. |
| `OPENAI_REASONING_TOKEN_HEADROOM` | no | Extra completion tokens for reasoning. Default `4096`. |
| `SCORE_CALIBRATION` | no | Inches multiplier. Default `1`. Do not fit it to the eval set. |
| `DEERAGE_EVAL_TOKEN` | no | Shared secret for `/eval`. Requests that send it skip entitlement and do not change free-use counts. The app never sends it. |
| `MIN_APP_VERSION` | no | Builds older than this see the soft update prompt. Default `1.0.8`. Raise it to `1.0.9` after that build is on the App Store. |
| `LATEST_APP_VERSION` | no | Shown as the current release. Default `1.0.9`. |
| `UPSTASH_REDIS_REST_URL` | yes | Upstash Redis REST URL. Falls back to `KV_REST_API_URL` when unset. |
| `UPSTASH_REDIS_REST_TOKEN` | yes | Upstash Redis REST token. Falls back to `KV_REST_API_TOKEN`. Server-side only. |
| `ADMIN_TOKEN` | yes, for admin routes | Bearer token for `/api/admin/*`. Long random string. The app never sends it. |
| `RECORD_SIGNING_SECRET` | yes, for pre-shot records | HMAC secret. Long random string. Never commit it. If it is unset, analysis still succeeds and the receipt is empty. |
| `VERIFY_RATE_LIMIT_PER_MINUTE` | no | Checks of `/api/verify-record` per caller. Default `30`. |
| `EXPO_ACCESS_TOKEN` | no | Optional Expo push access token. Broadcasts work without it. |
| `FEED_RATE_LIMIT_PER_MINUTE` | no | Feed reads per app user id. Default `40`. |
| `VOTE_RATE_LIMIT_PER_MINUTE` | no | Votes per app user id. Default `12`. |
| `PUSH_TOKEN_RATE_LIMIT_PER_MINUTE` | no | Token registrations per app user id. Default `10`. |
| `EMAIL_RATE_LIMIT_PER_MINUTE` | no | Email opt-in and unsubscribe per id. Default `6`. |
| `ADMIN_RATE_LIMIT_PER_MINUTE` | no | Admin calls per caller. Default `30`. |
| `FAIR_USE_DAILY` | no | Subscriber analyses per day. Default `10`. |
| `FAIR_USE_MONTHLY` | no | Subscriber analyses per month. Default `40`. |
| `FAIR_USE_TIMEZONE` | no | Calendar for those caps. Default `America/Chicago`. |
| `RATE_LIMIT_PER_MINUTE` | no | Per app user id. Default `8`. |
| `EVAL_RATE_LIMIT_PER_MINUTE` | no | Same limit for the eval token. Default `120`. |
| `DAILY_SPEND_CAP_USD` | no | Global OpenAI spend for the day. Default `25`. |
| `OPENAI_INPUT_USD_PER_MILLION` | no | Input token price. Default `4`. List price after Nov 30, 2026 is about `5`. |
| `OPENAI_OUTPUT_USD_PER_MILLION` | no | Output token price. Default `20`. List price after Nov 30, 2026 is about `30`. |

The mobile app's EAS secrets are different and public-client values only: `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` and `EXPO_PUBLIC_API_BASE_URL`. See the repo README.

## Updates, polls, push, and email

Public routes are rate limited in the same Upstash Redis as fair use. Admin routes require `Authorization: Bearer $ADMIN_TOKEN`. If `ADMIN_TOKEN` is unset, those routes return `not_configured`.

A missing `status` on create publishes the announcement or opens the poll. Close either one with `PATCH` and `"status": "closed"`. Votes are one per RevenueCat app user id. A second choice returns `already_voted` and does not change the tally. Results split `subscriber` (an active entitlement) and `free`.

From `server/`, with `DEERAGE_API_BASE_URL` and `ADMIN_TOKEN` set (a local `server/.env` is loaded and is not committed):

```bash
npm run admin -- announcement:create --title "Season Pass is here" --body "Your current plan keeps full access."
npm run admin -- poll:create --question "What should we build next?" --option "Rut timing" --option "Herd photos"
npm run admin -- poll:results --id poll_abc123
npm run admin -- push --title "New poll" --body "Vote on what is next." --audience all --dry-run
npm run admin -- emails
npm run admin -- harvests
npm run admin -- config:set --banner "The rut is on" --flag shootOrPass=true
npm run admin -- config:get
```

`push --dry-run` counts tokens and does not send. `--audience` is `all`, `subscriber`, or `free`. The segment is whatever RevenueCat said the last time that phone registered its token.

The same calls as curl:

```bash
curl -sS "$DEERAGE_API_BASE_URL/api/admin/announcements" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Season Pass is here","body":"Your current plan keeps full access.","status":"published"}'

curl -sS "$DEERAGE_API_BASE_URL/api/admin/polls" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"What should we build next?","options":["Rut timing","Herd photos"],"status":"open"}'

curl -sS "$DEERAGE_API_BASE_URL/api/admin/poll-results?pollId=POLL_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

curl -sS "$DEERAGE_API_BASE_URL/api/admin/push" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"New poll","body":"Vote on what is next.","audience":"all","dryRun":true}'

curl -sS "$DEERAGE_API_BASE_URL/api/admin/emails" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Close an item:

```bash
curl -sS -X PATCH "$DEERAGE_API_BASE_URL/api/admin/announcements" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"ann_abc123","status":"closed"}'
```

Unsubscribe (no admin token; the token is the one returned by opt-in and included in the CSV):

```bash
curl -sS "$DEERAGE_API_BASE_URL/api/email-unsubscribe" \
  -H "Content-Type: application/json" \
  -d '{"token":"UNSUBSCRIBE_TOKEN"}'
```

`npm test` covers votes, the admin token, email export, and the push dry-run.

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

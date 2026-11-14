# DeerAge accuracy eval

Internal benchmark only. The photos belong to the people who posted them. Do not republish, train on, or show them without written permission. Keep the source URL on every row.

`labels.csv` is the Nov 14, 2026 candidate set (87 rows). Rows whose `flag` starts with `weak` stay in the file and are skipped unless you pass `--include-weak`. Other flags (a photo the script could not fetch, a mount with no body) stay in the run. A missing photo is reported as skipped, and mount-only or antler-only rows are left out of the age metrics.

## Columns

| Column | Meaning |
| --- | --- |
| `id` | Stable row id |
| `photo_url` | One or more photo URLs, separated by ` \| `. The runner uses the first URL that starts with `http`. |
| `claimed_age` | True age in years. Half years (`6.5`) and whole years (`5`) are both used as labeled. |
| `age_method` | How the age was determined (cementum, tooth wear, known history, and so on). |
| `age_class` | `lab`, `tooth wear`, `known history`, `known (pen)`, `check station`, `estimated`, `self-reported`, `unknown`. |
| `score_in` | Gross score as published. Fractions like `146 5/8` are parsed. Ranges such as `upper 150s` are not scored. |
| `score_class` | `official`, `contest-official`, `green`, `self-reported`, `none`. |
| `ecoregion` | The region the scorecard groups by. Antler size varies here. Body shape does not, as much. |
| `state`, `county`, `location` | Finer place names. The model is given state and ecoregion, not the county. |
| `flag` | Why a row is weak. Empty means the row is in the default run. |

Age metrics use rows whose `age_class` is `lab`, `known history`, `known (pen)`, or `check station`. Score metrics use `official` and `contest-official`. Green scores shrink after the 60-day drying period, so they are kept in the file and left out of the default score error.

## Regional context

Antler size at a given age changes by ecoregion, even inside Texas. TPWD's long-run average gross score at 5.5+ is about 118 on the Edwards Plateau and about 132 in South Texas. Body cues (back line, belly, neck-to-chest, hams) are the age signal. The proxy is told the ecoregion so it does not treat a Midwest rack as the same prior as a Hill Country rack.

## Run

From the repo root. Node 22 can run the TypeScript directly.

```bash
node --experimental-strip-types eval/run.ts --dry-run
```

Dry run checks the CSV parser, counts rows by ecoregion, and writes `eval/scorecard.json` with the release bar marked not evaluated. It does not need an OpenAI key or a RevenueCat key.

Live run, after the proxy is up and `DEERAGE_EVAL_TOKEN` matches the server:

```bash
DEERAGE_EVAL_TOKEN=... PROXY_URL=http://localhost:3000 \
  node --experimental-strip-types eval/run.ts --baseline
```

`--baseline` sends the same photos through a plain "how old is this buck, and what is the gross score" prompt. `--limit 5` caps the rows. `--include-weak` keeps flagged rows. `--proxy` overrides `PROXY_URL`.

The scorecard reports, overall and by ecoregion:

- age exact and within one year
- young versus mature, with mature at 4.5 years and older
- mean absolute score error and the error as a percent of the true score
- mean and median latency

The release bar is: match or beat the baseline on young-versus-mature, score error of 10% or less, and a mean result in 20 seconds or less. A dry run does not claim that bar.

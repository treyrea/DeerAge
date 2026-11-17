# Refactor assessment, DeerAge 1.0.9

Scored on this branch after the remote EAS build-number change. Each item is Pass or Needs refactor. Refactors done here stay behaviour-preserving. Legacy subscribers stay on Scout, Hunter, Trophy, Outfitter, and `season_annual`.

## 1. Duplicated logic — Needs refactor

Evidence:

- `regions.ts` was 208 lines in both `mobile/src/lib` and `server/src`, byte-for-byte the same.
- `qr.ts` was 227 lines in both `mobile/src/utils` and `server/src`, byte-for-byte the same.
- `lease-text.ts` was 45 lines in both `mobile/src/lib` and `server/src`, byte-for-byte the same.
- Version compare was copied in `UpdateAvailableBanner.tsx` and `UpdateGate.tsx`. `server/src/aging-switch.ts` has a third compare. It returns `-1` or `1` and reads past three parts. The app compare returns the raw difference and stops at three parts. Callers only test `>= 0`, but a fourth component would not match, so the server function was not folded into the app function.

Done: the three identical files now live in `shared/` and both sides re-export them. The two app compares call `mobile/src/lib/version.ts`. The server compare stays in `aging-switch.ts`.

## 2. Dead code and stale paths — Needs refactor

Evidence:

- `scheme` is `vibecode` in `mobile/app.json`. That is the live URL scheme for `com.vibecode.deerage-qj3cfq`. Removing it would break links the installed app already uses. Left in place.
- `HomeScreenV2.tsx` was the only home screen. `RootNavigator` imported it as `HomeScreen`. The `V2` name was leftover.
- `subscriptionStore.ts` is the live store. `mobile/README.md` still pointed at `src/state/subscriptionStoreV2.ts`, which is not in the repo.
- `season_annual` remains in `planLabelFor` so an old Season Pass purchase still reads as Season Pass. It is not sold as a new product.

Done: renamed the home screen file to `HomeScreen.tsx`. Pointed the README at `subscriptionStore.ts`. Left the URL scheme and `season_annual`.

## 3. Oversized files — Needs refactor

Files over about 400 lines:

| Lines | File |
| --- | --- |
| 1473 | `mobile/src/screens/ResultsScreen.tsx` |
| 876 | `mobile/src/screens/AgeResultScreen.tsx` |
| 644 | `mobile/src/screens/DeerCameraScreen.tsx` |
| 599 | `server/src/content.test.ts` |
| 570 | `mobile/src/components/ManualPointCounter.tsx` |
| 568 | `mobile/src/state/deerScoringStore.ts` |
| 554 | `mobile/src/screens/SettingsScreen.tsx` |
| 529 | `mobile/src/types/deer-scoring.ts` |
| 485 | `mobile/src/screens/OfflineAgeGuideScreen.tsx` |
| 481 | `server/src/analyze.ts` |
| 474 | `mobile/src/components/DistancePicker.tsx` |
| 473 | `mobile/src/components/ScoreAdjustmentModal.tsx` |
| 465 | `mobile/src/screens/HistoryDetailScreen.tsx` |
| 463 | `mobile/src/screens/HistoryScreen.tsx` |
| 439 | `mobile/src/lib/revenuecatClient.ts` |

Not split in this change. These are screens and the camera flow. This environment cannot render the iOS app, so a mechanical split could change behaviour with no way to see it. The line counts stay as the reason this still needs a later refactor.

## 4. Tangled dependencies — Pass

`revenuecatClient.ts` does not import the subscription store. The store calls the client. Scan credits call the store after a server response. No cycle was required to remove for a behaviour-preserving change.

## 5. Inconsistent naming — Needs refactor

`REVENUECAT_SECRET_API_KEY` is the name in the server README. `REVENUECAT_SECRET_KEY` was also read, and the two files did not use the same order. Subscriber reads used only `REVENUECAT_SECRET_API_KEY`. Grants and scan packs tried `REVENUECAT_SECRET_KEY` first.

Done: `server/src/revenuecat-secret.ts` is the only reader. Reads prefer the documented name, then the alias. Grants and scan packs keep the previous order so an existing grant alias still wins when both are set. Neither value is logged.

## 6. Missing tests — Needs refactor

The server already tests regions, QR, lease text, field calls, scan credits, and the Hydrogen parser. The app had no unit test script. Purchase result handling, who can start a scan, and the version compare were untested.

Called for here, and added in the tests commit that follows this assessment: jest-expo tests for those app functions, plus server cases for bad input, a duplicate credit, a refund after a failed spend, and a timeout.

## 7. Version and build sources — Pass

`mobile/app.json` `expo.version` is `1.0.9`. `mobile/eas.json` sets `cli.appVersionSource` to `remote` and `autoIncrement` on the production profile, so the production iOS build number is stored by EAS and counted up there. `ios.buildNumber` in `app.json` is a local fallback and is not the store build number. `MIN_APP_VERSION` and `minSupportedVersion` stay server config for the soft card and the forced block. The app version compare used by those cards is now `mobile/src/lib/version.ts`.

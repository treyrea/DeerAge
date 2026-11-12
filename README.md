# DeerAge

**Know before you pull the trigger.**

DeerAge is an Expo SDK 54 / React Native iOS app that helps hunters estimate a deer's age and rack before and after the shot. It is already published on the App Store. This repository is the cleaned Vibecode export: the mobile app plus the Bun backend that shipped with it.

## Layout

- `mobile/` — Expo app (camera, age and rack analysis, subscriptions)
- `backend/` — Bun and Hono API. Startup can sync a Prisma schema when `prisma/schema.prisma` exists; this export does not include one.
- `changelog.txt` — change log from the Vibecode export
- `privacy-policy` — App Store privacy policy

`mobile/README.md` has the longer product write-up. This file is how to run the code.

## Mobile app

```bash
cd mobile
cp .env.example .env
bun install   # or: npm install
npx expo start
```

Copy `mobile/.env.example` to `mobile/.env` and fill in the values locally. Every key is named `EXPO_PUBLIC_VIBECODE_*` because the app was moved off Vibecode. Those names can stay, but the values should be replaced with the owner's own provider keys (OpenAI, Anthropic, Grok, Google, ElevenLabs, RevenueCat, and any others you enable).

`npx expo start` reads `.env` for local development. Production and store builds do not. Set the same `EXPO_PUBLIC_*` values as EAS environment variables or secrets. Leave them blank in `mobile/eas.json` rather than hardcoding keys there.

## Backend

```bash
cd backend
cp .env.example .env
bun install
bun run dev
```

`bun run dev` starts the API with hot reload. The port comes from `PORT` in `.env` (default `3000`). `backend/.env.example` lists optional provider key names with empty values; copy it to `backend/.env` and fill in only what you use.

`backend/scripts/start` is the hosted startup script (install, Prisma sync if a schema is present, then the server). For local work, `bun run dev` is enough.

## Secrets

Real `.env` files are not in this repo. `.env`, `.env.local`, dependencies, and Expo/native build output are gitignored at the repo root and inside `backend/` and `mobile/`.

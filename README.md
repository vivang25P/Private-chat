# Private Chat MVP

## Quick Start

```bash
npm install
npm run dev
```

## Environment

Set these in `.env`:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIXED_OWNER_UID`
- `VITE_FIXED_PARTNER_UID`

Optional single-peer override:

- `VITE_FIXED_PEER_UID`

## Firestore Rules Deploy + Verify

From project root:

```bash
npx firebase-tools login
npx firebase-tools use <your-project-id>
npx firebase-tools deploy --only firestore:rules
npx firebase-tools firestore:databases:get
```

Verify deploy output shows:
- `rules file firestore.rules compiled successfully`
- `released rules firestore.rules to cloud.firestore`

## Production Checklist

- Auth enabled in Firebase (Email/Password).
- Firestore database created.
- Rules deployed from current `firestore.rules`.
- Both users exist in `users` collection with `publicKey`.
- Fixed UID env values point to the real two accounts.
- Send/receive tested both directions after hard refresh.

## Troubleshooting

- `permission-denied`: deploy rules and verify chat participants contain both UIDs.
- `Receiver profile not found`: ensure peer user has completed signup once.
- `peer key changed`: use in-app "Trust new key" only after manual verification.

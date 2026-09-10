# BotCake Spiel Generator (multi-user)

A web app that generates follow-up spiels for BotCake sequences (pre-purchase
sequence, single occasion follow-ups, and post-purchase retention sequences).
Each advertiser registers their own account (email + password) and adds their
own Anthropic API key in Settings. Your API key is stored on the server and
is never sent to or visible from anyone else's browser.

## What's inside

- `server.js` — Express backend: registration/login, sessions, per-user API
  key storage, and a proxy route that calls Anthropic on the user's behalf.
- `public/index.html` — the full frontend (login screen + the 3 generator
  tabs), served as a static file by the backend.
- `users.json` — created automatically on first run. This is where accounts
  and API keys are stored. **Back this file up** if you care about not
  losing accounts — for a lot of users, swap this out for a real database
  later (Postgres, MySQL, etc.) without changing the API routes.

## Running it locally

You'll need [Node.js](https://nodejs.org) installed (v18 or newer).

```bash
cd botcake-app
npm install
npm start
```

Then open `http://localhost:3000` in your browser. Register an account,
add your Anthropic API key under Settings, and you're ready to generate.

## Deploying so advertisers can access it from anywhere

Any host that runs Node.js apps will work. Two easy free/cheap options:

### Option A: Render.com
1. Push this folder to a GitHub repository.
2. On [render.com](https://render.com), create a new "Web Service" and
   connect your repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add an environment variable `SESSION_SECRET` set to a long random string
   (this keeps login sessions secure — don't skip this).
5. Deploy. Render gives you a public URL your advertisers can use.

### Option B: Railway.app
1. Push this folder to a GitHub repository.
2. On [railway.app](https://railway.app), create a new project from your repo.
3. Railway auto-detects Node and runs `npm install` + `npm start`.
4. Add the `SESSION_SECRET` environment variable as above.
5. Deploy and grab the generated public URL.

## Important security notes before going live

- **Set `SESSION_SECRET`** to a long random value in your hosting
  provider's environment variables. The placeholder in `server.js` is not
  safe to use in production.
- **Enable HTTPS.** Render and Railway both provide this automatically. Don't
  run this over plain HTTP in production — passwords and session cookies
  need encryption in transit.
- **`users.json` grows over time.** It's fine for a handful to a few dozen
  advertisers. If you expect hundreds of users or want stronger guarantees
  against data loss, migrate to a real database — the route logic in
  `server.js` is written so this swap only touches the small set of
  `loadUsers` / `saveUsers` / `findUserByEmail` helper functions at the top.
- Each advertiser is billed by Anthropic directly through their own API key
  for whatever they generate — you are not billed for their usage.

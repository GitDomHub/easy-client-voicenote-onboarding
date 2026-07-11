# SETUP.md — one-time setup, executed by Claude Code

**Audience: Claude.** When the user says "set up my intake system", follow these steps in
order, verifying each. The user needs to do exactly two human things: log into Cloudflare
when the browser opens, and answer three questions. Everything else is yours.

## 0. Ask the user three things

1. **Your first name** (founders send voice notes "to {name}"; appears on the page).
2. **Your email** (the page's fallback if an upload ever fails).
3. **Mac or Windows?** (tool installs differ; macOS is the well-trodden path, Windows works
   with ffmpeg + whisper installed via winget/scoop, run scripts through Git Bash).

## 1. Install the tools (skip any that exist; verify each with a version call)

- **Node.js** (for wrangler): `brew install node` / winget `OpenJS.NodeJS.LTS`
- **wrangler**: use `npx wrangler --version` (no global install needed)
- **ffmpeg**: `brew install ffmpeg` / winget `Gyan.FFmpeg`
- **whisper.cpp**: `brew install whisper-cpp` / Windows: scoop `whisper-cpp` or a release
  binary; verify `whisper-cli --help`
- **Whisper model** (one-time 148MB):
  `mkdir -p ~/.cache/whisper-cpp && curl -L -o ~/.cache/whisper-cpp/ggml-base.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin`

## 2. Cloudflare login

`npx wrangler login` (a browser opens; the user logs in and approves). Verify with
`npx wrangler whoami`. A free Cloudflare account is enough for everything here.

## 3. Create storage + token, patch config

From the `system/` directory:

1. `npx wrangler kv namespace create client_intake` → copy the printed 32-hex id into
   `wrangler.toml` replacing `REPLACE-AT-SETUP-KV-ID`.
2. Generate a token: `openssl rand -hex 10` (or any 20-hex value) → replace
   `REPLACE-AT-SETUP-TOKEN` in `wrangler.toml`.
3. In `worker.js`, replace the setup placeholders with the user's answers:
   `{{SENDER}}` → first name, `{{SENDER_CAPS}}` → first name uppercased,
   `{{SENDER_EMAIL}}` → email. Leave `{{FOUNDER}}` and `{{BUSINESS}}` alone; those are
   replaced per client by the skill.
4. `node --check worker.js` must pass.

## 4. Deploy and verify

1. `npx wrangler deploy` → note the printed `https://client-intake.<subdomain>.workers.dev`.
2. `curl <url>/health` → `{"ok":true}`.
3. `curl <url>/i/<token>` → 200 and contains the demo questions;
   `curl <url>/i/wrong` → 404.
4. Open the page in a browser for the user to see. The demo client on it is fictional
   ("ClearView Exterior Care"); the skill replaces it with their real client.
5. Upload a test: `curl -X POST "<url>/upload?t=<token>" -H "content-type: text/plain" -d "setup test"`,
   confirm `{"ok":true...}`, then delete it:
   `npx wrangler kv key delete --namespace-id <id> --remote <printed key>`.

## 5. Tell the user

Report: the page URL (with token), that the store is empty and private, what the per-client
flow looks like (see SKILL.md), and that rotating the token in `wrangler.toml` + redeploying
kills an old link instantly. Suggest they save the URL somewhere handy.

**Costs:** Cloudflare free tier covers the worker and KV at voice-note volume. The whisper
model runs locally and is free.

**Privacy note worth repeating to clients:** audio goes into the user's own Cloudflare
account, is write-only from the page (no public read path), and transcription happens on
the user's own computer.

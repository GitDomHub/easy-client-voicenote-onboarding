---
name: onboarding-intake-voice-note
description: Onboard a small-business client end to end with only Claude Code and a free Cloudflare account. Deploys a branded voice-recording interview page (waveform, per-section recording, progress, ADHD-friendly), personalizes 25-30 questions from the client's website, then pulls and transcribes the founder's recorded answers locally and turns them into four onboarding documents (brand brief, founder story, approved claims, prohibited claims). Use when the user says "set up my intake system", "onboard my client", pastes a client website for onboarding, or says the client has finished recording.
---

# Client Onboarding by Voice, End to End

You (Claude) run the whole system. The user needs **Claude Code and a free Cloudflare
account. That's it.** No GitHub, no servers to manage, no code to read.

Four moments, each triggered by a plain sentence from the user:

| The user says | You do |
|---|---|
| "Set up my intake system" | **SETUP.md**, step by step (one time, ~30 min) |
| "Onboard my client, site is X" | Stages 1-2 below: research, personalize, deploy their page |
| "The client says he's done" | Stage 3: pull + transcribe the recordings |
| (automatically after stage 3) | Stage 4: write the four onboarding documents |

**Golden rule everywhere: the founder's words beat your words.** The phrasing is the product.

---

## Stage 0 — First run only

If `system/wrangler.toml` still contains `REPLACE-AT-SETUP`, stop and run **SETUP.md**
first. It installs the tools, logs the user into Cloudflare, deploys the page, and
verifies everything with a test upload.

## Stage 1 — Read the evidence (per client, before asking anything)

Get the client's **website URL** from the user (plus review links or old marketing
material if handy). Research with real tools; never invent.

1. **Fetch the website** (home, about, services, contact). Extract verbatim: business
   name, every service with its exact name, service area, years in business, credentials,
   guarantee wording, review claims, CTAs, owner-voice copy, distinctive gear or methods.
2. **Search public reviews** (Google, Facebook, directories). Mine verbatim buyer
   vocabulary and repeated praise (candidate proof points).
3. **Note gaps and contradictions**: third-party claims NOT on the client's own site
   (never published without founder confirmation), disagreeing numbers.

If a source is unreachable, say so and move on. No website at all? The interview carries
the load; questions lose their "your site says" hooks but everything still works.

## Stage 2 — Personalize and deploy the interview page

1. Build the question set from **`question-bank.md`** (read it; every block explains its
   purpose and personalization). Rules: 8 sections sized to one voice note each, 25-30
   questions, anchored in stage-1 evidence, own-site-only, warm spoken English, no em
   dashes, skip-permission stated up front. `example/example-questions.md` shows the depth.
2. Rewrite the `QUESTIONS` constant in `system/worker.js` with the new set (same object
   shape: id, short, title, min, qs). Replace `{{FOUNDER}}` and `{{BUSINESS}}` with the
   client's first name and business name.
3. `node --check system/worker.js`, then from `system/`: `npx wrangler deploy`.
4. Verify live: `curl <url>/i/<token>` contains the new questions; wrong token → 404.
5. Give the user the link plus a short message they can forward to the founder (voice-y,
   two sentences, mentions the mic test button and that skipping is fine).

The page the founder gets: all questions in collapsible sections with time estimates, a
mic-and-sending self-test, tap-to-record with a live waveform, per-section recording and
progress that survives coming back later, a floating record bar, and a typed-answer box.
Every take auto-uploads to the user's own Cloudflare storage; failed sends fall back to
download-and-text-it. Multiple founders/clients in sequence are fine: takes are keyed by
timestamp and section, and stage 3 archives between clients.

## Stage 3 — "The client says he's done"

From `system/`: `bash ingest.sh` — it pulls every take from KV, transcribes locally with
whisper (drop trade terms into `system/vocab.txt` first so words like "eavestrough" come
out right), and writes `system/transcripts.md` organized by take with section suffixes.

- Read the transcript back critically: flag garbled names/numbers rather than guessing.
- If a section is missing, tell the user which questions are unanswered; offer a mini
  follow-up list.
- After the user confirms the transcripts look right: `bash ingest.sh --archive` saves the
  audio locally and empties the store for the next client.

## Stage 4 — Write the four documents

Fill the templates from `templates/` (each has inline guidance), into a folder the user
picks (default `clients/{client-name}/`):

1. **brand-brief.md** — business, moat, personas, segments (easiest/whales/dream), CTA,
   wedge, offerings table, proof points, competitor exclusion list, buyer vocabulary
2. **founder-story.md** — their story and voice samples, first person preserved
3. **approved-claims.md** — ONLY claims the founder confirmed, each with a source; risky
   ones (insurance amounts, certifications) go to the "waiting room" pending written OK
4. **prohibited-claims.md** — the generic starter list plus refusals, unconfirmed
   third-party claims, and regulated territory for their trade

Close with a gap report: unanswered sections, claims awaiting written confirmation, and
site-vs-founder contradictions. Never resolve a contradiction silently.

### Compliance guardrails (while writing, adjust to jurisdiction)

No unverifiable superlatives; credentials only as confirmed and in exact scope; guarantees
verbatim with conditions or not at all; real reviews only, never composite quotes; the
client's local spelling and currency.

## Fallback: no Cloudflare (voice-notes-only mode)

If the user can't or won't set up Cloudflare, everything still works with one substitution:
skip SETUP.md and the page. Deliver stage 2's questions as a markdown doc (and optionally
the pretty static sheet from `templates/question-sheet.html`, which records nothing), have
the founder answer by **WhatsApp voice notes or phone voice memos**, and run stage 4 from
pasted transcripts or uploaded audio. Same questions, same four documents.

## Degradation table

| Missing | Do this |
|---|---|
| No website | Interview carries the load; drop "your site says" hooks; say so plainly |
| Few/no reviews | Mine competitor reviews for vocabulary; mark ICP notes "founder-stated, unverified" |
| Founder skips sections | Fill what you can, list gaps, offer a follow-up mini-list |
| Typed answers only | Fine; note that voice samples for tone are missing |
| Audio undecodable | ingest.sh names the file and keeps it safe in KV; check ffmpeg, re-run |
| Windows machine | Everything works via Git Bash + winget installs (SETUP.md notes); macOS is the smoothest path |

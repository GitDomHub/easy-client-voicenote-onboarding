# Easy Client Voice-Note Onboarding

Onboard a new client the human way: **they talk, you listen, Claude writes it down properly.**

Paste a client's website into Claude, get a personalized founder interview, let the founder
answer by **voice note** (WhatsApp, iPhone voice memos, whatever they already use), and turn
the answers into the four onboarding documents every content engagement needs:

1. **Brand brief** — who they are, who buys, how they win
2. **Founder story** — their voice, kept verbatim
3. **Approved claims** — what you may publish, with sources
4. **Prohibited claims** — what you must never say in their name

**No servers. No GitHub. No hosting. No logins for the client.** Just this skill and voice notes.

## Who this is for

Marketers, copywriters, and content people who onboard small-business clients and want the
founder's real voice on record before writing a word in their name. Built for people who do
not want to touch infrastructure.

## How to use it

### Option A: claude.ai (easiest)

1. Download this repository (green **Code** button, **Download ZIP**).
2. In claude.ai go to **Settings, Capabilities, Skills** and upload the folder
   (or paste the contents of `SKILL.md` at the start of a project's instructions).
3. In a new chat: *"Onboard my client, their website is example-client.com"*.

### Option B: Claude Code

1. Copy this folder into your project as `.claude/skills/onboarding-intake-voice-note/`.
2. Run `/onboarding-intake-voice-note` or just ask Claude to onboard a client.

### Then what happens

1. Claude reads the client's website and public reviews, and generates a **personalized
   question list** (25 to 30 questions in 8 short sections). Nothing generic: every question
   is anchored in what their site actually says.
2. You send the questions to the founder, as a document or as the included pretty HTML
   question sheet. They answer by voice note, one section at a time, skipping anything.
   Rambling is encouraged. It is one coffee's worth of talking.
3. You paste the voice-note transcripts (or upload the audio) back into the chat.
4. Claude fills the four templates in `templates/` with the founder's own words, flags every
   claim that still needs written confirmation, and tells you what is missing.

## What's in this repo

| File | What it is |
|---|---|
| `SKILL.md` | The skill itself: the full four-stage workflow Claude follows |
| `question-bank.md` | The master question bank with the reasoning behind every block |
| `templates/` | The four onboarding document templates + the HTML question-sheet template |
| `example/` | A complete worked example for a fictional window-cleaning company |

## Why voice notes

Founders do not fill in forms. They talk. Voice notes are chunked, resumable, familiar, and
zero-setup, which also makes them naturally friendly to busy and easily-distracted people:
one section per note, skip what you do not know, come back tomorrow. The gold is in how they
say things, and voice keeps the phrasing intact.

## Provenance

Distilled from the client-onboarding system built at [JUST DIGITAL](https://justdigital.world)
for real local-service engagements. The example client is fictional; any resemblance to an
actual window-cleaning business is coincidental (and flattering).

MIT licensed. Use it, adapt it, onboard someone.

---
name: onboarding-intake-voice-note
description: Onboard a small-business client with zero infrastructure. Reads the client's website and public reviews, generates a personalized founder interview (25-30 questions in 8 voice-note-sized sections), then turns the founder's voice-note answers into four onboarding documents (brand brief, founder story, approved claims, prohibited claims). Use when the user says "onboard my client", pastes a client website for onboarding, wants founder interview questions, or has voice-note answers/transcripts to turn into brand documents.
---

# Onboarding Intake by Voice Note

Turn a client's website plus one founder conversation into the four documents every content
engagement needs, with the founder answering by **voice note** in whatever app they already
use. No servers, no accounts, no forms.

The flow has four stages. Stages 1 and 2 happen in one sitting; stage 3 happens on the
founder's own time; stage 4 happens when the answers come back (often a later chat: if the
user arrives with transcripts in hand, jump straight to stage 4).

**Golden rule for every stage: the founder's words beat your words.** When they said it
well, quote them. The phrasing is the product.

---

## Stage 1 — Read the evidence (before asking anything)

Ask the user for the client's **website URL** (and, if handy: links to their Google reviews,
social profiles, or old marketing material). Then research with real tools; never invent.

1. **Fetch the website**: homepage, about, services/pricing, contact. Extract verbatim:
   - Exact business name and tagline
   - Every service/product with its exact name as written
   - Service area, years in business, credentials (insurance, licenses, certifications)
   - Guarantee wording, review-count claims, calls to action, phone/email
   - First-person copy (owner voice) and anything unusual or distinctive
2. **Search for public reviews** (Google, Facebook, industry directories). Mine verbatim
   buyer vocabulary: the literal words customers use to praise or complain. Note what
   reviews praise repeatedly (candidate proof points).
3. **Note gaps and contradictions**: claims on third-party directories that are NOT on the
   client's own site (these must never be published without founder confirmation), and any
   numbers that disagree (e.g. review counts).

**Rules:** if a source is unreachable, say so and move on. Everything gathered is *candidate*
material until the founder confirms it. If there is no website at all, say the interview will
carry the whole load and proceed; the question list simply loses its "your site says" hooks.

## Stage 2 — Generate the personalized interview

Build the question list from `question-bank.md` (read it: every block explains its purpose
and how to personalize). Non-negotiables:

- **8 sections, 25 to 30 questions total**, each section sized to one voice note (2 to 4
  minutes). Order: Your story → The person behind the business → The services → The claims →
  How you win work → Insider knowledge → Working together → The customers & the area.
- **Anchor questions in stage-1 evidence.** "Your site says X, is that still true?" beats
  "tell me about X". Questions that reference their actual gear, wording, or review count
  show the founder someone did their homework; that is the wow factor.
- **Only their own website feeds the questions.** Never confront the founder with claims
  from third-party directories or competitor research; ask open questions instead and let
  their answers confirm or kill those claims.
- **Warm, plain, spoken English.** Contractions. No em dashes. No jargon. The founder should
  feel interviewed by a curious human, not audited.
- Open with permission to be imperfect: it is about one coffee's worth of talking, rambling
  is perfect, **skip anything** (a half answer beats a perfect answer you never get).

Deliver as:
1. **A markdown document** the user can paste anywhere (default), formatted like
   `example/example-questions.md`, and
2. **Optionally** (offer it): a self-contained branded HTML question sheet from
   `templates/question-sheet.html`, following the placeholder instructions inside it. It is
   a display page only (checkbox progress saves in the reader's browser); answers still come
   back by voice note. The user can email the file or host it anywhere.

Close stage 2 by telling the user exactly what to send the founder, including the reply
instructions (next stage's opening lines are already written into the question document).

## Stage 3 — The founder talks (nothing for you to do)

The question document itself instructs the founder:

- Answer by **voice note in any app** (WhatsApp, Signal, iPhone Voice Memos, Android
  Recorder), one note per section, or one long ramble; both work.
- Skip freely. Half answers welcome. Typed answers welcome too.
- Send the notes back to the user (the person onboarding them), not to any system.

## Stage 4 — Turn answers into the four documents

When the user returns with audio files or transcripts (most voice-note apps transcribe;
audio uploaded to the chat can be transcribed directly):

1. **Assemble a raw transcript** organized by section, keeping the founder's phrasing.
   Flag inaudible/uncertain spots rather than guessing, especially names and numbers.
2. **Fill the four templates** from `templates/` (each has inline guidance):
   - `brand-brief.md` — business, moat, personas (from review mining + the customer
     questions), primary CTA, wedge, offerings table, proof points, competitor exclusion
     list, buyer vocabulary (verbatim quotes)
   - `founder-story.md` — their story and voice samples, first person preserved
   - `approved-claims.md` — ONLY claims the founder explicitly confirmed, each with its
     source (their site, or "founder interview, {date}")
   - `prohibited-claims.md` — keep the generic starter list, then add anything the founder
     refused, anything unconfirmed from third-party listings, and anything regulated in
     their trade
3. **Report the gaps**: unanswered sections, claims still needing written confirmation
   (insurance amounts, certifications, guarantees), and contradictions between what the
   site says and what the founder said. Never resolve a contradiction silently.

### Compliance guardrails (apply while writing, adjust to jurisdiction)

- No unverifiable superlatives ("best in town", "#1") without a citable third-party source.
- Credentials (insurance, bonding, licenses, health/childcare/financial qualifications):
  publish only what the founder confirmed, in their exact scope. When in doubt, understate.
- Guarantees: exact wording with its conditions, or nothing.
- Reviews: quote real ones only; never compose composite "customer quotes".
- The founder's local spelling and currency (e.g. Canadian English and CAD in Ontario).

## Degradation table

| Missing | Do this |
|---|---|
| No website | Interview carries the load; drop the "your site says" hooks; say so plainly |
| Few/no reviews | Mine competitor reviews for vocabulary; mark ICP notes "founder-stated, unverified" |
| Founder answers only some sections | Fill what you can, list the gaps, offer a follow-up mini-list of just the missing questions |
| Typed answers instead of voice | Fine; note that voice samples for tone are missing |
| Audio quality too poor to transcribe | Ask for a re-record of just that section; never guess quotes |

A worked end-to-end example lives in `example/`: a fictional window-cleaning company,
its generated questions, and the rendered HTML sheet. Match its depth and tone.

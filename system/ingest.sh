#!/usr/bin/env bash
# Pull every take from the intake worker's KV store, transcribe locally with
# whisper.cpp, and write transcripts.md next to this script. Run it via Claude
# Code ("the client says he's done") from the system/ directory:
#
#   bash ingest.sh                    -> transcripts.md
#   bash ingest.sh --archive          -> also saves audio to ./interview-audio/
#                                        and empties the KV store afterwards
#
# Requirements (SETUP.md installs them): wrangler (authed), whisper-cli,
# ffmpeg (any platform) or afconvert (macOS fallback), and the model at
# ~/.cache/whisper-cpp/ggml-base.en.bin
#
# Vocabulary hint: put trade words (one per line) in ./vocab.txt and they are
# fed to whisper as a prompt so it hears terms like "eavestrough" correctly.

set -euo pipefail
cd "$(dirname "$0")"

NS_ID=$(grep -oE 'id = "[a-f0-9]{32}"' wrangler.toml | head -1 | grep -oE '[a-f0-9]{32}' || true)
[ -n "$NS_ID" ] || { echo "No KV namespace id in wrangler.toml. Run SETUP.md first."; exit 1; }
MODEL="$HOME/.cache/whisper-cpp/ggml-base.en.bin"
command -v whisper-cli >/dev/null || { echo "whisper-cli not found (see SETUP.md)"; exit 1; }
[ -f "$MODEL" ] || { echo "Whisper model missing: $MODEL (see SETUP.md)"; exit 1; }

WORK="$(mktemp -d)"
OUT="transcripts.md"
ARCHIVE_MODE="${1:-}"

PROMPT="Founder interview."
[ -f vocab.txt ] && PROMPT="Founder interview. Vocabulary: $(grep -v '^#' vocab.txt | tr '\n' ',' | sed 's/,$//')."

echo "Listing takes in KV namespace $NS_ID ..."
KEYS_ALL=$(npx wrangler kv key list --namespace-id "$NS_ID" --remote 2>/dev/null | python3 -c "import json,sys; print('\n'.join(k['name'] for k in json.load(sys.stdin)))")
KEYS=$(echo "$KEYS_ALL" | grep -v '^miccheck-' || true)   # mic self-tests: never transcribed
[ -n "$KEYS" ] || { echo "No takes found."; exit 0; }
echo "$KEYS" | sed 's/^/  - /'

{
  echo "# Interview transcripts (raw)"
  echo
  echo "> Generated $(date +%Y-%m-%d\ %H:%M) by ingest.sh. One block per take, in upload"
  echo "> order; the -<section> suffix in each key says which question block the founder"
  echo "> was answering. Whisper output: verify names and numbers before quoting."
  echo
} > "$OUT.tmp"

decode () {  # decode <in> <out16kwav>; ffmpeg first (all formats), afconvert fallback (macOS)
  if command -v ffmpeg >/dev/null && ffmpeg -version >/dev/null 2>&1; then
    ffmpeg -nostdin -y -i "$1" -ar 16000 -ac 1 -f wav "$2" >/dev/null 2>&1 && return 0
  fi
  command -v afconvert >/dev/null && afconvert -f WAVE -d LEI16@16000 -c 1 "$1" "$2" 2>/dev/null
}

while IFS= read -r KEY; do
  echo "== $KEY"
  RAW="$WORK/$KEY"
  npx wrangler kv key get --namespace-id "$NS_ID" --remote "$KEY" > "$RAW" 2>/dev/null < /dev/null
  { echo "## Take: \`$KEY\`"; echo; } >> "$OUT.tmp"
  if [ "${KEY##*.}" = "txt" ]; then
    cat "$RAW" >> "$OUT.tmp"; echo >> "$OUT.tmp"; echo >> "$OUT.tmp"; continue
  fi
  WAV="$WORK/${KEY%.*}.16k.wav"
  if ! decode "$RAW" "$WAV" || [ ! -s "$WAV" ]; then
    echo "  SKIP: could not decode $KEY (is ffmpeg installed?); kept in KV"
    echo "_SKIPPED (could not decode audio)._" >> "$OUT.tmp"; echo >> "$OUT.tmp"; continue
  fi
  whisper-cli -m "$MODEL" -f "$WAV" -nt -np --prompt "$PROMPT" 2>/dev/null < /dev/null | sed 's/^ *//' >> "$OUT.tmp"
  echo >> "$OUT.tmp"; echo >> "$OUT.tmp"
done <<< "$KEYS"

mv "$OUT.tmp" "$OUT"; rm -rf "$WORK"
echo; echo "Wrote $OUT"
echo "Next: hand transcripts.md to the skill (SKILL.md stage 4) to fill the four documents."

if [ "$ARCHIVE_MODE" = "--archive" ]; then
  echo; echo "Archiving audio locally and emptying the KV store..."
  mkdir -p interview-audio
  while IFS= read -r KEY; do
    case "$KEY" in
      miccheck-*) npx wrangler kv key delete --namespace-id "$NS_ID" --remote "$KEY" >/dev/null 2>&1
                  echo "  purged mic-check: $KEY" ;;
      *) npx wrangler kv key get --namespace-id "$NS_ID" --remote "$KEY" > "interview-audio/$KEY" 2>/dev/null
         npx wrangler kv key delete --namespace-id "$NS_ID" --remote "$KEY" >/dev/null 2>&1
         echo "  archived + deleted: $KEY" ;;
    esac
  done <<< "$KEYS_ALL"
fi

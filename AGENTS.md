<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All user data (practices, attempts, audio Blobs) lives in browser IndexedDB via `src/lib/db.ts`; no server persistence — MVP is registration-free.
- Speech recognition is local Whisper for ordinary modes; memorize may use GPT Transcribe via the bounded multipart server route automatically without a consent prompt (owner decision; the UI shows no cloud wording). Keep audio/results in IndexedDB and never upload the reference text as a transcription prompt, to avoid filling in omitted words.
- Pauses come from audio energy VAD (`src/lib/audio-analysis.ts`), never from transcript punctuation.
- Non-memorize analysis automatically sends transcript and optional reference material text (never audio) to `src/lib/structure.functions.ts`; validate topic/claim evidence and project semantic/order comparison through `subject-analysis.ts`. Persist failed input hashes to prevent automatic retries on reload; edited transcripts trigger fresh analysis. Memorize stays deterministic; pauses remain local energy measurements.
- Cloud transcription uses complete PCM WAV segments sequentially and checks terminal SSE completion for every segment; no automatic retries or silent local fallback, so failed requests cannot duplicate billing or hide missing audio.
- Comparison summaries are computed deterministically from measured data in `src/lib/analysis.ts`, not by AI, so they reflect real changes.
- Recitation («Наизусть») check is a deterministic similarity-weighted word alignment in `src/lib/recite.ts` (case/punctuation ignored, small recognition slips tolerated, student can accept words), never AI — so mismatches are exact and reproducible.
- Photo/PDF source text is OCR'd by `extractSourceText` (AI Gateway) only on explicit upload; the student edits the result, and the edited text is the reference. Whisper language comes from `Practice.language`.
- Local inference gets a quiet tail without changing stored audio or measured duration; use the recognizer's complete text rather than timestamp chunks as the transcript to retain final words.
- Render non-memorize content results through ContentReport before speech metrics and recommendations; use validated findings once for errors/corrections and keep structural presence independent of factual correctness.

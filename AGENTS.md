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
- Speech recognition is local Whisper for ordinary modes; memorize may use GPT Transcribe via the bounded multipart server route only after explicit per-request audio consent. Keep audio/results in IndexedDB and never upload the reference text as a transcription prompt, to avoid filling in omitted words.
- Pauses come from audio energy VAD (`src/lib/audio-analysis.ts`), never from transcript punctuation.
- Structure analysis sends only transcript text to `src/lib/structure.functions.ts` after consent; memorize audio upload is a separate consent flow. Output is validated, and pauses remain local energy measurements.
- Cloud transcription uses complete PCM WAV segments sequentially and checks terminal SSE completion for every segment; no automatic retries or silent local fallback, so failed requests cannot duplicate billing or hide missing audio.
- Comparison summaries are computed deterministically from measured data in `src/lib/analysis.ts`, not by AI, so they reflect real changes.
- Recitation («Наизусть») check is a deterministic similarity-weighted word alignment in `src/lib/recite.ts` (case/punctuation ignored, small recognition slips tolerated, student can accept words), never AI — so mismatches are exact and reproducible.
- Photo/PDF source text is OCR'd by `extractSourceText` (AI Gateway) only on explicit upload; the student edits the result, and the edited text is the reference. Whisper language comes from `Practice.language`.

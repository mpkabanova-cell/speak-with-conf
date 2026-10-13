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
- Speech recognition runs locally in a Web Worker (`src/lib/whisper.worker.ts`, Transformers.js, WebGPU→WASM fallback); audio never leaves the browser.
- Pauses come from audio energy VAD (`src/lib/audio-analysis.ts`), never from transcript punctuation.
- Only the transcript text goes to the server function `src/lib/structure.functions.ts` (Lovable AI Gateway), after explicit user consent; output is Zod-validated.
- Comparison summaries are computed deterministically from measured data in `src/lib/analysis.ts`, not by AI, so they reflect real changes.

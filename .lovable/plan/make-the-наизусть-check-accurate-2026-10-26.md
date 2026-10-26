# Make the «Наизусть» check accurate

## What is wrong
The student said only 2 words wrong, but the screen shows 22 words said differently and 12 skipped. The words were actually said correctly. The speech recognition, which runs in the browser on a small model, heard them badly («пожелтили», «зенень», «жабару»). The check then compares those garbled words letter for letter, so every recognition mistake counts as a student mistake. One misheard word can also shift the alignment, so its neighbours show as «пропущено».

## Improvements

1. **Give recognition the original text as a hint.** In «Наизусть» mode the expected text is known. Passing it to Whisper as a prompt makes it pick the real words («пожелтели», «зелень») instead of near-sounding nonsense. This is the biggest gain.
2. **Use a stronger recognition model for «Наизусть».** Use whisper-small (or larger, where the device allows) rather than base, and show the fallback model if the device is weak.
3. **Tolerant word matching.** Count a word as correct when it differs from the original only slightly, by letter similarity, so «пожелтили» = «пожелтели». Count it as «сказано иначе» only when it is really a different word.
4. **Smarter alignment.** Align by similarity, not exact equality, so one bad word doesn't knock its neighbours into «пропущено». Merge split or joined words («меж цветов» / «межцветов», «полис» / «поле с»).
5. **Honest display of uncertainty.** Show a third state, «распознано неуверенно» (soft yellow, not red), for borderline words. Add a button to accept a word as correct with one tap.
6. **Quick re-check.** Fixing a word in the transcript re-runs the comparison immediately (this already exists; it will also work from the highlighted text).

## Verification
- Tests on your poem: garbled-but-close variants match, while truly wrong or skipped words are still caught. The case of exactly 2 real mistakes gives exactly 2.
- Run the old test cases again so no real mistake slips through.

## Technical details
- `whisper.worker.ts`: accept `prompt_text` and pass it as `prompt_ids` (tokenizer.getPromptIds), trimmed to the last ~200 tokens. Prefer whisper-small for memorize.
- `recite.ts`: weighted alignment (Needleman–Wunsch) with a Levenshtein-ratio cost. ok ≥ 0.75, uncertain 0.5–0.75, otherwise wrong. Join/split check on adjacent tokens. New status `"fuzzy"`. Stays deterministic, no AI (per the project rules).
- `ReciteView.tsx`: new style for fuzzy words, a «засчитать» action that stores overrides on the attempt.
- Extend `recite.test.ts`.

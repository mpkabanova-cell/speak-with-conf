# Tasks
- [ ] Automatically analyze completed/edited transcripts without confirmation, with clear topic and claim verdicts.
- [ ] Move transcript above results and improve local recognition without cloud audio in ordinary modes.
- [ ] Test automatic analysis, correction/reanalysis and persistence through UI and run regression tests.
- [x] Add subject accuracy for answer, retelling and project, plus project material upload and semantic/order comparison.
- [x] Verify project text-file upload, live analysis catches 20 vs 10 participants and reordered blocks, result persists on reload; accuracy and regression tests pass.
- [x] Connect GPT Transcribe for memorize with explicit audio consent and local fallback choice.
- [x] Verify spoken audio, consent, saved results, and regression tests (18 tests pass; live request returns 200 and persists).
- [x] Synthesize the poem with two prescribed omissions and compare: expected 2 omissions, model transcript yields 12. Accuracy on a human recording remains unverified; synthesized speech is not proof of human-recitation accuracy.
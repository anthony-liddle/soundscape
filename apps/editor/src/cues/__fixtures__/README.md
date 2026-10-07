# Fixtures

`peach.cues.json` is Peach of a Word's cue document, copied byte for byte:
34 cues, 117 notes and 3 instruments, 27,789 bytes, sha256
`b66a60d767bd4fc804945a1f78d0d2acfa60a2168be279ffb848b388445f615f`.

It was copied from `src/audio/peach.cues.json` in
`anthony-liddle/peach-of-a-word` with that repository at `23dc2e5`. The file
was last changed in `442ceb4`, "feat(sounds): the game's sounds on Soundscape,
held to the old engine in three browsers (#147)", and Peach's `main` holds
identical bytes.

The acceptance test in `../__tests__/acceptance.browser.test.tsx` opens it,
plays every cue, and saves it back, so do not reformat it. `.gitattributes`
keeps git from converting its line endings.

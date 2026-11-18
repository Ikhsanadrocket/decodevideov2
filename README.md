# Video Decode v2 — Content DNA
Video apa pun (cinematic, explainer, screen recording, vlog, animasi) -> segmen -> `content_dna.json`
(meta, style DNA, subjek berulang, beats/struktur, daftar shot + slot yang bisa dipakai ulang, transkrip).
`content_dna.json` adalah file serah-terima untuk tool "remake" (1 kalimat topik -> video baru).
- `public/` : UI statis tanpa build
- `functions/api/analyze.js` : proxy ke Claude API
- Secret: `ANTHROPIC_API_KEY`, `APP_PASSWORD` (opsional: `MODEL`)
- Lokal: `.dev.vars` berisi secret, lalu `npx wrangler pages dev public`
- Transkrip opsional: unggah .srt/.vtt (mis. subtitle YouTube) agar struktur mengikuti narasi.

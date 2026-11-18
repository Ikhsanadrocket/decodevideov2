# Video Decode v2 — Content DNA
Video apa pun (cinematic, explainer, screen recording, vlog, animasi) -> segmen -> `content_dna.json`
(meta, style DNA, subjek berulang, beats/struktur, daftar shot + slot yang bisa dipakai ulang, transkrip).
`content_dna.json` adalah file serah-terima untuk tool "remake" (1 kalimat topik -> video baru).
- `public/` : UI statis tanpa build
- `src/worker.js` : Worker (serve aset + proxy `/api/analyze` ke Claude API)
- Secret (bukan Pages, set di Worker): `npx wrangler secret put ANTHROPIC_API_KEY` dan `APP_PASSWORD`
- Lokal: `.dev.vars` berisi dua secret itu, lalu `npx wrangler dev`
- Deploy: `npx wrangler deploy` (atau Workers Builds di dashboard, deploy command `npx wrangler deploy`)
- Transkrip opsional: unggah .srt/.vtt agar struktur mengikuti narasi.

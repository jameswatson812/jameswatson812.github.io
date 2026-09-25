# jameswatson812.github.io

Personal site of Lingyu Zhan, served by GitHub Pages from `main` as plain static files (`.nojekyll`).

- `tools/content/*.html` — page bodies; `tools/build.py` wraps them in the shared header/footer and
  writes `index.html`, `research/`, `publications/`, `fish-genomics/`, `human-genomics/`.
- `assets/site.css` — the one stylesheet (light/dark).
- `fish-genomics/fst-1kb/` — interactive plotly panels (`fst_1kb_genome.html`, `fst_1kb_SCAF_<k>.html`),
  their shared `lib/`, `png/` fallbacks, the window tables and `meta.json`. Produced on Hoffman2 by
  `scripts/08_functional_categories/24_export_fst_widgets.job` in the goby project and copied here.
- `docs/DESIGN.md` — the approved design.

Update a page: edit its file under `tools/content/`, run `python3 tools/build.py`, then
`python3 tools/check.py`, commit and push.

# jameswatson812.github.io

Personal site of Lingyu Zhan, served by GitHub Pages from `main` as plain static files (`.nojekyll`).

- `tools/content/*.html` — page bodies; `tools/build.py` wraps them in the shared header/footer and
  writes `index.html`, `research/`, `publications/`, `fish-genomics/`, `human-genomics/`.
- `assets/site.css` — the one stylesheet (light/dark).
- `fish-genomics/fst-101snp/` — interactive plotly panels of the Maruki-style window F_ST scan
  (`fst101_genome.html`, `fst101_SCAF_<k>.html`), their shared `lib/`, `png/` fallbacks, the window tables and
  `meta.json`. Produced on Hoffman2 by `scripts/08_functional_categories/25_export_fst101_widgets.job` in the
  goby project (R export from NB08's `fig5_windows_fst.tsv`, then `24b_slim_widgets.py`) and copied here with
  `rsync` from `diversity_clam/eda_outputs_maruki_panels/web/`.
- `fish-genomics/fst-101snp-pairs/` — the pairwise version (every pair of the six coastal units):
  `pw_<A>-<B>_genome.html`, `pw_<A>-<B>_SCAF_<k>.html`, `pw_matrix.html`, `png/`, the window tables and `meta.json`.
  Produced by `25b_export_pairwise_widgets.job` from NB10 (`goby_10_pairwise_fst_windows_R.ipynb`).
- `docs/DESIGN.md` — the approved design.

Update a page: edit its file under `tools/content/`, run `python3 tools/build.py`, then
`python3 tools/check.py`, commit and push.

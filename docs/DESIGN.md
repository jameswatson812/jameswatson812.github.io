# Personal site design (approved 2026-09-25)

Rebuild of https://jameswatson812.github.io as a plain static site, with a Fish genomics tab that
publishes the interactive 1 kb sliding-window F_ST figures from the tidewater goby project.

## Decisions
- **Foundation:** hand-written HTML + one CSS file, no Jekyll, no build on GitHub (`.nojekyll`).
  `tools/build.py` stamps the shared header/footer onto `tools/content/*.html`; output pages are committed.
- **Repo and storage:** the existing `jameswatson812/jameswatson812.github.io` repository (branch `main`,
  Pages already enabled) is kept, its dead Hexo remnants removed. The working copy lives on the Google
  Drive mount at `My Drive/github/jameswatson812.github.io/` so the site is backed up with the rest of
  the user's files.
- **Tabs:** Home | Research | Publications | Fish genomics | Human genomics. Home carries the name,
  affiliation and a one-line background; Research, Publications and Human genomics are placeholders.
- **Fish genomics page:** intro to the study and the 1 kb window F_ST analysis with its key numbers, the
  genome-wide interactive overview embedded at the top, a scaffold menu (SCAF_1..22) that swaps a second
  panel loaded on demand, download links for the outlier and full window tables, static PNG fallbacks.
- **Figures:** exported on Hoffman2 by `24_export_fst_widgets.job` from the window table that
  `goby_09_fst_windows_1kb_R.ipynb` writes, using the notebook's plotting code. Widgets are saved with
  `selfcontained = FALSE` so one `lib/` directory (~4 MB) serves all 23 panels; the genome overview uses
  one WebGL trace per scaffold with a hovertemplate to stay small. Served under `fish-genomics/fst-1kb/`.
- **Verification:** `tools/check.py` (links resolve, titles present, size limits) before every push;
  after the push, HTTP 200 on every tab and a browser check that the widgets render and hover works.

## Not in scope
Email address on the home page (left off until the owner says so), per-scaffold PNGs embedded in the
page (linked only), the notebook's own 163 MB size (a `partial_bundle()` fix in the generator is a
separate follow-up).

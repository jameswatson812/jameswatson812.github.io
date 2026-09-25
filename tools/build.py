#!/usr/bin/env python3
"""Build the site's pages from tools/content/*.html plus the shared header and footer.

    python3 tools/build.py          # from the repo root

The generated pages are committed; GitHub Pages serves them as-is (.nojekyll, no build on GitHub).
Edit tools/content/<page>.html, re-run, commit. The Fish genomics page takes its numbers and its
scaffold menu from fish-genomics/fst-101snp/meta.json (written by the export job); when that file or
a field is absent, the numbers fall back to the NB08 readout recorded in FALLBACK below.
"""
import datetime
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTENT = ROOT / "tools" / "content"
META = ROOT / "fish-genomics" / "fst-101snp" / "meta.json"
SITE_NAME = "Lingyu Zhan"
NAV = [("Home", ""), ("Research", "research/"), ("Publications", "publications/"),
       ("Fish genomics", "fish-genomics/"), ("Human genomics", "human-genomics/")]
# output path, nav key, <title>, description, content file, depth below the root
PAGES = [
    ("index.html", "Home", SITE_NAME, "Lingyu Zhan, statistical geneticist, Ophoff Lab, UCLA.", "home.html", 0),
    ("research/index.html", "Research", "Research", "Research interests and projects.", "research.html", 1),
    ("publications/index.html", "Publications", "Publications", "Selected publications.", "publications.html", 1),
    ("fish-genomics/index.html", "Fish genomics", "Fish genomics",
     "Population genomics of the tidewater goby: interactive genome-wide F_ST scans in 101-SNP windows.", "fish-genomics.html", 1),
    ("human-genomics/index.html", "Human genomics", "Human genomics", "Human genomics projects.", "human-genomics.html", 1),
]
# the NB08 readout (goby_08_maruki_panels_R.ipynb, job 14746694), used only when meta.json lacks a field
FALLBACK = {"n_windows": 1010, "n_snps_in_windows": 102010, "nb08_n_snps_total": 1739987,
            "nb08_n_snps_maf10": 103251, "nb08_n_polymorphic_north": 1422005,
            "fst_windows": {"mean": 0.669, "sd": 0.103}, "n_outlier_windows": 3, "cut_line": 0.911,
            "n_outlier_genes": 16, "window_span_bp": {"median": 850447}}
TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="stylesheet" href="{root}assets/site.css">
</head>
<body>
<header class="site"><div class="wrap">
  <a class="brand" href="{root}">{site_name}</a>
  <nav class="tabs" aria-label="Site">
{nav}
  </nav>
</div></header>
<main class="wrap">
{body}
</main>
<footer class="site"><div class="wrap">&copy; {year} {site_name} &middot; <a href="https://github.com/jameswatson812/jameswatson812.github.io">Site source</a></div></footer>
</body>
</html>
"""

_META = None


def load_meta():
    global _META
    if _META is None:
        if META.exists():
            _META = json.loads(META.read_text())
        else:
            print(f"WARN: {META.relative_to(ROOT)} absent, using the NB08 readout numbers")
            _META = {}
    return _META


def get(*keys):
    """Nested lookup in meta.json, falling back to FALLBACK for a missing or null field."""
    cur, fb = load_meta(), FALLBACK
    for k in keys:
        cur = cur.get(k) if isinstance(cur, dict) else None
        fb = fb.get(k) if isinstance(fb, dict) else None
    return cur if cur is not None else fb


def page_numbers():
    """Tokens for the Fish genomics page."""
    maf10, poly = get("nb08_n_snps_maf10"), get("nb08_n_polymorphic_north")
    return {
        "n_total": f"{get('nb08_n_snps_total'):,}",
        "n_poly": f"{poly:,}",
        "n_snps_maf10": f"{maf10:,}",
        "pct_maf10": f"{100 * maf10 / poly:.0f}%",
        "n_windows": f"{get('n_windows'):,}",
        "n_snps_in_windows": f"{get('n_snps_in_windows'):,}",
        "mean": f"{get('fst_windows', 'mean'):.3f}",
        "sd": f"{get('fst_windows', 'sd'):.3f}",
        "n_outliers": f"{get('n_outlier_windows'):,}",
        "cut": f"{get('cut_line'):.3f}",
        "n_outlier_genes": f"{get('n_outlier_genes'):,}",
        "span_mb": f"{get('window_span_bp', 'median') / 1e6:.1f}",
    }


def scaffold_options():
    per = load_meta().get("per_scaffold", {})
    opts = []
    for k in range(1, 23):
        n = per.get(f"SCAF_{k}")
        label = f"SCAF_{k}" + (f" ({n:,} windows)" if n else "")
        opts.append(f'<option value="{k}">{label}</option>')
    return "".join(opts)


def render(out, key, title, description, content, depth):
    root = "./" if depth == 0 else "../" * depth
    links = []
    for name, href in NAV:
        cur = ' aria-current="page"' if name == key else ""
        links.append(f'    <a href="{root}{href}"{cur}>{name}</a>')
    nav = "\n".join(links)
    body = (CONTENT / content).read_text()
    body = body.replace("{root}", root).replace("{scaffold_options}", scaffold_options())
    for token, value in page_numbers().items():
        body = body.replace("{" + token + "}", value)
    page_title = title if title == SITE_NAME else f"{title} · {SITE_NAME}"
    html = TEMPLATE.format(title=page_title, description=description, root=root, site_name=SITE_NAME,
                           nav=nav, body=body.rstrip("\n"), year=datetime.date.today().year)
    target = ROOT / out
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html)
    return target


def main():
    for spec in PAGES:
        t = render(*spec)
        print(f"wrote {t.relative_to(ROOT)} ({t.stat().st_size:,} B)")


if __name__ == "__main__":
    main()

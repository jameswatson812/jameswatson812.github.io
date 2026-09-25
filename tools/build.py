#!/usr/bin/env python3
"""Build the site's pages from tools/content/*.html plus the shared header and footer.

    python3 tools/build.py          # from the repo root

The generated pages are committed; GitHub Pages serves them as-is (.nojekyll, no build on GitHub).
Edit tools/content/<page>.html, re-run, commit. The Fish genomics scaffold menu is labelled from
fish-genomics/fst-1kb/meta.json when that file is present.
"""
import datetime
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTENT = ROOT / "tools" / "content"
SITE_NAME = "Lingyu Zhan"
NAV = [("Home", ""), ("Research", "research/"), ("Publications", "publications/"),
       ("Fish genomics", "fish-genomics/"), ("Human genomics", "human-genomics/")]
# output path, nav key, <title>, description, content file, depth below the root
PAGES = [
    ("index.html", "Home", SITE_NAME, "Lingyu Zhan, statistical geneticist, Ophoff Lab, UCLA.", "home.html", 0),
    ("research/index.html", "Research", "Research", "Research interests and projects.", "research.html", 1),
    ("publications/index.html", "Publications", "Publications", "Selected publications.", "publications.html", 1),
    ("fish-genomics/index.html", "Fish genomics", "Fish genomics",
     "Population genomics of the tidewater goby: interactive genome-wide F_ST scans in 1 kb windows.", "fish-genomics.html", 1),
    ("human-genomics/index.html", "Human genomics", "Human genomics", "Human genomics projects.", "human-genomics.html", 1),
]
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


def scaffold_options():
    meta = ROOT / "fish-genomics" / "fst-1kb" / "meta.json"
    per = {}
    if meta.exists():
        per = json.loads(meta.read_text()).get("per_scaffold", {})
    opts = []
    for k in range(1, 23):
        n = per.get(f"SCAF_{k}")
        label = f"SCAF_{k}" + (f" ({n:,} windows)" if n else "")
        opts.append(f'<option value="{k}">{label}</option>')
    return "".join(opts)


FALLBACK = {"threshold_999": 0.980, "n_outlier_windows": 235, "n_outlier_windows_with_genes": 140,
            "n_outlier_genes": 132, "n_windows_ge1": 464252, "n_plotted": 234379,
            "fst_plotted": {"median": 0.077, "mean": 0.203}}


def fst_numbers():
    """Key numbers for the Fish genomics page, read from the export's meta.json when present."""
    meta = ROOT / "fish-genomics" / "fst-1kb" / "meta.json"
    m = json.loads(meta.read_text()) if meta.exists() else None
    if m is None:
        print("WARN: fish-genomics/fst-1kb/meta.json absent, using the NB09 readout numbers")
        m = FALLBACK
    return {
        "thr": f"{m['threshold_999']:.3f}",
        "n_outliers": f"{m['n_outlier_windows']:,}",
        "n_outliers_with_genes": f"{m['n_outlier_windows_with_genes']:,}",
        "n_outlier_genes": f"{m['n_outlier_genes']:,}",
        "n_ge1": f"{m['n_windows_ge1']:,}",
        "n_plotted": f"{m['n_plotted']:,}",
        "median": f"{m['fst_plotted']['median']:.3f}",
        "mean": f"{m['fst_plotted']['mean']:.3f}",
    }


def render(out, key, title, description, content, depth):
    root = "./" if depth == 0 else "../" * depth
    links = []
    for name, href in NAV:
        cur = ' aria-current="page"' if name == key else ""
        links.append(f'    <a href="{root}{href}"{cur}>{name}</a>')
    nav = "\n".join(links)
    body = (CONTENT / content).read_text()
    body = body.replace("{root}", root).replace("{scaffold_options}", scaffold_options())
    for token, value in fst_numbers().items():
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

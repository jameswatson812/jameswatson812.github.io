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
     "Population genomics of the tidewater goby: interactive genome-wide and pairwise F_ST scans in 101-SNP windows.", "fish-genomics.html", 1),
    ("fish-genomics/heterozygosity/index.html", "Fish genomics", "Heterozygosity",
     "Per-sample heterozygosity of the tidewater goby by coastal unit and subunit, coloured by sampling era.", "fish-het.html", 2),
    ("human-genomics/index.html", "Human genomics", "Human genomics", "Human genomics projects.", "human-genomics.html", 1),
]
# sub-tabs shown on every Fish genomics page (output path prefix -> label)
FISH_SUBNAV = [("F<sub>ST</sub> scans", "fish-genomics/"), ("Heterozygosity", "fish-genomics/heterozygosity/")]
META_HET = ROOT / "fish-genomics" / "het" / "meta.json"
PW_CLASSES = [("all", "fst-101snp-pairs", "All SNP classes"), ("replacement", "fst-101snp-pairs-replacement", "Replacement SNPs"),
              ("silent", "fst-101snp-pairs-silent", "Silent SNPs")]
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


def pairwise_tokens():
    """Tokens for the pairwise section: one summary table and scaffold-count map per site class."""
    tokens = {"pw_n_pairs": "15", "pw_class_options": "".join(
        f'<option value="{cls}">{label}</option>' for cls, _, label in PW_CLASSES)}
    per_all, opts = {}, None
    for cls, folder, label in PW_CLASSES:
        meta = ROOT / "fish-genomics" / folder / "meta.json"
        rows = []
        if not meta.exists():
            print(f"WARN: {meta.relative_to(ROOT)} absent, {cls} pairwise table built empty")
            per_all[cls] = {}
        else:
            m = json.loads(meta.read_text())
            tokens["pw_n_pairs"] = str(m["n_pairs"])
            if opts is None:
                opts = "".join(f'<option value="{p["pair"]}">{p["label"]}</option>' for p in m["pairs"])
            per_all[cls] = {p["pair"]: {k: v for k, v in p["per_scaffold"].items() if v} for p in m["pairs"]}
            for p in m["pairs"]:
                if p["n_windows"]:
                    wm = f'{p["win_mean"]:.3f} ({p["win_sd"]:.3f})' if p.get("win_sd") is not None else f'{p["win_mean"]:.3f}'
                    out = f'{p["n_outliers"]:,}' + (f' (cutoff {p["cut_line"]:.3f})' if p.get("cut_line") is not None else "")
                else:
                    wm, out = "no complete window", "0"
                rows.append("    <tr><td>{label}</td><td>{fish}</td><td>{snps}</td><td>{win}</td><td>{fst}</td><td>{wm}</td><td>{out}</td></tr>".format(
                    label=p["label"], fish=f'{p["n_a"]} + {p["n_b"]}', snps=f'{p["n_snps_maf10"]:,}', win=f'{p["n_windows"]:,}',
                    fst=f'{p["fst_maf10"]:.3f}' if p.get("fst_maf10") is not None else "n/a", wm=wm, out=out))
        tokens[f"pw_summary_rows_{cls}"] = "\n".join(rows)
    tokens["pw_pair_options"] = opts or ""
    tokens["pw_per_scaffold_json"] = json.dumps(per_all, separators=(",", ":"))
    return tokens


def het_tokens():
    """Tokens for the Heterozygosity page from fish-genomics/het/meta.json."""
    if not META_HET.exists():
        print(f"WARN: {META_HET.relative_to(ROOT)} absent, heterozygosity page built without numbers")
        return {"het_n_fish": "?", "het_n_pre": "?", "het_n_post": "?", "het_n_subunits": "?", "het_unit_rows": ""}
    m = json.loads(META_HET.read_text())
    rows = ["    <tr><td>{unit}</td><td>{n}</td><td>{pre}</td><td>{post}</td><td>{med}</td></tr>".format(
        unit=u["unit"], n=u["n"], pre=u["n_pre2005"], post=u["n_from2005"], med=f'{u["median_het"]:.2e}'.replace("e-0", "e-"))
        for u in m["per_unit"]]
    return {"het_n_fish": f'{m["n_fish"]:,}', "het_n_pre": f'{m["n_pre2005"]:,}', "het_n_post": f'{m["n_from2005"]:,}',
            "het_n_subunits": str(m["n_subunits"]), "het_unit_rows": "\n".join(rows)}


def fish_subnav(out):
    """The sub-tab bar for Fish genomics pages; the tab whose folder is the page's own is current."""
    depth = out.count("/")
    root = "./" if depth == 0 else "../" * depth
    links = []
    for label, folder in FISH_SUBNAV:
        cur = ' aria-current="page"' if out.startswith(folder) and out[len(folder):].count("/") == 0 else ""
        links.append(f'<a href="{root}{folder}"{cur}>{label}</a>')
    return '<nav class="subtabs" aria-label="Fish genomics sections">' + "".join(links) + "</nav>"


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
    body = body.replace("{fish_subnav}", fish_subnav(out))
    for token, value in {**page_numbers(), **pairwise_tokens(), **het_tokens()}.items():
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

#!/usr/bin/env python3
"""Check the built site before pushing: every relative link and iframe/script/css source resolves to a
file, every page has a <title> and a current nav tab, no file is over GitHub's limits, and report sizes.

    python3 tools/check.py [--allow-missing PREFIX ...]

--allow-missing PREFIX tolerates unresolved targets under PREFIX (used before the figures are copied in).
Exit status 1 on any error.
"""
import argparse
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP_DIRS = {".git", "tools", "docs"}
ATTR = re.compile(r'(?:href|src)="([^"]+)"')
HARD_LIMIT = 100 * 1024 * 1024   # GitHub refuses files over 100 MB
WARN_LIMIT = 25 * 1024 * 1024


def site_files():
    for p in ROOT.rglob("*"):
        if p.is_file() and not any(part in SKIP_DIRS for part in p.relative_to(ROOT).parts):
            yield p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--allow-missing", nargs="*", default=[])
    args = ap.parse_args()
    errors, warnings = [], []
    pages = [p for p in site_files() if p.suffix == ".html" and "fst-1kb" not in p.parts]
    if not (ROOT / ".nojekyll").exists():
        errors.append(".nojekyll missing (GitHub would run Jekyll over the site)")
    for page in pages:
        text = page.read_text()
        rel = page.relative_to(ROOT)
        if "<title>" not in text:
            errors.append(f"{rel}: no <title>")
        if 'aria-current="page"' not in text:
            errors.append(f"{rel}: no current nav tab")
        for target in ATTR.findall(text):
            if re.match(r"^(https?:|mailto:|#|data:)", target):
                continue
            path = target.split("#", 1)[0].split("?", 1)[0]
            if not path:
                continue
            resolved = (page.parent / path).resolve()
            if path.endswith("/") or resolved.is_dir():
                resolved = resolved / "index.html"
            if not resolved.exists():
                rel_t = str(resolved.relative_to(ROOT)) if str(resolved).startswith(str(ROOT)) else str(resolved)
                if any(rel_t.startswith(pref) for pref in args.allow_missing):
                    warnings.append(f"{rel}: {target} not present yet (allowed)")
                else:
                    errors.append(f"{rel}: broken link {target}")
    total = 0
    big = []
    for p in site_files():
        s = p.stat().st_size
        total += s
        if s > HARD_LIMIT:
            errors.append(f"{p.relative_to(ROOT)}: {s/1e6:.1f} MB exceeds GitHub's 100 MB file limit")
        elif s > WARN_LIMIT:
            warnings.append(f"{p.relative_to(ROOT)}: {s/1e6:.1f} MB is large for a web page")
        if s > 1_000_000:
            big.append((s, p.relative_to(ROOT)))
    print(f"pages checked: {len(pages)} | site total: {total/1e6:.1f} MB | files >1 MB: {len(big)}")
    for s, p in sorted(big, reverse=True)[:8]:
        print(f"  {s/1e6:7.1f} MB  {p}")
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print("RESULT:", "FAIL" if errors else "OK")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()

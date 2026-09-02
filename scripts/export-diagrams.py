#!/usr/bin/env python3
"""Export diagrams/*/*.html SVG sources to public/images/<stem>.svg.

The HTML file is the single editable source (AGENTS.md §五.2); the SVG under
public/images/ is a derived artifact and must never be hand-edited. This script
makes that derivation deterministic: extract the <svg> element verbatim and
prepend the XML declaration. Nothing else is rewritten.

Usage:
  python3 scripts/export-diagrams.py [file.html ...]     # explicit files
  python3 scripts/export-diagrams.py --changed           # HTML newer than its SVG
  python3 scripts/export-diagrams.py                     # all (use with care)
Exits non-zero if a source contains no <svg>.
"""
import re, sys, pathlib

XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>\n'
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "images"


def extract_svg(html_path):
    txt = html_path.read_text(encoding="utf-8")
    m = re.search(r"<svg\b.*?</svg>", txt, re.S)
    return m.group(0) if m else None


def export(html_path, verbose=True):
    svg = extract_svg(html_path)
    if svg is None:
        print(f"FAIL  {html_path}: no <svg> element")
        return False
    out = OUT_DIR / f"{html_path.stem}.svg"
    payload = XML_DECL + svg + "\n"
    before = out.read_bytes() if out.exists() else None
    if before == payload.encode("utf-8"):
        if verbose:
            print(f"SAME  {out.relative_to(ROOT)}  ({len(payload)} B, unchanged)")
        return True
    out.write_text(payload, encoding="utf-8")
    if verbose:
        verb = "WRITE" if before is None else "UPDATE"
        print(f"{verb} {out.relative_to(ROOT)}  ({len(payload)} B)")
    return True


def main():
    args = sys.argv[1:]
    if args and args[0] == "--changed":
        files = [h for h in sorted((ROOT / "diagrams").glob("*/*.html"))
                 if not (OUT_DIR / f"{h.stem}.svg").exists()
                 or h.stat().st_mtime > (OUT_DIR / f"{h.stem}.svg").stat().st_mtime]
        if not files:
            print("nothing changed")
            return 0
    elif args:
        files = [pathlib.Path(a) for a in args]
    else:
        files = sorted((ROOT / "diagrams").glob("*/*.html"))
    ok = all(export(f) for f in files)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

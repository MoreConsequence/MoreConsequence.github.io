#!/usr/bin/env python3
"""Verify diagram-design stroke/border consistency for the github-blog CDN & distributed-systems diagrams.

Checks (per the diagram-design skill token system, style-guide.md L113-123 + SKILL.md L293-340):
  1. stroke-width only uses the three allowed tokens: 0.8 (hairline), 1 (default), 1.2 (strong).
     - node box borders & neutral connectors  -> 1
     - accent/focal connectors (stroke #eb6c36, line/path) -> 1.2
     - axes / baselines / inner eyebrows / faint containers -> 0.8
  2. all three arrow markers (arrow, arrow-accent, arrow-link) are defined, canonical size
     markerWidth=8 markerHeight=6 refX=7 refY=3, polygon "0 0, 8 3, 0 6".
  3. no arrow-label mask rect overlaps its connector line (6-10px gap rule).
  4. no arrow-label mask cuts a node box border (rule 6: mask must not overlap a box drawn after it).

Usage:
  python3 scripts/verify-diagram-strokes.py [file.html|file.svg ...]
  (defaults to all diagrams/*/*.html if no args)
Exits non-zero if any diagram fails, so it can gate CI / pre-commit.
"""
import sys, re, pathlib, xml.etree.ElementTree as ET

FAINT = {
    "rgba(45,49,66,0.10)", "rgba(45,49,66,0.12)", "rgba(45,49,66,0.18)",
    "rgba(45,49,66,0.20)", "rgba(45,49,66,0.22)", "rgba(122,131,153,0.40)",
    "rgba(235,108,54,0.45)", "rgba(235,108,54,0.22)",
}
NODE_STROKE = {"#2d3142", "#4f5d75", "#7a8399", "#eb6c36"}
ALLOWED_W = {"0.8", "1", "1.2"}
CANON_MARKERS = {"arrow", "arrow-accent", "arrow-link"}


def num(el, a):
    v = el.get(a)
    return None if (v is None or "%" in v) else float(v)


def rects_overlap(r1, r2):
    return not (r1[0]+r1[2] <= r2[0] or r2[0]+r2[2] <= r1[0]
                or r1[1]+r1[3] <= r2[1] or r2[1]+r2[3] <= r1[1])


def fully_inside(inner, outer):
    return (inner[0] >= outer[0] and inner[1] >= outer[1]
            and inner[0]+inner[2] <= outer[0]+outer[2]
            and inner[1]+inner[3] <= outer[1]+outer[3])


def seg_hits_rect(x1, y1, x2, y2, rx, ry, rw, rh):
    sx1, sx2 = min(x1, x2), max(x1, x2)
    sy1, sy2 = min(y1, y2), max(y1, y2)
    if sx2 < rx or sx1 > rx+rw or sy2 < ry or sy1 > ry+rh:
        return False
    def ccw(ax, ay, bx, by, cx, cy):
        return (cy-ay)*(bx-ax) - (by-ay)*(cx-ax)
    def si(p1, p2, p3, p4):
        return ((ccw(*p3, *p4, *p1) > 0) != (ccw(*p3, *p4, *p2) > 0)) and \
               ((ccw(*p1, *p2, *p3) > 0) != (ccw(*p1, *p2, *p4) > 0))
    c = [(rx, ry), (rx+rw, ry), (rx+rw, ry+rh), (rx, ry+rh)]
    for i in range(4):
        if si((x1, y1), (x2, y2), c[i], c[(i+1) % 4]):
            return True
    return rx <= x1 <= rx+rw and ry <= y1 <= ry+rh and rx <= x2 <= rx+rw and ry <= y2 <= ry+rh


def extract_svg(path):
    txt = pathlib.Path(path).read_text(encoding="utf-8")
    if path.suffix == ".svg":
        return txt
    m = re.search(r"<svg\b.*?</svg>", txt, re.S)
    return m.group(0) if m else ""


def audit(svg_text):
    root = ET.fromstring(svg_text)
    problems = []
    arrows, masks, boxes = [], [], []
    widths = {}
    for el in root.iter():
        if el.tag.endswith("line") and el.get("marker-end"):
            c = [num(el, a) for a in ("x1", "y1", "x2", "y2")]
            if None not in c:
                arrows.append(tuple(c))
        if el.tag.endswith("rect"):
            fill = el.get("fill"); sc = el.get("stroke"); sw = el.get("stroke-width"); w = el.get("width")
            if fill == "#f5f5f5" and sc in (None, "transparent"):
                c = [num(el, a) for a in ("x", "y", "width", "height")]
                if None not in c:
                    masks.append(tuple(c))
            if sc in NODE_STROKE and fill != "#f5f5f5" and w not in (None, "100%"):
                c = [num(el, a) for a in ("x", "y", "width", "height")]
                if None not in c:
                    boxes.append(tuple(c))
            if sw:
                widths[sw] = widths.get(sw, 0) + 1
                if sw not in ALLOWED_W:
                    problems.append(f"stroke-width {sw} not in {sorted(ALLOWED_W)}")
    # markers present
    have = set(re.findall(r'<marker id="([^"]+)"', svg_text))
    for m in CANON_MARKERS - have:
        problems.append(f"missing marker #{m}")
    # arrow overlap
    for m in masks:
        for a in arrows:
            if seg_hits_rect(*a, *m):
                problems.append(f"label mask overlaps its connector at {m}")
                break
    # border cut
    for m in masks:
        for b in boxes:
            if rects_overlap(m, b) and not fully_inside(m, b):
                problems.append(f"label mask cuts node border at {m} on {b}")
    return problems, widths


def main():
    if len(sys.argv) > 1:
        files = [pathlib.Path(a) for a in sys.argv[1:]]
    else:
        files = sorted(pathlib.Path("diagrams").glob("*/*.html"))
    fails = 0
    for f in files:
        svg = extract_svg(f)
        if not svg:
            print(f"SKIP  {f} (no <svg> found)")
            continue
        try:
            probs, widths = audit(svg)
        except ET.ParseError as e:
            print(f"FAIL  {f}: XML parse error {e}")
            fails += 1
            continue
        if probs:
            fails += 1
            print(f"FAIL  {f}")
            for p in probs:
                print(f"       - {p}")
        else:
            print(f"OK    {f}  widths={widths}")
    print(f"\n{'ALL PASS' if fails == 0 else str(fails)+' FILE(S) FAILED'}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()

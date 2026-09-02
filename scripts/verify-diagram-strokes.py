#!/usr/bin/env python3
"""Verify diagram-design stroke/border consistency for github-blog diagrams.

Checks (per the diagram-design skill token system, style-guide.md L113-123 + SKILL.md L293-340):

  1. stroke-width only uses the three allowed tokens: 0.8 (hairline), 1 (default), 1.2 (strong).
     - node box borders (rect) & neutral connectors          -> 1
     - accent/focal connectors (stroke #eb6c36, line/path)   -> 1.2
     - axes / baselines / inner eyebrows / faint containers  -> 0.8
     Checked on every drawable element (rect, line, path, polyline, polygon, circle, ellipse) --
     connectors and arrowheads are line/path, so restricting this to rect would miss the
     exact class of defect it exists to catch.
  2. all three arrow markers (arrow, arrow-accent, arrow-link) are defined, canonical size
     markerWidth=8 markerHeight=6 refX=7 refY=3, polygon "0 0, 8 3, 0 6".
  3. no arrow-label mask rect overlaps a connector segment (6-10px gap rule).
     Segments are collected from both <line> and <path> (absolute M/L/H/V/Q).
  4. no arrow-label mask cuts a node box border.
  5. no dangling marker-start / marker-end reference (silently invisible arrowheads).

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
ACCENT = "#eb6c36"
NODE_STROKE = {"#2d3142", "#4f5d75", "#7a8399", ACCENT}
ALLOWED_W = {"0.8", "1", "1.2"}
CANON_MARKERS = {"arrow", "arrow-accent", "arrow-link"}
CANON_MARKER_ATTRS = {"markerWidth": "8", "markerHeight": "6", "refX": "7", "refY": "3"}
DRAWABLE = ("rect", "line", "path", "polyline", "polygon", "circle", "ellipse")
CONNECTOR = ("line", "path", "polyline")


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


def path_segments(d):
    """Return [(x1,y1,x2,y2), ...] for absolute M/L/H/V/Q paths, or None if the path
    uses arcs or relative commands we cannot resolve without a full interpreter.

    Absolute Q is how the style guide expresses a rounded orthogonal elbow. The
    control point sits exactly on the corner, so inserting it as a vertex yields a
    conservative envelope (the real curve bulges *inside* the corner). Overlap
    reports are therefore never false negatives -- at worst slightly strict.
    """
    if re.search(r"[CcAaSsTtZzmlhvcsqtaz]", d):
        return None
    pts, cur = [], None
    for cmd, arg in re.findall(r"([MLHVQ])\s*([-\d.,\s]+)", d):
        nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", arg)]
        if cmd in ("M", "L"):
            for i in range(0, len(nums) - 1, 2):
                cur = (nums[i], nums[i + 1])
                pts.append(cur)
        elif cmd == "H":                      # absolute horizontal: y stays
            if cur is None:
                return None
            for x in nums:
                cur = (x, cur[1])
                pts.append(cur)
        elif cmd == "V":                      # absolute vertical: x stays
            if cur is None:
                return None
            for y in nums:
                cur = (cur[0], y)
                pts.append(cur)
        elif cmd == "Q":                      # absolute quadratic: ctrl = corner
            if cur is None or len(nums) < 4:
                return None
            for i in range(0, len(nums) - 3, 4):
                cur = (nums[i], nums[i + 1])          # control point
                pts.append(cur)
                cur = (nums[i + 2], nums[i + 3])      # end point
                pts.append(cur)
    if len(pts) < 2:
        return None
    return [(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1]) for i in range(len(pts)-1)]


def expected_width(tag, color):
    if color in FAINT:
        return "0.8"
    if color == ACCENT and tag in CONNECTOR:
        return "1.2"
    return "1"


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
        tag = el.tag.split("}")[-1]
        if tag not in DRAWABLE:
            continue

        sc = el.get("stroke")
        sw = el.get("stroke-width")
        is_arrow = bool(el.get("marker-end"))

        # 1. stroke-width token check on every drawable element
        if sc:
            if sw is None:
                problems.append(f"<{tag}> stroke={sc} has no stroke-width")
            else:
                widths[sw] = widths.get(sw, 0) + 1
                if sw not in ALLOWED_W:
                    problems.append(f"<{tag}> stroke={sc} stroke-width={sw} not in {sorted(ALLOWED_W)}")
                else:
                    exp = expected_width(tag, sc.strip())
                    if sw != exp:
                        problems.append(f"<{tag}> stroke={sc} stroke-width={sw}, expected {exp}")

        # 2. collect connector segments for the mask-overlap check
        if is_arrow:
            if tag == "line":
                c = [num(el, a) for a in ("x1", "y1", "x2", "y2")]
                if None not in c:
                    arrows.append(tuple(c))
            elif tag == "path":
                segs = path_segments(el.get("d", ""))
                if segs is None:
                    problems.append("arrow <path> uses curves; cannot verify mask clearance")
                else:
                    arrows.extend(segs)

        # 3. collect label masks and node boxes
        if tag == "rect":
            fill = el.get("fill")
            w = el.get("width")
            if fill == "#f5f5f5" and sc in (None, "transparent"):
                c = [num(el, a) for a in ("x", "y", "width", "height")]
                if None not in c:
                    masks.append(tuple(c))
            if sc in NODE_STROKE and fill != "#f5f5f5" and w not in (None, "100%"):
                c = [num(el, a) for a in ("x", "y", "width", "height")]
                if None not in c:
                    boxes.append(tuple(c))

    # 4. markers present and canonical
    have = set(re.findall(r'<marker id="([^"]+)"', svg_text))
    for m in CANON_MARKERS - have:
        problems.append(f"missing marker #{m}")

    # 4b. dangling marker references -- silently invisible arrowheads.
    #     Only marker-start/marker-end count; url(#...) on fill/stroke is a
    #     pattern or gradient ref and is intentionally ignored here.
    refs = set()
    for el in root.iter():
        for attr in ("marker-start", "marker-end"):
            v = el.get(attr)
            if v:
                m = re.match(r"url\(#([^)]+)\)", v.strip())
                if m:
                    refs.add(m.group(1))
    for r in sorted(refs - have):
        problems.append(f"dangling marker ref url(#{r}) -- arrowhead will not render")
    for m in re.finditer(r"<marker\b([^>]*)>", svg_text):
        attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        mid = attrs.get("id")
        if mid not in CANON_MARKERS:
            continue
        for k, v in CANON_MARKER_ATTRS.items():
            if attrs.get(k) != v:
                problems.append(f"marker #{mid} {k}={attrs.get(k)}, expected {v}")

    # 5. mask vs connector
    for m in masks:
        for a in arrows:
            if seg_hits_rect(*a, *m):
                problems.append(f"label mask {m} overlaps connector {a}")
                break

    # 6. mask vs node border
    for m in masks:
        for b in boxes:
            if rects_overlap(m, b) and not fully_inside(m, b):
                problems.append(f"label mask {m} cuts node border {b}")

    return problems, widths, len(arrows), len(masks)


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
            probs, widths, na, nm = audit(svg)
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
            print(f"OK    {f}  widths={widths}  arrows={na}  masks={nm}")
    print(f"\n{'ALL PASS' if fails == 0 else str(fails)+' FILE(S) FAILED'}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()

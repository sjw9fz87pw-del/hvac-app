"""Builds the Axios Equipment Care logo (Option 4) as SVG, with text as outlines."""
import math, sys, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FD = os.path.join(os.path.dirname(__file__), "fonts/package/files")
def font(w): return TTFont(os.path.join(FD, f"montserrat-latin-{w}-normal.woff2"))
F = {w: font(w) for w in (600, 700, 800)}

NAVY = "#0b1f3f"; GRAY = "#5b6470"; TAG = "#163a6b"

def text_path(f, text, size, tracking_em=0.0):
    """Outline path for text at origin (baseline y=0), and its width."""
    gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f["head"].unitsPerEm
    s = size / upm; x = 0.0; parts = []
    for i, ch in enumerate(text):
        gname = cmap[ord(ch)]
        if ch != " ":
            pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
            gs[gname].draw(TransformPen(pen, (s, 0, 0, -s, x, 0)))
            parts.append(pen.getCommands())
        adv = f["hmtx"][gname][0] * s
        x += adv + (tracking_em * size if i < len(text) - 1 else 0)
    return " ".join(parts), x

def cap(f): return f["OS/2"].sCapHeight / f["head"].unitsPerEm

def fit(f, text, cap_px, width_px):
    size = cap_px / cap(f)
    _, w0 = text_path(f, text, size)
    tracking = (width_px - w0) / (size * (len(text) - 1))
    d, w = text_path(f, text, size, tracking)
    return d, w, size

def circle(p1, p2, p3):
    (ax, ay), (bx, by), (cx, cy) = p1, p2, p3
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    ux = ((ax*ax+ay*ay)*(by-cy)+(bx*bx+by*by)*(cy-ay)+(cx*cx+cy*cy)*(ay-by))/d
    uy = ((ax*ax+ay*ay)*(cx-bx)+(bx*bx+by*by)*(ax-cx)+(cx*cx+cy*cy)*(bx-ax))/d
    return ux, uy, math.hypot(ax-ux, ay-uy)

def swoosh(start, mid, end, thickness, sweep):
    """A crescent: the outer edge runs through start-mid-end; the inner edge
    returns with a flatter curve, so the stroke tapers to a point at both ends."""
    _, _, r_out = circle(start, mid, end)
    # inner edge: through start, a point pulled inward by `thickness` at the middle, end
    cx, cy, _ = circle(start, mid, end)
    mx, my = mid; k = thickness / math.hypot(mx - cx, my - cy)
    inner_mid = (mx - (mx - cx) * k, my - (my - cy) * k)
    _, _, r_in = circle(start, inner_mid, end)
    large = 1 if sweep_large(start, mid, end) else 0
    return (f"M{start[0]:.2f} {start[1]:.2f} A{r_out:.2f} {r_out:.2f} 0 {large} {sweep} {end[0]:.2f} {end[1]:.2f} "
            f"A{r_in:.2f} {r_in:.2f} 0 {large} {1 - sweep} {start[0]:.2f} {start[1]:.2f}Z")

def sweep_large(a, m, b):
    cx, cy, _ = circle(a, m, b)
    ang = lambda p: math.atan2(p[1] - cy, p[0] - cx)
    a0, am, a1 = ang(a), ang(m), ang(b)
    def ccw(x, y):  # angle from x to y going in increasing direction
        return (y - x) % (2 * math.pi)
    span = ccw(a0, a1) if ccw(a0, am) < ccw(a0, a1) else ccw(a1, a0)
    return span > math.pi

def ring(defs_id=""):
    """The three arcs of the Option 4 ring, in the 480x360 frame of the reference."""
    g = defs_id
    a = swoosh((166, 318), (68, 192), (356, 124), 16, 1)   # big outer arc: up the left, over the top
    b = swoosh((96, 100), (196, 66), (300, 98), 9, 1)        # thin inner arc across the top
    c = swoosh((112, 262), (216, 320), (330, 254), 15, 0)   # bottom arc
    defs = f"""<defs>
  <linearGradient id="{g}ga" x1="68" y1="310" x2="356" y2="70" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#0b4f86"/><stop offset="0.45" stop-color="#1667a0"/>
    <stop offset="0.72" stop-color="#2f8f95"/><stop offset="1" stop-color="#8cc043"/></linearGradient>
  <linearGradient id="{g}gb" x1="96" y1="80" x2="300" y2="96" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#1a6aa3"/><stop offset="1" stop-color="#2b86b5"/></linearGradient>
  <linearGradient id="{g}gc" x1="112" y1="290" x2="330" y2="290" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#86bd46"/><stop offset="0.5" stop-color="#3f9a7c"/>
    <stop offset="1" stop-color="#145f99"/></linearGradient>
</defs>"""
    paths = f'<path d="{a}" fill="url(#{g}ga)"/><path d="{b}" fill="url(#{g}gb)"/><path d="{c}" fill="url(#{g}gc)"/>'
    return defs, paths

def lockup(with_tagline):
    defs, arcs = ring("l")
    axios, w1, _ = fit(F[800], "AXIOS", 64, 322)
    eq, w2, _ = fit(F[700], "EQUIPMENT CARE", 16.5, 320)
    out = [f'<path d="{axios}" transform="translate(110 197)" fill="{NAVY}"/>',
           f'<path d="{eq}" transform="translate(111 241)" fill="{GRAY}"/>']
    vb = (56, 26, 386, 304)
    if with_tagline:
        tag, w3, _ = fit(F[600], "PEOPLE. EQUIPMENT. A STRONGER TOMORROW.", 10.5, 436)
        out.append(f'<path d="{tag}" transform="translate({243 - w3/2:.2f} 352)" fill="{TAG}"/>')
        vb = (17, 26, 452, 334)
    return vb, defs, arcs + "".join(out)

def mark():
    """Ring plus a heavy A: the app icon and the small logo."""
    defs, arcs = ring("m")
    a, w, size = fit(F[800], "A", 118, 0) if False else (None, None, None)
    cx, cy, _ = circle((166, 318), (68, 192), (356, 124))
    d, wa = text_path(F[800], "A", 118 / cap(F[800]))
    return defs, arcs + f'<path d="{d}" transform="translate({cx - wa / 2:.2f} {cy + 59:.2f})" fill="{NAVY}"/>'

def svg(vb, body, title):
    x, y, w, h = vb
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')

out = sys.argv[1]
vb, defs, body = lockup(True)
open(f"{out}/logo-full.svg", "w").write(svg(vb, defs + body, "Axios Equipment Care — People. Equipment. A stronger tomorrow."))
vb, defs, body = lockup(False)
open(f"{out}/logo.svg", "w").write(svg(vb, defs + body, "Axios Equipment Care"))
defs, body = mark()
open(f"{out}/logo-mark.svg", "w").write(svg((56, 26, 318, 304), defs + body, "Axios"))
# Horizontal wordmark (no ring) for the top bar, beside the mark
axios, w1, _ = fit(F[800], "AXIOS", 64, 322)
eq, w2, _ = fit(F[700], "EQUIPMENT CARE", 16.5, 320)
open(f"{out}/wordmark.svg", "w").write(svg((0, -66, 324, 112),
    f'<path d="{axios}" fill="{NAVY}"/><path d="{eq}" transform="translate(1 44)" fill="{GRAY}"/>', "Axios Equipment Care"))
print("ok")

# One-line logo for the app's top bar: the ring hugging AXIOS, the rest of
# the name running on to the right. (An earlier version put the ring-and-A
# mark before AXIOS, which read as a doubled A.)
mdefs, mbody = mark()
MX, MY, MW, MH = 56, 26, 318, 304
hdefs, harcs = ring("h")
ax_cap = 98
ax_d, ax_w = text_path(F[800], "AXIOS", ax_cap / cap(F[800]), 0.01)
eq_d, eq_w = text_path(F[700], "EQUIPMENT CARE", 52 / cap(F[700]), 0.10)
base = 190 + ax_cap / 2
x_ax = 116
x_eq = x_ax + ax_w + 36
open(f"{out}/logo-horizontal.svg", "w").write(svg((56, 26, x_eq + eq_w + 6 - 56, 304),
    hdefs + harcs +
    f'<path d="{ax_d}" transform="translate({x_ax} {base:.1f})" fill="{NAVY}"/>'
    f'<path d="{eq_d}" transform="translate({x_eq:.1f} {base:.1f})" fill="{GRAY}"/>',
    "Axios Equipment Care"))

# App icon: the mark on a white rounded square.
pad = 34
side = max(MW, MH) + pad * 2
ox = MX - pad - (side - MW - pad * 2) / 2
oy = MY - pad - (side - MH - pad * 2) / 2
open(f"{out}/icon.svg", "w").write(svg((ox, oy, side, side),
    f'<rect x="{ox}" y="{oy}" width="{side}" height="{side}" rx="{side * 0.22:.1f}" fill="#ffffff"/>' + mdefs + mbody,
    "Axios Equipment Care"))
print("horizontal + icon ok")

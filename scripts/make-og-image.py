#!/usr/bin/env python3
"""Regenerate public/og-image.png, the site-wide link-preview image (1200x630).

Design source of truth for the preview image. It follows ADR 0001 (dense ledger):
white surface, one green accent, rules for structure, the self-hosted Atkinson
Hyperlegible Next typeface. It shows no figures, so it can never go stale.

This is a one-off maintainer tool, not part of the build or CI, and its Python
packages are NOT project dependencies. Run with Pillow, fonttools and brotli
available, for example:

    pip install --target /tmp/og-libs pillow fonttools brotli
    PYTHONPATH=/tmp/og-libs python3 scripts/make-og-image.py

The output is deterministic for a given Pillow version; commit the PNG.
"""
import tempfile
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "src" / "assets" / "fonts"
OUT = ROOT / "public" / "og-image.png"

W, H, S = 1200, 630, 2  # final size and supersampling factor
INK, MUTED, LINE, ACCENT, TINT = "#14211b", "#556860", "#c3d0c8", "#0a6847", "#f1f7f3"
PAD = 72

tmp = tempfile.TemporaryDirectory()


def font(weight, size):
    src = FONTS / f"atkinson-hyperlegible-next-latin-{weight}-normal.woff2"
    ttf = Path(tmp.name) / f"{weight}.ttf"
    if not ttf.exists():
        f = TTFont(src)
        f.flavor = None
        f.save(ttf)
    return ImageFont.truetype(str(ttf), size * S)


img = Image.new("RGB", (W * S, H * S), "#ffffff")
d = ImageDraw.Draw(img)


def px(v):
    return int(v * S)


def text(x, y, s, f, fill):
    d.text((px(x), px(y)), s, font=f, fill=fill, anchor="ls")  # left, baseline


def width(s, f):
    return d.textlength(s, font=f) / S


# Accent rule across the top: structure, not decoration.
d.rectangle([0, 0, px(W), px(10)], fill=ACCENT)

# Brand row: the flag from the app header, then the wordmark.
fw, fh = 60, 30
flag = Image.new("RGB", (fw * 4, fh * 4), "#012169")
fd = ImageDraw.Draw(flag)
for width_, colour in ((6, "#ffffff"), (4, "#C8102E")):
    for a, b in (((0, 0), (fw, fh)), ((fw, 0), (0, fh))):
        fd.line([(a[0] * 4, a[1] * 4), (b[0] * 4, b[1] * 4)], fill=colour, width=width_ * 4)
for width_, colour in ((10, "#ffffff"), (6, "#C8102E")):
    fd.line([(fw * 2, 0), (fw * 2, fh * 4)], fill=colour, width=width_ * 4)
    fd.line([(0, fh * 2), (fw * 4, fh * 2)], fill=colour, width=width_ * 4)
flag = flag.resize((px(54), px(27)), Image.LANCZOS)
img.paste(flag, (px(PAD), px(60)))
d.rectangle([px(PAD), px(60), px(PAD + 54), px(87)], outline=LINE, width=S)

brand = font(800, 40)
text(PAD + 72, 88, "FinStats ", brand, INK)
text(PAD + 72 + width("FinStats ", brand), 88, "UK", brand, ACCENT)
url = font(500, 26)
text(W - PAD - width("finstats.fabio.org.uk", url), 87, "finstats.fabio.org.uk", url, MUTED)

# Headline: the one big thing.
head = font(800, 92)
text(PAD - 3, 250, "Official UK figures,", head, INK)
text(PAD - 3, 350, "plainly explained.", head, ACCENT)

sub = font(400, 30)
text(PAD, 418, "Inflation, interest rates, jobs, housing and government", sub, MUTED)
text(PAD, 458, "finances, straight from the official sources.", sub, MUTED)

# Ledger strip: the subjects the site covers, separated by rules. Labels only.
top, bottom = 508, 566
d.rectangle([px(PAD), px(top), px(W - PAD), px(bottom)], fill=TINT)
d.line([(px(PAD), px(top)), (px(W - PAD), px(top))], fill=LINE, width=S * 2)
d.line([(px(PAD), px(bottom)), (px(W - PAD), px(bottom))], fill=LINE, width=S * 2)
labels = ["Prices", "Economy", "Jobs & Pay", "Housing", "Government", "Calendar"]
cell = (W - 2 * PAD) / len(labels)
lab = font(600, 24)
for i, label in enumerate(labels):
    x0 = PAD + i * cell
    if i:
        d.line([(px(x0), px(top + 12)), (px(x0), px(bottom - 12))], fill=LINE, width=S * 2)
    text(x0 + 18, top + 37, label, lab, INK)

small = img.resize((W, H), Image.LANCZOS)
small = small.quantize(colors=48, method=Image.MEDIANCUT, dither=Image.NONE)
small.save(OUT, optimize=True)
print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")

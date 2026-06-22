# Final icon pass v3: big embossed dimensional UENITE wordmark.
# Usage: python scripts/uenite-icon-final-v3.py D:/uenite-cen-T.png
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

src = sys.argv[1] if len(sys.argv) > 1 else "D:/uenite-cen-T.png"
S = 1200
img = Image.open(src).convert("RGB").resize((S, S), Image.LANCZOS)

try:
    f_word = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 232)
    f_sub = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 50)
except OSError:
    f_word = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 232)
    f_sub = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 50)

WORD = "UENITE"
SPLIT = 3  # UEN | ITE

# Measure
probe = ImageDraw.Draw(Image.new("L", (1, 1)))
bb = probe.textbbox((0, 0), WORD, font=f_word)
tw, th = bb[2] - bb[0], bb[3] - bb[1]
word_x = (S - tw) // 2 - bb[0]
# Glyph top sits just below the coin's lower rim (~y 800 in the T artwork),
# so the wordmark never covers the coin.
WORD_TOP = 852
word_y = WORD_TOP - bb[1]

def text_mask(fill_parts=None):
    m = Image.new("L", (S, S), 0)
    dm = ImageDraw.Draw(m)
    dm.text((word_x, word_y), WORD, font=f_word, fill=255)
    return m

def part_mask(part):  # "UEN" or "ITE"
    m = Image.new("L", (S, S), 0)
    dm = ImageDraw.Draw(m)
    if part == "UEN":
        dm.text((word_x, word_y), WORD[:SPLIT], font=f_word, fill=255)
    else:
        uen_w = probe.textbbox((0, 0), WORD[:SPLIT], font=f_word)[2]
        dm.text((word_x + uen_w, word_y), WORD[SPLIT:], font=f_word, fill=255)
    return m

# 1. Soft cast shadow under everything
shadow = text_mask().filter(ImageFilter.GaussianBlur(14))
img.paste(Image.new("RGB", (S, S), (2, 10, 6)), (6, 16), shadow.point(lambda p: int(p * 0.85)))

# 2. Extrusion: stacked darker layers going down-right for 3D depth
for depth in range(10, 0, -1):
    layer = Image.new("L", (S, S), 0)
    ld = ImageDraw.Draw(layer)
    ld.text((word_x + depth // 2, word_y + depth), WORD, font=f_word, fill=255)
    shade = 38 + depth * 6
    img.paste(Image.new("RGB", (S, S), (shade // 3, shade // 2, shade // 2 - 5)), (0, 0), layer)

# 3. Gradient metal faces: silver-white for UEN, emerald metal for ITE
def gradient_face(top_rgb, bottom_rgb):
    g = Image.new("RGB", (S, S))
    gd = ImageDraw.Draw(g)
    y0, y1 = word_y + bb[1], word_y + bb[1] + th
    for y in range(S):
        t = min(1, max(0, (y - y0) / max(1, th)))
        gd.line([(0, y), (S, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top_rgb, bottom_rgb)))
    return g

img.paste(gradient_face((255, 255, 255), (168, 180, 175)), (0, 0), part_mask("UEN"))
img.paste(gradient_face((182, 255, 215), (52, 165, 113)), (0, 0), part_mask("ITE"))

# 4. Top rim highlight: text shifted up, minus the face, blurred slightly
face = text_mask()
rim_src = Image.new("L", (S, S), 0)
rd = ImageDraw.Draw(rim_src)
rd.text((word_x, word_y - 5), WORD, font=f_word, fill=255)
rim = ImageChops = None
from PIL import ImageChops as IC
rim = IC.subtract(rim_src, face).filter(ImageFilter.GaussianBlur(1))
img.paste(Image.new("RGB", (S, S), (255, 255, 255)), (0, 0), rim)

# 5. Gold letter-spaced subline
d = ImageDraw.Draw(img)
sub = "THE ORIGINAL LOVE NOTE"
spacing = 8
widths = [d.textbbox((0, 0), ch, font=f_sub)[2] for ch in sub]
total = sum(widths) + spacing * (len(sub) - 1)
sx = (S - total) // 2
sy = WORD_TOP + th + 18  # tight under the wordmark
for ch, w in zip(sub, widths):
    d.text((sx + 2, sy + 3), ch, font=f_sub, fill=(3, 12, 8))
    d.text((sx, sy), ch, font=f_sub, fill=(251, 191, 36))
    sx += w + spacing

img.save("D:/uenite-icon.png", "PNG")
print("saved D:/uenite-icon.png (embossed v3)")

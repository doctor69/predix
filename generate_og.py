from PIL import Image, ImageDraw, ImageFont
import math

W, H = 1200, 630

# ── colours ──────────────────────────────────────────────────────────────────
BG_TOP    = (8,  10, 18)
BG_BOT    = (12, 16, 30)
ACCENT    = (99, 102, 241)   # indigo-500
ACCENT2   = (168, 85, 247)   # purple-500
YES_COL   = (34, 197, 94)    # green-500
NO_COL    = (239, 68,  68)   # red-500
WHITE     = (255, 255, 255)
MUTED     = (148, 163, 184)  # slate-400

img  = Image.new("RGB", (W, H), BG_TOP)
draw = ImageDraw.Draw(img)

# ── vertical gradient ─────────────────────────────────────────────────────────
for y in range(H):
    t = y / H
    r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
    g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
    b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# ── subtle grid lines ─────────────────────────────────────────────────────────
GRID = (255, 255, 255, 8)
grid_img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(grid_img)
for x in range(0, W, 60):
    gd.line([(x, 0), (x, H)], fill=GRID)
for y in range(0, H, 60):
    gd.line([(0, y), (W, y)], fill=GRID)
img = Image.alpha_composite(img.convert("RGBA"), grid_img).convert("RGB")
draw = ImageDraw.Draw(img)

# ── glowing orb top-right ────────────────────────────────────────────────────
orb = Image.new("RGBA", (W, H), (0, 0, 0, 0))
od  = ImageDraw.Draw(orb)
cx, cy, r = 980, 80, 260
for i in range(r, 0, -1):
    alpha = int(60 * (i / r) ** 2)
    od.ellipse([cx-i, cy-i, cx+i, cy+i], fill=(*ACCENT, alpha))
img = Image.alpha_composite(img.convert("RGBA"), orb).convert("RGB")
draw = ImageDraw.Draw(img)

# ── second orb bottom-left ────────────────────────────────────────────────────
orb2 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
od2  = ImageDraw.Draw(orb2)
cx2, cy2, r2 = 180, 560, 200
for i in range(r2, 0, -1):
    alpha = int(45 * (i / r2) ** 2)
    od2.ellipse([cx2-i, cy2-i, cx2+i, cy2+i], fill=(*ACCENT2, alpha))
img = Image.alpha_composite(img.convert("RGBA"), orb2).convert("RGB")
draw = ImageDraw.Draw(img)

# ── fonts ─────────────────────────────────────────────────────────────────────
SANS_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
SANS      = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

font_logo  = ImageFont.truetype(SANS_BOLD, 88)
font_tag   = ImageFont.truetype(SANS,      32)
font_label = ImageFont.truetype(SANS_BOLD, 22)
font_small = ImageFont.truetype(SANS,      20)

# ── logo pill (rounded rect behind the word) ─────────────────────────────────
pill_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
pld = ImageDraw.Draw(pill_layer)
px, py, pr, ph = 80, 64, 12, 70
pw = 240
pld.rounded_rectangle([px, py, px+pw, py+ph], radius=pr,
                       fill=(*ACCENT, 30), outline=(*ACCENT, 80), width=2)
img = Image.alpha_composite(img.convert("RGBA"), pill_layer).convert("RGB")
draw = ImageDraw.Draw(img)

# ── "PREDIX" wordmark ─────────────────────────────────────────────────────────
draw.text((90, 62), "PREDIX", font=font_logo, fill=WHITE)

# gradient shimmer on the X letter (approximate with accent colour)
# measure text to find the X position
bbox = draw.textbbox((90, 62), "PREDIX", font=font_logo)
x_bbox = draw.textbbox((90, 62), "PREДИ", font=font_logo)   # width up to X

# ── tagline ───────────────────────────────────────────────────────────────────
draw.text((90, 175), "Zero-custody prediction markets", font=font_tag, fill=MUTED)

# ── three mock market cards ───────────────────────────────────────────────────
def card(x, y, w, h, question, yes_pct):
    cl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cl)
    cd.rounded_rectangle([x, y, x+w, y+h], radius=14,
                          fill=(255,255,255, 10), outline=(255,255,255,25), width=1)
    img2 = Image.alpha_composite(img.convert("RGBA"), cl).convert("RGB")
    d2 = ImageDraw.Draw(img2)

    # question text (wrap at ~28 chars)
    words = question.split()
    lines, cur = [], ""
    for word in words:
        test = (cur + " " + word).strip()
        if len(test) > 26:
            lines.append(cur)
            cur = word
        else:
            cur = test
    lines.append(cur)

    ty = y + 20
    for line in lines[:2]:
        d2.text((x+18, ty), line, font=font_small, fill=WHITE)
        ty += 26

    # YES/NO bar
    bar_y = y + h - 36
    bar_w = w - 36
    no_pct = 100 - yes_pct
    yes_w = int(bar_w * yes_pct / 100)

    # track
    d2.rounded_rectangle([x+18, bar_y, x+18+bar_w, bar_y+12],
                           radius=6, fill=(255,255,255,20))
    # yes fill
    if yes_w > 0:
        d2.rounded_rectangle([x+18, bar_y, x+18+yes_w, bar_y+12],
                               radius=6, fill=(*YES_COL, 220))
    # labels
    d2.text((x+18,          bar_y+16), f"YES {yes_pct}%", font=font_label, fill=YES_COL)
    d2.text((x+18+bar_w-68, bar_y+16), f"NO {no_pct}%",  font=font_label, fill=NO_COL)

    return img2

CARD_Y = 270
CARD_H = 190
CARD_W = 330
GAP    = 30

img = card(80,          CARD_Y, CARD_W, CARD_H, "Will Bitcoin hit $150K by end of 2026?", 64)
draw = ImageDraw.Draw(img)
img = card(80+CARD_W+GAP, CARD_Y, CARD_W, CARD_H, "Will India win the 2026 T20 World Cup?", 48)
draw = ImageDraw.Draw(img)
img = card(80+2*(CARD_W+GAP), CARD_Y, CARD_W, CARD_H, "Fed rate cut before September 2026?", 71)
draw = ImageDraw.Draw(img)

# ── bottom bar ────────────────────────────────────────────────────────────────
draw = ImageDraw.Draw(img)
draw.text((90, 512), "predix.vip", font=font_tag, fill=(*ACCENT, 255))

# right side — stats
draw.text((840, 512), "Powered by Polygon", font=font_small, fill=MUTED)

# ── top accent line ───────────────────────────────────────────────────────────
for x in range(W):
    t = x / W
    r = int(ACCENT[0]  + (ACCENT2[0]  - ACCENT[0])  * t)
    g = int(ACCENT[1]  + (ACCENT2[1]  - ACCENT[1])  * t)
    b = int(ACCENT[2]  + (ACCENT2[2]  - ACCENT[2])  * t)
    draw.line([(x, 0), (x, 3)], fill=(r, g, b))

# ── save ──────────────────────────────────────────────────────────────────────
out = "frontend/public/og-image.png"
img.save(out, "PNG", optimize=True)
print(f"Saved {out}  ({W}x{H})")

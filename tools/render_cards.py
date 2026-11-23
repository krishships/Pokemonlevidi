#!/usr/bin/env python3
"""Render boss cards and explainer sheets for Pokemon Heart and Soul.

Art is drawn from primitives here — original placeholder silhouettes, no
ripped sprites. Output: 1600x1000 boss cards + two explainer posters.
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path("/scratch/work/pokemonlevidi")
OUT = Path("/scratch/work/img")
OUT.mkdir(parents=True, exist_ok=True)

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")


def font(size: int, bold: bool = False, italic: bool = False) -> ImageFont.FreeTypeFont:
    if bold and italic:
        name = "DejaVuSans-BoldOblique.ttf"
    elif bold:
        name = "DejaVuSans-Bold.ttf"
    elif italic:
        name = "DejaVuSans-Oblique.ttf"
    else:
        name = "DejaVuSans.ttf"
    return ImageFont.truetype(str(FONT_DIR / name), size)


def mono(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "DejaVuSansMono-Bold.ttf" if bold else "DejaVuSansMono.ttf"
    return ImageFont.truetype(str(FONT_DIR / name), size)


BG = (11, 13, 18)
PANEL = (18, 22, 30)
PANEL_HI = (24, 29, 39)
INK = (233, 237, 244)
MUTED = (138, 148, 166)
DIM = (86, 95, 112)
RULE = (36, 42, 54)

ACCENT = {
    "sentinel_of_ash": (226, 112, 58),
    "mycelial_warden": (127, 166, 80),
    "blade_dancer_of_the_grove": (79, 179, 165),
    "pale_court_duelist": (200, 185, 138),
    "grave_choir_tyrant": (142, 124, 195),
    "brass_bell_beast": (201, 162, 39),
}


def mix(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


def rr(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def text(d, xy, s, f, fill=INK, anchor="la", spacing=4):
    d.multiline_text(xy, s, font=f, fill=fill, anchor=anchor, spacing=spacing)


def measure(d, s, f):
    return d.textbbox((0, 0), s, font=f)


# ---------------------------------------------------------------- silhouettes

def draw_sentinel(d, x, y, s):
    """Tall knight, heavy blade, horns."""
    d.polygon([(x + .46 * s, y + .10 * s), (x + .72 * s, y + .30 * s),
               (x + .78 * s, y + .96 * s), (x + .16 * s, y + .96 * s),
               (x + .22 * s, y + .30 * s)], fill=255)
    d.rounded_rectangle([x + .37 * s, y + .09 * s, x + .63 * s, y + .27 * s],
                        radius=.05 * s, fill=255)
    d.polygon([(x + .36 * s, y + .11 * s), (x + .30 * s, y - .01 * s),
               (x + .44 * s, y + .09 * s)], fill=255)
    d.polygon([(x + .64 * s, y + .11 * s), (x + .70 * s, y - .01 * s),
               (x + .56 * s, y + .09 * s)], fill=255)
    # blade, held clear of the cloak so the silhouette reads
    d.polygon([(x + .86 * s, y + .30 * s), (x + .96 * s, y + .37 * s),
               (x + .94 * s, y + .94 * s), (x + .88 * s, y + .92 * s)], fill=255)
    d.rounded_rectangle([x + .82 * s, y + .44 * s, x + .99 * s, y + .49 * s],
                        radius=.01 * s, fill=255)
    d.rounded_rectangle([x + .88 * s, y + .48 * s, x + .94 * s, y + .62 * s],
                        radius=.01 * s, fill=255)
    # eyes punched out
    d.ellipse([x + .42 * s, y + .16 * s, x + .47 * s, y + .20 * s], fill=0)
    d.ellipse([x + .53 * s, y + .16 * s, x + .58 * s, y + .20 * s], fill=0)


def draw_warden(d, x, y, s):
    """Squat fungal guardian, domed cap, wide base."""
    d.ellipse([x + .14 * s, y + .10 * s, x + .86 * s, y + .54 * s], fill=255)
    d.rounded_rectangle([x + .33 * s, y + .44 * s, x + .67 * s, y + .84 * s],
                        radius=.12 * s, fill=255)
    d.ellipse([x + .06 * s, y + .52 * s, x + .30 * s, y + .74 * s], fill=255)
    d.ellipse([x + .70 * s, y + .52 * s, x + .94 * s, y + .74 * s], fill=255)
    d.ellipse([x + .10 * s, y + .78 * s, x + .90 * s, y + .98 * s], fill=255)
    # cap spots
    for cx, cy, r in ((.30, .26, .045), (.52, .20, .035), (.72, .30, .05), (.44, .36, .03)):
        d.ellipse([x + (cx - r) * s, y + (cy - r) * s,
                   x + (cx + r) * s, y + (cy + r) * s], fill=0)
    d.ellipse([x + .40 * s, y + .60 * s, x + .46 * s, y + .65 * s], fill=0)
    d.ellipse([x + .54 * s, y + .60 * s, x + .60 * s, y + .65 * s], fill=0)


def draw_dancer(d, x, y, s):
    """Lean duelist, twin curved blades, mantis mantle."""
    d.polygon([(x + .50 * s, y + .16 * s), (x + .66 * s, y + .34 * s),
               (x + .62 * s, y + .70 * s), (x + .38 * s, y + .70 * s),
               (x + .34 * s, y + .34 * s)], fill=255)
    d.ellipse([x + .42 * s, y + .06 * s, x + .58 * s, y + .22 * s], fill=255)
    # mantle wings
    d.polygon([(x + .36 * s, y + .26 * s), (x + .06 * s, y + .44 * s),
               (x + .30 * s, y + .58 * s)], fill=255)
    d.polygon([(x + .64 * s, y + .26 * s), (x + .94 * s, y + .44 * s),
               (x + .70 * s, y + .58 * s)], fill=255)
    # blades
    d.polygon([(x + .30 * s, y + .40 * s), (x - .02 * s, y + .16 * s),
               (x + .06 * s, y + .10 * s), (x + .34 * s, y + .36 * s)], fill=255)
    d.polygon([(x + .70 * s, y + .40 * s), (x + 1.02 * s, y + .16 * s),
               (x + .94 * s, y + .10 * s), (x + .66 * s, y + .36 * s)], fill=255)
    # legs
    d.polygon([(x + .42 * s, y + .68 * s), (x + .36 * s, y + .96 * s),
               (x + .45 * s, y + .96 * s), (x + .49 * s, y + .68 * s)], fill=255)
    d.polygon([(x + .58 * s, y + .68 * s), (x + .64 * s, y + .96 * s),
               (x + .55 * s, y + .96 * s), (x + .51 * s, y + .68 * s)], fill=255)
    d.ellipse([x + .45 * s, y + .11 * s, x + .49 * s, y + .15 * s], fill=0)
    d.ellipse([x + .52 * s, y + .11 * s, x + .56 * s, y + .15 * s], fill=0)


def draw_duelist(d, x, y, s):
    """Slender courtier, long coat, rapier, plume."""
    d.polygon([(x + .50 * s, y + .20 * s), (x + .70 * s, y + .34 * s),
               (x + .78 * s, y + .94 * s), (x + .22 * s, y + .94 * s),
               (x + .30 * s, y + .34 * s)], fill=255)
    d.ellipse([x + .42 * s, y + .06 * s, x + .58 * s, y + .22 * s], fill=255)
    d.polygon([(x + .46 * s, y + .06 * s), (x + .38 * s, y - .04 * s),
               (x + .54 * s, y + .02 * s)], fill=255)
    d.rounded_rectangle([x + .30 * s, y + .24 * s, x + .70 * s, y + .30 * s],
                        radius=.02 * s, fill=255)
    # rapier
    d.line([(x + .74 * s, y + .46 * s), (x + 1.00 * s, y + .74 * s)],
           fill=255, width=int(.022 * s))
    d.ellipse([x + .70 * s, y + .42 * s, x + .80 * s, y + .50 * s], fill=255)
    # coat tails
    d.polygon([(x + .26 * s, y + .50 * s), (x + .12 * s, y + .96 * s),
               (x + .26 * s, y + .96 * s)], fill=255)
    d.polygon([(x + .74 * s, y + .50 * s), (x + .88 * s, y + .96 * s),
               (x + .74 * s, y + .96 * s)], fill=255)
    d.ellipse([x + .45 * s, y + .11 * s, x + .49 * s, y + .15 * s], fill=0)
    d.ellipse([x + .52 * s, y + .11 * s, x + .56 * s, y + .15 * s], fill=0)


def draw_tyrant(d, x, y, s):
    """Robed conductor, bell-shaped robe, floating motes."""
    d.polygon([(x + .50 * s, y + .16 * s), (x + .74 * s, y + .40 * s),
               (x + .90 * s, y + .96 * s), (x + .10 * s, y + .96 * s),
               (x + .26 * s, y + .40 * s)], fill=255)
    d.ellipse([x + .40 * s, y + .04 * s, x + .60 * s, y + .26 * s], fill=255)
    d.polygon([(x + .50 * s, y + .02 * s), (x + .40 * s, y - .06 * s),
               (x + .60 * s, y - .06 * s)], fill=255)
    # arms raised
    d.line([(x + .30 * s, y + .40 * s), (x + .10 * s, y + .20 * s)],
           fill=255, width=int(.05 * s))
    d.line([(x + .70 * s, y + .40 * s), (x + .90 * s, y + .20 * s)],
           fill=255, width=int(.05 * s))
    # motes
    for cx, cy, r in ((.12, .08, .035), (.88, .08, .035), (.24, .16, .022),
                      (.76, .16, .022), (.50, .86, .03)):
        d.ellipse([x + (cx - r) * s, y + (cy - r) * s,
                   x + (cx + r) * s, y + (cy + r) * s], fill=255)
    d.ellipse([x + .45 * s, y + .13 * s, x + .49 * s, y + .17 * s], fill=0)
    d.ellipse([x + .52 * s, y + .13 * s, x + .56 * s, y + .17 * s], fill=0)


def draw_beast(d, x, y, s):
    """Horned quadruped with a bell under its jaw."""
    d.ellipse([x + .14 * s, y + .30 * s, x + .80 * s, y + .78 * s], fill=255)
    d.ellipse([x + .60 * s, y + .16 * s, x + .96 * s, y + .56 * s], fill=255)
    # horns
    d.polygon([(x + .66 * s, y + .20 * s), (x + .58 * s, y + .02 * s),
               (x + .72 * s, y + .16 * s)], fill=255)
    d.polygon([(x + .86 * s, y + .18 * s), (x + .96 * s, y + .01 * s),
               (x + .92 * s, y + .22 * s)], fill=255)
    # legs
    for lx in (.22, .36, .58, .70):
        d.rounded_rectangle([x + lx * s, y + .68 * s, x + (lx + .10) * s, y + .98 * s],
                            radius=.03 * s, fill=255)
    # tail
    d.line([(x + .16 * s, y + .44 * s), (x + .02 * s, y + .30 * s)],
           fill=255, width=int(.04 * s))
    # bell
    d.polygon([(x + .72 * s, y + .52 * s), (x + .88 * s, y + .52 * s),
               (x + .84 * s, y + .66 * s), (x + .76 * s, y + .66 * s)], fill=255)
    d.ellipse([x + .76 * s, y + .64 * s, x + .84 * s, y + .70 * s], fill=255)
    d.ellipse([x + .76 * s, y + .28 * s, x + .81 * s, y + .33 * s], fill=0)
    d.ellipse([x + .86 * s, y + .28 * s, x + .91 * s, y + .33 * s], fill=0)


SILHOUETTES = {
    "sentinel_of_ash": draw_sentinel,
    "mycelial_warden": draw_warden,
    "blade_dancer_of_the_grove": draw_dancer,
    "pale_court_duelist": draw_duelist,
    "grave_choir_tyrant": draw_tyrant,
    "brass_bell_beast": draw_beast,
}


def silhouette_layer(boss_id: str, size: int, accent) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    s = size * 0.78
    SILHOUETTES[boss_id](d, (size - s) / 2, size * 0.12, s)

    glow = mask.filter(ImageFilter.GaussianBlur(size * 0.045))
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    glow_rgb = Image.new("RGBA", (size, size), accent + (0,))
    glow_rgb.putalpha(glow.point(lambda v: int(v * 0.55)))
    layer = Image.alpha_composite(layer, glow_rgb)

    body = Image.new("RGBA", (size, size), mix(accent, (6, 8, 12), 0.55) + (255,))
    body.putalpha(mask)
    layer = Image.alpha_composite(layer, body)

    rim = mask.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(1.2))
    rim_rgb = Image.new("RGBA", (size, size), mix(accent, (255, 255, 255), 0.45) + (255,))
    rim_rgb.putalpha(rim.point(lambda v: min(255, int(v * 2.2))))
    layer = Image.alpha_composite(layer, rim_rgb)
    return layer


# ---------------------------------------------------------------- boss card

KIND_LABEL = {"melee": "melee", "lunge": "lunge",
              "projectile": "proj", "area": "area"}


def boss_card(boss: dict) -> Path:
    W, H = 1600, 1000
    accent = ACCENT[boss["id"]]
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # accent wash top-left
    wash = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    wd.ellipse([-300, -380, 900, 520], fill=accent + (26,))
    img = Image.alpha_composite(img.convert("RGBA"), wash).convert("RGB")
    d = ImageDraw.Draw(img)

    # header rule
    d.rectangle([64, 64, 64 + 120, 70], fill=accent)
    text(d, (64, 86), "POKÉMON HEART AND SOUL  ·  LIVE BATTLE", font(20, bold=True), MUTED)
    text(d, (W - 64, 86), "BOSS DOSSIER", font(20, bold=True), DIM, anchor="ra")

    # ---- left panel: silhouette
    panel = [64, 140, 664, 900]
    rr(d, panel, 22, fill=PANEL, outline=RULE, width=2)
    img.paste(Image.new("RGB", (1, 1), PANEL), (0, 0))
    d = ImageDraw.Draw(img)
    sil_size = 540
    sil = silhouette_layer(boss["id"], sil_size, accent)
    img.paste(sil, (94, 190), sil)
    d = ImageDraw.Draw(img)
    text(d, (114, 856), "original placeholder silhouette — not a final sprite",
         font(17, italic=True), DIM)

    # ---- right column
    x = 720
    title_size = 58
    while title_size > 34 and measure(d, boss["name"], font(title_size, bold=True))[2] > 816:
        title_size -= 2
    text(d, (x, 150), boss["name"], font(title_size, bold=True))
    text(d, (x, 224), boss["epithet"], font(27, italic=True), accent)
    y = 272
    text(d, (x, y), boss["archetype"], font(21), MUTED)

    # stat chips
    y = 330
    chips = [
        ("HP", str(boss["hp"])),
        ("POISE", str(boss["poise"])),
        ("WALK", f'{boss["movement"]["walk_speed"]} px/f'),
        ("IDLE", f'{boss["movement"]["aggression"]} f'),
        ("ATTACKS", str(len(boss["attacks"]))),
    ]
    cx = x
    for label, value in chips:
        w = 30 + max(measure(d, value, font(30, bold=True))[2],
                     measure(d, label, font(15, bold=True))[2])
        rr(d, [cx, y, cx + w, y + 76], 12, fill=PANEL_HI, outline=RULE, width=1)
        text(d, (cx + 15, y + 12), value, font(30, bold=True))
        text(d, (cx + 15, y + 50), label, font(15, bold=True), DIM)
        cx += w + 12

    # ---- phase bar
    y = 452
    text(d, (x, y), "PHASE THRESHOLDS", font(17, bold=True), DIM)
    bar = [x, y + 30, x + 812, y + 62]
    p2, p3 = boss["phases"]["phase2_hp_pct"], boss["phases"]["phase3_hp_pct"]
    x2 = bar[0] + (bar[2] - bar[0]) * (100 - p2) / 100
    x3 = bar[0] + (bar[2] - bar[0]) * (100 - p3) / 100
    rr(d, bar, 8, fill=PANEL_HI)
    d.rectangle([bar[0], bar[1], x2, bar[3]], fill=mix(accent, BG, 0.55))
    d.rectangle([x2, bar[1], x3, bar[3]], fill=mix(accent, BG, 0.28))
    d.rectangle([x3, bar[1], bar[2], bar[3]], fill=accent)
    for px, lbl in ((bar[0], "100%"), (x2, f"{p2}%"), (x3, f"{p3}%"), (bar[2], "0%")):
        d.line([(px, bar[1] - 8), (px, bar[3] + 8)], fill=BG, width=3)
        text(d, (px, bar[3] + 14), lbl, mono(15), MUTED,
             anchor="ma" if px not in (bar[0], bar[2]) else ("la" if px == bar[0] else "ra"))
    text(d, (x, y + 104), "P1 steady  →  P2 longer reach  →  P3 faster recovery",
         font(19, italic=True), MUTED)

    # ---- attack table
    y = 620
    text(d, (x, y), "ATTACK TABLE", font(17, bold=True), DIM)
    y += 30
    cols = [("ATTACK", 0), ("KIND", 300), ("TEL/ACT/REC", 400), ("DMG", 590),
            ("REACH", 668), ("PH", 780)]
    for label, dx in cols:
        text(d, (x + dx, y), label, font(15, bold=True), DIM)
    y += 24
    d.line([(x, y), (x + 812, y)], fill=RULE, width=1)
    y += 10

    for atk in boss["attacks"]:
        dmg = atk["damage"]
        text(d, (x + 4, y + 6), atk["name"], font(21), INK)
        text(d, (x + 300, y + 7), KIND_LABEL[atk["kind"]], mono(18), MUTED)
        frames = f'{atk["telegraph"]}/{atk["active"]}/{atk["recovery"]}'
        text(d, (x + 400, y + 7), frames, mono(18), MUTED)
        text(d, (x + 590, y + 7), str(dmg), mono(18), mix(accent, (255, 255, 255), 0.35))
        reach = (f'{atk["range_min"]}–{atk["range_max"]}' if atk["range_min"]
                 else f'0–{atk["range_max"]}')
        text(d, (x + 668, y + 7), reach, mono(18), MUTED)
        text(d, (x + 786, y + 7), f'P{atk["min_phase"]}', mono(18),
             accent if atk["min_phase"] == 3 else MUTED)
        y += 40
        d.line([(x, y - 4), (x + 812, y - 4)], fill=(26, 31, 41), width=1)

    # footer
    text(d, (64, 934), "github.com/krishships/Pokemonlevidi  ·  data/bosses/"
         + boss["id"] + ".json", mono(18), DIM)
    text(d, (W - 64, 934), "frames at 60 Hz", mono(18), DIM, anchor="ra")

    path = OUT / f'boss_{boss["id"]}.png'
    img.save(path)
    return path


# ---------------------------------------------------------------- explainer 1

def how_it_works() -> Path:
    W, H = 1600, 1500
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    accent = (226, 112, 58)
    accent2 = (79, 179, 165)

    d.rectangle([64, 56, 184, 62], fill=accent)
    text(d, (64, 78), "HOW THE LIVE BATTLE WORKS", font(46, bold=True))
    text(d, (64, 140), "Pokémon Heart and Soul — the turn-based engine replaced by a 60 Hz action loop",
         font(22), MUTED)

    # ---- the loop
    y = 220
    text(d, (64, y), "1 · THE BOSS LOOP", font(19, bold=True), DIM)
    y += 40
    steps = [
        ("IDLE", "faces you,\ncloses or\nopens space", accent2),
        ("PICK", "weighted\nchoice, gated\nby phase", accent2),
        ("TELEGRAPH", "wind-up,\nNO hitbox\nyet", (201, 162, 39)),
        ("ACTIVE", "hitbox live,\nlunge, one\nhit only", (226, 112, 58)),
        ("RECOVERY", "your punish\nwindow", (127, 166, 80)),
    ]
    bw, bh, gap = 272, 190, 30
    for i, (title, body, col) in enumerate(steps):
        bx = 64 + i * (bw + gap)
        rr(d, [bx, y, bx + bw, y + bh], 16, fill=PANEL, outline=mix(col, BG, 0.55), width=2)
        d.rectangle([bx, y, bx + 6, y + bh], fill=col)
        text(d, (bx + 26, y + 22), title, font(26, bold=True), col)
        text(d, (bx + 26, y + 66), body, font(20), MUTED, spacing=6)
        if i < len(steps) - 1:
            ax = bx + bw + 6
            d.polygon([(ax, y + bh / 2 - 9), (ax + 14, y + bh / 2),
                       (ax, y + bh / 2 + 9)], fill=DIM)
    # loop back arrow
    d.line([(64 + 4 * (bw + gap) + bw / 2, y + bh), (64 + 4 * (bw + gap) + bw / 2, y + bh + 34),
            (64 + bw / 2, y + bh + 34), (64 + bw / 2, y + bh)], fill=DIM, width=2)
    d.polygon([(64 + bw / 2 - 8, y + bh + 10), (64 + bw / 2 + 8, y + bh + 10),
               (64 + bw / 2, y + bh + 1)], fill=DIM)
    text(d, (64 + bw / 2 + 16, y + bh + 22), "cooldown, then again", font(18, italic=True), DIM)

    # ---- player toolkit
    y += bh + 90
    text(d, (64, y), "2 · YOUR TOOLKIT", font(19, bold=True), DIM)
    y += 36
    tools = [
        ("NAIL", "B", "40 px reach · 14 dmg", "+9 soul per hit"),
        ("DASH", "L", "6 px/frame · 12 i-frames", "the answer to most attacks"),
        ("JUMP", "A", "40 px arc", "dodges ground-only hitboxes"),
        ("FOCUS", "R (hold)", "45 frames · −33 soul", "heals 30 HP, you are locked"),
    ]
    tw = 358
    for i, (name, key, spec, note) in enumerate(tools):
        bx = 64 + i * (tw + 24)
        rr(d, [bx, y, bx + tw, y + 128], 14, fill=PANEL, outline=RULE, width=1)
        text(d, (bx + 20, y + 16), name, font(24, bold=True), accent)
        kx = bx + tw - 20
        kw = measure(d, key, mono(18, True))[2] + 24
        rr(d, [kx - kw, y + 16, kx, y + 46], 8, fill=PANEL_HI, outline=DIM)
        text(d, (kx - kw / 2, y + 23), key, mono(18, True), INK, anchor="ma")
        text(d, (bx + 20, y + 58), spec, mono(17), MUTED)
        text(d, (bx + 20, y + 90), note, font(17, italic=True), DIM)

    # ---- mapping table
    y += 178
    text(d, (64, y), "3 · TURN-BASED → LIVE MAPPING", font(19, bold=True), DIM)
    y += 36
    rows = [
        ("HP / maxHP", "unchanged — 100 player, boss from JSON"),
        ("Speed stat", "player attack cooldown + boss aggression frames"),
        ("Accuracy / evasion", "gone — hitbox overlap, you can physically dodge"),
        ("PP", "soul charge 0–100, spent on focus-heal"),
        ("Status / flinch", "poise break → 50-frame stagger"),
        ("Switching", "disabled — you are locked in the arena"),
        ("Bag items", "focus-heal, and the Poké Flute as the arena trigger"),
    ]
    col_w = 812
    for i, (left, right) in enumerate(rows):
        ry = y + i * 44
        rr(d, [64, ry, 64 + 2 * col_w + 24, ry + 38], 8,
           fill=PANEL if i % 2 == 0 else BG)
        text(d, (84, ry + 9), left, mono(19), INK)
        text(d, (84 + col_w, ry + 9), right, font(19), MUTED)
    y += len(rows) * 44 + 30

    # ---- phase flow
    text(d, (64, y), "4 · PHASES (every boss, same shape)", font(19, bold=True), DIM)
    y += 40
    ph = [("PHASE 1", "full HP → 66%", "learn the telegraphs", mix(accent2, BG, 0.2)),
          ("PHASE 2", "66% → 33%", "+reach, new attack unlocks", (201, 162, 39)),
          ("PHASE 3", "33% → 0%", "+speed, recovery ×0.55", (226, 112, 58))]
    for i, (name, range_, note, col) in enumerate(ph):
        bx = 64 + i * 520
        rr(d, [bx, y, bx + 496, y + 96], 12, fill=PANEL, outline=mix(col, BG, 0.5), width=2)
        text(d, (bx + 22, y + 16), name, font(24, bold=True), col)
        text(d, (bx + 22, y + 50), range_, mono(18), MUTED)
        text(d, (bx + 22, y + 74), note, font(17, italic=True), DIM)
        if i < 2:
            d.polygon([(bx + 502, y + 48 - 10), (bx + 516, y + 48),
                       (bx + 502, y + 48 + 10)], fill=DIM)
    text(d, (64, y + 108), "crossing a threshold: boss roars — 45 frames invulnerable, no attacks",
         font(18, italic=True), DIM)

    # footer
    text(d, (64, H - 56), "github.com/krishships/Pokemonlevidi  ·  docs/design/ACTION_BATTLE_SPEC.md",
         mono(18), DIM)
    text(d, (W - 64, H - 56), "all numbers are frames at 60 Hz", mono(18), DIM, anchor="ra")

    path = OUT / "how_it_works.png"
    img.save(path)
    return path


# ---------------------------------------------------------------- explainer 2

def combat_timeline() -> Path:
    W, H = 1600, 940
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    tele, act, rec = 18, 6, 24
    total = tele + act + rec + 12
    left, right = 180, 1520
    scale = (right - left) / total

    def fx(frame):
        return left + frame * scale

    d.rectangle([64, 56, 184, 62], fill=(226, 112, 58))
    text(d, (64, 78), "ONE ATTACK, FRAME BY FRAME", font(46, bold=True))
    text(d, (64, 140), "Sentinel of Ash · Ash Cleave — 18 telegraph / 6 active / 24 recovery",
         font(22), MUTED)

    # frame ruler
    y = 232
    for f in range(0, total + 1, 5):
        x = fx(f)
        d.line([(x, y - 10), (x, y + 6)], fill=DIM, width=1)
        if f % 10 == 0:
            text(d, (x, y - 34), str(f), mono(15), DIM, anchor="ma")

    # main bar
    by, bh = y + 18, 74
    spans = [(0, tele, "TELEGRAPH", "no hitbox — you can see it coming", (201, 162, 39)),
             (tele, tele + act, "ACTIVE", "hitbox live, 22 dmg", (226, 112, 58)),
             (tele + act, tele + act + rec, "RECOVERY", "punish window", (127, 166, 80))]
    for start, end, label, sub, col in spans:
        x0, x1 = fx(start), fx(end)
        rr(d, [x0 + 2, by, x1 - 2, by + bh], 10, fill=mix(col, BG, 0.62),
           outline=col, width=2)
        text(d, (x0 + 14, by + 14), label, font(21, bold=True), col)
        if x1 - x0 > 200:
            text(d, (x0 + 14, by + 44), sub, font(17, italic=True), MUTED)

    # player response lanes
    lanes = [
        ("DASH THROUGH", tele - 4, tele + 8, (79, 179, 165),
         "12 i-frames start here — they cover the whole 6-frame active window"),
        ("WALK OUT", 0, tele + act, (200, 185, 138),
         "5 px/frame gets you clear of the 52 px reach in ~10 frames"),
        ("JUMP OVER", tele - 8, tele + act, (142, 124, 195),
         "only works on height-0 attacks — Ash Cleave has 24 px tolerance"),
        ("PUNISH", tele + act, tele + act + rec, (127, 166, 80),
         "24 frames = 1 nail swing (10 f) + 14 frames to reposition"),
    ]
    y = by + bh + 56
    for name, start, end, col, note in lanes:
        x0, x1 = fx(max(0, start)), fx(min(total, end))
        text(d, (64, y + 6), name, font(18, bold=True), col)
        rr(d, [x0, y, x1, y + 26], 8, fill=mix(col, BG, 0.45))
        d.rectangle([x0, y, x0 + 4, y + 26], fill=col)
        text(d, (x0 + 14, y + 30), note, font(16, italic=True), DIM)
        y += 78

    # callouts
    y += 10
    rr(d, [64, y, W - 64, y + 108], 12, fill=PANEL, outline=RULE, width=1)
    text(d, (88, y + 20), "THE RULE THAT MAKES IT FAIR", font(19, bold=True), (226, 112, 58))
    text(d, (88, y + 50),
         "Every attack has three stages and only the middle one can hurt you. Telegraph is never "
         "shorter than 7 frames (the reaction floor at 60 Hz);", font(19), MUTED)
    text(d, (88, y + 76),
         "one hit per attack instance; and at least one attack per boss leaves a 30+ frame recovery "
         "so the fight always has a heal window.", font(19), MUTED)

    text(d, (64, H - 52), "github.com/krishships/Pokemonlevidi  ·  src/action_battle.c",
         mono(18), DIM)

    path = OUT / "combat_timeline.png"
    img.save(path)
    return path


def main() -> None:
    bosses = [json.loads(p.read_text(encoding="utf-8"))
              for p in sorted((ROOT / "data" / "bosses").glob("*.json"))]
    bosses.sort(key=lambda b: (b["phases"]["phase2_hp_pct"] * -1, b["id"]))
    order = ["sentinel_of_ash", "mycelial_warden", "blade_dancer_of_the_grove",
             "pale_court_duelist", "grave_choir_tyrant", "brass_bell_beast"]
    by_id = {b["id"]: b for b in bosses}
    for boss_id in order:
        print(boss_card(by_id[boss_id]))
    print(how_it_works())
    print(combat_timeline())


if __name__ == "__main__":
    main()

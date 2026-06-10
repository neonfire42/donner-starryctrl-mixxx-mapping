#!/usr/bin/env python3
"""Generate layout.svg, a visual control map for the Donner StarryCTRL mapping.

Run `python3 generate-layout.py` after changing the mapping and commit the
regenerated layout.svg alongside it.
"""

W, H = 1445, 910
FONT = "DejaVu Sans, Verdana, Arial, sans-serif"

# colors
BG = "#1a1d21"
STRIP_BG = "#23262b"
BTN_BG = "#373c44"
BTN_BG_FREE = "#262a2f"
STROKE = "#4d535c"
TEXT = "#e8e8e8"
DIM = "#76797e"
SHIFT = "#f6ad55"   # shift-function text
D1 = "#3182ce"      # deck 1
D2 = "#38a169"      # deck 2
GRAY = "#5a6472"    # master / library
FX = "#805ad5"      # effects
LED = "#e53e3e"     # LED indicator

out = []


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text(x, y, s, size=10, color=TEXT, anchor="middle", weight="normal", style=""):
    out.append(
        f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" '
        f'text-anchor="{anchor}" font-weight="{weight}" '
        f'font-family="{FONT}" {style}>{esc(s)}</text>'
    )


def rect(x, y, w, h, fill, rx=6, stroke=None):
    s = f' stroke="{stroke}"' if stroke else ""
    out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{s}/>')


def circle(cx, cy, r, fill, stroke=None):
    s = f' stroke="{stroke}" stroke-width="2"' if stroke else ""
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"{s}/>')


# ---------------------------------------------------------------- header
out.append(f'<rect width="{W}" height="{H}" fill="{BG}"/>')
text(W / 2, 36, "Donner StarryCTRL — Mixxx DJ mapping", 24, TEXT, weight="bold")
text(W / 2, 60,
     "SHIFT = hold the bottom-left ▶ transport button  ·  "
     "keep the hardware on its default layer (don't press the device's own SHIFT key)",
     12, SHIFT)

# ---------------------------------------------------------------- strips
STRIP_W, PITCH, X0 = 160, 175, 30

# (chip color, [label lines]) — lines are (text, color)
knobs = [
    (D1,   [("Deck 1 jog (pitch nudge)", TEXT), ("hold loop in/out: adjust", DIM), ("shift: search", SHIFT)]),
    (GRAY, [("Headphone level", TEXT)]),
    (GRAY, [("Cue ↔ master", TEXT), ("headphone mix", TEXT)]),
    (D1,   [("Deck 1 filter", TEXT), ("(superknob)", DIM)]),
    (GRAY, [("Library scroll", TEXT), ("shift: waveform zoom", SHIFT)]),
    (D2,   [("Deck 2 filter", TEXT), ("(superknob)", DIM)]),
    (FX,   [("FX dry/wet (focused unit)", TEXT), ("shift: metaknob", SHIFT)]),
    (D2,   [("Deck 2 jog (pitch nudge)", TEXT), ("hold loop in/out: adjust", DIM), ("shift: search", SHIFT)]),
]

# per strip: list of 4 buttons (M, S, R, square): (chip color, line1, line2) or None=free
B = {
    1: [(D1, "Loop in", ("hold + jog adjusts", DIM)),
        (D1, "Sync", ("shift: tempo range", SHIFT)),
        (D1, "Cue", ("shift: cue at start", SHIFT)),
        (D1, "Play", ("shift: reverse", SHIFT))],
    2: [(D1, "Loop out", ("hold + jog adjusts", DIM)),
        (D1, "Loop ÷2", None), None, None],
    3: [(D1, "Reloop / exit", None),
        (D1, "Loop ×2", None), None, None],
    4: [None, None,
        (FX, "FX1 → deck 1", ("assign focused unit", DIM)),
        (D1, "CUE1", ("headphone cue", DIM))],
    5: [(D2, "Loop in", ("hold + jog adjusts", DIM)),
        (D2, "Loop ÷2", None),
        (FX, "FX2 → deck 2", ("assign focused unit", DIM)),
        (D2, "CUE2", ("headphone cue", DIM))],
    6: [(D2, "Loop out", ("hold + jog adjusts", DIM)),
        (D2, "Loop ×2", None), None, None],
    7: [(D2, "Reloop / exit", None), None, None, None],
    8: [None,
        (D2, "Sync", ("shift: tempo range", SHIFT)),
        (D2, "Cue", ("shift: cue at start", SHIFT)),
        (D2, "Play", ("shift: reverse", SHIFT))],
}

faders = [
    (D1, "DECK 1 VOLUME", ""),
    (D2, "DECK 2 VOLUME", ""),
    (None, "free", ""),
    (None, "free", ""),
    (GRAY, "CROSSFADER", ""),
    (None, "free", ""),
    (D1, "DECK 1 PITCH", "up = faster"),
    (D2, "DECK 2 PITCH", "up = faster"),
]

ROWS = "MSR□"
for i in range(8):
    x = X0 + i * PITCH
    cx = x + STRIP_W / 2
    rect(x, 90, STRIP_W, 600, STRIP_BG, rx=10)
    text(cx, 110, f"STRIP {i + 1}", 11, DIM, weight="bold")

    # knob
    chip, lines = knobs[i]
    circle(cx, 152, 26, "#2e333a", stroke=chip)
    text(cx, 157, str(i + 1), 14, TEXT, weight="bold")
    for n, (s, c) in enumerate(lines):
        text(cx, 198 + n * 13, s, 10, c)

    # buttons
    for row in range(4):
        y = 248 + row * 52
        spec = B[i + 1][row]
        letter = ROWS[row]
        if spec is None:
            rect(x + 8, y, STRIP_W - 16, 46, BTN_BG_FREE, stroke="#33373d")
            rect(x + 14, y + 12, 22, 22, "#2e3338", rx=5)
            text(x + 25, y + 27, letter, 11, "#555", weight="bold")
            text(x + 44, y + 27, "free", 10, "#5b5e63", anchor="start", style='font-style="italic"')
            continue
        color, l1, l2 = spec
        rect(x + 8, y, STRIP_W - 16, 46, BTN_BG, stroke=STROKE)
        rect(x + 14, y + 12, 22, 22, color, rx=5)
        text(x + 25, y + 27, letter, 11, "#fff", weight="bold")
        if l2 is None:
            text(x + 44, y + 27, l1, 10.5, TEXT, anchor="start")
        else:
            text(x + 44, y + 21, l1, 10.5, TEXT, anchor="start")
            text(x + 44, y + 35, l2[0], 9, l2[1], anchor="start")

    # fader
    color, l1, l2 = faders[i]
    track_color = color if color else "#3a3e44"
    out.append(f'<rect x="{cx - 4}" y="475" width="8" height="140" rx="4" '
               f'fill="#101214" stroke="{track_color}"/>')
    handle_fill = "#454b53" if color else "#2c3036"
    rect(cx - 22, 532, 44, 16, handle_fill, rx=4, stroke=track_color)
    text(cx, 645, l1, 11, TEXT if color else "#5b5e63",
         weight="bold" if color else "normal",
         style='font-style="italic"' if not color else "")
    if l2:
        text(cx, 660, l2, 9, DIM)

# ---------------------------------------------------------------- bottom row
bottom = [
    ("▶",  SHIFT, [("SHIFT", SHIFT), ("hold for shifted", DIM), ("functions", DIM)], False),
    ("II", GRAY,  [("MIC 1", TEXT), ("talkover toggle", DIM)], True),
    ("●",  FX,    [("FX on", TEXT), ("effect 1 of", DIM), ("focused unit", DIM)], False),
    ("◀◀", FX,    [("Prev effect", TEXT), ("shift: prev unit", SHIFT)], False),
    ("▶▶", FX,    [("Next effect", TEXT), ("shift: next unit", SHIFT)], False),
    ("«",  D1,    [("Load track", TEXT), ("→ deck 1", TEXT)], False),
    ("»",  D2,    [("Load track", TEXT), ("→ deck 2", TEXT)], False),
    ("▲",  GRAY,  [("Library back", TEXT), ("shift: select item", SHIFT)], False),
    ("▼",  None,  [("free", "#5b5e63")], False),
    ("◀",  None,  [("free", "#5b5e63")], False),
    ("▶",  LED,   [("GO LIVE", TEXT), ("record +", DIM), ("broadcast", DIM)], True),
]

text(X0, 712, "BOTTOM ROW (left to right)", 11, DIM, anchor="start", weight="bold")
BW, BPITCH = 116, 126
for i, (sym, color, lines, led) in enumerate(bottom):
    x = X0 + i * BPITCH
    y = 722
    cx = x + BW / 2
    if color is None:
        rect(x, y, BW, 92, BTN_BG_FREE, rx=8, stroke="#33373d")
        text(cx, y + 30, sym, 16, "#555", weight="bold")
    else:
        rect(x, y, BW, 92, BTN_BG, rx=8, stroke=color)
        text(cx, y + 30, sym, 16, TEXT, weight="bold")
    for n, (s, c) in enumerate(lines):
        text(cx, y + 52 + n * 13, s, 9.5, c)
    if led:
        circle(x + BW - 12, y + 12, 4, LED)

# ---------------------------------------------------------------- legend
ly = 848
text(X0, ly, "Legend:", 11, TEXT, anchor="start", weight="bold")
legend = [(D1, "deck 1"), (D2, "deck 2"), (GRAY, "master / library"), (FX, "effects")]
lx = X0 + 65
for color, label in legend:
    rect(lx, ly - 10, 12, 12, color, rx=3)
    text(lx + 17, ly, label, 10.5, TEXT, anchor="start")
    lx += 17 + len(label) * 6 + 28
circle(lx + 4, ly - 4, 4, LED)
text(lx + 14, ly, "button LED lights while active (mic live / recording+streaming)",
     10.5, TEXT, anchor="start")
text(X0, ly + 22, "shift: … = function while holding the bottom-left ▶ button",
     10.5, SHIFT, anchor="start")
text(X0, ly + 42,
     "Generated by generate-layout.py · mapping files: "
     "Donner-StarryCTRL-DJ.midi.xml + Donner-StarryCTRL-DJ-scripts.js",
     9.5, DIM, anchor="start")

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
    f'viewBox="0 0 {W} {H}">\n' + "\n".join(out) + "\n</svg>\n"
)

with open("layout.svg", "w", encoding="utf-8") as f:
    f.write(svg)
print(f"wrote layout.svg ({len(svg)} bytes)")

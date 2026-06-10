# Donner StarryCTRL — Mixxx DJ mapping

2-deck DJ mapping for the Donner StarryCTRL (hardware-identical to the
M-Vave SMC-Mixer), implementing the layout drawn by Fiachik in the
[Mixxx forum thread](https://mixxx.discourse.group/t/m-wave-sinco-smc-mixer-radio-broadcast-mapping/30366).

## Install

Copy `Donner-StarryCTRL-DJ.midi.xml` and `Donner-StarryCTRL-DJ-scripts.js`
into `~/.mixxx/controllers/` (already done on this machine), then pick
**Donner StarryCTRL (DJ)** for the device in Preferences → Controllers.

**Important:** keep the controller on its default layer. The hardware
SHIFT button (top right, below BT) switches the device's internal layer
and changes the MIDI messages it sends — this mapping only covers the
default layer. The mapping's SHIFT is the **bottom-left play transport
button** instead.

## Layout

Strips are numbered 1–8 left to right. Each strip is a fader plus a
column of four buttons (M, S, R, □ top to bottom). "Shift" means holding
the bottom-left ▶ transport button.

### Knobs (left to right)

| # | Function | Shift |
|---|----------|-------|
| 1 | Deck 1 jog (pitch nudge); adjusts loop point while loop in/out held | Jog search (seek) |
| 2 | Headphone level | |
| 3 | Cue/master headphone mix | |
| 4 | Deck 1 superknob (QuickEffect filter) | |
| 5 | Library scroll | Waveform zoom |
| 6 | Deck 2 superknob (QuickEffect filter) | |
| 7 | FX level depth (focused unit dry/wet) | Metaknob (unit super) |
| 8 | Deck 2 jog; adjusts loop point while loop in/out held | Jog search (seek) |

### Faders

| Fader | Function |
|-------|----------|
| 1 | Deck 1 volume |
| 2 | Deck 2 volume |
| 3 | Crossfader |
| 4–6 | free |
| 7 | Deck 1 pitch (up = faster; flip sign in `rateFader` for DJ-style) |
| 8 | Deck 2 pitch |

### Strip buttons

| Strip | M | S | R | □ |
|-------|---|---|---|---|
| 1 (deck 1) | Loop in (hold + jog = adjust) | Sync · *shift: tempo range* | Cue · *shift: cue at start* | Play · *shift: reverse* |
| 2 (deck 1) | Loop out (hold + jog = adjust) | Loop ÷2 | free | free |
| 3 (deck 1) | Reloop/exit | Loop ×2 | free | free |
| 4 (deck 1) | free | free | **FX1** (assign focused unit to deck 1) | **CUE1** (headphone cue) |
| 5 (deck 2) | Loop in | Loop ÷2 | **FX2** (assign focused unit to deck 2) | **CUE2** (headphone cue) |
| 6 (deck 2) | Loop out | Loop ×2 | free | free |
| 7 (deck 2) | Reloop/exit | free | free | free |
| 8 (deck 2) | free | Sync · *shift: tempo range* | Cue · *shift: cue at start* | Play · *shift: reverse* |

### Bottom row (left to right)

| Button | Function | Shift |
|--------|----------|-------|
| ▶ | **SHIFT** (hold) | |
| ⏸ | Mic 1 on/off (talkover) — LED lit while the mic is live | |
| ⏺ | FX on (toggle effect 1 of focused unit) | |
| ⏮ | Previous effect | Previous effect unit |
| ⏭ | Next effect | Next effect unit |
| « | Load selected track → deck 1 | |
| » | Load selected track → deck 2 | |
| ▲ | Library focus back | Select item (GoToItem) |
| ▼ ◀ | free | |
| ▶ (rightmost) | **Go live**: start/stop recording + broadcasting together — LED lit while live | |

Notes on go live: broadcasting must be configured in Preferences →
Live Broadcasting first, or Mixxx will show an error when enabling it.
The LED lights while recording is running or the broadcast connection
is up (including the connecting phase); if both drop, it goes dark.
Mixxx persists the broadcasting toggle across restarts, so if you quit
while live it may ask to reconnect on the next launch.

## Things to verify on first run (built without the hardware)

1. **Encoder direction** — if knobs work backwards, the device may send
   inverted relative values; swap the sign in `StarryCTRL.ticks`.
2. **Button release messages** — assumed to be note-on with velocity 0
   (matches the official M-Vave mapping). If loop in/out "hold to adjust"
   never releases, the device sends note-off (0x80) instead; add 0x80
   bindings to the XML.
3. **LEDs** — play/cue/sync/loop/pfl/FX LEDs are sent as note-on 0x7F /
   0x00. The official mapping notes some firmware only blinks LEDs.
4. **Strip assignments** — strips 4/5 (FX1/CUE1, FX2/CUE2) and the deck 2
   button placements were read off Fiachik's annotated photo; if a button
   does something unexpected, use Preferences → Controllers → the
   highlighted MIDI activity (or `mixxx --controller-debug`) to see the
   note number and tell me which function landed where.
5. **Pitch fader polarity** — currently fader up = faster.

Tweakable constants (jog sensitivity, search speed, loop-adjust step,
tempo ranges, number of FX units cycled) are at the top of the script.

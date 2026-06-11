"use strict";

// Donner StarryCTRL / M-Vave SMC-Mixer — 2-deck DJ mapping
// Implements the layout drawn by Fiachik in the Mixxx forum thread:
// https://mixxx.discourse.group/t/m-wave-sinco-smc-mixer-radio-broadcast-mapping/30366
//
// The hardware speaks a Mackie-Control-style protocol (same MIDI codes as the
// official MVave-SMC-Mixer mapping by Sam Whited):
//   - 8 faders on pitch bend, status 0xE0..0xE7
//   - 8 encoders on CC 0x10..0x17 (relative: 0x01..0x07 = up, 0x41..0x47 = down)
//   - strip buttons as notes: R row 0x00..0x07, S row 0x08..0x0F,
//     M row 0x10..0x17, square row 0x18..0x1F
//   - bottom row: 0x5B-0x5F transport, 0x2E/0x2F chevrons, 0x60..0x63 arrows
//
// The bottom-left PLAY transport button (0x5E) is used as SHIFT.
// Keep the hardware on its default layer (the top-right SHIFT button switches
// internal layers and will change the MIDI messages the device sends).

// eslint-disable-next-line no-var
var StarryCTRL = {};

// ---------------------------------------------------------------------------
// Tweakables
// ---------------------------------------------------------------------------
StarryCTRL.jogNudge = 2;          // strength of pitch nudge per encoder tick
StarryCTRL.searchStep = 0.005;    // fraction of track per tick (shift + jog)
StarryCTRL.loopAdjustSecs = 0.01; // loop point move per tick while held
StarryCTRL.zoomStep = 0.3;        // waveform zoom per tick
StarryCTRL.knobStep = 0.025;      // parameter change per tick for level knobs
StarryCTRL.numFxUnits = 2;        // how many effect units shift+prev/next cycles
StarryCTRL.tempoRanges = [0.08, 0.16, 0.24, 0.5];
StarryCTRL.endWarningSecs = 30;   // seconds before track end to start flashing
StarryCTRL.endWarningFlashMs = 500; // flash interval in milliseconds

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
StarryCTRL.shift = false;
StarryCTRL.focusedUnit = 1;
StarryCTRL.loopInHeld = {"[Channel1]": false, "[Channel2]": false};
StarryCTRL.loopOutHeld = {"[Channel1]": false, "[Channel2]": false};
StarryCTRL.connections = [];
StarryCTRL.fxConnections = [];
// End-of-track warning: flash the full M+S+R button columns of strips 1-3
// (deck 1 side) and 6-8 (deck 2 side). Several of these double as live
// indicators — loop (strip 3/7 M), sync (strip 1/8 S) and cue (strip 1/8 R)
// — so their connections hold off while the warning is flashing and
// stopEndWarning restores their real states.
StarryCTRL.endWarningLeds = {
    "[Channel1]": [0x10, 0x11, 0x12, 0x08, 0x09, 0x0A, 0x00, 0x01, 0x02],
    "[Channel2]": [0x15, 0x16, 0x17, 0x0D, 0x0E, 0x0F, 0x05, 0x06, 0x07],
};
StarryCTRL.endWarningTimer = {"[Channel1]": 0, "[Channel2]": 0};
StarryCTRL.endWarningFlashState = {"[Channel1]": false, "[Channel2]": false};

// Always-on LEDs: M+S of strips 4 and 5 light the middle of the unit as a
// landmark for the crossfader (fader 5).
StarryCTRL.landmarkLeds = [0x13, 0x0B, 0x14, 0x0C];

StarryCTRL.LED = {
    cue: {"[Channel1]": 0x00, "[Channel2]": 0x07},
    play: {"[Channel1]": 0x18, "[Channel2]": 0x1F},
    sync: {"[Channel1]": 0x08, "[Channel2]": 0x0F},
    loop: {"[Channel1]": 0x12, "[Channel2]": 0x16},
    pfl: {"[Channel1]": 0x1B, "[Channel2]": 0x1C},
    fxAssign: {"[Channel1]": 0x03, "[Channel2]": 0x04},
    fxOn: 0x5F,
    shift: 0x5E,
    mic: 0x5D,
    live: 0x63,
};

StarryCTRL.allLeds = [
    0x00, 0x01, 0x02, 0x05, 0x06, 0x07,
    0x18, 0x1F, 0x08, 0x0F, 0x10, 0x14, 0x11, 0x15,
    0x12, 0x16, 0x09, 0x0C, 0x0A, 0x0D, 0x03, 0x04, 0x1B, 0x1C,
    0x13, 0x0B, 0x17,
    0x5B, 0x5C, 0x5D, 0x5E, 0x5F, 0x2E, 0x2F, 0x60, 0x61, 0x62, 0x63,
];

StarryCTRL.sendLed = function(note, on) {
    midi.sendShortMsg(0x90, note, on ? 0x7F : 0x00);
};

// Relative encoder value -> signed tick count (supports acceleration)
StarryCTRL.ticks = function(value) {
    return value < 0x40 ? value : -(value - 0x40);
};

StarryCTRL.isPress = function(value) {
    return value > 0;
};

StarryCTRL.unitGroup = function() {
    return "[EffectRack1_EffectUnit" + StarryCTRL.focusedUnit + "]";
};

StarryCTRL.effectGroup = function() {
    return "[EffectRack1_EffectUnit" + StarryCTRL.focusedUnit + "_Effect1]";
};

// ---------------------------------------------------------------------------
// End-of-track warning
// ---------------------------------------------------------------------------
StarryCTRL.startEndWarning = function(group) {
    if (StarryCTRL.endWarningTimer[group]) {
        return;
    }
    StarryCTRL.endWarningFlashState[group] = true;
    StarryCTRL.endWarningLeds[group].forEach(function(note) {
        StarryCTRL.sendLed(note, true);
    });
    StarryCTRL.endWarningTimer[group] = engine.beginTimer(
        StarryCTRL.endWarningFlashMs,
        function() {
            StarryCTRL.endWarningFlashState[group] =
                !StarryCTRL.endWarningFlashState[group];
            StarryCTRL.endWarningLeds[group].forEach(function(note) {
                StarryCTRL.sendLed(note, StarryCTRL.endWarningFlashState[group]);
            });
        }
    );
};

StarryCTRL.stopEndWarning = function(group) {
    if (!StarryCTRL.endWarningTimer[group]) {
        return; // not active — avoid spamming LED-off on every position update
    }
    engine.stopTimer(StarryCTRL.endWarningTimer[group]);
    StarryCTRL.endWarningTimer[group] = 0;
    StarryCTRL.endWarningFlashState[group] = false;
    StarryCTRL.endWarningLeds[group].forEach(function(note) {
        StarryCTRL.sendLed(note, false);
    });
    // the warning borrows live indicator LEDs — restore their real states
    StarryCTRL.sendLed(StarryCTRL.LED.cue[group],
        engine.getValue(group, "cue_indicator") > 0);
    StarryCTRL.sendLed(StarryCTRL.LED.sync[group],
        engine.getValue(group, "sync_enabled") > 0);
    StarryCTRL.sendLed(StarryCTRL.LED.loop[group],
        engine.getValue(group, "loop_enabled") > 0);
};

StarryCTRL.checkEndWarning = function(group, pos) {
    const duration = engine.getValue(group, "duration");
    const playing = engine.getValue(group, "play") > 0;
    if (duration > 0 && pos > 0 && playing) {
        const remaining = duration * (1 - pos);
        if (remaining <= StarryCTRL.endWarningSecs) {
            StarryCTRL.startEndWarning(group);
            return;
        }
    }
    StarryCTRL.stopEndWarning(group);
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
StarryCTRL.init = function() {
    ["[Channel1]", "[Channel2]"].forEach(function(group) {
        engine.softTakeover(group, "volume", true);
        engine.softTakeover(group, "rate", true);
    });
    engine.softTakeover("[Master]", "crossfader", true);

    StarryCTRL.allLeds.forEach(function(note) {
        StarryCTRL.sendLed(note, false);
    });
    StarryCTRL.landmarkLeds.forEach(function(note) {
        StarryCTRL.sendLed(note, true);
    });

    ["[Channel1]", "[Channel2]"].forEach(function(group) {
        StarryCTRL.connections.push(
            engine.makeConnection(group, "cue_indicator", function(value) {
                if (StarryCTRL.endWarningTimer[group]) {
                    return; // the warning is flashing this LED; restored on stop
                }
                StarryCTRL.sendLed(StarryCTRL.LED.cue[group], value > 0);
            }),
            engine.makeConnection(group, "play_indicator", function(value) {
                StarryCTRL.sendLed(StarryCTRL.LED.play[group], value > 0);
            }),
            engine.makeConnection(group, "sync_enabled", function(value) {
                if (StarryCTRL.endWarningTimer[group]) {
                    return; // the warning is flashing this LED; restored on stop
                }
                StarryCTRL.sendLed(StarryCTRL.LED.sync[group], value > 0);
            }),
            engine.makeConnection(group, "loop_enabled", function(value) {
                if (StarryCTRL.endWarningTimer[group]) {
                    return; // the warning is flashing this LED; restored on stop
                }
                StarryCTRL.sendLed(StarryCTRL.LED.loop[group], value > 0);
            }),
            engine.makeConnection(group, "pfl", function(value) {
                StarryCTRL.sendLed(StarryCTRL.LED.pfl[group], value > 0);
            }),
            engine.makeConnection(group, "playposition", function(pos) {
                StarryCTRL.checkEndWarning(group, pos);
            }),
            // playposition stops updating once the deck stops, so pause and
            // track end are caught here to shut the warning off.
            engine.makeConnection(group, "play", function(value) {
                if (value > 0) {
                    StarryCTRL.checkEndWarning(group,
                        engine.getValue(group, "playposition"));
                } else {
                    StarryCTRL.stopEndWarning(group);
                }
            })
        );
    });
    StarryCTRL.connections.push(
        engine.makeConnection("[Microphone]", "talkover", function(value) {
            StarryCTRL.sendLed(StarryCTRL.LED.mic, value > 0);
        }),
        engine.makeConnection("[Recording]", "status", StarryCTRL.updateLiveLed),
        engine.makeConnection("[Shoutcast]", "status", StarryCTRL.updateLiveLed)
    );
    StarryCTRL.connections.forEach(function(conn) { conn.trigger(); });

    StarryCTRL.connectFx();
};

StarryCTRL.shutdown = function() {
    ["[Channel1]", "[Channel2]"].forEach(function(group) {
        StarryCTRL.stopEndWarning(group);
    });
    StarryCTRL.connections.forEach(function(conn) { conn.disconnect(); });
    StarryCTRL.fxConnections.forEach(function(conn) { conn.disconnect(); });
    StarryCTRL.allLeds.forEach(function(note) {
        StarryCTRL.sendLed(note, false);
    });
};

// FX LEDs follow the focused unit, so they are reconnected when it changes.
StarryCTRL.connectFx = function() {
    StarryCTRL.fxConnections.forEach(function(conn) { conn.disconnect(); });
    StarryCTRL.fxConnections = [];
    const unit = StarryCTRL.unitGroup();
    ["[Channel1]", "[Channel2]"].forEach(function(group) {
        StarryCTRL.fxConnections.push(
            engine.makeConnection(unit, "group_" + group + "_enable", function(value) {
                StarryCTRL.sendLed(StarryCTRL.LED.fxAssign[group], value > 0);
            })
        );
    });
    StarryCTRL.fxConnections.push(
        engine.makeConnection(StarryCTRL.effectGroup(), "enabled", function(value) {
            StarryCTRL.sendLed(StarryCTRL.LED.fxOn, value > 0);
        })
    );
    StarryCTRL.fxConnections.forEach(function(conn) { conn.trigger(); });
};

// ---------------------------------------------------------------------------
// Shift (bottom-left PLAY transport button)
// ---------------------------------------------------------------------------
StarryCTRL.shiftButton = function(channel, control, value, status, group) {
    StarryCTRL.shift = StarryCTRL.isPress(value);
    StarryCTRL.sendLed(StarryCTRL.LED.shift, StarryCTRL.shift);
};

// ---------------------------------------------------------------------------
// Faders (pitch bend; control = LSB, value = MSB)
// ---------------------------------------------------------------------------
StarryCTRL.faderValue = function(control, value) {
    return ((value << 7) | control) / 16383;
};

StarryCTRL.volumeFader = function(channel, control, value, status, group) {
    engine.setParameter(group, "volume", StarryCTRL.faderValue(control, value));
};

StarryCTRL.crossfaderFader = function(channel, control, value, status, group) {
    engine.setParameter("[Master]", "crossfader", StarryCTRL.faderValue(control, value));
};

// Fader up = faster. Swap the sign here if you prefer DJ-style (down = faster).
StarryCTRL.rateFader = function(channel, control, value, status, group) {
    engine.setParameter(group, "rate", StarryCTRL.faderValue(control, value));
};

// ---------------------------------------------------------------------------
// Encoders
// ---------------------------------------------------------------------------

// Jog turn / shift: jog search. While loop in/out is held, adjusts that point.
StarryCTRL.jogKnob = function(channel, control, value, status, group) {
    const ticks = StarryCTRL.ticks(value);
    if (StarryCTRL.shift) {
        let pos = engine.getParameter(group, "playposition") +
            ticks * StarryCTRL.searchStep;
        pos = Math.max(0, Math.min(1, pos));
        engine.setParameter(group, "playposition", pos);
    } else if (StarryCTRL.loopInHeld[group] || StarryCTRL.loopOutHeld[group]) {
        const key = StarryCTRL.loopInHeld[group] ?
            "loop_start_position" : "loop_end_position";
        const current = engine.getValue(group, key);
        if (current < 0) {
            return; // no loop point set yet
        }
        // positions are in stereo samples: 2 * sample rate per second
        const step = 2 * engine.getValue(group, "track_samplerate") *
            StarryCTRL.loopAdjustSecs;
        engine.setValue(group, key, Math.max(0, current + ticks * step));
    } else {
        engine.setValue(group, "jog", ticks * StarryCTRL.jogNudge);
    }
};

StarryCTRL.headGainKnob = function(channel, control, value, status, group) {
    const ticks = StarryCTRL.ticks(value);
    engine.setParameter("[Master]", "headGain",
        engine.getParameter("[Master]", "headGain") + ticks * StarryCTRL.knobStep);
};

StarryCTRL.headMixKnob = function(channel, control, value, status, group) {
    const ticks = StarryCTRL.ticks(value);
    engine.setParameter("[Master]", "headMix",
        engine.getParameter("[Master]", "headMix") + ticks * StarryCTRL.knobStep);
};

// Superknob / filter (QuickEffect)
StarryCTRL.filterKnob = function(channel, control, value, status, group) {
    const ticks = StarryCTRL.ticks(value);
    engine.setParameter(group, "super1",
        engine.getParameter(group, "super1") + ticks * StarryCTRL.knobStep);
};

// Library scroll / shift: waveform zoom (both decks)
StarryCTRL.browseKnob = function(channel, control, value, status, group) {
    const ticks = StarryCTRL.ticks(value);
    if (StarryCTRL.shift) {
        ["[Channel1]", "[Channel2]"].forEach(function(deck) {
            let zoom = engine.getValue(deck, "waveform_zoom") +
                ticks * StarryCTRL.zoomStep;
            zoom = Math.max(1, Math.min(10, zoom));
            engine.setValue(deck, "waveform_zoom", zoom);
        });
    } else {
        engine.setValue("[Library]", "MoveVertical", ticks);
    }
};

// FX level depth (unit dry/wet) / shift: metaknob (unit super knob)
StarryCTRL.fxLevelKnob = function(channel, control, value, status, group) {
    const ticks = StarryCTRL.ticks(value);
    const unit = StarryCTRL.unitGroup();
    const key = StarryCTRL.shift ? "super1" : "mix";
    engine.setParameter(unit, key,
        engine.getParameter(unit, key) + ticks * StarryCTRL.knobStep);
};

// ---------------------------------------------------------------------------
// Deck buttons
// ---------------------------------------------------------------------------

// CUE / shift: jump to track start and stop
StarryCTRL.cueButton = function(channel, control, value, status, group) {
    if (StarryCTRL.shift) {
        if (StarryCTRL.isPress(value)) {
            engine.setValue(group, "start_stop", 1);
        }
    } else {
        engine.setValue(group, "cue_default", StarryCTRL.isPress(value) ? 1 : 0);
    }
};

// Play / shift: reverse
StarryCTRL.playButton = function(channel, control, value, status, group) {
    if (!StarryCTRL.isPress(value)) {
        return;
    }
    if (StarryCTRL.shift) {
        engine.setValue(group, "reverse", !engine.getValue(group, "reverse"));
    } else {
        engine.setValue(group, "play", !engine.getValue(group, "play"));
    }
};

// Sync / shift: cycle tempo (rate) range
StarryCTRL.syncButton = function(channel, control, value, status, group) {
    if (!StarryCTRL.isPress(value)) {
        return;
    }
    if (StarryCTRL.shift) {
        const current = engine.getValue(group, "rateRange");
        const ranges = StarryCTRL.tempoRanges;
        let next = 0;
        for (let i = 0; i < ranges.length; i++) {
            if (Math.abs(ranges[i] - current) < 0.001) {
                next = (i + 1) % ranges.length;
                break;
            }
        }
        engine.setValue(group, "rateRange", ranges[next]);
    } else {
        engine.setValue(group, "sync_enabled",
            !engine.getValue(group, "sync_enabled"));
    }
};

// Loop in/out: set the point; hold the button and turn the jog knob to adjust.
StarryCTRL.loopInButton = function(channel, control, value, status, group) {
    const pressed = StarryCTRL.isPress(value);
    StarryCTRL.loopInHeld[group] = pressed;
    engine.setValue(group, "loop_in", pressed ? 1 : 0);
};

StarryCTRL.loopOutButton = function(channel, control, value, status, group) {
    const pressed = StarryCTRL.isPress(value);
    StarryCTRL.loopOutHeld[group] = pressed;
    engine.setValue(group, "loop_out", pressed ? 1 : 0);
};

StarryCTRL.reloopButton = function(channel, control, value, status, group) {
    if (StarryCTRL.isPress(value)) {
        engine.setValue(group, "reloop_toggle", 1);
    }
};

StarryCTRL.loopHalveButton = function(channel, control, value, status, group) {
    engine.setValue(group, "loop_halve", StarryCTRL.isPress(value) ? 1 : 0);
};

StarryCTRL.loopDoubleButton = function(channel, control, value, status, group) {
    engine.setValue(group, "loop_double", StarryCTRL.isPress(value) ? 1 : 0);
};

// FX1/FX2: assign the focused effect unit to this deck
StarryCTRL.fxAssignButton = function(channel, control, value, status, group) {
    if (!StarryCTRL.isPress(value)) {
        return;
    }
    const key = "group_" + group + "_enable";
    const unit = StarryCTRL.unitGroup();
    engine.setValue(unit, key, !engine.getValue(unit, key));
};

// CUE1/CUE2: headphone cue (pfl)
StarryCTRL.pflButton = function(channel, control, value, status, group) {
    if (StarryCTRL.isPress(value)) {
        engine.setValue(group, "pfl", !engine.getValue(group, "pfl"));
    }
};

// ---------------------------------------------------------------------------
// Bottom row
// ---------------------------------------------------------------------------

// Record button: toggle first effect of the focused unit on/off
StarryCTRL.fxOnButton = function(channel, control, value, status, group) {
    if (!StarryCTRL.isPress(value)) {
        return;
    }
    const effect = StarryCTRL.effectGroup();
    engine.setValue(effect, "enabled", !engine.getValue(effect, "enabled"));
};

// Prev/next effect; shift: prev/next effect unit
StarryCTRL.effectSelect = function(value, direction) {
    if (!StarryCTRL.isPress(value)) {
        return;
    }
    if (StarryCTRL.shift) {
        let unit = StarryCTRL.focusedUnit + direction;
        if (unit < 1) {
            unit = StarryCTRL.numFxUnits;
        } else if (unit > StarryCTRL.numFxUnits) {
            unit = 1;
        }
        StarryCTRL.focusedUnit = unit;
        StarryCTRL.connectFx();
    } else {
        engine.setValue(StarryCTRL.effectGroup(), "effect_selector", direction);
    }
};

StarryCTRL.prevEffectButton = function(channel, control, value, status, group) {
    StarryCTRL.effectSelect(value, -1);
};

StarryCTRL.nextEffectButton = function(channel, control, value, status, group) {
    StarryCTRL.effectSelect(value, 1);
};

StarryCTRL.loadButton = function(channel, control, value, status, group) {
    if (StarryCTRL.isPress(value)) {
        engine.setValue(group, "LoadSelectedTrack", 1);
    }
};

// Pause transport button: toggle mic 1 (talkover)
StarryCTRL.micButton = function(channel, control, value, status, group) {
    if (StarryCTRL.isPress(value)) {
        engine.setValue(group, "talkover", !engine.getValue(group, "talkover"));
    }
};

// Right arrow: go live — start/stop recording and broadcasting together.
// If the two states ever diverge (e.g. broadcast dropped but recording kept
// going), one press brings both back down.
StarryCTRL.liveButton = function(channel, control, value, status, group) {
    if (!StarryCTRL.isPress(value)) {
        return;
    }
    const recording = engine.getValue("[Recording]", "status") > 0;
    const broadcasting = engine.getValue("[Shoutcast]", "enabled") > 0;
    const goLive = !(recording || broadcasting);
    if (recording !== goLive) {
        engine.setValue("[Recording]", "toggle_recording", 1);
        engine.setValue("[Recording]", "toggle_recording", 0);
    }
    engine.setValue("[Shoutcast]", "enabled", goLive ? 1 : 0);
    StarryCTRL.updateLiveLed();
};

// Live LED: lit while recording or while the broadcast connection is up.
// [Shoutcast],status: 0 unconnected, 1 connecting, 2 on air, 3 failure,
// 4 partial (some connections up) — treat 1/2/4 as live.
StarryCTRL.updateLiveLed = function() {
    const recording = engine.getValue("[Recording]", "status") > 0;
    const bcStatus = engine.getValue("[Shoutcast]", "status");
    const broadcasting = bcStatus === 1 || bcStatus === 2 || bcStatus === 4;
    StarryCTRL.sendLed(StarryCTRL.LED.live, recording || broadcasting);
};

// Up arrow: move library focus back / shift: open-activate selected item
StarryCTRL.backButton = function(channel, control, value, status, group) {
    if (!StarryCTRL.isPress(value)) {
        return;
    }
    if (StarryCTRL.shift) {
        engine.setValue("[Library]", "GoToItem", 1);
    } else {
        engine.setValue("[Library]", "MoveFocusBackward", 1);
    }
};

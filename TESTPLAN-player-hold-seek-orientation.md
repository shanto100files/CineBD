# Test Plan — Player: Hold-to-Seek, Orientation Toggle, Seek-Stall Fix

Covers OTA releases 8801b448 (seek stall + hold-to-seek + orientation toggle) and
df4c9096 (tap/hold double-apply fix). Player screen: search → any content → Info → Play.

Setup: phone (portrait-capable), one landscape video (16:9), one portrait video (9:16
if available), a long video (30+ min) for hold-to-seek distances. TV checks marked [TV].

---

## A. Hold-to-seek (seek buttons: press-and-hold)

- [ ] **A1. Plain tap = ±10s.** Single tap on rewind/forward seeks exactly 10s, video keeps playing (no pause).
- [ ] **A2. Tap burst unchanged.** Three quick taps: label shows +10 → +20 → +30, total seek = 30s (not 60s, not 90s).
- [ ] **A3. Hold ramps.** Hold forward ~1s: label climbs +10 → +30 → +60 … while held; release applies ONE jump (check the time position once).
- [ ] **A4. Hold distance scales with duration.** Hold ~2s on a 1h video should jump minutes (~100s+), single small jump, one re-buffer only.
- [ ] **A5. Hold backward works the same.** Hold rewind: label −10 → −30 → −60 …, release jumps back once.
- [ ] **A6. No double-apply on release (df4c9096).** After a hold release, the video must land on exactly the label value (±1s drift). If it lands 10s further, the trailing onPress double-applied — FAIL.
- [ ] **A7. Tap-then-hold (df4c9096).** Tap once (+10 applies), within ~1s press and hold: hold starts fresh from +10 label; release applies only the hold burst (e.g. +30), NOT +40.
- [ ] **A8. Quick tap after hold.** Hold and release (big jump), then immediately tap: tap seeks exactly +10 more.
- [ ] **A9. Hold near video end.** Hold forward to the end: video ends gracefully (onEnd), no stuck UI, replay works.
- [ ] **A10. Hold at 0:00.** Hold rewind at the start: clamps at 0, no crash, label returns to plain 10.
- [ ] **A11. [TV] D-pad seek unaffected.** Left/right = ±10s with accumulated feedback; up/down = ±30s; OK toggles play/pause. Hold-to-seek is touch-only; TV unchanged.

## B. Seek-stall fix (video must never freeze after seek)

- [ ] **B1. Tap seek keeps playing.** Tap ±10 during playback: no pause, playback continues from the new position.
- [ ] **B2. Rapid taps keep playing.** 5 fast taps in ~2s: after settling, video plays (the old bug froze it here).
- [ ] **B3. Hold release keeps playing.** After a big hold-jump lands, playback resumes automatically (allow a short buffer spinner, but NOT a stuck pause icon/paused frame).
- [ ] **B4. Seekbar drag keeps playing.** Drag the seekbar and release: playback resumes (this path already had pause/restore; confirm no regression).
- [ ] **B5. Double-tap gesture keeps playing.** Double-tap left/right side seek gesture: video continues after the jump.
- [ ] **B6. Manual pause still works.** Tap the center play/pause: pauses and stays paused (guard must not force-resume user pauses).
- [ ] **B7. Pause during seek settles correctly.** Pause, then seek with the button: stays paused; resume works.
- [ ] **B8. Speed change unaffected.** Set 1.5x/2x: rate stays; then seek: returns to playing at the chosen rate.

## C. Manual orientation toggle (top bar, next to lock)

- [ ] **C1. Button visible.** Landscape video, controls shown: rotate icon appears between lock and cast/fullscreen buttons. [TV: hidden.]
- [ ] **C2. Landscape → portrait.** Tap: screen rotates to portrait, toast "Portrait mode", video letterboxed, keeps playing.
- [ ] **C3. Portrait → landscape.** Tap again: back to landscape, toast "Landscape mode".
- [ ] **C4. Override sticks (the point of the feature).** While playing a landscape video forced to portrait (C2), wait 5s+ and scrub/seek: orientation stays portrait (auto-detect + police listener must NOT steal it back).
- [ ] **C5. Detect-fail scenario.** Play a stream that misdetects (video shows rotated/wrong aspect): use the toggle to correct it manually — it must hold until you leave the player.
- [ ] **C6. Next video auto-detects afresh.** Exit player, play another (portrait) video: auto-orientation works as before (override did not leak).
- [ ] **C7. Player exit restores.** After using the toggle, exit the player: app returns to its normal orientation behavior (no stuck landscape in the app).
- [ ] **C8. Lock interplay.** Toggle orientation first, then lock the player: lock overlay works; unlock; orientation unchanged.

## D. Regression sweep

- [ ] **D1. Normal playback** (no seeks) for 5 minutes: no unexpected pauses.
- [ ] **D2. Controls auto-hide** still works after button seeks and holds.
- [ ] **D3. Cast session.** Start cast: orientation toggle hidden; seek buttons do not crash the cast UI.
- [ ] **D4. PiP / background-return.** Enter PiP or background mid-play, return: position and playing state intact.
- [ ] **D5. Episode switch.** Next episode: seek guard/hold state resets cleanly (first tap seeks +10 exactly).
- [ ] **D6. [TV] Full TV player sweep** (A11 + playback + back key) after these changes.

---

## Quick smoke (2 min) if short on time

Tap ±10 → keeps playing • Hold → one big jump on release (exact distance) • Rotate
toggle → sticks through a seek • Center pause → stays paused.

# Item Combat Playtest Rubric

This checklist defines the v1 "Mario Kart-like" feel target for boost, shell,
banana, item boxes, and spin-out recovery. Numeric ranges below are playtest
targets, not locked tuning constants; prefer changing values when repeated
playtests show the feel target is not met.

## Playtest Protocol

Use this protocol after any change to item behavior, item visuals, item-box
placement, networking replication, race pacing, or AI pace. The goal is to
decide whether combat feels responsive and understandable in a real multiplayer
race, not to freeze exact numeric tuning values.

### Preconditions

- Run a real 2-human WebRTC race: one host, one guest, plus 2 AI racers.
- Use Desktop Chrome for both clients.
- Use the full 3-lap race on the shipped track.
- Keep both clients visible enough to compare local item actions against remote
  reactions.
- Use host-authoritative gameplay: the host decides item pickups, item effects,
  lap progress, and finish order; the guest sends input over RTCDataChannel.
- Do not accept offline-only single-player results as evidence for this rubric.

### Required Race Passes

Complete at least 3 races after any item tuning change:

1. Normal race: both humans try to win and use items naturally.
2. Host coverage race: the host intentionally picks up and uses boost, shell,
   and banana at least once.
3. Guest comeback race: the guest intentionally trails for the first lap, then
   tries to recover through item boxes, boost use, and clean driving.

If a pass fails because of setup, disconnect, or a non-item bug, rerun that pass
after recording the blocker. If a pass fails because item combat is confusing,
weak, hidden, or out of sync, keep the failure and add a tuning note.

### What To Observe During Each Race

- Pickup count per human and whether either player stays empty for a long
  section after missing or taking boxes.
- Held-item downtime, including whether single-slot inventory behavior is clear.
- Boost moments: speed feel, camera/FOV widening, particle trail readability,
  and whether the boost changes position in the race.
- Shell moments: launch readability, projectile path, dodge window, collision
  fairness, and spin-out reaction.
- Banana moments: drop position, persistence, visibility to both humans, fair
  avoidability, and spin-out reaction.
- Remote event delay: whether the other client sees item launches, drops, hits,
  and recovery within the normal local latency target.
- Recovery feel: whether spin-out lasts long enough to matter but short enough
  that control return feels responsive.
- Comeback pressure: whether a trailing human can reduce a moderate gap through
  item routing and item use without relying on AI mistakes.
- Finish gaps and any finish-order changes caused by item combat.

### Evidence To Capture

- Build or commit identifier.
- Host and guest browser versions.
- Whether signaling connected through WebSocket and gameplay traffic used
  RTCDataChannel.
- Rough FPS impression for both clients: stable, occasional hitch, or frequent
  hitch.
- Remote item delay impression: synchronized, noticeable but playable, or late.
- Per-category `Pass`, `Watch`, or `Fail` score with short notes.
- Next tuning changes, if any.

## Pass Gates

- Every race has meaningful item interaction before lap 1 ends.
- Both humans can pick up and use boost, shell, and banana during playtest.
- Shells and bananas create visible, understandable spin-outs on both clients.
- Item effects never feel like hidden state: the local and remote player can
  tell what happened, who was hit, and when control returns.
- A trailing human has credible ways to reduce the gap through item boxes and
  boost use without needing AI mistakes.

## Automated Metric Check

Run `npm run validate:item-combat-playtest-metrics` after item tuning changes.
The check validates broad playtest gates rather than exact tuning constants:

- Pickup frequency: item-box opportunities per racer per lap, per race, and per
  target race minute.
- Useful item rate: weighted share of boost, shell, and banana contexts that
  have an immediate useful target or effect, plus a controlled host-side
  pickup/use cycle.
- Combat opportunity rate: expected shell/banana opportunities per target race
  minute, backed by target-resolution coverage for the 2-human + 2-AI roster.

## Scoring

Use this scale for each category:

- `Pass`: consistently hits the target in normal play.
- `Watch`: works, but at least one tester hesitates, misreads, or calls it weak.
- `Fail`: repeated confusion, starvation, unavoidable hits, or no comeback path.

The item-combat pass is valid only when all five categories below are `Pass` or
there is a concrete follow-up tuning note for every `Watch`.

## Item-Combat Feedback Questions

Ask these immediately after each race before changing tuning. Prefer specific
moments from the race over general impressions.

### Pickup And Inventory

- Did you notice every item-box pickup at the moment it happened?
- Did the held-item slot make it clear whether you had boost, shell, banana, or
  nothing?
- Did you ever think you should have picked up an item but did not? If yes,
  where on the track?
- Did single-slot inventory behavior feel intentional when you drove through a
  box while already holding an item?

### Boost Feel

- Did boost feel like a real burst of speed rather than a small stat change?
- Did the camera/FOV widening and particle trail make the boost obvious without
  hiding the track?
- Did boost help you recover after a mistake or spin-out?
- Was boost too weak, too strong, or close enough for v1?

### Shell Feel

- Could you tell when a shell was fired and where it was traveling?
- When you were targeted, did you have a fair chance to dodge after seeing it?
- When a shell hit, did the victim and spin-out reaction read clearly on both
  clients?
- Did any shell appear to pass through a kart, hit outside its visible path, or
  vanish without explanation?

### Banana Feel

- Could both players see dropped bananas early enough to react?
- Did banana placement behind the kart feel useful without creating confusing
  instant self-hits?
- Did banana hits produce the same clear spin-out language as shell hits?
- Did bananas persist long enough to shape the next lap or pack movement?

### Recovery And Fairness

- Did spin-out feel like a short combat penalty rather than a race-ending lockout?
- Was control return obvious and responsive?
- Did hit immunity or recovery handling prevent repeated helpless hits?
- Did any hit feel hidden, unavoidable, or disconnected from the visible item?

### Multiplayer Sync

- Did the remote client see item pickup, use, hit, and recovery close to when the
  local client saw them?
- Did remote movement stay smooth enough to aim shells and read banana hazards?
- Did the host and guest agree on who was hit, who recovered, lap count, and
  finish order?
- Did any item effect appear on only one client?

### Race And Comeback

- Did item boxes appear often enough to keep all 3 laps active?
- Could a trailing human reduce a moderate gap through boost, shell, banana, and
  cleaner driving?
- Did the leader remain vulnerable to visible item play without hidden
  rubber-banding?
- Did item combat create position changes without making driving feel secondary?

## Category Checklist

### 1. Pickup Frequency

Target: racers should make several item decisions in a 3-lap race, with item
boxes appearing often enough that combat stays present but not so often that
driving becomes secondary.

- A clean racing line offers an item opportunity at least once per lap, and
  usually more than once.
- A racer without a held item should not stay empty for a long track section
  unless they missed visible boxes or chose a bad line.
- Item boxes respawn quickly enough that the pack does not permanently starve
  the guest, AI racers, or a trailing human.
- Single-slot inventory is respected: pickup fails or is ignored while holding an
  item, and this feels clear rather than broken.
- Over a normal race, both humans should receive enough pickups to try at least
  two different item types unless they repeatedly avoid boxes.

Tuning levers: item-box count, item-box placement, respawn delay, collision
pickup radius, item weighting.

### 2. Item Readability

Target: players should understand pickup, held item, use, world presence, and hit
outcome at racing speed without reading debug text.

- Pickup feedback is immediate: the HUD slot visibly changes on the same moment
  the kart crosses the box.
- Held boost, shell, and banana icons are distinguishable at a glance.
- Boost feels obvious through speed, camera/FOV widening, and trail feedback.
- Shell is visible as a forward projectile for its whole useful travel time.
- Banana is visible as a persistent hazard on the track to both humans, not only
  to the dropper.
- Shell or banana hits clearly show the victim, spin-out direction, and recovery
  state on both clients.
- Remote item events appear close enough to local action that testers describe
  them as synchronized under normal local conditions.
- V1 visual fidelity may use simple particles and a small amount of spin-out
  animation jitter, as long as the effect remains visible, bounded, and
  unambiguous at racing speed.

Tuning levers: HUD size, color contrast, projectile scale, banana scale,
particle intensity, camera FOV delta, network event broadcast timing.

### 3. Hit Avoidance

Target: hits should feel earned, dodgeable, and readable. The game should reward
aim, placement, and last-second steering instead of invisible or unavoidable
collisions.

- A straight shell can be avoided by a player who sees it from medium distance
  and changes line promptly.
- Shells do not appear to pass through karts or hit karts outside their visible
  path.
- Bananas punish careless lines but are avoidable when the player has a fair
  view of the track ahead.
- Banana placement behind the user feels useful without creating instant,
  unreadable self-hits for normal driving.
- Hit immunity or recovery handling prevents repeated hits from chaining into a
  long helpless state.
- AI item use may be imperfect, but AI-fired or AI-dropped items follow the same
  readable rules as human items.

Tuning levers: shell speed, shell radius, banana radius, arm time, hit immunity,
track-side placement, collision sweep logic.

### 4. Recovery Time

Target: shell and banana hits should create a short, expressive loss of control
that hurts position without making the player feel removed from the race.

- Spin-out recovery feels near the accepted 1-2 second combat-racing window.
- During spin-out, steering loss, speed reduction, and visual rotation all point
  to the same state.
- Control return is obvious and responsive; the player can steer and accelerate
  immediately after recovery.
- A single hit changes the local fight but does not usually decide the entire
  race by itself.
- Boost after recovery feels like a valid way to rejoin the pack.

Tuning levers: stun duration, speed factor, angular spin amount, recovery
acceleration, post-hit immunity, boost duration.

### 5. Comeback Potential

Target: item combat should keep the 3-lap race live. A trailing human should be
able to pressure the leader through item-box routing, boosts, and hazards, while
the leader still wins through cleaner driving.

- Last place has regular item-box access and is not starved by leaders clearing
  the racing line.
- Boost produces a visible and positional gain large enough to matter after a
  missed turn or hit.
- Shell and banana interactions can close or reopen gaps without feeling random.
- A human trailing by a moderate mistake can reduce the gap within a few item
  cycles through clean driving and item use.
- Leaders remain vulnerable to visible shells and track hazards, but are not
  punished by hidden rubber-banding.
- Finishing order can change due to item combat during a normal race, especially
  between nearby racers.

Tuning levers: box placement on alternate lines, boost strength, boost duration,
item weighting by position if added, AI pace, track shortcut risk.

## Playtest Notes Template

```text
Date / build:
Host browser:
Guest browser:
Average FPS impression:
Remote item delay impression:

Pickup frequency: Pass / Watch / Fail
Notes:

Item readability: Pass / Watch / Fail
Notes:

Hit avoidance: Pass / Watch / Fail
Notes:

Recovery time: Pass / Watch / Fail
Notes:

Comeback potential: Pass / Watch / Fail
Notes:

Next tuning changes:
```

## Final Rubric Checklist

Before marking item combat as accepted for v1, every item below must be checked
or have an explicit follow-up issue.

- [ ] A real 2-player WebRTC session was tested in Desktop Chrome with one host,
  one guest, and 2 AI racers.
- [ ] The tested race used the shipped track, 3 laps, and the normal race flow
  from countdown through finish.
- [ ] WebSocket signaling connected, then gameplay inputs and host snapshots
  moved over RTCDataChannel.
- [ ] Host-authoritative decisions were verified for item pickup, item use, item
  hits, race progress, and finish order.
- [ ] `npm run validate:item-combat-playtest-metrics` passed for the current
  build.
- [ ] Both humans picked up and used boost, shell, and banana during the required
  race passes.
- [ ] Boost produced visible speed gain, camera/FOV widening, and particle trail
  feedback on both clients.
- [ ] Shell fired as a visible straight projectile, created fair dodge moments,
  and caused readable spin-out on hit.
- [ ] Banana dropped behind the kart, persisted as a shared track hazard, and
  caused readable spin-out on hit.
- [ ] Shell and banana hit reactions shared the same clear recovery language and
  avoided long helpless chains.
- [ ] Remote item events felt synchronized under normal local conditions and did
  not feel late enough to affect combat decisions.
- [ ] Remote movement stayed smooth enough for aiming, dodging, and reading
  hazards.
- [ ] Item boxes remained available throughout the 3-lap race and did not starve
  the trailing human.
- [ ] A trailing human had credible comeback pressure through item routing,
  boosts, and hazards.
- [ ] All five rubric categories are `Pass`, or every `Watch` has a concrete
  tuning note and owner.
- [ ] No result depends on exact hard-coded tuning constants being treated as
  final; numeric ranges remain playtest targets.
- [ ] No offline-only single-player run was used as the final acceptance
  evidence.

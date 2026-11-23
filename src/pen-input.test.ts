import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIFT_GRACE,
  PenEngine,
  ZERO_PRESSURE_SAMPLES,
  altitudeOf,
  filterCoalescedSamples,
  kindOf,
  palmSized,
  slotOf,
  tiltOf,
  twistOf,
} from './pen-logic';

test('slotOf maps XP-Pen barrel buttons vs mouse buttons without mixing indices and bitmasks', () => {
  // Stylus mode (Windows Ink on)
  assert.equal(slotOf({ pointerType: 'pen', buttons: 1, button: 0 }), '');
  assert.equal(slotOf({ pointerType: 'pen', buttons: 2, button: 1 }), 'barrel1');
  assert.equal(slotOf({ pointerType: 'pen', buttons: 4, button: 2 }), 'barrel2');
  assert.equal(slotOf({ pointerType: 'pen', buttons: 32, button: 5 }), 'eraser');
  assert.equal(slotOf({ pointerType: 'eraser', buttons: 1, button: 0 }), 'eraser');
  // Bitmask alone vs button index alone
  assert.equal(slotOf({ pointerType: 'pen', buttons: 2, button: 0 }), 'barrel1');
  assert.equal(slotOf({ pointerType: 'pen', buttons: 0, button: 2 }), 'barrel2');

  // Mouse mode (Windows Ink off: right click = barrel1, middle = barrel2)
  assert.equal(slotOf({ pointerType: 'mouse', buttons: 2, button: 2 }), 'barrel1');
  assert.equal(slotOf({ pointerType: 'mouse', buttons: 4, button: 1 }), 'barrel2');
  assert.equal(slotOf({ pointerType: 'mouse', buttons: 1, button: 0 }), '');
});

test('narrow XP-Pen pressure band (0.46..0.50) is normalised and settled cleanly', () => {
  const engine = new PenEngine();
  engine.begin('pen');
  for (let i = 0; i <= 30; i++) {
    const e = {
      pointerType: 'pen',
      type: i === 0 ? 'pointerdown' : 'pointermove',
      buttons: 1,
      pressure: 0.46 + (i / 30) * 0.04,
      timeStamp: 100 + i * 8,
    };
    engine.pressureOf(e);
  }
  engine.settle('pen');

  assert.equal(engine.hasPressure({ pointerType: 'pen' }), true);
  assert.equal(engine.profiles.pen.variable, true);
  assert.ok(Math.abs(engine.normalise('pen', 0.46) - 0) < 1e-6);
  assert.ok(Math.abs(engine.normalise('pen', 0.48) - 0.5) < 1e-3);
  assert.ok(Math.abs(engine.normalise('pen', 0.5) - 1) < 1e-6);
});

test('zero-pressure pen contact falls back cleanly after threshold while light-touch ramp stays pressure-sensitive', () => {
  // Case A: Light initial touch (pressure 0 on down, then ramps > 0) -> resets zeroN and learns pressure
  const lightStart = new PenEngine();
  lightStart.begin('pen');
  lightStart.pressureOf({ pointerType: 'pen', type: 'pointerdown', buttons: 1, pressure: 0, timeStamp: 1 });
  assert.equal(lightStart.profiles.pen.zeroN, 1);
  lightStart.pressureOf({ pointerType: 'pen', type: 'pointermove', buttons: 1, pressure: 0.25, timeStamp: 9 });
  assert.equal(lightStart.profiles.pen.zeroN, 0);
  assert.equal(lightStart.profiles.pen.n, 1);
  assert.equal(lightStart.hasPressure({ pointerType: 'pen' }), true);
  assert.equal(lightStart.isZeroPressureFallback(), false);

  // Case B: Hover moves (buttons: 0, pressure: 0) NEVER trigger zero-pressure fallback
  const hoverOnly = new PenEngine();
  for (let i = 0; i < 40; i++) {
    hoverOnly.pressureOf({ pointerType: 'pen', type: 'pointermove', buttons: 0, pressure: 0, timeStamp: 10 + i });
  }
  assert.equal(hoverOnly.profiles.pen.zeroN, 0);
  assert.equal(hoverOnly.isZeroPressureFallback(), false);

  // Case C: Deco 640 / Android OTG sending pointerType: 'pen', buttons: 1, pressure: 0 continuously
  // even when browser timer coarsening gives consecutive events identical timeStamps
  const zeroDriver = new PenEngine();
  zeroDriver.begin('pen');
  const repeatedRef = {
    pointerType: 'pen',
    type: 'pointerdown',
    buttons: 1,
    pressure: 0,
    timeStamp: 100,
  };
  zeroDriver.pressureOf(repeatedRef);
  zeroDriver.pressureOf(repeatedRef); // same event reference dispatched to multiple listeners -> ignored
  assert.equal(zeroDriver.profiles.pen.zeroN, 1);

  for (let i = 1; i < ZERO_PRESSURE_SAMPLES; i++) {
    const e = {
      pointerType: 'pen',
      type: 'pointermove',
      buttons: 1,
      pressure: 0,
      timeStamp: 100, // same tick
    };
    zeroDriver.pressureOf(e);
  }
  assert.equal(zeroDriver.isZeroPressureFallback(), true);
  assert.equal(zeroDriver.hasPressure({ pointerType: 'pen' }), false);
});

test('two-pen replacement shifts floor and ceiling up cleanly', () => {
  const engine = new PenEngine();
  // Pen 1: wide range 0.10..0.95
  engine.begin('pen');
  for (let i = 0; i <= 25; i++) {
    engine.pressureOf({
      pointerType: 'pen',
      type: i === 0 ? 'pointerdown' : 'pointermove',
      buttons: 1,
      pressure: 0.1 + (i / 25) * 0.85,
      timeStamp: 10 + i,
    });
  }
  engine.settle('pen');
  assert.ok(engine.profiles.pen.lo <= 0.11);

  // Pen 2: narrow compressed range 0.46..0.50 across 2 settled strokes
  for (let s = 0; s < 2; s++) {
    engine.begin('pen');
    for (let i = 0; i <= 25; i++) {
      engine.pressureOf({
        pointerType: 'pen',
        type: i === 0 ? 'pointerdown' : 'pointermove',
        buttons: 1,
        pressure: 0.46 + (i / 25) * 0.04,
        timeStamp: 100 + s * 100 + i,
      });
    }
    engine.settle('pen');
  }
  assert.ok(engine.profiles.pen.lo >= 0.45);
  assert.ok(engine.profiles.pen.hi <= 0.51);
});

test('palm rejection blocks touches while pen down, hovering, in grace, or palm-sized', () => {
  const engine = new PenEngine();
  assert.equal(engine.accept({ pointerType: 'pen', type: 'pointerdown', buttons: 1, pressure: 0.5 }, 1000), true);
  assert.equal(engine.accept({ pointerType: 'touch', type: 'pointerdown', width: 10, height: 10 }, 1020), false);
  assert.equal(engine.lastReason, 'touch:pen is down');

  assert.equal(engine.accept({ pointerType: 'pen', type: 'pointerup', buttons: 0, pressure: 0 }, 1100), true);
  assert.equal(engine.accept({ pointerType: 'touch', type: 'pointerdown', width: 10, height: 10 }, 1200), false);
  assert.equal(engine.lastReason, 'touch:inside lift grace');

  // Leave hover -> still blocked until LIFT_GRACE passes
  engine.penNear = false;
  assert.equal(
    engine.accept({ pointerType: 'touch', type: 'pointerdown', width: 10, height: 10 }, 1100 + LIFT_GRACE + 50),
    true
  );
  assert.equal(palmSized({ pointerType: 'touch', width: 52, height: 48 }), true);
  assert.equal(
    engine.accept({ pointerType: 'touch', type: 'pointerdown', width: 52, height: 48 }, 2000),
    false
  );
});

test('filterCoalescedSamples drops foreign pointerIds, out-of-order timestamps, non-finite coords, and bogus (0,0) spikes', () => {
  const parent = { pointerId: 7, timeStamp: 100, clientX: 400, clientY: 500 };
  const list = [
    { pointerId: 7, timeStamp: 90, clientX: 390, clientY: 490 },
    { pointerId: 8, timeStamp: 92, clientX: 392, clientY: 492 }, // foreign
    { pointerId: 7, timeStamp: 85, clientX: 395, clientY: 495 }, // out of order
    { pointerId: 7, timeStamp: 96, clientX: 0, clientY: 0 }, // driver origin spike
    { pointerId: 7, timeStamp: 98, clientX: Number.NaN, clientY: 499 }, // bad coords
    { pointerId: 7, timeStamp: 100, clientX: 400, clientY: 500 },
  ];
  const kept = filterCoalescedSamples(parent, list);
  assert.deepEqual(
    kept.map((q) => [q.timeStamp, q.clientX, q.clientY]),
    [
      [90, 390, 490],
      [100, 400, 500],
    ]
  );

  // Legitimate stroke near (0,0) keeps (0,0)
  const originParent = { pointerId: 7, timeStamp: 100, clientX: 5, clientY: 6 };
  const keptNearOrigin = filterCoalescedSamples(originParent, [
    { pointerId: 7, timeStamp: 95, clientX: 0, clientY: 0 },
    originParent,
  ]);
  assert.equal(keptNearOrigin.length, 2);
});

test('tilt, altitude, twist, and kindOf match spec geometry', () => {
  assert.equal(kindOf({ pointerType: 'eraser' }), 'pen');
  assert.ok(Math.abs(tiltOf({ pointerType: 'pen', tiltX: 0, tiltY: 0 })) < 1e-6);
  assert.ok(Math.abs(tiltOf({ pointerType: 'pen', tiltX: 45, tiltY: 0 }) - 0.5) < 0.01);
  assert.ok(Math.abs((altitudeOf({ pointerType: 'pen', tiltX: 45, tiltY: 0 }) ?? 0) - Math.PI / 4) < 0.01);
  assert.equal(twistOf({ pointerType: 'pen' }), null);
  assert.ok(Math.abs((twistOf({ pointerType: 'pen', twist: 90 }) ?? 0) - Math.PI / 2) < 1e-6);
});

// Ball velocities for each kind of kick: rolled passes that arrive at a teammate's feet, lofted
// balls that land on a spot, shots at a point in the goal (with optional curl).
import * as THREE from 'three';
import { BALL, CONDITIONS } from '../data/tuning';
import { flight } from './ball';

const R = BALL.radius;
const G = BALL.gravity;

/** Launch speed for a rolled ball to cover `d` metres and still be doing `arrive` m/s. */
export function rollSpeed(d: number, arrive: number) {
  // Players half-allow for the pitch: a wet one runs a bit long, a snowy one a bit short.
  const roll = BALL.roll * (1 + (CONDITIONS.roll - 1) * 0.5);
  return Math.sqrt(arrive * arrive + 2 * roll * d) * (1 + d * 0.004);
}

/** A ball rolled along the grass toward (toX, toZ) at `speed`. */
export function groundKick(fromX: number, fromZ: number, toX: number, toZ: number, speed: number) {
  const dx = toX - fromX, dz = toZ - fromZ;
  const d = Math.hypot(dx, dz) || 1;
  return new THREE.Vector3((dx / d) * speed, 0.3, (dz / d) * speed);
}

/** Flight time for a lofted ball over `d` metres (longer balls hang longer). */
export function loftTime(d: number, high = 1) {
  return Math.max(0.75, Math.min(2.4, (0.65 + d * 0.05) * high));
}

/** A lofted ball from `from` that lands on (toX, toZ) after `t` seconds. */
export function loft(from: THREE.Vector3, toX: number, toZ: number, t: number) {
  const dx = toX - from.x, dz = toZ - from.z;
  const d = Math.hypot(dx, dz);
  const k = 1 + d * 0.0075;
  return new THREE.Vector3((dx / t) * k, (R - from.y + 0.5 * G * t * t) / t, (dz / t) * k);
}

/**
 * A shot at the point (gx, ty, tz) on the goal line, at `speed`, curling by `curl` (-1..1: which way
 * it bends). Returns the velocity and the spin.
 */
export function shot(from: THREE.Vector3, gx: number, ty: number, tz: number, speed: number, curl = 0) {
  let dx = gx - from.x, dz = tz - from.z;
  const d = Math.hypot(dx, dz) || 1;
  const spinY = curl * 22;
  // Curl bends it sideways: aim off by as much so it bends back onto the target.
  const off = (0.5 * BALL.magnus * spinY * d * d) / speed;
  const ux = dx / d, uz = dz / d;
  dx -= uz * off;
  dz += ux * off;
  const d2 = Math.hypot(dx, dz);
  const t = d2 / speed;
  const vy = (ty - from.y) / t + 0.5 * G * t;
  const v = new THREE.Vector3((dx / d2) * speed, vy, (dz / d2) * speed);
  return { vel: v, spin: new THREE.Vector3(0, spinY, 0) };
}

/** Turn a horizontal velocity by a random angle (normal-ish, `sd` radians). */
export function wobble(v: THREE.Vector3, sd: number, sdUp = 0) {
  const a = gauss() * sd;
  const c = Math.cos(a), s = Math.sin(a);
  const x = v.x * c - v.z * s, z = v.x * s + v.z * c;
  v.x = x;
  v.z = z;
  if (sdUp) v.y += gauss() * sdUp;
  return v;
}

export function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
}

/**
 * Like loft(), but no faster than `top`: if the ball would need to be hit harder, it hangs longer
 * instead (a higher, gentler ball); only if even that's too fast does it fall short.
 */
export function loftCapped(from: THREE.Vector3, toX: number, toZ: number, t: number, top: number) {
  let v = loft(from, toX, toZ, t);
  for (let tt = t; v.length() > top && tt < 2.6; tt += 0.1) v = loft(from, toX, toZ, tt);
  if (v.length() > top) v.multiplyScalar(top / v.length());
  return v;
}

/**
 * Curl: a kick with side spin bends, so start it off to one side by just enough that it bends
 * back onto (toX, toZ). Works it out by flying the ball (same physics as the real one) and
 * correcting the angle (and, for a ball that should land there, the range) a few times. `curl` -1..1: + bends it to the kicker's left (an
 * inside-of-the-right-foot curler), - to the right.
 */
export function curled(from: THREE.Vector3, vel: THREE.Vector3, curl: number, toX: number, toZ: number, lands = false) {
  const spin = new THREE.Vector3(0, curl * 22, 0);
  if (Math.abs(curl) < 0.02) return { vel, spin };
  const v = vel.clone();
  const d = Math.hypot(toX - from.x, toZ - from.z);
  if (d < 1) return { vel, spin };
  const ux = (toX - from.x) / d, uz = (toZ - from.z) / d;
  const p = new THREE.Vector3(), w = new THREE.Vector3(), sp = new THREE.Vector3();
  const h = 1 / 120;
  // A lofted ball should land on the target (fix its range too); anything else just has to pass
  // through it (a shot crossing the goal line, a pass rolling to someone).
  const lofted = lands;
  for (let iter = 0; iter < 5; iter++) {
    p.copy(from);
    w.copy(v);
    sp.copy(spin);
    // Fly until it's as far along as the target (a lofted ball: until it lands), or it stops, then
    // see how far off to the side (and, lofted, how short or long) it is.
    let side = 0, along = 0;
    for (let t = 0; t < 4; t += h) {
      flight(p, w, sp, h);
      along = (p.x - from.x) * ux + (p.z - from.z) * uz;
      side = (p.x - from.x) * -uz + (p.z - from.z) * ux;
      if (lofted ? t > 0.1 && p.y <= R + 0.01 : along >= d) break;
      if (w.lengthSq() < 0.04 && p.y <= R + 0.01) break;
    }
    const err = Math.atan2(side, Math.max(1, along));
    const range = lofted ? d / Math.max(1, Math.hypot(along, side)) : 1;
    if (Math.abs(err) < 0.002 && Math.abs(range - 1) < 0.01) break;
    rotateY(v, -err);
    if (lofted) { const k = Math.max(0.85, Math.min(1.2, range)); v.x *= k; v.z *= k; }
  }
  return { vel: v, spin };
}

/** Turn a horizontal velocity by `a` radians (the same way as wobble()). */
function rotateY(v: THREE.Vector3, a: number) {
  const c = Math.cos(a), s = Math.sin(a);
  const x = v.x * c - v.z * s, z = v.x * s + v.z * c;
  v.x = x;
  v.z = z;
}

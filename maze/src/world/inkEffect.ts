// Hand-drawn ink: thin outlines found from the depth picture, wobbling like a pen line
// (and "boiling" a few times a second, like animated comics), plus a faint paper grain.
import * as THREE from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';

const frag = /* glsl */ `
uniform float uThickness;
uniform vec3 uInk;
uniform float uGrain;
uniform float uDebug;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
// Inverse distance is flat across a flat surface on screen, so its second derivative only lights up at edges.
float inv(vec2 uv) { return 1.0 / max(0.001, -getViewZ(readDepth(uv))); }

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float boil = floor(time * 4.0);
  vec2 px = uv * resolution;
  // Wobble where we look (snapped to whole pixels, so flat surfaces stay clean): lines aren't ruler-straight.
  vec2 w = vec2(vnoise(px / 37.0 + boil * 3.1), vnoise(px / 41.0 + 17.0 + boil * 1.7)) - 0.5;
  vec2 suv = (floor(px + w * 2.5) + 0.5) * texelSize;
  float t = max(1.0, floor(uThickness * resolution.y / 900.0 + 0.5));
  vec2 ox = vec2(texelSize.x * t, 0.0), oy = vec2(0.0, texelSize.y * t);
  float c = inv(suv);
  float l = inv(suv - ox), r = inv(suv + ox), d = inv(suv - oy), u = inv(suv + oy);
  // Second derivative of inverse depth: zero on flat surfaces, big at creases and silhouettes.
  float crease = (abs(l + r - 2.0 * c) + abs(u + d - 2.0 * c)) / c;
  // Pen pressure: some stretches of line are darker than others.
  float pressure = 0.65 + 0.35 * vnoise(px / 19.0 + 5.0);
  float edge = smoothstep(0.006, 0.02, crease) * pressure;
  vec3 col = mix(inputColor.rgb, uInk, edge * 0.92);
  if (uDebug > 0.5) { outputColor = vec4(vec3(crease * uDebug), 1.0); return; }
  // Paper: a faint, fixed grain.
  float g = vnoise(px / 1.6) * 0.6 + vnoise(px / 5.0) * 0.4;
  col *= 1.0 - uGrain + uGrain * 2.0 * g;
  outputColor = vec4(col, inputColor.a);
}
`;

export class InkEffect extends Effect {
  constructor({ thickness = 1, grain = 0.06 } = {}) {
    super('InkEffect', frag, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['uThickness', new THREE.Uniform(thickness)],
        ['uInk', new THREE.Uniform(new THREE.Color(0x0e0a08))],
        ['uGrain', new THREE.Uniform(grain)],
        ['uDebug', new THREE.Uniform(0)],
      ]),
    });
  }
}

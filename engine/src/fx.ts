import * as THREE from 'three';

/** Flat ring on the ground that fills clockwise with `progress` (0..1). */
export function makeProgressRing(inner: number, outer: number, color: THREE.ColorRepresentation) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uProgress: { value: 1 },
      uOpacity: { value: 1 },
      uInner: { value: inner / outer },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uProgress; uniform float uOpacity; uniform float uInner;
      varying vec2 vUv;
      void main() {
        float r = length(vUv);
        float aa = fwidth(r);
        float band = smoothstep(uInner - aa, uInner + aa, r) * (1.0 - smoothstep(1.0 - aa, 1.0 + aa, r));
        float ang = atan(-vUv.x, -vUv.y) / 6.2831853 + 0.5;
        float filled = step(ang, uProgress);
        float a = band * mix(0.22, 1.0, filled) * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * mix(0.6, 1.0, filled), a);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(outer * 2, outer * 2), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  return {
    mesh,
    set progress(v: number) { mat.uniforms.uProgress.value = v; },
    set opacity(v: number) { mat.uniforms.uOpacity.value = v; },
    set color(c: THREE.ColorRepresentation) { (mat.uniforms.uColor.value as THREE.Color).set(c); },
  };
}

/** Billboard sprite drawn from a canvas; redraw by calling `draw` again. */
export function makeCanvasSprite(width: number, height: number, worldHeight: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set((worldHeight * width) / height, worldHeight, 1);
  sprite.renderOrder = 10;
  return {
    sprite,
    draw(fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
      ctx.clearRect(0, 0, width, height);
      fn(ctx, width, height);
      tex.needsUpdate = true;
    },
  };
}

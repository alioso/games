import * as THREE from 'three';
import { rng } from '@engine/math';
import type { SkinDef } from '../data/blocs';

// Patterns painted all over a bloc's body: sponge holes, lava cracks, fluorite crystal bands.

function canvas(paint: (g: CanvasRenderingContext2D, s: number) => void, size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  paint(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const cache = new Map<string, Partial<THREE.MeshStandardMaterialParameters>>();

/** Extra material settings (texture maps, glow) for skins with a body pattern. */
export function bodyLook(skin: SkinDef): Partial<THREE.MeshStandardMaterialParameters> {
  if (!skin.body) return {};
  const hit = cache.get(skin.body);
  if (hit) return hit;
  const r = rng(7);
  let look: Partial<THREE.MeshStandardMaterialParameters> = {};
  switch (skin.body) {
    case 'sponge':
      look = {
        map: canvas((g, s) => {
          g.fillStyle = '#f4d93e';
          g.fillRect(0, 0, s, s);
          for (let i = 0; i < 40; i++) {
            const x = r.next() * s, y = r.next() * s, rad = 4 + r.next() * 14;
            g.fillStyle = '#c9a91f';
            g.beginPath();
            g.ellipse(x, y, rad, rad * (0.7 + r.next() * 0.4), r.next() * 3, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#9c7f12';
            g.beginPath();
            g.ellipse(x + 2, y + 2, rad * 0.6, rad * 0.5, 0, 0, Math.PI * 2);
            g.fill();
          }
        }),
      };
      break;
    case 'lava': {
      const cracks: [number, number][][] = [];
      for (let i = 0; i < 14; i++) {
        let x = r.next() * 256, y = r.next() * 256, a = r.next() * 6.28;
        const line: [number, number][] = [[x, y]];
        for (let k = 0; k < 7; k++) { a += r.range(-0.8, 0.8); x += Math.cos(a) * 16; y += Math.sin(a) * 16; line.push([x, y]); }
        cracks.push(line);
      }
      const draw = (g: CanvasRenderingContext2D, color: string, width: number) => {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.lineJoin = 'round';
        for (const line of cracks) {
          g.beginPath();
          line.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.stroke();
        }
      };
      look = {
        map: canvas((g, s) => {
          g.fillStyle = '#2b2220';
          g.fillRect(0, 0, s, s);
          for (let i = 0; i < 400; i++) { g.fillStyle = r.pick(['#3a2e2a', '#1d1716', '#45332b']); g.fillRect(r.next() * s, r.next() * s, 6, 6); }
          draw(g, '#ff8a2a', 4);
        }),
        emissiveMap: canvas((g, s) => {
          g.fillStyle = '#000';
          g.fillRect(0, 0, s, s);
          draw(g, '#ff6a1a', 7);
          draw(g, '#ffd27a', 2);
        }),
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 2.2,
      };
      break;
    }
    case 'fluorite':
      look = {
        // Purple and green bands, like the real crystal, with a soft inner glow.
        map: canvas((g, s) => {
          const grd = g.createLinearGradient(0, 0, s, s);
          grd.addColorStop(0, '#b38cff');
          grd.addColorStop(0.35, '#7d4dff');
          grd.addColorStop(0.5, '#6ee7c8');
          grd.addColorStop(0.65, '#7d4dff');
          grd.addColorStop(1, '#c9a8ff');
          g.fillStyle = grd;
          g.fillRect(0, 0, s, s);
          g.strokeStyle = 'rgba(255,255,255,0.35)';
          g.lineWidth = 3;
          for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(r.next() * s, 0); g.lineTo(r.next() * s, s); g.stroke(); }
        }),
        emissive: new THREE.Color(0x5b2be0),
        emissiveIntensity: 0.5,
      };
      break;
  }
  cache.set(skin.body, look);
  return look;
}

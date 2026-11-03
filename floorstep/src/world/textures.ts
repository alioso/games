// Hand-drawn-looking textures painted on canvases: floors, wallpaper, book spines, paintings.
import * as THREE from 'three';
import { rng } from '@engine/math';
import type { FloorStyle, WallStyle } from '../data/rooms';

const INK = '#1a1410';
const cache = new Map<string, THREE.CanvasTexture>();

function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

/** Floor texture covering 2×2 world units. */
export function floorTexture(f: FloorStyle) {
  return canvasTex(`floor:${f.kind}:${f.a}:${f.b}`, 512, 512, (g) => {
    const R = rng(7);
    g.fillStyle = f.a;
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = INK;
    if (f.kind === 'tiles') {
      const n = 4, s = 512 / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          g.fillStyle = (i + j) % 2 ? f.b : f.a;
          g.fillRect(i * s, j * s, s, s);
        }
      g.globalAlpha = 0.8;
      g.lineWidth = 4;
      for (let i = 0; i <= n; i++) {
        g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 512); g.stroke();
        g.beginPath(); g.moveTo(0, i * s); g.lineTo(512, i * s); g.stroke();
      }
      // Cracks and grime.
      g.lineWidth = 1.5;
      g.globalAlpha = 0.35;
      for (let k = 0; k < 6; k++) {
        let x = R.range(0, 512), y = R.range(0, 512);
        g.beginPath(); g.moveTo(x, y);
        for (let s2 = 0; s2 < 4; s2++) { x += R.range(-25, 25); y += R.range(-25, 25); g.lineTo(x, y); }
        g.stroke();
      }
    } else {
      // Planks: long boards, staggered joints, wood grain.
      const rows = f.kind === 'boards' ? 5 : 8, h = 512 / rows;
      for (let r = 0; r < rows; r++) {
        g.globalAlpha = 1;
        g.fillStyle = r % 2 ? f.b : f.a;
        g.fillRect(0, r * h, 512, h);
        g.globalAlpha = 0.18;
        g.strokeStyle = INK;
        g.lineWidth = 1.2;
        for (let k = 0; k < 4; k++) {
          const y = r * h + R.range(4, h - 4);
          g.beginPath(); g.moveTo(0, y);
          for (let x = 0; x <= 512; x += 64) g.lineTo(x, y + R.range(-2, 2));
          g.stroke();
        }
        g.globalAlpha = 0.85;
        g.lineWidth = 3;
        const off = R.range(0, 256);
        for (let x = off; x < 512 + 256; x += 256) {
          const xx = x % 512;
          g.beginPath(); g.moveTo(xx, r * h); g.lineTo(xx, r * h + h); g.stroke();
          // Nail heads.
          g.fillStyle = INK;
          g.beginPath(); g.arc(xx + 7, r * h + 6, 2, 0, 7); g.arc(xx + 7, r * h + h - 6, 2, 0, 7); g.fill();
        }
        g.beginPath(); g.moveTo(0, r * h); g.lineTo(512, r * h); g.stroke();
      }
      // Knots.
      g.globalAlpha = 0.4;
      for (let k = 0; k < 7; k++) {
        g.beginPath();
        g.ellipse(R.range(0, 512), R.range(0, 512), R.range(4, 9), R.range(2, 4), 0, 0, 7);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  });
}

/**
 * Wallpaper spanning the whole wall height (v 0..1 bottom to top), repeating every 1 unit along u.
 * Lower part is wood panelling with a dark skirting board.
 */
export function wallTexture(w: WallStyle) {
  return canvasTex(`wall:${w.paper}:${w.accent}:${w.pattern}:${w.panel}`, 256, 640, (g) => {
    const W = 256, H = 640;
    const panelTop = H * 0.62;
    g.fillStyle = w.paper;
    g.fillRect(0, 0, W, panelTop);
    g.fillStyle = w.accent;
    g.strokeStyle = w.accent;
    switch (w.pattern) {
      case 'stripes':
        for (let x = 0; x < W; x += 64) g.fillRect(x + 20, 0, 24, panelTop);
        break;
      case 'dots':
        for (let y = 20; y < panelTop; y += 48)
          for (let x = (y / 48) % 2 ? 32 : 0; x < W + 32; x += 64) { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
        break;
      case 'diamonds':
        for (let y = 0; y < panelTop + 40; y += 64)
          for (let x = 0; x < W + 64; x += 64) {
            g.beginPath(); g.moveTo(x, y - 26); g.lineTo(x + 18, y); g.lineTo(x, y + 26); g.lineTo(x - 18, y); g.closePath(); g.fill();
          }
        break;
      case 'fleur':
        g.lineWidth = 4;
        for (let y = 40; y < panelTop; y += 80)
          for (let x = (y / 80) % 2 ? 64 : 0; x < W + 64; x += 128) {
            g.beginPath(); g.arc(x, y, 14, Math.PI, 0); g.stroke();
            g.beginPath(); g.arc(x - 14, y + 10, 10, -Math.PI / 2, Math.PI / 2); g.stroke();
            g.beginPath(); g.arc(x + 14, y + 10, 10, Math.PI / 2, -Math.PI / 2); g.stroke();
            g.fillRect(x - 2, y - 24, 4, 50);
          }
        break;
      case 'tiles':
        g.strokeStyle = 'rgba(26,20,16,0.45)';
        g.lineWidth = 3;
        for (let y = 0; y < panelTop; y += 42) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
        for (let x = 0; x <= W; x += 42.67) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, panelTop); g.stroke(); }
        break;
      case 'bricks':
        g.strokeStyle = 'rgba(26,20,16,0.5)';
        g.lineWidth = 3;
        for (let y = 0, r = 0; y < panelTop; y += 32, r++) {
          g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
          for (let x = r % 2 ? 32 : 0; x <= W; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
        }
        break;
      case 'plain':
        break;
    }
    // Stains and peeling: it's a haunted house.
    const R = rng(w.paper.length * 13 + w.accent.charCodeAt(2));
    g.fillStyle = 'rgba(30,20,10,0.12)';
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.ellipse(R.range(0, W), R.range(0, panelTop), R.range(12, 30), R.range(20, 60), 0, 0, 7);
      g.fill();
    }
    // Panelling.
    g.fillStyle = w.panel;
    g.fillRect(0, panelTop, W, H - panelTop);
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, panelTop); g.lineTo(W, panelTop); g.stroke();
    g.lineWidth = 2.5;
    g.strokeStyle = 'rgba(26,20,16,0.7)';
    g.strokeRect(22, panelTop + 26, W / 2 - 44, H - panelTop - 80);
    g.strokeRect(W / 2 + 22, panelTop + 26, W / 2 - 44, H - panelTop - 80);
    g.beginPath(); g.moveTo(0, panelTop + 10); g.lineTo(W, panelTop + 10); g.stroke();
    // Skirting board.
    g.fillStyle = INK;
    g.fillRect(0, H - 26, W, 26);
  });
}

/** Rows of book spines for bookcase shelves. */
export function booksTexture(seed: number) {
  return canvasTex(`books:${seed % 4}`, 256, 64, (g) => {
    const R = rng(seed % 4 + 11);
    const colors = ['#7a2a2a', '#2a4f7a', '#3d6b35', '#8a6a2a', '#5a2a6a', '#2a2a2a', '#9a4a2a', '#c8b48a'];
    let x = 0;
    while (x < 256) {
      const w = R.range(10, 22), h = R.range(40, 64);
      g.fillStyle = R.pick(colors);
      g.fillRect(x, 64 - h, w, h);
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.strokeRect(x, 64 - h, w, h);
      g.fillStyle = 'rgba(240,220,160,0.7)';
      g.fillRect(x + 3, 64 - h + 8, w - 6, 3);
      x += w + (R.next() < 0.1 ? 14 : 0);
    }
  }, false);
}

/** Small creepy portraits and landscapes for paintings. */
export function paintingTexture(seed: number) {
  const n = seed % 4;
  return canvasTex(`paint:${n}`, 128, 100, (g) => {
    const bg = ['#3b4a3a', '#4a3a2a', '#2a3448', '#5a4a3a'][n];
    g.fillStyle = bg;
    g.fillRect(0, 0, 128, 100);
    g.strokeStyle = INK;
    g.lineWidth = 3;
    if (n === 2) {
      // Moonlit hills.
      g.fillStyle = '#e8e0b0';
      g.beginPath(); g.arc(92, 28, 12, 0, 7); g.fill();
      g.fillStyle = '#1e2636';
      g.beginPath(); g.moveTo(0, 100); g.quadraticCurveTo(40, 40, 80, 80); g.quadraticCurveTo(104, 60, 128, 72); g.lineTo(128, 100); g.fill();
    } else {
      // A portrait of some long-nosed ancestor whose eyes follow you.
      const skin = ['#a8c070', '#c09070', '#d0c0a0', '#9a8acb'][n];
      g.fillStyle = '#2a1e18';
      g.fillRect(34, 62, 60, 40);
      g.fillStyle = skin;
      g.beginPath(); g.ellipse(64, 46, 22, 26, 0, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(64 + (n === 1 ? 20 : 14), 54, 16, 7, 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(56, 38, 6, 0, 7); g.arc(72, 38, 6, 0, 7); g.fill();
      // (The pupils are added in 3D, so they can follow you around the room.)
    }
  }, false);
}

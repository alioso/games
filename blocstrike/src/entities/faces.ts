import * as THREE from 'three';
import type { SkinId } from '../data/blocs';

// Faces are drawn on a 128×128 canvas and stuck on the front of each bloc.
// Each one copies the bloc shop sketch.

type Painter = (g: CanvasRenderingContext2D) => void;

function texture(paint: Painter) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = g.fillStyle = '#111';
  paint(g);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const teeth = (g: CanvasRenderingContext2D, x: number, y: number, w: number, n: number, h: number) => {
  g.fillStyle = '#fff';
  g.beginPath();
  const step = w / n;
  for (let i = 0; i < n; i++) {
    g.moveTo(x + i * step, y);
    g.lineTo(x + i * step + step / 2, y + h);
    g.lineTo(x + (i + 1) * step, y);
  }
  g.fill();
};

const beginner: Painter = (g) => {
  for (const x of [26, 74]) {
    g.fillStyle = '#fff';
    g.fillRect(x, 26, 28, 28);
    g.lineWidth = 5;
    g.strokeRect(x, 26, 28, 28);
    g.fillStyle = '#111';
    g.fillRect(x + 11, 34, 12, 14);
  }
  g.fillStyle = '#111';
  g.fillRect(34, 72, 60, 30);
  teeth(g, 38, 72, 52, 3, 16);
};

const noob: Painter = (g) => {
  g.lineWidth = 6;
  for (const x of [42, 82]) {
    g.beginPath();
    g.moveTo(x - 4, 32); g.lineTo(x - 4, 54);
    g.moveTo(x + 6, 32); g.lineTo(x + 6, 54);
    g.stroke();
  }
  g.lineWidth = 7;
  g.beginPath();
  g.arc(64, 108, 26, Math.PI * 1.2, Math.PI * 1.8);
  g.stroke();
};

const bronze: Painter = (g) => {
  g.lineWidth = 5;
  g.fillStyle = '#fff';
  for (const [x, flip] of [[24, 1], [70, -1]] as const) {
    g.beginPath();
    g.moveTo(x, 44 + 6 * flip); g.lineTo(x + 34, 44 - 6 * flip); g.lineTo(x + 34, 54 - 6 * flip); g.lineTo(x, 54 + 6 * flip);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.fillStyle = '#111';
  g.fillRect(30, 76, 68, 26);
  teeth(g, 32, 76, 64, 4, 20);
};

const silver: Painter = (g) => {
  g.lineWidth = 7;
  for (const x of [42, 86]) {
    g.beginPath();
    g.arc(x, 50, 13, Math.PI, 0);
    g.stroke();
  }
  g.fillStyle = '#111';
  g.beginPath();
  g.roundRect(28, 72, 72, 32, 8);
  g.fill();
  teeth(g, 32, 72, 64, 5, 14);
  g.save();
  g.translate(0, 104);
  g.scale(1, -1);
  teeth(g, 32, 0, 64, 5, 12);
  g.restore();
};

const pro: Painter = (g) => {
  g.fillStyle = '#111';
  g.beginPath();
  g.roundRect(18, 30, 92, 30, 14);
  g.fill();
  g.fillStyle = '#5ff';
  g.fillRect(28, 38, 26, 8);
  g.fillRect(74, 38, 26, 8);
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(40, 88);
  g.quadraticCurveTo(64, 102, 90, 84);
  g.stroke();
};

const gold: Painter = (g) => {
  const star = (cx: number, cy: number, r: number) => {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const rr = i % 2 ? r * 0.3 : r;
      g.lineTo(cx + Math.sin(a) * rr, cy - Math.cos(a) * rr);
    }
    g.closePath();
    g.fill();
  };
  g.fillStyle = '#fff';
  star(42, 44, 20);
  star(86, 44, 20);
  g.fillStyle = '#111';
  star(42, 44, 9);
  star(86, 44, 9);
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 74, 26, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  g.fillStyle = '#ff5c8a';
  g.beginPath();
  g.ellipse(72, 102, 10, 12, 0, 0, Math.PI * 2);
  g.fill();
};

const rainbow: Painter = (g) => {
  g.lineWidth = 7;
  for (const x of [26, 72]) {
    g.beginPath();
    g.moveTo(x, 52); g.lineTo(x + 8, 34); g.lineTo(x + 16, 50); g.lineTo(x + 24, 34); g.lineTo(x + 30, 52);
    g.stroke();
  }
  g.fillStyle = '#111';
  g.fillRect(30, 72, 68, 28);
  teeth(g, 32, 72, 64, 6, 12);
};

const copper: Painter = (g) => {
  for (const x of [42, 86]) {
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(x, 44, 15, 0, Math.PI * 2); g.fill();
    g.lineWidth = 4; g.stroke();
    g.fillStyle = '#111';
    g.beginPath(); g.arc(x + 3, 46, 7, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#111';
  g.beginPath();
  g.moveTo(30, 76); g.quadraticCurveTo(64, 116, 98, 76); g.closePath();
  g.fill();
  g.fillStyle = '#fff';
  g.fillRect(40, 77, 48, 8);
};

const iron: Painter = (g) => {
  // Rivets in the corners.
  g.fillStyle = '#3a3f44';
  for (const [x, y] of [[12, 12], [116, 12], [12, 116], [116, 116]]) { g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#111';
  g.fillRect(24, 38, 30, 12);
  g.fillRect(74, 38, 30, 12);
  g.fillStyle = '#ff4a2a';
  g.fillRect(34, 41, 10, 6);
  g.fillRect(84, 41, 10, 6);
  g.fillStyle = '#111';
  g.fillRect(34, 80, 60, 10);
  g.fillStyle = '#9aa1a8';
  for (const x of [44, 64, 84]) { g.beginPath(); g.arc(x, 85, 3, 0, Math.PI * 2); g.fill(); }
};

const chocolate: Painter = (g) => {
  g.lineWidth = 7;
  g.strokeStyle = '#fff3e0';
  for (const x of [42, 86]) {
    g.beginPath();
    g.moveTo(x - 13, 50); g.lineTo(x, 38); g.lineTo(x + 13, 50);
    g.stroke();
  }
  g.fillStyle = '#2a140a';
  g.beginPath(); g.arc(64, 74, 24, 0.1 * Math.PI, 0.9 * Math.PI); g.closePath(); g.fill();
  g.fillStyle = '#ff7a9a';
  g.beginPath(); g.ellipse(64, 92, 10, 7, 0, 0, Math.PI * 2); g.fill();
};

const dead: Painter = (g) => {
  g.lineWidth = 9;
  for (const x of [40, 88]) {
    g.beginPath();
    g.moveTo(x - 13, 30); g.lineTo(x + 13, 56);
    g.moveTo(x + 13, 30); g.lineTo(x - 13, 56);
    g.stroke();
  }
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(34, 92);
  for (let i = 0; i <= 6; i++) g.lineTo(34 + i * 10, i % 2 ? 84 : 96);
  g.stroke();
};

const PAINTERS: Record<SkinId | 'dead', Painter> = { beginner, noob, bronze, copper, iron, silver, pro, chocolate, gold, rainbow, dead };

const cache = new Map<string, THREE.CanvasTexture>();

export function faceTexture(id: SkinId | 'dead') {
  if (!cache.has(id)) cache.set(id, texture(PAINTERS[id]));
  return cache.get(id)!;
}

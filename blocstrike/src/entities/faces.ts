import * as THREE from 'three';

// Faces are drawn on a 128×128 canvas and stuck on the front of each bloc.
// The beginner face copies the sketch: square eyes and a "W" of teeth.

type Painter = (g: CanvasRenderingContext2D) => void;

function texture(paint: Painter) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  paint(g);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const beginner: Painter = (g) => {
  for (const x of [26, 74]) {
    g.fillStyle = '#fff';
    g.fillRect(x, 26, 28, 28);
    g.lineWidth = 5;
    g.strokeStyle = '#111';
    g.strokeRect(x, 26, 28, 28);
    g.fillStyle = '#111';
    g.fillRect(x + 11, 34, 12, 14);
  }
  g.fillStyle = '#111';
  g.fillRect(34, 72, 60, 30);
  g.fillStyle = '#fff';
  g.beginPath();
  for (const x of [38, 58, 78]) {
    g.moveTo(x, 72);
    g.lineTo(x + 8, 88);
    g.lineTo(x + 16, 72);
  }
  g.fill();
};

const dead: Painter = (g) => {
  g.strokeStyle = '#111';
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

const robot: Painter = (g) => {
  g.fillStyle = '#101820';
  g.beginPath();
  g.roundRect(8, 14, 112, 92, 16);
  g.fill();
  g.fillStyle = '#fff';
  g.fillRect(26, 36, 24, 18);
  g.fillRect(78, 36, 24, 18);
  g.fillRect(36, 74, 56, 8);
};

const cache = new Map<string, THREE.CanvasTexture>();
const get = (k: string, p: Painter) => {
  if (!cache.has(k)) cache.set(k, texture(p));
  return cache.get(k)!;
};

export const FACES = {
  beginner: () => get('beginner', beginner),
  dead: () => get('dead', dead),
  robot: () => get('robot', robot),
};

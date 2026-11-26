// Battle with Ideas: canvas-painted tileable textures for the paper island and painted worlds.

import * as THREE from 'three';
import { mulberry32 } from '../shared/rng.js';

function tnoise(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (a, b) => { a = ((a % p) + p) % p; b = ((b % p) + p) % p; let k = (a * 374761393 + b * 668265263 + s * 2246822519) >>> 0; k = Math.imul(k ^ (k >>> 13), 1274126177); return ((k ^ (k >>> 16)) >>> 0) / 4294967296; };
  const A = h(xi, yi), B = h(xi + 1, yi), C = h(xi, yi + 1), D = h(xi + 1, yi + 1);
  return A + (B - A) * u + (C - A) * v + (A - B - C + D) * u * v;
}

function tfbm(x, y, p, s, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += tnoise(x * f, y * f, p * f, s + i * 31) * a; f *= 2; a *= 0.5; }
  return v / 0.9375;
}

function canvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return c; }
function rgb(hex) { const c = new THREE.Color(hex); return [c.r * 255, c.g * 255, c.b * 255]; }

function finish(cv, repeatMeters = 8) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.repeat.set(1 / repeatMeters, 1 / repeatMeters);
  t.needsUpdate = true;
  return t;
}

function pixels(n, fn) {
  const cv = canvas(n), g = cv.getContext('2d'), img = g.createImageData(n, n), d = img.data;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = fn(x / n, y / n);
    const i = (y * n + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function paperTexture() {
  const n = 512;
  const cv = pixels(n, (u, v) => {
    const f = tfbm(u * 16, v * 16, 16, 3, 3);
    const fib = tnoise(u * 180, v * 30, 180, 9);
    const k = 246 - f * 10 - fib * 5;
    return [k, k - 1, k - 5];
  });
  const g = cv.getContext('2d');
  g.strokeStyle = 'rgba(120,150,190,0.16)';
  g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(n, i * 64); g.stroke();
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, n); g.stroke();
  }
  return finish(cv, 8);
}

export function concreteTexture(tint = '#c9c8c3') {
  const base = rgb(tint);
  const cv = pixels(256, (u, v) => {
    const f = tfbm(u * 8, v * 8, 8, 5, 4), s = tnoise(u * 90, v * 90, 90, 2);
    const k = 0.88 + f * 0.18 - (s > 0.93 ? 0.12 : 0);
    return [base[0] * k, base[1] * k, base[2] * k];
  });
  return finish(cv, 3);
}

export function cardboardTexture(tint = '#d9d4c8') {
  const base = rgb(tint);
  const cv = pixels(256, (u, v) => {
    const f = tfbm(u * 6, v * 20, 6, 8, 4);
    const k = 0.82 + f * 0.24;
    return [base[0] * k, base[1] * k, base[2] * k];
  });
  return finish(cv, 6);
}

export function patternTexture(pattern, c1, c2, seed = 1) {
  const a = rgb(c1), b = rgb(c2);
  const r = mulberry32(seed);
  let cv;
  switch (pattern) {
    case 'stripes': cv = pixels(256, (u, v) => { const t = ((u + v) * 6) % 1; return t < 0.5 ? a : b; }); break;
    case 'checker': cv = pixels(256, (u, v) => ((Math.floor(u * 8) + Math.floor(v * 8)) % 2 ? a : b)); break;
    case 'waves': cv = pixels(256, (u, v) => { const t = 0.5 + 0.5 * Math.sin((v + Math.sin(u * Math.PI * 4) * 0.06) * Math.PI * 12); return mix(a, b, t); }); break;
    case 'swirl': cv = pixels(256, (u, v) => { const f = tfbm(u * 4, v * 4, 4, seed, 3); const t = 0.5 + 0.5 * Math.sin((u * 3 + f * 3) * Math.PI * 2); return mix(a, b, t); }); break;
    case 'marble': cv = pixels(256, (u, v) => { const f = tfbm(u * 5, v * 5, 5, seed, 5); const t = Math.pow(Math.abs(Math.sin((u + f * 1.6) * Math.PI * 6)), 0.35); return mix(b, a, t); }); break;
    case 'dots': cv = pixels(256, (u, v) => { const x = (u * 8) % 1 - 0.5, y = (v * 8) % 1 - 0.5; return x * x + y * y < 0.07 ? b : a; }); break;
    case 'hex': cv = pixels(256, (u, v) => { const x = u * 8, y = v * 8 * 1.1547; const q = Math.abs(((x + (Math.floor(y) % 2) * 0.5) % 1) - 0.5), w = Math.abs((y % 1) - 0.5); return q > 0.44 || w > 0.44 ? b : a; }); break;
    case 'tiles': cv = pixels(256, (u, v) => { const x = (u * 6) % 1, y = (v * 6) % 1; const f = tnoise(Math.floor(u * 6), Math.floor(v * 6), 6, seed); return x < 0.06 || y < 0.06 ? b : mix(a, b, f * 0.25); }); break;
    case 'cracks': {
      cv = pixels(256, (u, v) => { const f = tfbm(u * 4, v * 4, 4, seed, 4); return mix(a, mix(a, [0, 0, 0], 0.25), f); });
      const g = cv.getContext('2d');
      g.strokeStyle = c2; g.lineWidth = 3; g.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        let x = r() * 256, y = r() * 256, ang = r() * Math.PI * 2;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 9; k++) { ang += (r() - 0.5) * 1.2; x += Math.cos(ang) * 14; y += Math.sin(ang) * 14; g.lineTo(x, y); }
        g.stroke();
      }
      break;
    }
    case 'spots': {
      cv = pixels(256, (u, v) => mix(a, b, tfbm(u * 6, v * 6, 6, seed, 2) * 0.15));
      const g = cv.getContext('2d');
      g.fillStyle = c2;
      for (let i = 0; i < 40; i++) {
        const x = r() * 256, y = r() * 256, rr = 6 + r() * 18;
        for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.beginPath(); g.arc(x + dx, y + dy, rr, 0, Math.PI * 2); g.fill(); }
      }
      break;
    }
    case 'grass': {
      cv = pixels(256, (u, v) => mix(a, b, tfbm(u * 5, v * 5, 5, seed, 3) * 0.6));
      const g = cv.getContext('2d');
      g.lineWidth = 2;
      for (let i = 0; i < 900; i++) {
        const x = r() * 256, y = r() * 256, l = 4 + r() * 7, ang = -Math.PI / 2 + (r() - 0.5) * 0.9;
        const c = mix(a, b, r());
        g.strokeStyle = `rgb(${c[0] * 0.9 | 0},${c[1] * 0.95 | 0},${c[2] * 0.9 | 0})`;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); g.stroke();
      }
      break;
    }
    default: cv = pixels(256, (u, v) => mix(a, b, tfbm(u * 5, v * 5, 5, seed, 4)));
  }
  return finish(cv, 7);
}

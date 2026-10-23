import type { V2 } from './math';

/** Grid path-finding over a rectangle of ground (A*, 8 directions, with path smoothing). */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly blocked: Uint8Array;
  private g: Float32Array;
  private f: Float32Array;
  private parent: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private run = 0;

  constructor(
    readonly minX: number,
    readonly minZ: number,
    width: number,
    depth: number,
    readonly cell: number,
  ) {
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(depth / cell);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }

  /** Mark every cell whose centre satisfies `isBlocked`. */
  mark(isBlocked: (x: number, z: number) => boolean) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const [x, z] = this.center(c, r);
        if (isBlocked(x, z)) this.blocked[r * this.cols + c] = 1;
      }
    }
  }

  center(c: number, r: number): [number, number] {
    return [this.minX + (c + 0.5) * this.cell, this.minZ + (r + 0.5) * this.cell];
  }

  cellOf(x: number, z: number): [number, number] {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cell)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / this.cell)));
    return [c, r];
  }

  isBlocked(x: number, z: number) {
    const [c, r] = this.cellOf(x, z);
    return this.blocked[r * this.cols + c] === 1;
  }

  /** Nearest free cell centre to (x, z), searching outward in rings. */
  nearestFree(x: number, z: number): V2 {
    const [c0, r0] = this.cellOf(x, z);
    for (let rad = 0; rad < Math.max(this.cols, this.rows); rad++) {
      let best: V2 | null = null;
      let bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const c = c0 + dc, r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          if (this.blocked[r * this.cols + c]) continue;
          const [cx, cz] = this.center(c, r);
          const d = (cx - x) ** 2 + (cz - z) ** 2;
          if (d < bestD) { bestD = d; best = { x: cx, z: cz }; }
        }
      }
      if (best) return best;
    }
    return { x, z };
  }

  /** Straight walk between two points without touching a blocked cell. */
  lineFree(ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / (this.cell * 0.5));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.isBlocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  findPath(sx: number, sz: number, tx: number, tz: number): V2[] | null {
    if (this.isBlocked(tx, tz)) ({ x: tx, z: tz } = this.nearestFree(tx, tz));
    if (this.lineFree(sx, sz, tx, tz)) return [{ x: tx, z: tz }];
    let start = this.cellOf(sx, sz);
    if (this.blocked[start[1] * this.cols + start[0]]) {
      const f = this.nearestFree(sx, sz);
      start = this.cellOf(f.x, f.z);
    }
    const [gc, gr] = this.cellOf(tx, tz);
    const goal = gr * this.cols + gc;
    const s = start[1] * this.cols + start[0];
    const run = ++this.run;
    const heap = new MinHeap(this.f);
    const h = (i: number) => {
      const dx = Math.abs((i % this.cols) - gc), dz = Math.abs(Math.floor(i / this.cols) - gr);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    this.stamp[s] = run;
    this.g[s] = 0;
    this.f[s] = h(s);
    this.parent[s] = -1;
    heap.push(s);
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (this.closed[cur] === run) continue;
      this.closed[cur] = run;
      const cc = cur % this.cols, cr = Math.floor(cur / this.cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = cc + dc, nr = cr + dr;
          if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
          const n = nr * this.cols + nc;
          if (this.blocked[n]) continue;
          // No corner cutting past blocked cells.
          if (dr && dc && (this.blocked[cr * this.cols + nc] || this.blocked[nr * this.cols + cc])) continue;
          const g = this.g[cur] + (dr && dc ? 1.414 : 1);
          if (this.stamp[n] === run && g >= this.g[n]) continue;
          this.stamp[n] = run;
          this.g[n] = g;
          this.f[n] = g + h(n);
          this.parent[n] = cur;
          heap.push(n);
        }
      }
    }
    if (this.stamp[goal] !== run) return null;
    const cells: V2[] = [];
    for (let i = goal; i !== -1; i = this.parent[i]) {
      const [x, z] = this.center(i % this.cols, Math.floor(i / this.cols));
      cells.push({ x, z });
    }
    cells.reverse();
    cells[cells.length - 1] = { x: tx, z: tz };
    // String-pull: skip waypoints we can see past.
    const out: V2[] = [];
    let from = { x: sx, z: sz };
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.lineFree(from.x, from.z, cells[j].x, cells[j].z)) j--;
      out.push(cells[j]);
      from = cells[j];
      i = j + 1;
    }
    return out;
  }
}

class MinHeap {
  private items: number[] = [];
  constructor(private key: Float32Array) {}
  get size() {
    return this.items.length;
  }
  push(v: number) {
    const a = this.items;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.key[a[p]] <= this.key[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.key[a[l]] < this.key[a[m]]) m = l;
        if (r < a.length && this.key[a[r]] < this.key[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

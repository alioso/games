// Fixed-step simulation with a render callback every animation frame.

export class GameLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  readonly step: number;

  constructor(
    private update: (dt: number) => void,
    private render: (frameDt: number) => void,
    hz = 60,
  ) {
    this.step = 1 / hz;
  }

  start() {
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      // Clamp long gaps (tab switch, breakpoint) so the sim doesn't fast-forward.
      const frameDt = Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.acc += frameDt;
      while (this.acc >= this.step) {
        this.update(this.step);
        this.acc -= this.step;
      }
      this.render(frameDt);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }
}

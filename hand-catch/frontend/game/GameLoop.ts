/**
 * GameLoop.ts - Frame-Rate Independent Fixed-Timestep Loop
 * Uses an accumulator pattern with clamped delta-time to prevent spiral-of-death.
 */

export class GameLoop {
  private isRunning: boolean = false;
  private lastTime: number = performance.now();
  private accumulator: number = 0;
  private readonly fixedStep: number = 1 / 100; // 100 Hz simulation step
  private readonly maxFrameTime: number = 0.1; // 100 ms max clamp
  private rafId: number | null = null;

  private onUpdate: (dt: number) => void;
  private onRender: (alpha: number) => void;

  constructor(onUpdate: (dt: number) => void, onRender: (alpha: number) => void) {
    this.onUpdate = onUpdate;
    this.onRender = onRender;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;

    const tick = (now: number) => {
      if (!this.isRunning) return;

      const dt = Math.min((now - this.lastTime) / 1000, this.maxFrameTime);
      this.lastTime = now;

      this.accumulator += dt;
      while (this.accumulator >= this.fixedStep) {
        this.onUpdate(this.fixedStep);
        this.accumulator -= this.fixedStep;
      }

      const alpha = this.accumulator / this.fixedStep;
      this.onRender(alpha);

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

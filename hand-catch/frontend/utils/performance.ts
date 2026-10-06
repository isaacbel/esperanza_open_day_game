/**
 * performance.ts - Adaptive Performance Monitor
 * Continuously monitors FPS & frame times; automatically throttles visual effects
 * (particles, motion trails, glow sprites) if FPS falls below 50 FPS for sustained frames.
 */

export class PerformanceMonitor {
  private frameCount: number = 0;
  private lastTime: number = performance.now();
  private fps: number = 60;
  private lowFpsCounter: number = 0;
  private highFpsCounter: number = 0;
  public lowQualityMode: boolean = false;

  public update(): void {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastTime;

    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastTime = now;

      // Throttle if below 48 FPS for 2 consecutive seconds
      if (this.fps < 48) {
        this.lowFpsCounter++;
        this.highFpsCounter = 0;
        if (this.lowFpsCounter >= 2) {
          this.lowQualityMode = true;
        }
      } else if (this.fps >= 55) {
        this.highFpsCounter++;
        this.lowFpsCounter = 0;
        if (this.highFpsCounter >= 4) {
          this.lowQualityMode = false;
        }
      }
    }
  }

  public getFps(): number {
    return this.fps;
  }
}

/**
 * HandSmoothing.ts - Low-latency One-Euro Filter & Multi-Dimensional Smoothing
 *
 * Eliminates high-frequency sensor jitter during slow hand movements while preserving
 * crisp, instantaneous reaction to fast sweeps without perceptible lag.
 *
 * Reference: Casiez, G., Roussel, N. and Vogel, D. (2012). 1€ Filter.
 */

export class OneEuroFilter {
  public minCutoff: number;
  public beta: number;
  public dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev: number = 0;
  private tPrev: number | null = null;

  constructor(minCutoff: number = 1.0, beta: number = 0.035, dCutoff: number = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  public setParameters(minCutoff: number, beta: number, dCutoff: number): void {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  public filter(val: number, timestamp: number): number {
    if (this.tPrev === null) {
      this.xPrev = val;
      this.dxPrev = 0;
      this.tPrev = timestamp;
      return val;
    }

    const dt = Math.max(0.001, (timestamp - this.tPrev) / 1000);
    this.tPrev = timestamp;

    // Estimate derivative
    const dx = (val - (this.xPrev ?? val)) / dt;
    const edx = this.exponentialSmoothing(dx, this.dxPrev, this.alpha(dt, this.dCutoff));
    this.dxPrev = edx;

    // Adaptive cutoff based on instantaneous velocity
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const xFiltered = this.exponentialSmoothing(val, this.xPrev ?? val, this.alpha(dt, cutoff));
    this.xPrev = xFiltered;

    return xFiltered;
  }

  private alpha(dt: number, cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * Math.max(0.0001, cutoff));
    return 1.0 / (1.0 + tau / dt);
  }

  private exponentialSmoothing(val: number, prev: number, a: number): number {
    return a * val + (1 - a) * prev;
  }

  public reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

/**
 * Convenience filter for 2D points (X and Y coordinates) with individual 1€ filters.
 */
export class OneEuroPointFilter {
  public filterX: OneEuroFilter;
  public filterY: OneEuroFilter;

  constructor(minCutoff: number = 1.0, beta: number = 0.035, dCutoff: number = 1.0) {
    this.filterX = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.filterY = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  public filter(x: number, y: number, timestamp: number): { x: number; y: number } {
    return {
      x: this.filterX.filter(x, timestamp),
      y: this.filterY.filter(y, timestamp)
    };
  }

  public reset(): void {
    this.filterX.reset();
    this.filterY.reset();
  }
}

/**
 * CoordinateMapper.ts - Precise Video-to-Canvas-to-Game Coordinate Pipeline
 * Ensures 1:1 synchronization between real hands, background webcam feed,
 * and virtual game space across arbitrary resolutions and aspect ratios.
 */
import { Point2D, ViewportTransform } from './HandTypes';
import { GAME_CONFIG } from '../game/GameConfig';

export class CoordinateMapper {
  private transform: ViewportTransform = {
    canvasWidth: 1280,
    canvasHeight: 720,
    gameScale: 1.0,
    gameOriginX: 0,
    gameOriginY: 0,
    videoFitScale: 1.0,
    videoOffsetX: 0,
    videoOffsetY: 0
  };

  public updateViewport(
    canvasWidth: number,
    canvasHeight: number,
    videoWidth: number = 1280,
    videoHeight: number = 720
  ): void {
    this.transform.canvasWidth = canvasWidth;
    this.transform.canvasHeight = canvasHeight;

    // 1. Uniform game scaling with centering inside canvas (pillarbox / letterbox)
    this.transform.gameScale = Math.min(
      canvasWidth / GAME_CONFIG.logicalWidth,
      canvasHeight / GAME_CONFIG.logicalHeight
    );
    this.transform.gameOriginX = (canvasWidth - GAME_CONFIG.logicalWidth * this.transform.gameScale) / 2;
    this.transform.gameOriginY = (canvasHeight - GAME_CONFIG.logicalHeight * this.transform.gameScale) / 2;

    // 2. Cover-fit calculation for background video feed (matches background fill)
    if (videoWidth > 0 && videoHeight > 0) {
      this.transform.videoFitScale = Math.max(
        canvasWidth / videoWidth,
        canvasHeight / videoHeight
      );
      this.transform.videoOffsetX = (canvasWidth - videoWidth * this.transform.videoFitScale) / 2;
      this.transform.videoOffsetY = (canvasHeight - videoHeight * this.transform.videoFitScale) / 2;
    }
  }

  public getTransform(): ViewportTransform {
    return this.transform;
  }

  /**
   * Maps MediaPipe normalized landmark [0, 1] in unmirrored video space into Game Space (1280x720)
   */
  public landmarkToGame(
    lm: { x: number; y: number },
    videoWidth: number,
    videoHeight: number
  ): Point2D {
    // 1. Mirror horizontally: xm = 1 - x
    const xm = 1.0 - lm.x;

    // 2. Video to Canvas via Cover-Fit
    const canvasX = xm * videoWidth * this.transform.videoFitScale + this.transform.videoOffsetX;
    const canvasY = lm.y * videoHeight * this.transform.videoFitScale + this.transform.videoOffsetY;

    // 3. Canvas to Game logical space
    const gameX = (canvasX - this.transform.gameOriginX) / this.transform.gameScale;
    const gameY = (canvasY - this.transform.gameOriginY) / this.transform.gameScale;

    return { x: gameX, y: gameY };
  }

  /**
   * Inverse mapping: converts Game logical space coordinate back to unmirrored video landmark [0, 1].
   * Useful for testing, projection validation, and synthetic trajectories.
   */
  public gameToNormalizedLandmark(
    gamePoint: Point2D,
    videoWidth: number,
    videoHeight: number
  ): Point2D {
    const canvasX = gamePoint.x * this.transform.gameScale + this.transform.gameOriginX;
    const canvasY = gamePoint.y * this.transform.gameScale + this.transform.gameOriginY;

    const xm = (canvasX - this.transform.videoOffsetX) / (videoWidth * this.transform.videoFitScale);
    const ym = (canvasY - this.transform.videoOffsetY) / (videoHeight * this.transform.videoFitScale);

    return {
      x: 1.0 - xm,
      y: ym
    };
  }

  public canvasToGame(canvasX: number, canvasY: number): Point2D {
    return {
      x: (canvasX - this.transform.gameOriginX) / this.transform.gameScale,
      y: (canvasY - this.transform.gameOriginY) / this.transform.gameScale
    };
  }

  public gameToCanvas(gameX: number, gameY: number): Point2D {
    return {
      x: gameX * this.transform.gameScale + this.transform.gameOriginX,
      y: gameY * this.transform.gameScale + this.transform.gameOriginY
    };
  }
}

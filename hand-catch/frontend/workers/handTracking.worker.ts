/**
 * handTracking.worker.ts - Web Worker for off-main-thread HandLandmarker inference
 * Transfers ImageBitmap / VideoFrame and returns normalized landmarks.
 */

// Worker message types
export interface WorkerInitMessage {
  type: 'INIT';
  wasmUrl: string;
  modelAssetPath: string;
  delegate: 'GPU' | 'CPU';
}

export interface WorkerDetectMessage {
  type: 'DETECT';
  bitmap: ImageBitmap;
  timestamp: number;
}

export interface WorkerResultMessage {
  type: 'RESULT';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  results: any;
  timestamp: number;
  inferenceMs: number;
}

export interface WorkerErrorMessage {
  type: 'ERROR';
  message: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handLandmarker: any = null;

self.onmessage = async (e: MessageEvent<WorkerInitMessage | WorkerDetectMessage>) => {
  const data = e.data;

  if (data.type === 'INIT') {
    try {
      // Import vision inside worker
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(data.wasmUrl);

      handLandmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: data.modelAssetPath,
          delegate: data.delegate
        },
        runningMode: 'IMAGE', // Workers process single transferred ImageBitmaps
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55
      });

      self.postMessage({ type: 'INIT_DONE' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'ERROR', message: msg });
    }
  } else if (data.type === 'DETECT') {
    if (!handLandmarker) return;

    const start = performance.now();
    try {
      const results = handLandmarker.detect(data.bitmap);
      const inferenceMs = Math.round(performance.now() - start);

      // Close the transferred ImageBitmap to free GPU memory
      data.bitmap.close();

      self.postMessage({
        type: 'RESULT',
        results,
        timestamp: data.timestamp,
        inferenceMs
      });
    } catch (err: unknown) {
      data.bitmap.close();
      const msg = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'ERROR', message: msg });
    }
  }
};

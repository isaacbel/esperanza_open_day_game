/**
 * device.ts - Display pixel ratio, viewport detection, secure context validation
 */

export function getSafeDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  // Cap at 2 to avoid rendering bottlenecks on ultra-high-density displays
  return Math.min(window.devicePixelRatio || 1, 2);
}

export function isSecureContext(): boolean {
  if (typeof window === 'undefined') return true;
  return window.isSecureContext && window.location.protocol !== 'file:';
}

export function requestFullscreen(element: HTMLElement = document.documentElement): Promise<void> {
  if (!document.fullscreenElement) {
    return element.requestFullscreen().catch(() => {});
  } else {
    return document.exitFullscreen().catch(() => {});
  }
}

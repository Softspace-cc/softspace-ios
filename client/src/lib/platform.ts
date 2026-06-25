export function isDesktopApp() {
  return typeof window !== 'undefined' && typeof window.electron !== 'undefined';
}

export function isCapacitorApp() {
  if (typeof window === 'undefined') return false;
  return (
    typeof (window as any).Capacitor !== 'undefined' ||
    window.location.protocol === 'capacitor:' ||
    (window.location.hostname === 'localhost' && /android|iphone|ipad|ipod/i.test(navigator.userAgent))
  );
}

export function getClientPlatform(): 'desktop' | 'mobile' | 'web' {
  if (isDesktopApp()) return 'desktop';
  if (
    isCapacitorApp() ||
    (typeof window !== 'undefined' &&
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent))
  ) {
    return 'mobile';
  }
  return 'web';
}

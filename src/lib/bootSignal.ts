// Tiny startup coordination signal: the Home screen fires it once its first
// frames have actually painted, so App can fade the splash overlay exactly
// then (instead of on a fixed timer that races slow devices and shows black).
type Listener = () => void;

let fired = false;
const listeners = new Set<Listener>();

export const markHomeReady = (): void => {
  if (fired) return;
  fired = true;
  listeners.forEach(l => {
    try {
      l();
    } catch {}
  });
  listeners.clear();
};

/** Returns an unsubscribe function. Fires immediately if already ready. */
export const onHomeReady = (l: Listener): (() => void) => {
  if (fired) {
    l();
    return () => undefined;
  }
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

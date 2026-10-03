/**
 * ============================================================
 * SHIFT CLOCK
 * ============================================================
 *
 * The open shift, held in one place so the header can show it.
 *
 * The home screens already count the worked time on their own
 * cards, but that card is only on one page. Once somebody punches
 * in they spend the day on other screens, so the running clock is
 * published here and the shell draws it above whatever they are
 * looking at.
 *
 * What is stored is the punch in instant, not the elapsed time:
 * a stored duration would have to be updated every second by
 * whoever owns it, while an instant is written once and every
 * reader works out its own elapsed value from it.
 */
type Handler = (startedAt: number | null) => void;

const handlers = new Set<Handler>();

/** epoch ms of the punch in, or null when no shift is open */
let current: number | null = null;

/**
 * Subscribe to the open shift. The handler fires immediately with
 * the current value, so a component mounting midway through a
 * shift shows the clock without waiting for the next punch.
 *
 * Returns the unsubscribe.
 */
export function onOpenShift(handler: Handler) {
  handlers.add(handler);

  try {
    handler(current);
  } catch (error) {
    console.error("Shift clock handler error:", error);
  }

  return () => {
    handlers.delete(handler);
  };
}

/**
 * Called by the screens that own the attendance record, with the
 * punch in instant while the day is open and null once it is
 * closed. Driven by the loaded record rather than by the button,
 * so a shift already running when the app opens is picked up too.
 */
export function setOpenShift(startedAt: number | null) {
  /** a re-render that resolved to the same shift is not news */
  if (current === startedAt) return;

  current = startedAt;

  handlers.forEach((handler) => {
    try {
      handler(startedAt);
    } catch (error) {
      console.error("Shift clock handler error:", error);
    }
  });
}

export function getOpenShift() {
  return current;
}

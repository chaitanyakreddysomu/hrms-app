import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";

import { onOpenShift } from "./shiftClock";

/**
 * ============================================================
 * THE ONGOING SHIFT NOTIFICATION
 * ============================================================
 *
 * The open shift, posted into the system shade so it is there
 * with the app closed rather than only inside it.
 *
 * Android only. `sticky` maps to Android's setOngoing, which is
 * what pins a notification to the top of the shade and stops a
 * swipe dismissing it. iOS has no equivalent: every post there is
 * a fresh banner, so repeating one every minute would be an alarm
 * going off all day. iOS keeps the in-app clock instead.
 */
const CHANNEL = "shift";
const ID = "shift-clock";

/**
 * How often the text is rewritten. A notification cannot tick on
 * its own here, so every change of the displayed value costs a
 * re-post; a minute matches what the reader actually sees change,
 * since the body is written to the minute.
 */
const REFRESH_MS = 60000;

let timer: ReturnType<typeof setInterval> | null = null;
let startedAt: number | null = null;

/** 09:15 am, the wall clock the shift opened at */
function clockTime(instant: number) {
  const date = new Date(instant);

  const hours = date.getHours();
  const suffix = hours >= 12 ? "pm" : "am";
  const shown = hours % 12 === 0 ? 12 : hours % 12;

  return (
    `${String(shown).padStart(2, "0")}:` +
    `${String(date.getMinutes()).padStart(2, "0")} ${suffix}`
  );
}

/** "3h 42m", the shape a duration is read in rather than 03:42:07 */
function worked(from: number) {
  const diff = Math.max(0, Date.now() - from);

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  if (hours === 0) return `${minutes}m`;

  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

async function ensureChannel() {
  /**
   * Its own channel, at LOW. The notification is rewritten every
   * minute, and on the default HIGH channel each rewrite would
   * buzz the phone. LOW posts silently and keeps it out of the
   * heads-up position it does not need.
   */
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: "Working hours",
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: [0],
    enableVibrate: false,
    showBadge: false,
    lightColor: "#2563EB",
  });
}

async function post(from: number) {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: {
        title: "Working",
        body: `${worked(from)} · since ${clockTime(from)}`,
        /** Android's setOngoing: pinned, and not swipeable away */
        sticky: true,
        /** a tap opens the app; it must not take the clock with it */
        autoDismiss: false,
        color: "#2563EB",
        priority: Notifications.AndroidNotificationPriority.LOW,
        data: { shiftClock: true },
      },
      /** null means now, and reusing the id rewrites in place */
      trigger: null,
    });
  } catch (error) {
    console.error("Shift notification failed:", error);
  }
}

async function clear() {
  try {
    await Notifications.dismissNotificationAsync(ID);
    await Notifications.cancelScheduledNotificationAsync(ID);
  } catch {
    /** already gone, which is the state we wanted anyway */
  }
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * Wires the shade to the shift clock. Called once, at startup.
 *
 * Returns the unsubscribe, though nothing uses it: the app has no
 * point at which it stops caring about an open shift.
 */
export function startShiftNotifications() {
  if (Platform.OS !== "android") return () => {};

  const unsubscribe = onOpenShift(async (open) => {
    startedAt = open;
    stopTimer();

    if (!open) {
      await clear();
      return;
    }

    const permission = await Notifications.getPermissionsAsync();

    /**
     * Not requested here. Punching in is the wrong moment to throw
     * a permission dialog at somebody, and push registration has
     * already asked by this point in the session.
     */
    if (permission.status !== "granted") return;

    await ensureChannel();
    await post(open);

    timer = setInterval(() => {
      if (startedAt) post(startedAt);
    }, REFRESH_MS);
  });

  /**
   * Coming back to the app after a while, the shade is showing
   * whatever the last tick wrote before the timers were frozen.
   * This catches it up rather than waiting out another minute.
   */
  const appState = AppState.addEventListener("change", (state) => {
    if (state === "active" && startedAt) post(startedAt);
  });

  return () => {
    unsubscribe();
    stopTimer();
    appState.remove();
  };
}

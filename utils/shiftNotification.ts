import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

import { onOpenShift } from "./shiftClock";
import {
  startAttendanceNotification,
  stopAttendanceNotification,
} from "../modules/attendance-notification";

/**
 * ============================================================
 * THE ONGOING SHIFT NOTIFICATION
 * ============================================================
 *
 * The open shift, posted into the system shade so it is there
 * with the app closed rather than only inside it.
 *
 * Posted exactly once, at punch-in, using Android's own
 * chronometer (modules/attendance-notification) - the system
 * ticks the displayed duration itself from then on, so there is
 * no repeat post, no repeat alert, and nothing running on the JS
 * side while the shift is open. Only punch-out (open === null)
 * touches it again, to take it down.
 *
 * Android only. iOS has no ongoing/chronometer notification
 * concept - every post there is a fresh banner, so there is
 * nothing to show without it becoming a once-a-minute alarm.
 * iOS keeps the in-app clock instead.
 */
export function startShiftNotifications() {
  if (Platform.OS !== "android") return () => {};

  const unsubscribe = onOpenShift(async (open) => {
    if (!open) {
      stopAttendanceNotification();
      return;
    }

    const permission = await Notifications.getPermissionsAsync();

    /**
     * Not requested here. Punching in is the wrong moment to throw
     * a permission dialog at somebody, and push registration has
     * already asked by this point in the session.
     */
    if (permission.status !== "granted") return;

    startAttendanceNotification(open);
  });

  return unsubscribe;
}

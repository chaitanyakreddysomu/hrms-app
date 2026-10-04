import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * ============================================================
 * ATTENDANCE NOTIFICATION (native)
 * ============================================================
 *
 * A single ongoing notification with Android's own chronometer,
 * posted once at punch-in and left for the system to tick -
 * nothing on the JS side reposts it, so there is no repeat alert
 * and no battery cost. expo-notifications has no chronometer
 * option, which is why this is a small native module instead.
 */
const NativeModule = Platform.OS === "android"
  ? requireOptionalNativeModule("AttendanceNotification")
  : null;

/** Posts the ongoing "Attendance Active" notification. No-op off Android. */
export function startAttendanceNotification(punchInMillis: number): void {
  try {
    NativeModule?.start(punchInMillis);
  } catch (error) {
    console.error("startAttendanceNotification failed:", error);
  }
}

/** Removes the notification, e.g. on punch-out. No-op off Android. */
export function stopAttendanceNotification(): void {
  try {
    NativeModule?.stop();
  } catch (error) {
    console.error("stopAttendanceNotification failed:", error);
  }
}

import "./global.css";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppNavigator from "./navigation/AppNavigator";
import { ToastProvider } from "./components/Toast";
import { startShiftNotifications } from "./utils/shiftNotification";

export default function App() {
  /**
   * The shade follows the shift clock for as long as the app is
   * alive. Wired here rather than in a shell, because all three
   * shells mount their own and the notification belongs to the
   * person, not to whichever panel they happen to be looking at.
   */
  useEffect(() => startShiftNotifications(), []);

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <AppNavigator />
      </ToastProvider>
    </SafeAreaProvider>
  );
}

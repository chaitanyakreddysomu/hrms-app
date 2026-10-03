import { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";

import { disablePush, enablePush, isPushEnabled } from "../utils/push";

/**
 * ============================================================
 * THE NOTIFICATIONS SWITCH
 * ============================================================
 *
 * The behaviour behind the row that sits under biometric login on
 * every profile page. Kept here rather than in each screen so the
 * admin, HR and employee pages cannot drift apart.
 *
 * On  -> asks for permission, takes a fresh token, registers it.
 * Off -> drops this device from the account, server side.
 * On again -> asks again and stores whatever token comes back.
 */
export interface NotificationToggle {
  on: boolean;
  busy: boolean;
  /** set when the system will not show the prompt any more */
  blocked: boolean;
  toggle: () => void;
  openSettings: () => void;
}

interface Options {
  onResult?: (result: {
    ok: boolean;
    on: boolean;
    title: string;
    message: string;
  }) => void;
}

export function useNotificationToggle({
  onResult,
}: Options = {}): NotificationToggle {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let alive = true;

    isPushEnabled().then((enabled) => {
      if (alive) setOn(enabled);
    });

    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(async () => {
    if (busy) return;

    setBusy(true);

    try {
      if (on) {
        await disablePush();
        setOn(false);
        setBlocked(false);

        onResult?.({
          ok: true,
          on: false,
          title: "Notifications Off",
          message: "This device will stop receiving alerts.",
        });

        return;
      }

      const result = await enablePush();

      if (result.ok) {
        setOn(true);
        setBlocked(false);

        onResult?.({
          ok: true,
          on: true,
          title: "Notifications On",
          message: "This device is registered for alerts.",
        });

        return;
      }

      setOn(false);
      setBlocked(result.reason === "blocked");

      const message =
        result.reason === "blocked"
          ? "Permission was turned off for this app. Open settings to allow it."
          : result.reason === "denied"
          ? "Permission is needed before alerts can be sent here."
          : result.reason === "not-a-device"
          ? "Push notifications do not work on a simulator."
          : "Could not register this device. Try again.";

      onResult?.({
        ok: false,
        on: false,
        title: "Notifications Not Enabled",
        message,
      });
    } finally {
      setBusy(false);
    }
  }, [busy, on, onResult]);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  return { on, busy, blocked, toggle, openSettings };
}

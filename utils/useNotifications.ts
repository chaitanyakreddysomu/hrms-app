import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { getAuthSession } from "./authStorage";
import { apiFetch } from "./api";
import {
  clearBadge,
  onPushReceived,
  onPushTapped,
  openedFromPush,
  registerForPush,
  getPushStatus,
} from "./push";

/**
 * ============================================================
 * NOTIFICATIONS, FOR A DASHBOARD
 * ============================================================
 *
 * Every dashboard wants the same four things: register this
 * device for push, keep an unread count for the bell, open the
 * notifications page when one is tapped from outside the app,
 * and refresh when the app comes back to the foreground.
 */
interface Options {
  /** where the unread count is read from, roles differ */
  countPath?: string;
  /** opens the notifications page in that shell */
  onOpen: () => void;
}

export function useNotifications({ countPath, onOpen }: Options) {
  const [unread, setUnread] = useState(0);

  /** the handler changes on every render, the listener should not */
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  const refresh = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        countPath || "/api/notifications/unread-count",
        session.token
      );

      if (!res.ok) return;

      const data = await res.json().catch(() => null);

      /** the shared route answers with a count, role routes with a list */
      if (typeof data?.count === "number") {
        setUnread(data.count);
      } else if (Array.isArray(data)) {
        setUnread(data.filter((n: any) => !n.read).length);
      }
    } catch (error) {
      console.error("Unread count error:", error);
    }
  }, [countPath]);

  /* ---- this device, on the list ---- */
  useEffect(() => {
    /** the outcome is logged, since a failure is otherwise silent */
    registerForPush().then(() =>
      console.log("Push registration:", JSON.stringify(getPushStatus()))
    );

    refresh();
    clearBadge();
  }, [refresh]);

  /* ---- a tap from outside the app opens the page ---- */
  useEffect(() => {
    let alive = true;

    (async () => {
      const target = await openedFromPush();

      /** a moment for the shell to mount before it is steered */
      if (alive && target) setTimeout(() => openRef.current(), 350);
    })();

    const stopTap = onPushTapped(() => {
      openRef.current();
      refresh();
      clearBadge();
    });

    const stopReceive = onPushReceived(() => refresh());

    return () => {
      alive = false;
      stopTap();
      stopReceive();
    };
  }, [refresh]);

  /* ---- coming back to the app catches up the badge ---- */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });

    return () => sub.remove();
  }, [refresh]);

  return { unread, refresh, setUnread };
}

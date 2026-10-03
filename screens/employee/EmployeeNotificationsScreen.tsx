import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { getAuthSession } from "../../utils/authStorage";
import { apiFetch } from "../../utils/api";
import {
  useRegisterScreenAction,
  useShellScroll,
} from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { useToast } from "../../components/Toast";
import { Ionicons } from "@expo/vector-icons";

import {
  Card,
  EmptyState,
  IconTile,
  Loading,
  SectionTitle,
  ToneName,
  formatDate,
} from "./ui";

/**
 * ============================================================
 * NOTIFICATIONS
 * ============================================================
 *
 * GET /api/employee/notifications, newest first. Opening one
 * marks it read through PATCH on the same resource, so the badge
 * on the home header stays honest.
 */
interface Note {
  _id: string;
  title?: string;
  message?: string;
  body?: string;
  read?: boolean;
  type?: string;
  source?: string;
  /** what the notification is about, used for its icon */
  category?: string;
  entityId?: string;
  date?: string;
  createdAt?: string;
}

/** an icon and a tint per subject, so a glance tells them apart */
const LOOK: Record<string, [keyof typeof Ionicons.glyphMap, ToneName]> = {
  leave: ["airplane", "blue"],
  complaint: ["chatbubble-ellipses", "amber"],
  referral: ["people", "purple"],
  request: ["person-add", "green"],
  payslip: ["receipt", "green"],
  general: ["notifications", "blue"],
};

interface Props {
  listPath?: string;
  /** the collection the read flag is patched on, id appended */
  readPath?: string;
}

export default function EmployeeNotificationsScreen({
  listPath = "/api/employee/notifications",
  readPath = "/api/employee/notifications",
}: Props = {}) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();
  const { showToast } = useToast();

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(listPath, session.token);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Notifications Unavailable",
          message: "Could not load your notifications.",
        });

        return;
      }

      const data = await res.json();
      setNotes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Notifications load error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [listPath]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (note: Note) => {
    if (note.read) return;

    /** shown as read straight away, the server catches up */
    setNotes((current) =>
      current.map((n) => (n._id === note._id ? { ...n, read: true } : n))
    );

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      /** HR marks one read on /:id/read, employees on /:id */
      const suffix = readPath.includes("/hr/") ? "/read" : "";

      await apiFetch(`${readPath}/${note._id}${suffix}`, session.token, {
        method: "PATCH",
      });
    } catch (error) {
      console.error("Mark read error:", error);
    }
  };

  const markAllRead = async () => {
    if (!notes.some((n) => !n.read)) return;

    setNotes((current) => current.map((n) => ({ ...n, read: true })));

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      await apiFetch("/api/notifications/read-all", session.token, {
        method: "PATCH",
      });
    } catch (error) {
      console.error("Mark all read error:", error);
    }
  };

  useRegisterScreenAction("markAllRead", markAllRead);

  const unread = notes.filter((n) => !n.read).length;

  return (
    <ScrollView
      {...shellScroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16, paddingTop: shellTop, paddingBottom: 150 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor="#2563EB"
        />
      }
    >
      {loading ? (
        <Loading label="Loading notifications" />
      ) : notes.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="Nothing new"
          message="Announcements and approvals will show up here."
        />
      ) : (
        <>
          <SectionTitle
            action={unread > 0 ? "Mark all read" : undefined}
            onAction={markAllRead}
          >
            {unread > 0 ? `${unread} unread` : "All caught up"}
          </SectionTitle>

          {notes.map((note) => (
            <Card
              key={note._id}
              onPress={() => markRead(note)}
              style={
                note.read
                  ? undefined
                  : { borderColor: "#BFDBFE", backgroundColor: "#F8FAFF" }
              }
            >
              <View style={{ flexDirection: "row" }}>
                <IconTile
                  icon={(LOOK[note.category || "general"] || LOOK.general)[0]}
                  tone={
                    note.read
                      ? "slate"
                      : (LOOK[note.category || "general"] || LOOK.general)[1]
                  }
                />

                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text
                    style={{
                      color: "#0F172A",
                      fontSize: 14,
                      fontWeight: note.read ? "600" : "800",
                    }}
                  >
                    {note.title || "Notification"}
                  </Text>

                  <Text
                    style={{
                      color: "#475569",
                      fontSize: 12,
                      lineHeight: 18,
                      marginTop: 4,
                    }}
                  >
                    {note.message || note.body || ""}
                  </Text>

                  <Text
                    style={{
                      color: "#CBD5E1",
                      fontSize: 11,
                      fontWeight: "600",
                      marginTop: 6,
                    }}
                  >
                    {formatDate(note.date || note.createdAt)}
                  </Text>
                </View>

                {!note.read && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: "#2563EB",
                      marginTop: 6,
                    }}
                  />
                )}
              </View>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

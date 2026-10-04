import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiFetch } from "../../utils/api";
import { getAuthSession, isAuthError } from "../../utils/authStorage";
import RefreshSessionButton from "../../components/RefreshSessionButton";
import {
  toShellOptions,
  useShellFilters,
  useShellScroll,
} from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";

/**
 * ============================================================
 * ADMIN NOTIFICATIONS
 * ============================================================
 *
 * The receiving half of the web notifications page. Sending is a
 * desk job, so the app only lists what the admin was sent and
 * marks items read as they are opened.
 *
 *   GET   /api/admin/notifications        (?sort=unread)
 *   PATCH /api/admin/notifications/:id?markasread
 */
interface Props {
  reloadKey?: number;
  /** keeps the header bell badge in step */
  onUnreadChange?: (count: number) => void;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  type: string;
  source: string;
}

const TYPE_THEME: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string }
> = {
  info: { icon: "information-circle", tint: "#2563EB", bg: "#EFF6FF" },
  success: { icon: "checkmark-circle", tint: "#059669", bg: "#ECFDF5" },
  warning: { icon: "alert-circle", tint: "#D97706", bg: "#FFFBEB" },
  error: { icon: "close-circle", tint: "#DC2626", bg: "#FEF2F2" },
};

function timeAgo(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

/** the two test buttons, sharing the row evenly */
function TestButton({
  label,
  icon,
  busy,
  disabled,
  onPress,
  tone = "blue",
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  tone?: "blue" | "dark";
}) {
  const background = tone === "dark" ? "#0F172A" : "#2563EB";

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        height: 46,
        borderRadius: 16,
        backgroundColor: background,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Ionicons name={icon} size={16} color="#FFFFFF" />
      )}
      <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>
        {busy ? "Sending" : label}
      </Text>
    </TouchableOpacity>
  );
}

export default function AdminNotificationsScreen({
  reloadKey,
  onUnreadChange,
}: Props) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);

  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState("All");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** which of the two tests is in flight, if either */
  const [testing, setTesting] = useState<"header" | "system" | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const session = await getAuthSession();
      if (!session?.token) {
        setError("Session expired. Please sign in again.");
        return;
      }

      const query = filter === "Unread" ? "?sort=unread" : "";
      const res = await apiFetch(
        `/api/admin/notifications${query}`,
        session.token
      );
      if (!res.ok) {
        /** a rejected token is worth naming, so the refresh is offered */
        setError(
          res.status === 401 || res.status === 403
            ? "Session expired. Refresh it to carry on."
            : "Could not load notifications."
        );
        return;
      }

      const data = await res.json();
      setItems(
        (Array.isArray(data) ? data : []).map((n: any) => ({
          id: n._id || n.id,
          title: n.title,
          message: n.message,
          date: n.date,
          read: !!n.read,
          type: n.type || "info",
          source: n.source || "System",
        }))
      );
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, reloadKey]);

  /** the header menu owns this filter while embedded */
  useShellFilters(
    useMemo(
      () => [
        {
          key: "read",
          label: "Show",
          value: filter,
          defaultValue: "All",
          options: toShellOptions(["All", "Unread"]),
          onChange: setFilter,
        },
      ],
      [filter]
    )
  );

  const markRead = async (item: Notification) => {
    if (item.read) return;
    const before = items;
    setItems((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
    );
    try {
      const session = await getAuthSession();
      if (!session?.token) return;
      const res = await apiFetch(
        `/api/admin/notifications/${item.id}?markasread`,
        session.token,
        { method: "PATCH" }
      );
      if (!res.ok) setItems(before);
    } catch {
      setItems(before);
    }
  };

  /**
   * Sends a notification to this admin's own devices. The arrival is
   * its own confirmation, in the header or in the tray depending on
   * `force`, so nothing is reported back on screen. Failures go to
   * the log.
   *
   * `force` asks the app to use the system tray even though it is
   * open, which is otherwise reserved for a backgrounded app.
   */
  const sendTest = async (mode: "header" | "system") => {
    if (testing) return;
    setTesting(mode);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch("/api/notifications/test-expo", session.token, {
        method: "POST",
        body: JSON.stringify({
          title:
            mode === "system"
              ? "This is a system notification"
              : "This is test heading",
          body:
            mode === "system"
              ? "Sent to the tray with the app open."
              : "This is test description",
          force: mode === "system",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.error("Test notification failed:", res.status, data?.message);
        return;
      }

      load();
    } catch (error) {
      console.error("Test notification error:", error);
    } finally {
      setTesting(null);
    }
  };

  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    /** the unread view cannot count what it filtered out */
    if (filter === "All") onUnreadChange?.(unread);
  }, [unread, filter, onUnreadChange]);

  const renderItem = ({ item }: { item: Notification }) => {
    const theme = TYPE_THEME[item.type] || TYPE_THEME.info;
    const open = expanded === item.id;

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          setExpanded(open ? null : item.id);
          markRead(item);
        }}
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 20,
          borderWidth: 1,
          borderColor: item.read ? "#E2E8F0" : "#BFDBFE",
          padding: 14,
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row" }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              backgroundColor: theme.bg,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Ionicons name={theme.icon} size={20} color={theme.tint} />
          </View>

          <View style={{ flex: 1 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text
                style={{
                  flex: 1,
                  color: "#0F172A",
                  fontSize: 14,
                  fontWeight: item.read ? "600" : "800",
                }}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              {!item.read && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "#2563EB",
                  }}
                />
              )}
            </View>

            <Text
              style={{
                color: "#475569",
                fontSize: 13,
                lineHeight: 19,
                marginTop: 4,
              }}
              numberOfLines={open ? undefined : 2}
            >
              {item.message}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <Ionicons name="person-circle-outline" size={14} color="#94A3B8" />
              <Text
                style={{
                  color: "#94A3B8",
                  fontSize: 11,
                  fontWeight: "600",
                  marginLeft: 4,
                }}
              >
                {item.source}
              </Text>
              <Text style={{ color: "#CBD5E1", marginHorizontal: 6 }}>•</Text>
              <Text
                style={{ color: "#94A3B8", fontSize: 11, fontWeight: "600" }}
              >
                {timeAgo(item.date)}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#F1F5F9",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <FlatList
      {...shellScroll}
      style={{ flex: 1, backgroundColor: "#F1F5F9" }}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: shellTop,
        paddingBottom: 150,
        flexGrow: 1,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor="#2563EB"
          colors={["#2563EB"]}
          progressViewOffset={40}
        />
      }
      ListHeaderComponent={
        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
            <TestButton
              label="In-app"
              icon="chatbubble-ellipses-outline"
              busy={testing === "header"}
              disabled={!!testing}
              onPress={() => sendTest("header")}
            />
            <TestButton
              label="System"
              icon="notifications-outline"
              tone="dark"
              busy={testing === "system"}
              disabled={!!testing}
              onPress={() => sendTest("system")}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 4,
            }}
          >
            <Ionicons name="notifications-outline" size={14} color="#64748B" />
            <Text
              style={{
                color: "#64748B",
                fontSize: 12,
                fontWeight: "700",
                marginLeft: 6,
              }}
            >
              {items.length}{" "}
              {items.length === 1 ? "notification" : "notifications"}
            </Text>
            {unread > 0 && (
              <Text
                style={{
                  color: "#2563EB",
                  fontSize: 12,
                  fontWeight: "700",
                  marginLeft: 6,
                }}
              >
                • {unread} unread
              </Text>
            )}
          </View>
        </View>
      }
      ListEmptyComponent={
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 70,
          }}
        >
          <Ionicons
            name={error ? "alert-circle-outline" : "notifications-off-outline"}
            size={48}
            color={error ? "#EF4444" : "#CBD5E1"}
          />
          <Text
            style={{
              color: error ? "#0F172A" : "#94A3B8",
              fontSize: 14,
              fontWeight: "600",
              marginTop: 14,
              textAlign: "center",
              paddingHorizontal: 30,
            }}
          >
            {error || "Nothing here yet"}
          </Text>

          {isAuthError(error) && (
            <RefreshSessionButton
              onDone={() => {
                setLoading(true);
                load();
              }}
            />
          )}
        </View>
      }
    />
  );
}

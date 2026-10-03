import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { getAuthSession } from "../../utils/authStorage";
import { apiFetch } from "../../utils/api";
import {
  useRegisterScreenAction,
  useShellScroll,
  useShellSearch,
} from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { useToast } from "../../components/Toast";
import {
  Card,
  EmptyState,
  IconTile,
  Loading,
  SectionTitle,
  StatTile,
  StatusPill,
  ToneName,
} from "./ui";
import ModalDismiss from "../../components/ModalDismiss";

/**
 * ============================================================
 * TEAM ATTENDANCE
 * ============================================================
 *
 * GET /api/hr/attendance?date= gives one day across everyone,
 * which is how the web console reads it. A swipe steps a day.
 */
interface Record {
  _id?: string;
  id?: string;
  userId?: string;
  name?: string;
  email?: string;
  empId?: string;
  profileImage?: string;
  avatar?: string;
  designation?: string;
  date?: string;
  status?: string;
  punchIn?: string;
  punchOut?: string;
  latitude?: number | null;
  longitude?: number | null;
  totalHours?: number;
  /** the route names the worked hours this way */
  timeWorking?: number | null;
}

const STATUS_ICON: Record2 = {
  Present: ["checkmark-circle", "green"],
  Late: ["time", "amber"],
  Absent: ["close-circle", "red"],
  "Half Day": ["contrast", "amber"],
  "On Leave": ["cafe", "blue"],
};

type Record2 = { [key: string]: [keyof typeof Ionicons.glyphMap, ToneName] };

const toISO = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
};

export default function HrAttendanceScreen() {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();
  const { showToast } = useToast();

  const [day, setDay] = useState(new Date());
  const [records, setRecords] = useState<Record[]>([]);
  const [open, setOpen] = useState<Record | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  /** a long press on the header title opens the search field */
  useShellSearch(setSearch);

  /** ticks while the open record is still on the clock */
  const [now, setNow] = useState(Date.now());

  const stillIn =
    !!open && !!open.punchIn && open.punchIn !== "--" &&
    (!open.punchOut || open.punchOut === "--");

  useEffect(() => {
    if (!stillIn) return;

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [stillIn]);

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        `/api/hr/attendance?date=${toISO(day)}`,
        session.token
      );

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Attendance Unavailable",
          message: "Could not load this day.",
        });

        return;
      }

      const data = await res.json();
      setRecords(Array.isArray(data) ? data : data?.records || []);
    } catch (error) {
      console.error("HR attendance error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [day]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const shiftDay = (step: number) =>
    setDay((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + step);

      /** the future holds no attendance to read */
      return next > new Date() ? current : next;
    });

  const shiftRef = useRef(shiftDay);
  shiftRef.current = shiftDay;

  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 24 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx <= -60) shiftRef.current(1);
        else if (gesture.dx >= 60) shiftRef.current(-1);
      },
    })
  ).current;

  /**
   * Export writes the day out as CSV and hands it to the share
   * sheet, which is how a phone saves or mails a file.
   */
  const exportDay = async () => {
    if (!records.length) {
      showToast({
        type: "warning",
        title: "Nothing To Export",
        message: "This day has no attendance to write out.",
      });

      return;
    }

    try {
      const header = "Name,Employee ID,Status,Punch in,Punch out,Hours";

      const rows = records.map((record) =>
        [
          record.name || record.userId || "",
          record.empId || "",
          record.status || "",
          record.punchIn === "--" ? "" : record.punchIn || "",
          record.punchOut === "--" ? "" : record.punchOut || "",
          record.timeWorking ?? record.totalHours ?? "",
        ]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      );

      const file = `${FileSystem.cacheDirectory}attendance-${toISO(day)}.csv`;

      await FileSystem.writeAsStringAsync(file, [header, ...rows].join("\n"));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file, {
          mimeType: "text/csv",
          dialogTitle: `Attendance ${toISO(day)}`,
          UTI: "public.comma-separated-values-text",
        });
      } else {
        showToast({
          type: "success",
          title: "File Ready",
          message: "Saved to the app storage.",
        });
      }
    } catch (error) {
      console.error("Export attendance error:", error);

      showToast({
        type: "error",
        title: "Export Failed",
        message: "Could not write the file.",
      });
    }
  };

  useRegisterScreenAction("exportAttendance", exportDay);

  /** the search narrows what the day already returned */
  const shown = records.filter((record) => {
    const text = search.trim().toLowerCase();
    if (!text) return true;

    return [record.name, record.empId, record.userId]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(text));
  });

  const present = records.filter(
    (r) => r.status === "Present" || r.status === "Late"
  ).length;

  const absent = records.filter((r) => r.status === "Absent").length;

  const onLeave = records.filter((r) => r.status === "On Leave").length;

  /** a dash from the server means the field was never filled */
  const orDash = (value?: string | null) =>
    !value || value === "--" ? "--" : value;

  /**
   * A finished day reports the hours the server counted. One that
   * is still running counts up from the punch in instead, so the
   * sheet shows the time on the clock rather than a dash.
   */
  const worked = (record: Record) => {
    const running =
      !!record.punchIn &&
      record.punchIn !== "--" &&
      (!record.punchOut || record.punchOut === "--");

    if (running) {
      const [h, m, sec] = String(record.punchIn).split(":").map(Number);

      if (!Number.isNaN(h)) {
        const start = record.date ? new Date(record.date) : new Date();

        if (!Number.isNaN(start.getTime())) {
          start.setHours(h, m || 0, sec || 0, 0);

          const diff = Math.max(0, now - start.getTime());

          const hours = Math.floor(diff / 3600000);
          const minutes = Math.floor((diff % 3600000) / 60000);
          const seconds = Math.floor((diff % 60000) / 1000);

          return (
            `${String(hours).padStart(2, "0")}:` +
            `${String(minutes).padStart(2, "0")}:` +
            `${String(seconds).padStart(2, "0")}`
          );
        }
      }
    }

    const hours = record.timeWorking ?? record.totalHours;

    return hours ? `${Number(hours).toFixed(2)} h` : "--";
  };

  /** hands the coordinates to whichever maps app the phone has */
  const openInMaps = (record: Record) => {
    if (!record.latitude || !record.longitude) return;

    const label = encodeURIComponent(
      record.name || record.userId || "Punch in"
    );

    const point = `${record.latitude},${record.longitude}`;

    const url =
      Platform.OS === "ios"
        ? `maps:0,0?q=${label}@${point}`
        : `geo:0,0?q=${point}(${label})`;

    Linking.openURL(url).catch(() =>
      /** no maps app, the browser always works */
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${point}`)
    );
  };

  return (
    <>
    <ScrollView
      {...swipe.panHandlers}
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
      {/* DAY */}

      <Card style={{ flexDirection: "row", alignItems: "center" }}>
        <TouchableOpacity
          onPress={() => shiftDay(-1)}
          style={{ padding: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color="#2563EB" />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: "#0F172A", fontSize: 15, fontWeight: "800" }}>
            {day.toLocaleDateString("en-GB", {
              weekday: "short",
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </Text>

          <Text
            style={{ color: "#94A3B8", fontSize: 11, fontWeight: "600" }}
          >
            {records.length} records, swipe to change day
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => shiftDay(1)}
          style={{ padding: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-forward" size={20} color="#2563EB" />
        </TouchableOpacity>
      </Card>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatTile
          icon="checkmark-circle-outline"
          label="Present"
          value={String(present)}
          tone="green"
        />

        <StatTile
          icon="close-circle-outline"
          label="Absent"
          value={String(absent)}
          tone="red"
        />

        <StatTile
          icon="cafe-outline"
          label="On leave"
          value={String(onLeave)}
          tone="blue"
        />
      </View>

      <SectionTitle>Who was in</SectionTitle>

      {loading ? (
        <Loading label="Loading attendance" />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Nothing logged"
          message="No attendance was recorded for this day."
        />
      ) : (
        shown.map((record) => {
          const photo = record.profileImage || record.avatar;

          return (
            <TouchableOpacity
              key={record._id || record.id || record.userId}
              activeOpacity={0.7}
              onPress={() => setOpen(record)}
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 20,
                padding: 16,
                borderWidth: 1,
                borderColor: "#F3F4F6",
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              {photo ? (
                <Image
                  source={{ uri: photo }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: "#F3F4F6",
                  }}
                />
              ) : (
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: "#EFF6FF",
                    borderWidth: 1,
                    borderColor: "#DBEAFE",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#2563EB",
                      fontSize: 18,
                      fontWeight: "700",
                    }}
                  >
                    {(record.name || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}

              <View style={{ flex: 1, marginHorizontal: 14 }}>
                <Text
                  style={{
                    color: "#111827",
                    fontWeight: "700",
                    fontSize: 15,
                  }}
                  numberOfLines={1}
                >
                  {record.name || record.userId || "Employee"}
                </Text>

                <Text
                  style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }}
                  numberOfLines={1}
                >
                  {record.email || record.empId || "--"}
                </Text>
              </View>

              <StatusPill status={record.status} />
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>

    {/* ============================================================
        ONE PERSON, ONE DAY
    ============================================================ */}

    <Modal
      visible={!!open}
      transparent
      animationType="slide"
      onRequestClose={() => setOpen(null)}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.5)",
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(null)} />

        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 34,
          }}
        >
          <View style={{ alignItems: "center", marginBottom: 14 }}>
            <View
              style={{
                width: 44,
                height: 5,
                borderRadius: 3,
                backgroundColor: "#D1D5DB",
              }}
            />
          </View>

          {!!open && (
            <>
              {/* WHO, with the outcome of the day on the right */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F9FAFB",
                  padding: 16,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  marginBottom: 16,
                }}
              >
                {open.profileImage || open.avatar ? (
                  <Image
                    source={{ uri: open.profileImage || open.avatar }}
                    style={{ width: 56, height: 56, borderRadius: 28 }}
                  />
                ) : (
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: "#2563EB",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontSize: 22,
                        fontWeight: "700",
                      }}
                    >
                      {(open.name || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}

                <View style={{ flex: 1, marginHorizontal: 14 }}>
                  <Text
                    style={{
                      color: "#111827",
                      fontSize: 17,
                      fontWeight: "700",
                    }}
                    numberOfLines={1}
                  >
                    {open.name || open.userId || "Employee"}
                  </Text>

                  <Text
                    style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }}
                    numberOfLines={1}
                  >
                    {open.email || open.empId || "--"}
                  </Text>
                </View>

                <StatusPill status={open.status} />
              </View>

              {/* THE DAY, two by two */}
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                }}
              >
                <Tile
                  icon="log-in-outline"
                  tone="green"
                  label="Punch in"
                  value={orDash(open.punchIn)}
                />

                <Tile
                  icon="log-out-outline"
                  tone="amber"
                  label="Punch out"
                  value={orDash(open.punchOut)}
                />

                <Tile
                  icon="location-outline"
                  tone="purple"
                  label={
                    open.latitude && open.longitude
                      ? "Location, tap to open"
                      : "Location"
                  }
                  value={
                    open.latitude && open.longitude
                      ? `${open.latitude.toFixed(3)}, ${open.longitude.toFixed(3)}`
                      : "Not recorded"
                  }
                  onPress={
                    open.latitude && open.longitude
                      ? () => openInMaps(open)
                      : undefined
                  }
                />

                <Tile
                  icon="time-outline"
                  tone="blue"
                  label={stillIn ? "Working now" : "Worked"}
                  value={worked(open)}
                  live={stillIn}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
    </>
  );
}

function Tile({
  icon,
  tone,
  label,
  value,
  onPress,
  live,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: ToneName;
  label: string;
  value: string;
  onPress?: () => void;
  live?: boolean;
}) {
  const body = (
    <View
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: onPress ? "#DDD6FE" : "#EEF2F7",
        padding: 14,
      }}
    >
      <IconTile icon={icon} tone={tone} size={34} />

      <Text
        style={{
          color: "#0F172A",
          fontSize: 15,
          fontWeight: "800",
          marginTop: 10,
          fontVariant: live ? ["tabular-nums"] : undefined,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>

      <Text
        style={{
          color: onPress ? "#7C3AED" : "#94A3B8",
          fontSize: 11,
          fontWeight: onPress ? "700" : "600",
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <View style={{ width: "48.5%", marginBottom: 12 }}>
      {onPress ? (
        <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
          {body}
        </TouchableOpacity>
      ) : (
        body
      )}
    </View>
  );
}

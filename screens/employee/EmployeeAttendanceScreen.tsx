import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { getAuthSession } from "../../utils/authStorage";
import { apiFetch } from "../../utils/api";
import { useShellScroll } from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { useToast } from "../../components/Toast";
import {
  Card,
  EmptyState,
  IconTile,
  Loading,
  Row,
  SectionTitle,
  StatusPill,
  ToneName,
  formatDate,
} from "./ui";
import ModalDismiss from "../../components/ModalDismiss";

/**
 * ============================================================
 * MY ATTENDANCE
 * ============================================================
 *
 * The employee view of GET /api/attendance for one month, with
 * the same month and year controls the web page offers. The
 * backend counts months from zero.
 */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface AttendanceRecord {
  _id: string;
  date: string;
  status?: string;
  punchIn?: string;
  punchOut?: string;
  totalHours?: number;
}

const STATUS_ICON: Record<
  string,
  [keyof typeof Ionicons.glyphMap, ToneName]
> = {
  Present: ["checkmark-circle", "green"],
  Late: ["time", "amber"],
  Absent: ["close-circle", "red"],
  "Half Day": ["contrast", "amber"],
  "On Leave": ["cafe", "blue"],
  Holiday: ["calendar", "purple"],
};

interface Props {
  /** HR reads its own days with self=true on the shared route */
  self?: boolean;
}

export default function EmployeeAttendanceScreen({ self }: Props = {}) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();
  const { showToast } = useToast();

  const now = new Date();

  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<AttendanceRecord | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        `/api/attendance?${self ? "self=true&" : ""}month=${month}&year=${year}`,
        session.token
      );

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Attendance Unavailable",
          message: "Could not load this month.",
        });

        return;
      }

      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Attendance load error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month, year, self]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  /**
   * A horizontal drag moves through the calendar: left for the
   * next month, right for the previous one. The threshold keeps
   * it out of the way of the vertical scroll.
   */
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx <= -60) shiftRef.current(1);
        else if (gesture.dx >= 60) shiftRef.current(-1);
      },
    })
  ).current;

  const shiftMonth = (step: number) => {
    let nextMonth = month + step;
    let nextYear = year;

    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }

    setMonth(nextMonth);
    setYear(nextYear);
  };

  const shiftRef = useRef(shiftMonth);
  shiftRef.current = shiftMonth;

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
      {/* MONTH PICKER */}

      <Card style={{ flexDirection: "row", alignItems: "center" }}>
        <TouchableOpacity
          onPress={() => shiftMonth(-1)}
          style={{ padding: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color="#2563EB" />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Text
            style={{ color: "#0F172A", fontSize: 15, fontWeight: "800" }}
          >
            {MONTHS[month]} {year}
          </Text>

          <Text
            style={{ color: "#94A3B8", fontSize: 11, fontWeight: "600" }}
          >
            {records.length} records, swipe to change month
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => shiftMonth(1)}
          style={{ padding: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-forward" size={20} color="#2563EB" />
        </TouchableOpacity>
      </Card>

      <SectionTitle>Daily record</SectionTitle>

      {loading ? (
        <Loading label="Loading attendance" />
      ) : records.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Nothing logged"
          message={`No attendance was recorded in ${MONTHS[month]} ${year}.`}
        />
      ) : (
        records
          .slice()
          .sort(
            (a, b) =>
              new Date(b.date).getTime() - new Date(a.date).getTime()
          )
          .map((record) => {
            const [icon, tone] =
              STATUS_ICON[record.status || ""] || ["ellipse", "slate"];

            const date = new Date(record.date);

            return (
              <Card key={record._id} onPress={() => setOpen(record)}>
                <View
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <IconTile icon={icon} tone={tone} />

                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text
                      style={{
                        color: "#0F172A",
                        fontSize: 14,
                        fontWeight: "800",
                      }}
                    >
                      {date.toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                      })}
                    </Text>

                    <Text
                      style={{
                        color: "#94A3B8",
                        fontSize: 11,
                        fontWeight: "600",
                        marginTop: 3,
                      }}
                    >
                      {record.punchIn || "--"} to {record.punchOut || "--"}
                      {record.totalHours
                        ? `  ${record.totalHours.toFixed(1)} h`
                        : ""}
                    </Text>
                  </View>

                  <StatusPill status={record.status} />
                </View>
              </Card>
            );
          })
      )}
    </ScrollView>

    {/* ============================================================
        ONE DAY IN FULL
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

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <Text
              style={{ color: "#0F172A", fontSize: 20, fontWeight: "800" }}
            >
              {open ? formatDate(open.date) : ""}
            </Text>

            <TouchableOpacity
              onPress={() => setOpen(null)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "#F3F4F6",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {!!open && (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <IconTile
                  icon={(STATUS_ICON[open.status || ""] || ["ellipse", "slate"])[0]}
                  tone={(STATUS_ICON[open.status || ""] || ["ellipse", "slate"])[1]}
                />

                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text
                    style={{
                      color: "#0F172A",
                      fontSize: 15,
                      fontWeight: "800",
                    }}
                  >
                    {new Date(open.date).toLocaleDateString("en-GB", {
                      weekday: "long",
                    })}
                  </Text>

                  <Text
                    style={{
                      color: "#94A3B8",
                      fontSize: 11,
                      fontWeight: "600",
                      marginTop: 3,
                    }}
                  >
                    {open.totalHours
                      ? `${open.totalHours.toFixed(2)} hours worked`
                      : "No hours recorded"}
                  </Text>
                </View>

                <StatusPill status={open.status} />
              </View>

              <Card>
                <Row label="Punch in" value={open.punchIn || "Not recorded"} />
                <Row
                  label="Punch out"
                  value={open.punchOut || "Not recorded"}
                />
                <Row
                  label="Total hours"
                  value={
                    open.totalHours ? open.totalHours.toFixed(2) : "0.00"
                  }
                />
                <Row label="Status" value={open.status || "Unknown"} last />
              </Card>
            </>
          )}
        </View>
      </View>
    </Modal>
    </>
  );
}

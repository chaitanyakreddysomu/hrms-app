import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";

import { getAuthSession } from "../../utils/authStorage";
import { apiFetch } from "../../utils/api";
import { setOpenShift } from "../../utils/shiftClock";
import { useShellScroll } from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { useToast } from "../../components/Toast";
import {
  Card,
  IconTile,
  SectionTitle,
  StatTile,
  StatusPill,
  ToneName,
  formatDate,
} from "./ui";

/**
 * ============================================================
 * MY WORKSPACE
 * ============================================================
 *
 * The HR person as an employee: their own punch clock, their own
 * hours, their own leave. Punching uses the HR routes, which land
 * on the same attendance controller the employee side uses.
 */
interface Props {
  name: string;
  onNavigate: (tab: string, page?: string) => void;
}

export default function HrMyHomeScreen({ name, onNavigate }: Props) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);
  const { showToast } = useToast();

  const [today, setToday] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [leaves, setLeaves] = useState<any[]>([]);

  const [refreshing, setRefreshing] = useState(false);
  const [punching, setPunching] = useState(false);

  /** ticks once a second so the worked time counts up on screen */
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const [todayRes, statsRes, leaveRes] = await Promise.all([
        apiFetch("/api/hr/attendance/status", session.token),
        apiFetch("/api/attendance/stats", session.token),
        apiFetch("/api/leaves/my", session.token),
      ]);

      if (todayRes.ok) setToday(await todayRes.json().catch(() => null));
      if (statsRes.ok) setStats(await statsRes.json().catch(() => null));

      if (leaveRes.ok) {
        const data = await leaveRes.json().catch(() => []);
        setLeaves(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("HR my home error:", error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const punchedIn = !!today?.punchIn;
  const punchedOut = !!today?.punchOut;

  useEffect(() => {
    if (!punchedIn || punchedOut) return;

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [punchedIn, punchedOut]);

  /** the punches are wall clock strings on the record's own day */
  const atRecordDay = (stamp?: string | null) => {
    if (!stamp) return null;

    const [h, m, sec] = String(stamp).split(":").map(Number);
    if (Number.isNaN(h)) return null;

    const date = today?.date ? new Date(today.date) : new Date();
    if (Number.isNaN(date.getTime())) return null;

    date.setHours(h, m || 0, sec || 0, 0);

    return date;
  };

  const to12Hour = (stamp?: string | null) => {
    const date = atRecordDay(stamp);
    if (!date) return "--";

    const hours = date.getHours();
    const suffix = hours >= 12 ? "pm" : "am";
    const shown = hours % 12 === 0 ? 12 : hours % 12;

    return (
      `${String(shown).padStart(2, "0")}:` +
      `${String(date.getMinutes()).padStart(2, "0")}:` +
      `${String(date.getSeconds()).padStart(2, "0")} ${suffix}`
    );
  };

  const worked = (() => {
    const start = atRecordDay(today?.punchIn);
    if (!start) return null;

    let end = punchedOut ? atRecordDay(today?.punchOut) : new Date(now);
    if (!end) return null;

    if (punchedOut && end < start) {
      end = new Date(end.getTime() + 86400000);
    }

    const diff = Math.max(0, end.getTime() - start.getTime());

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    return (
      `${String(hours).padStart(2, "0")}:` +
      `${String(minutes).padStart(2, "0")}:` +
      `${String(seconds).padStart(2, "0")}`
    );
  })();

  /**
   * The shell draws a running clock above every page while a day
   * is open, so the shift is published for it here. Driven by the
   * loaded record, so a shift already running when the app opened
   * raises the clock as well as one started by the button.
   */
  useEffect(() => {
    const start = atRecordDay(today?.punchIn);

    setOpenShift(
      punchedIn && !punchedOut && start ? start.getTime() : null
    );
  }, [punchedIn, punchedOut, today?.punchIn, today?.date]);

  /** punching in is recorded against a place, so it is required */
  const readLocation = async (required: boolean) => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        if (required) {
          showToast({
            type: "warning",
            title: "Location Needed",
            message: "Allow location access to punch in.",
          });
        }

        return required ? null : { lat: 0, lng: 0 };
      }

      const enabled = await Location.hasServicesEnabledAsync();

      if (!enabled) {
        if (required) {
          showToast({
            type: "warning",
            title: "Turn On Location",
            message: "Switch location on in your device settings, then retry.",
          });
        }

        return required ? null : { lat: 0, lng: 0 };
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
    } catch (error) {
      console.error("Location error:", error);

      if (required) {
        showToast({
          type: "error",
          title: "Location Failed",
          message: "Could not read your position. Please try again.",
        });
      }

      return required ? null : { lat: 0, lng: 0 };
    }
  };

  const punch = async () => {
    if (punching || punchedOut) return;

    setPunching(true);

    try {
      const location = await readLocation(!punchedIn);
      if (!location) return;

      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        punchedIn ? "/api/hr/punch-out" : "/api/hr/punch-in",
        session.token,
        {
          method: punchedIn ? "PATCH" : "POST",
          body: JSON.stringify({ location }),
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        showToast({
          type: "error",
          title: punchedIn ? "Punch Out Failed" : "Punch In Failed",
          message: data?.message || "The server did not accept that.",
        });

        return;
      }

      showToast({
        type: "success",
        title: punchedIn ? "Punched Out" : "Punched In",
        message: punchedIn
          ? "Your day has been closed."
          : "Have a good day at work.",
      });

      load();
    } catch (error) {
      console.error("Punch error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setPunching(false);
    }
  };

  const pendingLeaves = leaves.filter((l) => l.status === "Pending").length;

  const shortcuts: {
    icon: keyof typeof Ionicons.glyphMap;
    tone: ToneName;
    label: string;
    hint: string;
    tab: string;
    page?: string;
  }[] = [
    {
      icon: "airplane-outline",
      tone: "blue",
      label: "Apply for leave",
      hint: "Submit a new request",
      tab: "myleaves",
    },
    {
      icon: "receipt-outline",
      tone: "green",
      label: "My payslips",
      hint: "Monthly salary breakdown",
      tab: "more",
      page: "mypayslips",
    },
    {
      icon: "folder-open-outline",
      tone: "amber",
      label: "My documents",
      hint: "Upload what is missing",
      tab: "more",
      page: "mydocuments",
    },
    {
      icon: "chatbubble-ellipses-outline",
      tone: "purple",
      label: "My complaints",
      hint: "Raise something yourself",
      tab: "more",
      page: "mycomplaints",
    },
  ];

  return (
    <ScrollView
      {...shellScroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        padding: 16,
        /** clears the bar, then 14 of air before the first card */
        paddingTop: shellTop + 14,
        paddingBottom: 150,
      }}
      refreshControl={
        <RefreshControl
          progressViewOffset={shellTop}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor="#2563EB"
        />
      }
    >
      {/* TODAY */}

      <View
        style={{
          borderRadius: 28,
          backgroundColor: "#2563EB",
          padding: 20,
          marginBottom: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                color: "#BFDBFE",
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 1.1,
                textTransform: "uppercase",
              }}
            >
              {new Date().toLocaleDateString("en-GB", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}
            </Text>

            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 22,
                fontWeight: "800",
                marginTop: 6,
              }}
            >
              Hello {name.split(" ")[0]}
            </Text>
          </View>

          {!!worked && (
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={{
                  color: "#BFDBFE",
                  fontSize: 10,
                  fontWeight: "800",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                {punchedOut ? "Total" : "Working"}
              </Text>

              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 22,
                  fontWeight: "800",
                  marginTop: 2,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {worked}
              </Text>
            </View>
          )}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 18,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{ color: "#BFDBFE", fontSize: 11, fontWeight: "700" }}
            >
              In {to12Hour(today?.punchIn)}   Out {to12Hour(today?.punchOut)}
            </Text>

            <Text
              style={{
                color: "#FFFFFF",
                fontSize: 13,
                fontWeight: "700",
                marginTop: 4,
              }}
            >
              {punchedOut
                ? "Day complete"
                : punchedIn
                ? "You are punched in"
                : "Not punched in yet"}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={punch}
            disabled={punching || punchedOut}
            style={{
              height: 44,
              paddingHorizontal: 20,
              borderRadius: 22,
              backgroundColor: punchedOut
                ? "rgba(255,255,255,0.25)"
                : "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: punchedOut ? "#FFFFFF" : "#2563EB",
                fontSize: 13,
                fontWeight: "800",
              }}
            >
              {punchedOut
                ? "Done"
                : punching
                ? "Please wait"
                : punchedIn
                ? "Punch out"
                : "Punch in"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* MONTH */}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatTile
          icon="time-outline"
          label="Hours today"
          value={stats ? `${stats.today ?? 0} h` : "0 h"}
          tone="green"
        />

        <StatTile
          icon="hourglass-outline"
          label="Leaves pending"
          value={String(pendingLeaves)}
          tone="amber"
        />

        <StatTile
          icon="calendar-outline"
          label="Hours this month"
          value={stats ? `${stats.month ?? 0} h` : "0 h"}
          tone="blue"
        />
      </View>

      {/* SHORTCUTS */}

      <SectionTitle>Quick actions</SectionTitle>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        {shortcuts.map((item) => (
          <TouchableOpacity
            key={item.label}
            activeOpacity={0.85}
            onPress={() => onNavigate(item.tab, item.page)}
            style={{
              width: "48.5%",
              backgroundColor: "#FFFFFF",
              borderRadius: 24,
              borderWidth: 1,
              borderColor: "#EEF2F7",
              padding: 16,
              marginBottom: 12,
            }}
          >
            <IconTile icon={item.icon} tone={item.tone} />

            <Text
              style={{
                color: "#0F172A",
                fontSize: 13,
                fontWeight: "800",
                marginTop: 12,
              }}
              numberOfLines={1}
            >
              {item.label}
            </Text>

            <Text
              style={{
                color: "#94A3B8",
                fontSize: 11,
                fontWeight: "600",
                marginTop: 3,
              }}
              numberOfLines={2}
            >
              {item.hint}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* RECENT LEAVE */}

      {leaves.length > 0 && (
        <>
          <SectionTitle
            action="See all"
            onAction={() => onNavigate("myleaves")}
          >
            My recent leave
          </SectionTitle>

          {leaves.slice(0, 3).map((leave) => (
            <Card key={leave._id}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <IconTile
                  icon="calendar-outline"
                  tone={
                    leave.status === "Approved"
                      ? "green"
                      : leave.status === "Rejected"
                      ? "red"
                      : "amber"
                  }
                  size={38}
                />

                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text
                    style={{
                      color: "#0F172A",
                      fontSize: 13,
                      fontWeight: "800",
                    }}
                  >
                    {leave.type} leave
                  </Text>

                  <Text
                    style={{
                      color: "#94A3B8",
                      fontSize: 11,
                      fontWeight: "600",
                      marginTop: 2,
                    }}
                  >
                    {formatDate(leave.startDate)}
                  </Text>
                </View>

                <StatusPill status={leave.status} />
              </View>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

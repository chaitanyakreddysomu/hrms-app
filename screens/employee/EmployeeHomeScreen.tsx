import React, { useCallback, useEffect, useState } from "react";
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import UpdateSheet from "../../components/UpdateSheet";

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
  StatusPill,
  formatDate,
  formatMoney
} from "./ui";


/**
 * ============================================================
 * EMPLOYEE HOME
 * ============================================================
 *
 * The landing page: today's attendance, service shortcuts, and
 * recent leave activity.
 */
interface Props {
  name: string;
  onNavigate: (tab: string, page?: string) => void;
  profileImage?: string;
  unread?: number;
}

interface Holiday {
  _id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
}

interface Payslip {
  _id: string;
  empId: string;
  month: string;
  year: number;
  netPay: number;
  status: "Draft" | "Created" | "Paid";
  generatedOn?: string;
  profileImage?: string;
  avatar?: string;
}
export default function EmployeeHomeScreen({
  name,
  onNavigate,
  profileImage,
  unread = 0,
}: Props) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16, true);
  const { showToast } = useToast();

  const [today, setToday] = useState<any>(null);
  // const [leaves, setLeaves] = useState<any[]>([]);
  const [updateSheetOpen, setUpdateSheetOpen] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [punching, setPunching] = useState(false);

  /** ticks once a second so the worked time counts up on screen */
  const [now, setNow] = useState(Date.now());

  const [upcomingHoliday, setUpcomingHoliday] = useState<Holiday | null>(
  null
);

const [latestPayslip, setLatestPayslip] = useState<Payslip | null>(
  null
);


const load = useCallback(async () => {
  try {
    const session = await getAuthSession();

    if (!session?.token) return;

    const currentYear = new Date().getFullYear();

    const [todayRes, holidaysRes, payslipsRes] = await Promise.all([
      apiFetch("/api/attendance/today", session.token),

      apiFetch(
        "/api/employee/holidays",
        session.token
      ),

      apiFetch(
        `/api/employee/payslips?year=${currentYear}`,
        session.token
      ),
    ]);

    // ============================================================
    // TODAY'S ATTENDANCE
    // ============================================================

    if (todayRes.ok) {
      const data = await todayRes.json().catch(() => null);
      setToday(data);
    }

    // ============================================================
    // UPCOMING HOLIDAY
    // ============================================================

    if (holidaysRes.ok) {
      const data = await holidaysRes.json().catch(() => []);

      if (Array.isArray(data)) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcoming = data
          .filter((holiday: Holiday) => {
            const endDate = new Date(
              holiday.endDate || holiday.startDate
            );

            endDate.setHours(0, 0, 0, 0);

            return endDate.getTime() >= today.getTime();
          })
          .sort(
            (a: Holiday, b: Holiday) =>
              new Date(a.startDate).getTime() -
              new Date(b.startDate).getTime()
          );

        setUpcomingHoliday(upcoming[0] || null);
      } else {
        setUpcomingHoliday(null);
      }
    }

    // ============================================================
    // LATEST PAYSLIP
    // ============================================================

    if (payslipsRes.ok) {
      const data = await payslipsRes.json().catch(() => []);

      if (Array.isArray(data) && data.length > 0) {
        // Backend returns newest payslip first
        // because it uses .sort({ generatedOn: -1 })
        setLatestPayslip(data[0]);
      } else {
        setLatestPayslip(null);
      }
    }
  } catch (error) {
    console.error("Employee home load error:", error);

    showToast({
      type: "error",
      title: "Network Problem",
      message: "Could not reach the server.",
    });
  } finally {
    setRefreshing(false);
  }
}, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  /** the record names them punchIn and punchOut */
  const punchedIn = !!today?.punchIn;
  const punchedOut = !!today?.punchOut;

  /** only run the timer while the day is actually open */
  useEffect(() => {
    if (!punchedIn || punchedOut) return;

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [punchedIn, punchedOut]);

  /**
   * The record keeps the punches as local wall clock strings, so
   * they are read back onto the day the record belongs to, not
   * onto today. A shift left open overnight then keeps counting
   * past 24 hours instead of going negative after midnight.
   */
  const atRecordDay = (stamp?: string | null) => {
    if (!stamp) return null;

    const [h, m, sec] = String(stamp).split(":").map(Number);
    if (Number.isNaN(h)) return null;

    const date = today?.date ? new Date(today.date) : new Date();
    if (Number.isNaN(date.getTime())) return null;

    date.setHours(h, m || 0, sec || 0, 0);

    return date;
  };

  /** 14:05:09 reads as 02:05:09 pm */
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

  /**
   * Counts up from the punch in second while the day is open, and
   * freezes at the gap between the two punches once it is closed.
   */
  const worked = (() => {
    const start = atRecordDay(today?.punchIn);
    if (!start) return null;

    let end = punchedOut ? atRecordDay(today?.punchOut) : new Date(now);
    if (!end) return null;

    /** a punch out earlier than the punch in landed after midnight */
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
   * is open, so the shift is published for it here.
   *
   * Driven by the loaded record rather than by the punch button:
   * a shift that was already running when the app opened has to
   * raise the clock too, and only the record knows about that.
   */
  useEffect(() => {
    const start = atRecordDay(today?.punchIn);

    setOpenShift(
      punchedIn && !punchedOut && start ? start.getTime() : null
    );
  }, [punchedIn, punchedOut, today?.punchIn, today?.date]);

  /**
   * Punching in is recorded against a place, so the coordinates
   * are taken fresh each time. Punching out reuses whatever was
   * last read, and falls back to zeroes, matching the web page.
   */
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

      /** the switch itself may still be off at the OS level */
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

      /** no coordinates means no punch in */
      if (!location) return;

      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        punchedIn ? "/api/attendance/punch-out" : "/api/attendance/punch-in",
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

  const shortcuts: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    page: string;
  }[] = [
    {
      icon: "sunny-outline",
      label: "Holidays",
      page: "holidays",
    },
    {
      icon: "receipt-outline",
      label: "Payslips",
      page: "payslips",
    },
    {
      icon: "people-outline",
      label: "Referrals",
      page: "referrals",
    },
    {
      icon: "chatbubble-ellipses-outline",
      label: "Complaints",
      page: "complaints",
    },
  ];

  return (
    <ScrollView
      {...shellScroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        padding: 16,
        backgroundColor: "#FAF9F7",
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
      {/* GREETING */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
        <View
  style={{
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    overflow: "hidden",
  }}
>
  {profileImage ? (
    <Image
      source={{ uri: profileImage }}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
      }}
    />
  ) : (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#DBEAFE",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="person" size={20} color="#2563EB" />
    </View>
  )}
</View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: "#8A8D98", fontSize: 13, fontWeight: "600" }}>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}</Text>
          <Text style={{ color: "#171A24", fontSize: 22, fontWeight: "800", marginTop: 1 }}>Hello, {name.split(" ")[0]}</Text>
        </View>
        <TouchableOpacity onPress={() => onNavigate("home", "notifications")} activeOpacity={0.75} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#F0EFED" }}>
          <Ionicons name="notifications-outline" size={20} color="#202331" />
          {unread > 0 ? (
            <View style={{ position: "absolute", top: 1, right: 1, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "800" }}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* TODAY */}

      <View
        style={{
          borderRadius: 22,
          marginBottom: 18,
          shadowColor: "#0B3FAF",
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.34,
          shadowRadius: 24,
          elevation: 18,
        }}
      >
      <LinearGradient
        colors={["#1765E8", "#2F7BF0", "#1254C8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 22,
          overflow: "hidden",
          padding: 20,
          minHeight: 206,
          justifyContent: "space-between",
        }}
      >
        <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, overflow: "hidden" }}>
          <View style={{ position: "absolute", width: 240, height: 240, borderRadius: 120, top: -132, right: -72, backgroundColor: "rgba(255,255,255,0.09)" }} />
          <View style={{ position: "absolute", width: 174, height: 174, borderRadius: 87, top: -74, right: -10, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }} />
          <View style={{ position: "absolute", width: 280, height: 88, borderRadius: 44, top: 118, right: -104, transform: [{ rotate: "-28deg" }], backgroundColor: "rgba(255,255,255,0.07)" }} />
          <View style={{ position: "absolute", width: 152, height: 152, borderRadius: 76, bottom: -106, left: -42, backgroundColor: "rgba(8,47,130,0.12)" }} />
        </View>
        {/* the date on the left, the clock on the right */}
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
                color: "#DBEAFE",
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
              {punchedOut ? "Your workday is complete" : punchedIn ? "Your shift is in progress" : "Your day at a glance"}
            </Text>
          </View>

          {!!worked && (
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={{
                  color: "#DBEAFE",
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
              style={{
                color: "#DBEAFE",
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              In {to12Hour(today?.punchIn)}   Out{" "}
              {to12Hour(today?.punchOut)}
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
                : "Ready when you are"}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={punch}
            disabled={punching || punchedOut}
            style={{
              height: 44,
              paddingHorizontal: 20,
              borderRadius: 14,
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
      </LinearGradient>
      </View>

      {/* <SectionTitle>Your services</SectionTitle> */}
      <View
  style={{
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: 8,
  }}
>
  {shortcuts.map((item) => (
    <TouchableOpacity
      key={item.label}
      activeOpacity={0.75}
      onPress={() => onNavigate("documents", item.page)}
      style={{
        width: "24%",
        alignItems: "center",
        paddingVertical: 10,
        backgroundColor: "#FFFFFF",
        borderRadius: 14,

        // Small shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          backgroundColor: "#FFFFFF",
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={item.icon}
          size={21}
          color="#2563EB"
        />
      </View>

      <Text
        style={{
          color: "#334155",
          fontSize: 10,
          fontWeight: "700",
          marginTop: 6,
        }}
        numberOfLines={1}
      >
        {item.label}
      </Text>
    </TouchableOpacity>
  ))}
</View>

{/* ============================================================
    UPCOMING HOLIDAY
============================================================ */}

<SectionTitle>Upcoming Holiday</SectionTitle>

{upcomingHoliday ? (
  <Card
    onPress={() => onNavigate("documents", "holidays")}
    style={{
      marginBottom: 14,
      backgroundColor: "#FFFFFF",
    }}
  >
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <IconTile
        icon="sunny-outline"
        tone="blue"
        size={42}
      />

      <View
        style={{
          flex: 1,
          marginLeft: 14,
        }}
      >
        <Text
          style={{
            color: "#0F172A",
            fontSize: 14,
            fontWeight: "800",
          }}
          numberOfLines={1}
        >
          {upcomingHoliday.name}
        </Text>

        <Text
          style={{
            color: "#94A3B8",
            fontSize: 11,
            fontWeight: "600",
            marginTop: 3,
          }}
        >
          {formatDate(upcomingHoliday.startDate)}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={17}
        color="#CBD5E1"
      />
    </View>
  </Card>
) : (
  <Card
    style={{
      marginBottom: 14,
    }}
  >
    <Text
      style={{
        color: "#94A3B8",
        fontSize: 12,
        fontWeight: "600",
        textAlign: "center",
        paddingVertical: 4,
      }}
    >
      No upcoming holidays
    </Text>
  </Card>
)}
     {/* ============================================================
    LATEST PAYSLIP
============================================================ */}

<SectionTitle>Latest Payslip</SectionTitle>

{latestPayslip ? (
  <Card
    onPress={() => onNavigate("documents", "payslips")}
  >
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <IconTile
        icon="receipt-outline"
        tone="green"
        size={42}
      />

      <View
        style={{
          flex: 1,
          marginLeft: 14,
        }}
      >
        <Text
          style={{
            color: "#0F172A",
            fontSize: 14,
            fontWeight: "800",
          }}
        >
          {latestPayslip.month} {latestPayslip.year}
        </Text>

        <Text
          style={{
            color: "#94A3B8",
            fontSize: 11,
            fontWeight: "600",
            marginTop: 3,
          }}
        >
          Net {formatMoney(latestPayslip.netPay)}
        </Text>
      </View>

      <View
        style={{
          alignItems: "flex-end",
        }}
      >
        <StatusPill status={latestPayslip.status} />

        <Ionicons
          name="chevron-forward"
          size={17}
          color="#CBD5E1"
          style={{
            marginTop: 7,
          }}
        />
      </View>
    </View>
  </Card>
) : (
  <Card>
    <Text
      style={{
        color: "#94A3B8",
        fontSize: 12,
        fontWeight: "600",
        textAlign: "center",
        paddingVertical: 4,
      }}
    >
      No payslip available
    </Text>
  </Card>
)}

      <TouchableOpacity activeOpacity={0.85} onPress={() => setUpdateSheetOpen(true)} style={{ minHeight: 54, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE7F8", flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 8, marginBottom: 20 }}>
        <Ionicons name="cloud-download-outline" size={19} color="#2563EB" />
        <Text style={{ color: "#2563EB", fontSize: 14, fontWeight: "700", marginLeft: 9 }}>Check for updates</Text>
      </TouchableOpacity>
      <UpdateSheet visible={updateSheetOpen} onClose={() => setUpdateSheetOpen(false)} />
    </ScrollView>
  );
}

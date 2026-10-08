import React, { useCallback, useEffect, useState } from "react";
import {
  Animated,
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
import EmployeePayslipsScreen, { type Payslip } from "./EmployeePayslipsScreen";
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
  attendancePath?: string;
  holidaysPath?: string;
  payslipsPath?: string;
  payslipProfilePath?: string;
  punchInPath?: string;
  punchOutPath?: string;
  switchLabel?: string;
  onSwitchView?: () => void;
  notificationsTab?: string;
  shortcutIconSize?: number;
}

interface Holiday {
  _id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
}

interface EmployeeHomeCacheEntry {
  today: any;
  upcomingHoliday: Holiday | null;
  latestPayslip: Payslip | null;
  cachedAt: number;
}

const HOME_CACHE_TTL_MS = 2 * 60 * 1000;
const employeeHomeCache = new Map<string, EmployeeHomeCacheEntry>();

export default function EmployeeHomeScreen({
  name,
  onNavigate,
  profileImage,
  unread = 0,
  attendancePath = "/api/attendance/today",
  holidaysPath = "/api/employee/holidays",
  payslipsPath = "/api/employee/payslips",
  payslipProfilePath = "/api/employee/profile",
  punchInPath = "/api/attendance/punch-in",
  punchOutPath = "/api/attendance/punch-out",
  switchLabel,
  onSwitchView,
  notificationsTab = "home",
  shortcutIconSize = 25,
}: Props) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(8, true);
  const { showToast } = useToast();
  const cacheKey = `${attendancePath}|${holidaysPath}|${payslipsPath}`;
  const cachedHome = employeeHomeCache.get(cacheKey);
  const [employeeDob, setEmployeeDob] = useState<string | null>(null);
  const [today, setToday] = useState<any>(cachedHome?.today ?? null);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  // const [leaves, setLeaves] = useState<any[]>([]);
  const [updateSheetOpen, setUpdateSheetOpen] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [punching, setPunching] = useState(false);
  const [showPunchCelebration, setShowPunchCelebration] = useState(false);
  /** ticks once a second so the worked time counts up on screen */
  const [now, setNow] = useState(Date.now());

  const [upcomingHoliday, setUpcomingHoliday] = useState<Holiday | null>(
    cachedHome?.upcomingHoliday ?? null
  );

const [latestPayslip, setLatestPayslip] = useState<Payslip | null>(
  cachedHome?.latestPayslip ?? null
);

// const birthdayToday = isBirthdayToday(employeeDob);


const punchedIn = !!today?.punchIn;
const punchedOut = !!today?.punchOut;

const isBirthdayToday = (() => {
  if (!employeeDob) return false;

  const todayDate = new Date();
  const dob = new Date(employeeDob);

  if (Number.isNaN(dob.getTime())) return false;

  return (
    todayDate.getDate() === dob.getDate() &&
    todayDate.getMonth() === dob.getMonth()
  );
})();


const showBirthdayCard = isBirthdayToday && !punchedOut;

const celebrationItems: {
  emoji: string;
  left: `${number}%`;
  delay: number;
  duration: number;
  size: number;
}[] = [
  { emoji: "🎊", left: "5%", delay: 0, duration: 2400, size: 28 },
  { emoji: "🎉", left: "15%", delay: 180, duration: 2700, size: 26 },
  { emoji: "🎊", left: "27%", delay: 350, duration: 2300, size: 30 },
  { emoji: "🎉", left: "39%", delay: 100, duration: 2800, size: 27 },
  { emoji: "🎊", left: "51%", delay: 450, duration: 2500, size: 29 },
  { emoji: "🎉", left: "63%", delay: 220, duration: 2700, size: 26 },
  { emoji: "🎊", left: "75%", delay: 500, duration: 2400, size: 30 },
  { emoji: "🎉", left: "87%", delay: 300, duration: 2600, size: 27 },
  { emoji: "🎊", left: "10%", delay: 700, duration: 2800, size: 24 },
  { emoji: "🎉", left: "33%", delay: 600, duration: 2500, size: 25 },
  { emoji: "🎊", left: "58%", delay: 800, duration: 2700, size: 24 },
  { emoji: "🎉", left: "80%", delay: 650, duration: 2600, size: 25 },
];

const Celebration = () => {
  const animations = React.useRef(
    celebrationItems.map(() => new Animated.Value(-70))
  ).current;

  useEffect(() => {
    if (!showPunchCelebration) {
      // Immediately stop everything
      animations.forEach((animation) => {
        animation.stopAnimation();
        animation.setValue(-70);
      });
      return;
    }

    // Reset all animations before starting
    animations.forEach((animation) => {
      animation.stopAnimation();
      animation.setValue(-70);
    });

    const animationRefs: Animated.CompositeAnimation[] = [];

    celebrationItems.forEach((item, index) => {
      const animation = Animated.sequence([
        Animated.delay(item.delay),
        Animated.timing(animations[index], {
          toValue: 500,
          duration: 1800,
          useNativeDriver: true,
        }),
      ]);

      animationRefs.push(animation);
      animation.start();
    });

    // Stop celebration completely after 2.5 seconds
    const timer = setTimeout(() => {
      animationRefs.forEach((animation) => {
        animation.stop();
      });

      animations.forEach((animation) => {
        animation.stopAnimation();
        animation.setValue(-70);
      });

      setShowPunchCelebration(false);
    }, 2500);

    return () => {
      clearTimeout(timer);

      animationRefs.forEach((animation) => {
        animation.stop();
      });

      animations.forEach((animation) => {
        animation.stopAnimation();
        animation.setValue(-70);
      });
    };
  }, [showPunchCelebration]);

  if (!showPunchCelebration) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        elevation: 9999,
        overflow: "hidden",
      }}
    >
      {celebrationItems.map((item, index) => (
        <Animated.Text
          key={`${item.emoji}-${index}`}
          style={{
            position: "absolute",
            left: item.left,
            top: 0,
            fontSize: item.size,
            transform: [
              { translateY: animations[index] },
              {
                rotate: index % 2 === 0 ? "18deg" : "-18deg",
              },
            ],
          }}
        >
          {item.emoji}
        </Animated.Text>
      ))}
    </View>
  );
};

const load = useCallback(async (force = false) => {
  const cached = employeeHomeCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.cachedAt < HOME_CACHE_TTL_MS) {
    setToday(cached.today);
    setUpcomingHoliday(cached.upcomingHoliday);
    setLatestPayslip(cached.latestPayslip);
    setRefreshing(false);
    return;
  }


  try {
    const session = await getAuthSession();

    if (!session?.token) return;

    let nextToday = cached?.today ?? null;
    let nextUpcomingHoliday = cached?.upcomingHoliday ?? null;
    let nextLatestPayslip = cached?.latestPayslip ?? null;

    const currentYear = new Date().getFullYear();

  const [todayRes, holidaysRes, payslipsRes, profileRes] =
  await Promise.all([
    apiFetch(attendancePath, session.token),
    apiFetch(holidaysPath, session.token),
    apiFetch(`${payslipsPath}?year=${currentYear}`, session.token),
    apiFetch(payslipProfilePath, session.token),
  ]);

    // ============================================================
    // TODAY'S ATTENDANCE
    // ============================================================

    if (todayRes.ok) {
      const data = await todayRes.json().catch(() => null);
      nextToday = data;
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

        nextUpcomingHoliday = upcoming[0] || null;
        setUpcomingHoliday(nextUpcomingHoliday);
      } else {
        nextUpcomingHoliday = null;
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
        nextLatestPayslip = data[0];
        setLatestPayslip(nextLatestPayslip);
      } else {
        nextLatestPayslip = null;
        setLatestPayslip(null);
      }
    }

    if (todayRes.ok && holidaysRes.ok && payslipsRes.ok) {
      employeeHomeCache.set(cacheKey, {
        today: nextToday,
        upcomingHoliday: nextUpcomingHoliday,
        latestPayslip: nextLatestPayslip,
        cachedAt: Date.now(),
      });
    }

    if (profileRes.ok) {
  const profileData = await profileRes.json().catch(() => null);

  setEmployeeDob(profileData?.dob || profileData?.employee?.dob || null);
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
}, [attendancePath, cacheKey, holidaysPath, payslipsPath, showToast]);

  useEffect(() => {
    load();
  }, [load]);



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
      const location = punchedIn
      ? { lat: 0, lng: 0 }
      : await readLocation(true);

      /** no coordinates means no punch in */
      if (!location) return;

      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        punchedIn ? punchOutPath : punchInPath,
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

// 🎉 Birthday celebration only after Punch In
if (!punchedIn && isBirthdayToday) {
  setShowPunchCelebration(true);
}

// Refresh attendance immediately after successful punch
await load(true);



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
    <View style={{ flex: 1 }}>
    <Celebration />
    <ScrollView
      {...shellScroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        padding: 16,
        backgroundColor: "#FAF9F7",
        /** begins just below the system status bar */
        paddingTop: shellTop + 4,
        paddingBottom: 150,
      }}
      refreshControl={
        <RefreshControl
          progressViewOffset={shellTop}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load(true);
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
          <Text style={{ color: "#171A24", fontSize: 22, fontWeight: "800", marginTop: 1 }} numberOfLines={1}>Hello, {name}</Text>
        </View>
        <TouchableOpacity onPress={() => onNavigate(notificationsTab, "notifications")} activeOpacity={0.75} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#F0EFED" }}>
          <Ionicons name="notifications-outline" size={20} color="#202331" />
          {unread > 0 ? (
            <View style={{ position: "absolute", top: 1, right: 1, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "800" }}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {switchLabel && onSwitchView && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onSwitchView}
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 18,
            backgroundColor: "#EFF6FF",
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginTop: -8,
            marginBottom: 14,
          }}
        >
          <Ionicons name="swap-horizontal-outline" size={16} color="#2563EB" />
          <Text style={{ color: "#2563EB", fontSize: 11, fontWeight: "800", marginLeft: 6 }}>
            {switchLabel}
          </Text>
        </TouchableOpacity>
      )}

      {/* TODAY */}

<View
  style={{
    borderRadius: 22,
    marginBottom: 18,
    shadowColor: "#000000",
    shadowOffset: { width: 16, height: 100 },
    shadowOpacity: 0.25,
    shadowRadius: 50,
    elevation: 25,
  }}
>
  <LinearGradient
    colors={
      showBirthdayCard
          ? ["#FFB703", "#FB8500", "#FF006E"]
        : ["#005eff", "#4e8dec", "#0a3d93"]
    }
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={{
      borderRadius: 22,
      overflow: "hidden",
      paddingTop: 0,
      paddingHorizontal: 20,
      paddingBottom: 20,
      minHeight: 175,
      justifyContent: "space-between",
    }}
  >
    {/* Decorative background */}
    <View
      pointerEvents="none"
      style={{
        ...StyleSheet.absoluteFillObject,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          position: "absolute",
          width: 240,
          height: 240,
          borderRadius: 120,
          top: -132,
          right: -72,
          backgroundColor: "rgba(255,255,255,0.09)",
        }}
      />

      <View
        style={{
          position: "absolute",
          width: 174,
          height: 174,
          borderRadius: 87,
          top: -74,
          right: -10,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.18)",
        }}
      />

      <View
        style={{
          position: "absolute",
          width: 280,
          height: 88,
          borderRadius: 44,
          top: 118,
          right: -104,
          transform: [{ rotate: "-28deg" }],
          backgroundColor: "rgba(255,255,255,0.07)",
        }}
      />

      <View
        style={{
          position: "absolute",
          width: 152,
          height: 152,
          borderRadius: 76,
          bottom: -106,
          left: -42,
          backgroundColor: showBirthdayCard
            ? "rgba(120,53,15,0.10)"
            : "rgba(8,47,130,0.12)",
        }}
      />
    </View>

    {/* DATE + TITLE */}
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
      }}
    >
      <View
        style={{
          flex: 1,
          paddingRight: 12,
        }}
      >
        {/* Date */}
        <Text
          style={{
            color: showBirthdayCard ? "#FFF7ED" : "#DBEAFE",
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

        {/* Main title */}
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 22,
            fontWeight: "800",
            marginTop: 6,
          }}
        >
          {showBirthdayCard
            ? "Happy Birthday"
            : punchedOut
            ? "Your workday is complete"
            : punchedIn
            ? "Your shift is in progress"
            : "Your day at a glance"}
        </Text>
      </View>

      {/* WORKING / TOTAL TIME */}
      {!!worked && (
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              color: showBirthdayCard ? "#FFF7ED" : "#DBEAFE",
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

    {/* BOTTOM */}
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginTop: 18,
      }}
    >
      <View
        style={{
          flex: 1,
          paddingRight: 12,
        }}
      >
        {/* Punch In / Punch Out time */}
        <Text
          style={{
            color: showBirthdayCard ? "#FFF7ED" : "#DBEAFE",
            fontSize: 11,
            fontWeight: "700",
          }}
        >
          {`In ${to12Hour(today?.punchIn)}   Out ${to12Hour(
            today?.punchOut
          )}`}
        </Text>

        {/* Status */}
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
            : "Have a good day at work."}
        </Text>
      </View>

      {/* Punch button */}
      {!punchedOut && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={punch}
          disabled={punching}
          style={{
            height: 44,
            paddingHorizontal: 20,
            borderRadius: 14,
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: showBirthdayCard ? "#DB2777" : "#2563EB",
              fontSize: 13,
              fontWeight: "800",
            }}
          >
            {punching
              ? "Please wait"
              : punchedIn
              ? "Punch out"
              : "Punch in"}
          </Text>
        </TouchableOpacity>
      )}
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
    }}
  >
    {/* Small white icon box */}
    <View
      style={{
        width: 60,
        height: 60,
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",

        // Small shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <Ionicons
        name={item.icon}
        size={shortcutIconSize}
        color="#2563EB"
      />
    </View>

    {/* Text outside white box */}
    <Text
      style={{
        color: "#334155",
        fontSize: 11,
        fontWeight: "800",
        marginTop: 7,
        textAlign: "center",
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
  <Card onPress={() => setSelectedPayslip(latestPayslip)}>
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      {/* Left icon */}
      <IconTile
        icon="receipt-outline"
        // tone="green"
        tone={latestPayslip.status === "Paid" ? "green" : "amber"}

        size={42}
      />

      {/* Month + amount */}
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
            color: "#059669",
            fontSize: 14,
            fontWeight: "800",
            marginTop: 0,
          }}
        >
          {formatMoney(latestPayslip.netPay)}
        </Text>
      </View>

      {/* Right status */}
      <View
        style={{
          marginLeft: 8,
        }}
      >
        <StatusPill status={latestPayslip.status} />
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
      <EmployeePayslipsScreen
        modalOnly
        profilePath={payslipProfilePath}
        selectedPayslip={selectedPayslip}
        onClose={() => setSelectedPayslip(null)}
      />

    </ScrollView>
  </View>
  );
}

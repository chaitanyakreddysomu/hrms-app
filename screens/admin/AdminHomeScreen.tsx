import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { apiFetch } from "../../utils/api";
import { getAuthSession } from "../../utils/authStorage";
import { useShellScroll } from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";

interface Props {
  userName: string;
  userRole: string;
  userDesignation?: string;
  profileImage?: string;
  reloadKey?: number;
  onOpenEmployees: () => void;
  onOpenRequests: () => void;
  onOpenAttendance: () => void;
  onOpenComplaints: () => void;
}

interface Slice {
  name: string;
  value: number;
  color: string;
}

interface DashboardData {
  kpi: {
    totalStaff: { value: number; trend: string };
    presentToday: { value: number; trend: string };
    onBench: { value: number; trend: string };
    systemAlerts: { value: number; trend: string };
  };
  charts: {
    attendanceDistribution: Slice[];
    resourceUtilization: Slice[];
  };
  quickActions: {
    pendingApprovals: number;
    alerts: number;
  };
  today: TodayData;
}

interface Birthday {
  id?: string;
  name: string;
  role: string;
  initials: string;
  profileImage?: string | null;
}

interface Holiday {
  id?: string;
  name: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  /** already formatted by the API, e.g. "14 Sep" */
  date: string;
  day: string;
  color: string;
}

interface TodayData {
  onLeave: number;
  workFromHome: number;
  newReferrals: number;
  birthdays: Birthday[];
  holidays: Holiday[];
  /** the signed in admin has a birthday today */
  isYourBirthday: boolean;
}

const EMPTY: DashboardData = {
  kpi: {
    totalStaff: { value: 0, trend: "" },
    presentToday: { value: 0, trend: "" },
    onBench: { value: 0, trend: "" },
    systemAlerts: { value: 0, trend: "" },
  },
  charts: {
    attendanceDistribution: [],
    resourceUtilization: [],
  },
  quickActions: {
    pendingApprovals: 0,
    alerts: 0,
  },
  today: {
    onLeave: 0,
    workFromHome: 0,
    newReferrals: 0,
    birthdays: [],
    holidays: [],
    isYourBirthday: false,
  },
};

export default function AdminHomeScreen({
  userName,
  userRole,
  userDesignation,
  profileImage,
  reloadKey,
  onOpenEmployees,
  onOpenRequests,
  onOpenAttendance,
  onOpenComplaints,
}: Props) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();

  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openHoliday, setOpenHoliday] = useState<Holiday | null>(null);

  /**
   * How many records a list endpoint is reporting.
   *
   * The two lists answer in different shapes: pending requests
   * comes back as a bare array, complaints as a page of rows with
   * a pagination block beside it. A page's `length` is only the
   * size of that page, so a total is taken from the pagination
   * wherever the server sends one and the array is the fallback.
   */
  const countFrom = (payload: any): number => {
    if (Array.isArray(payload)) return payload.length;

    const total =
      payload?.pagination?.total ??
      payload?.pagination?.totalCount ??
      payload?.total;

    if (typeof total === "number") return total;

    if (Array.isArray(payload?.complaints)) return payload.complaints.length;

    return 0;
  };

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();

      if (!session?.token) return;

      /**
       * The counts come from the same endpoints the two screens
       * behind these cards use, rather than from the dashboard's
       * own quickActions block. Tapping a card lands on that list,
       * so the number on the card and the number of rows the list
       * shows are then the same thing by construction.
       *
       * Complaints are counted as Open: the ones still waiting on
       * somebody, which is what an alert count means here.
       *
       * A full page is asked for rather than `limit=1`. Only the
       * total is wanted, but the total is only reliable if the
       * server sends one in its pagination block; where it does
       * not, the count falls back to the rows returned, and with
       * a limit of 1 that fallback would report 1 no matter how
       * many complaints were open.
       */
      const [dashboardRes, approvalsRes, complaintsRes] = await Promise.all([
        apiFetch("/api/admin/dashboard", session.token),
        apiFetch("/api/admin/pending-requests", session.token),
        apiFetch(
          "/api/admin/complaints?page=1&limit=100&status=Open",
          session.token
        ),
      ]);

      if (!dashboardRes.ok) return;

      const result = await dashboardRes.json();

      /**
       * Each count falls back to whatever the dashboard reported
       * if its own call failed, so one endpoint being down leaves
       * the card showing a stale number rather than a wrong zero.
       */
      const fallback = {
        ...EMPTY.quickActions,
        ...(result.quickActions || {}),
      };

      const pendingApprovals = approvalsRes.ok
        ? countFrom(await approvalsRes.json().catch(() => null))
        : fallback.pendingApprovals;

      const alerts = complaintsRes.ok
        ? countFrom(await complaintsRes.json().catch(() => null))
        : fallback.alerts;

      setData({
        ...EMPTY,
        ...result,
        today: { ...EMPTY.today, ...(result.today || {}) },
        quickActions: { pendingApprovals, alerts },
      });
    } catch {
      /* Keep current dashboard data */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, reloadKey]);

  const { kpi, charts, quickActions, today } = data;

  const attendancePercent =
    kpi.totalStaff.value > 0
      ? Math.round(
          (kpi.presentToday.value / kpi.totalStaff.value) * 100
        )
      : 0;

  const attendanceTotal = charts.attendanceDistribution.reduce(
    (sum, slice) => sum + slice.value,
    0
  );

  const resourceTotal = charts.resourceUtilization.reduce(
    (sum, slice) => sum + slice.value,
    0
  );

  const greeting = useMemo(() => {
    const hour = new Date().getHours();

    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";

    /** evening carries through to midnight, never good night */
    return "Good evening";
  }, []);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }, []);

  return (
    <ScrollView
      {...shellScroll}
      style={styles.scroll}
      /** the top padding clears the transparent bar, so it is a
       *  runtime value and cannot live in the StyleSheet */
      contentContainerStyle={[styles.content, { paddingTop: shellTop }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor="#64748B"
          colors={["#64748B"]}
          progressViewOffset={40}
        />
      }
    >
      {/* ===================================================== */}
      {/* YOUR BIRTHDAY */}
      {/* ===================================================== */}

      {today.isYourBirthday && (
        <LinearGradient
          colors={["#FDE68A", "#FBBF24", "#F59E0B"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.birthdayPill}
        >
          <Text style={styles.birthdayPillEmoji}>🎉</Text>
          <Text style={styles.birthdayPillText} numberOfLines={1}>
            Happy birthday, {userName.split(" ")[0]}!
          </Text>
          <Text style={styles.birthdayPillEmoji}>🎂</Text>
        </LinearGradient>
      )}

      {/* ===================================================== */}
      {/* GREETING */}
      {/* ===================================================== */}

      <View style={styles.greeting}>
        <View style={styles.greetingText}>
          <Text style={styles.date}>{todayLabel.toUpperCase()}</Text>

          <Text style={styles.greetingTitle}>
            {greeting},{" "}
            <Text style={styles.greetingName}>
              {userName.split(" ")[0]}
            </Text>
          </Text>

          <Text style={styles.greetingSubtitle}>
            Here&apos;s what&apos;s happening across your organisation today.
          </Text>
        </View>

        {profileImage ? (
          <Image source={{ uri: profileImage }} style={styles.profileImage} />
        ) : (
          <View style={styles.profileFallback}>
            <Text style={styles.profileInitial}>
              {userName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      {/* ===================================================== */}
      {/* TODAY AT A GLANCE */}
      {/* ===================================================== */}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today at a glance</Text>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      <View style={styles.glanceGrid}>
        <GlanceCard
          icon="people-outline"
          label="Total staff"
          value={loading ? "—" : String(kpi.totalStaff.value)}
          color="#64748B"
          background="#F8FAFC"
        />

        <GlanceCard
          icon="checkmark-circle-outline"
          label="Present"
          value={loading ? "—" : String(kpi.presentToday.value)}
          suffix={`${attendancePercent}%`}
          color="#059669"
          background="#F0FDF4"
        />

        <GlanceCard
          icon="home-outline"
          label="Work from home"
          value={String(today.workFromHome)}
          color="#6366F1"
          background="#EEF2FF"
        />

        <GlanceCard
          icon="calendar-outline"
          label="On leave"
          value={String(today.onLeave)}
          color="#F59E0B"
          background="#FFFBEB"
        />
      </View>

      {/* ===================================================== */}
      {/* BIRTHDAYS */}
      {/* ===================================================== */}

      <SectionTitle title="Today&apos;s birthdays" />

      <View style={styles.whiteCard}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Celebrate the team</Text>
            <Text style={styles.cardSubtitle}>
              {today.birthdays.length} birthdays today
            </Text>
          </View>

          <View style={styles.birthdayIcon}>
            <Ionicons name="gift-outline" size={20} color="#EC4899" />
          </View>
        </View>

        <View style={styles.birthdayList}>
          {today.birthdays.length === 0 && (
            <Text style={styles.emptyNote}>
              {loading ? "Checking the calendar…" : "No birthdays today"}
            </Text>
          )}

          {today.birthdays.map((person, index) => (
            <View
              key={person.id || person.name}
              style={[
                styles.birthdayRow,
                index !== today.birthdays.length - 1 &&
                  styles.birthdayBorder,
              ]}
            >
              {person.profileImage ? (
                <Image
                  source={{ uri: person.profileImage }}
                  style={styles.birthdayAvatar}
                />
              ) : (
                <LinearGradient
                  colors={["#FCE7F3", "#FDF2F8"]}
                  style={styles.birthdayAvatar}
                >
                  <Text style={styles.birthdayInitials}>
                    {person.initials}
                  </Text>
                </LinearGradient>
              )}

              <View style={styles.birthdayInfo}>
                <Text style={styles.birthdayName}>{person.name}</Text>
                <Text style={styles.birthdayRole}>{person.role}</Text>
              </View>

              <Text style={styles.birthdayEmoji}>🎂</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ===================================================== */}
      {/* WORKFORCE STATUS */}
      {/* ===================================================== */}

      <SectionTitle title="Workforce status" />

      <View style={styles.statusCard}>
        <StatusRow
          icon="airplane-outline"
          iconColor="#F59E0B"
          iconBackground="#FFFBEB"
          title="On leave"
          subtitle="Employees away today"
          value={today.onLeave}
        />

        <View style={styles.statusDivider} />

        <StatusRow
          icon="home-outline"
          iconColor="#6366F1"
          iconBackground="#EEF2FF"
          title="Work from home"
          subtitle="Remote today"
          value={today.workFromHome}
        />

        <View style={styles.statusDivider} />

        <StatusRow
          icon="person-add-outline"
          iconColor="#0EA5E9"
          iconBackground="#F0F9FF"
          title="New referrals"
          subtitle="Added this week"
          value={today.newReferrals}
        />
      </View>

      {/* ===================================================== */}
      {/* ATTENDANCE */}
      {/* ===================================================== */}

      <SectionTitle title="Attendance overview" />

      <View style={styles.whiteCard}>
        {loading ? (
          <ActivityIndicator
            color="#64748B"
            style={{ marginVertical: 24 }}
          />
        ) : charts.attendanceDistribution.length === 0 ? (
          <Empty label="No attendance recorded yet" />
        ) : (
          <>
            <View style={styles.attendanceTop}>
              <View>
                <Text style={styles.attendancePercent}>
                  {attendancePercent}%
                </Text>
                <Text style={styles.attendanceCaption}>
                  attendance today
                </Text>
              </View>

              <View style={styles.attendanceIcon}>
                <Ionicons
                  name="pulse-outline"
                  size={22}
                  color="#059669"
                />
              </View>
            </View>

            <MeterBar
              slices={charts.attendanceDistribution}
              total={attendanceTotal}
            />

            <View style={styles.legendList}>
              {charts.attendanceDistribution.map((slice) => (
                <LegendRow
                  key={slice.name}
                  slice={slice}
                  total={attendanceTotal}
                />
              ))}
            </View>
          </>
        )}
      </View>

      {/* ===================================================== */}
      {/* UPCOMING HOLIDAYS */}
      {/* ===================================================== */}

      <SectionTitle title="Upcoming holidays" />

      <View style={styles.holidayList}>
        {today.holidays.length === 0 && (
          <Text style={styles.emptyNote}>
            {loading ? "Loading the calendar…" : "No holidays scheduled"}
          </Text>
        )}

        {today.holidays.map((holiday) => (
          <TouchableOpacity
            key={holiday.id || holiday.name}
            activeOpacity={0.75}
            onPress={() => setOpenHoliday(holiday)}
            style={styles.holidayCard}
          >
            <View
              style={[
                styles.holidayDate,
                { backgroundColor: `${holiday.color}12` },
              ]}
            >
              <Text
                style={[
                  styles.holidayDateText,
                  { color: holiday.color },
                ]}
              >
                {holiday.date.split(" ")[0]}
              </Text>
              <Text
                style={[
                  styles.holidayMonth,
                  { color: holiday.color },
                ]}
              >
                {holiday.date.split(" ")[1]}
              </Text>
            </View>

            <View style={styles.holidayInfo}>
              <Text style={styles.holidayName}>{holiday.name}</Text>
              <Text style={styles.holidayDay}>{holiday.day}</Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={18}
              color="#CBD5E1"
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* ===================================================== */}
      {/* RESOURCE UTILISATION */}
      {/* ===================================================== */}

      <SectionTitle title="Resource utilisation" />

      <View style={styles.whiteCard}>
        {loading ? (
          <ActivityIndicator
            color="#64748B"
            style={{ marginVertical: 22 }}
          />
        ) : charts.resourceUtilization.length === 0 ? (
          <Empty label="No allocation data yet" />
        ) : (
          <View style={{ gap: 16 }}>
            {charts.resourceUtilization.map((slice) => (
              <View key={slice.name}>
                <View style={styles.resourceHeader}>
                  <Text style={styles.resourceName}>
                    {slice.name}
                  </Text>

                  <Text style={styles.resourceValue}>
                    {slice.value}
                    <Text style={styles.resourcePercent}>
                      {resourceTotal > 0
                        ? `  ${Math.round(
                            (slice.value / resourceTotal) * 100
                          )}%`
                        : ""}
                    </Text>
                  </Text>
                </View>

                <Track
                  ratio={
                    resourceTotal > 0
                      ? slice.value / resourceTotal
                      : 0
                  }
                  color={slice.color || "#64748B"}
                />
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ===================================================== */}
      {/* QUICK ACTIONS */}
      {/* ===================================================== */}

      <SectionTitle title="Quick actions" />

      <View style={styles.actionGrid}>
        <ActionCard
          icon="people-outline"
          title="Employees"
          subtitle="Directory & roles"
          color="#2563EB"
          onPress={onOpenEmployees}
        />

        <ActionCard
          icon="checkmark-circle-outline"
          title="Approvals"
          subtitle={`${quickActions.pendingApprovals} pending`}
          color="#059669"
          badge={quickActions.pendingApprovals}
          onPress={onOpenRequests}
        />

        <ActionCard
          icon="calendar-outline"
          title="Attendance"
          subtitle="Punch records"
          color="#7C3AED"
          onPress={onOpenAttendance}
        />

        <ActionCard
          icon="alert-circle-outline"
          title="Complaints"
          subtitle={`${quickActions.alerts} alerts`}
          color="#DC2626"
          badge={quickActions.alerts}
          onPress={onOpenComplaints}
        />
      </View>

      {/* ===================================================== */}
      {/* FOOTER */}
      {/* ===================================================== */}

      <View style={styles.footer}>
        <View style={styles.footerDot} />
        <Text style={styles.footerText}>
          {userDesignation || userRole} · Admin workspace
        </Text>
      </View>
      {/* ===================================================== */}
      {/* HOLIDAY DETAIL */}
      {/* ===================================================== */}

      <Modal
        visible={!!openHoliday}
        transparent
        animationType="slide"
        onRequestClose={() => setOpenHoliday(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setOpenHoliday(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalGrabber} />

            {!!openHoliday && (
              <>
                <View
                  style={[
                    styles.modalBadge,
                    { backgroundColor: `${openHoliday.color}14` },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalBadgeDay,
                      { color: openHoliday.color },
                    ]}
                  >
                    {openHoliday.date.split(" ")[0]}
                  </Text>
                  <Text
                    style={[
                      styles.modalBadgeMonth,
                      { color: openHoliday.color },
                    ]}
                  >
                    {openHoliday.date.split(" ")[1]}
                  </Text>
                </View>

                <Text style={styles.modalTitle}>{openHoliday.name}</Text>
                <Text style={styles.modalSubtitle}>{openHoliday.day}</Text>

                <View style={styles.modalRows}>
                  <ModalRow
                    icon="pricetag-outline"
                    label="Type"
                    value={openHoliday.type || "Holiday"}
                  />
                  <ModalRow
                    icon="calendar-outline"
                    label="Starts"
                    value={formatFullDate(openHoliday.startDate)}
                  />
                  <ModalRow
                    icon="calendar-clear-outline"
                    label="Ends"
                    value={formatFullDate(
                      openHoliday.endDate || openHoliday.startDate
                    )}
                  />
                  <ModalRow
                    icon="time-outline"
                    label="Duration"
                    value={holidayLength(openHoliday)}
                  />
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setOpenHoliday(null)}
                  style={styles.modalClose}
                >
                  <Text style={styles.modalCloseText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

/* ============================================================ */
/* COMPONENTS */
/* ============================================================ */

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function GlanceCard({
  icon,
  label,
  value,
  suffix,
  color,
  background,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  suffix?: string;
  color: string;
  background: string;
}) {
  return (
    <View style={styles.glanceCard}>
      <View style={styles.glanceTop}>
        <View
          style={[
            styles.glanceIcon,
            { backgroundColor: background },
          ]}
        >
          <Ionicons name={icon} size={18} color={color} />
        </View>

        {suffix && (
          <Text style={[styles.glanceSuffix, { color }]}>
            {suffix}
          </Text>
        )}
      </View>

      <Text style={styles.glanceValue}>{value}</Text>
      <Text style={styles.glanceLabel}>{label}</Text>
    </View>
  );
}

function StatusRow({
  icon,
  iconColor,
  iconBackground,
  title,
  subtitle,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBackground: string;
  title: string;
  subtitle: string;
  value: number;
}) {
  return (
    <View style={styles.statusRow}>
      <View
        style={[
          styles.statusIcon,
          { backgroundColor: iconBackground },
        ]}
      >
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>

      <View style={styles.statusInfo}>
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={styles.statusSubtitle}>{subtitle}</Text>
      </View>

      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

function CardHeaderIcon({
  icon,
  color,
  background,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
}) {
  return (
    <View style={[styles.cardHeaderIcon, { backgroundColor: background }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
  );
}

function ActionCard({
  icon,
  title,
  subtitle,
  color,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  color: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={styles.actionCard}
    >
      <View style={styles.actionTop}>
        <View
          style={[
            styles.actionIcon,
            { backgroundColor: `${color}10` },
          ]}
        >
          <Ionicons name={icon} size={20} color={color} />
        </View>

        {badge !== undefined && badge > 0 && (
          <View style={[styles.actionBadge, { backgroundColor: color }]}>
            <Text style={styles.actionBadgeText}>{badge}</Text>
          </View>
        )}
      </View>

      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSubtitle}>{subtitle}</Text>

      <View style={styles.actionArrow}>
        <Ionicons
          name="arrow-forward"
          size={14}
          color="#CBD5E1"
        />
      </View>
    </TouchableOpacity>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.whiteCard}>{children}</View>;
}

function Empty({ label }: { label: string }) {
  return (
    <Text style={styles.emptyText}>
      {label}
    </Text>
  );
}

function Track({
  ratio,
  color,
}: {
  ratio: number;
  color: string;
}) {
  return (
    <View style={styles.track}>
      <LinearGradient
        colors={[color, `${color}AA`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
          height: "100%",
          borderRadius: 5,
        }}
      />
    </View>
  );
}

function MeterBar({
  slices,
  total,
}: {
  slices: Slice[];
  total: number;
}) {
  return (
    <View style={styles.meter}>
      {slices.map((slice) => (
        <View
          key={slice.name}
          style={{
            flex: total > 0 ? slice.value : 0,
            backgroundColor: slice.color || "#64748B",
          }}
        />
      ))}
    </View>
  );
}

function LegendRow({
  slice,
  total,
}: {
  slice: Slice;
  total: number;
}) {
  const percent =
    total > 0
      ? Math.round((slice.value / total) * 100)
      : 0;

  return (
    <View style={styles.legendRow}>
      <View
        style={[
          styles.legendDot,
          { backgroundColor: slice.color || "#64748B" },
        ]}
      />

      <Text style={styles.legendName}>{slice.name}</Text>

      <Text style={styles.legendValue}>
        {slice.value}
      </Text>

      <Text style={styles.legendPercent}>
        {percent}%
      </Text>
    </View>
  );
}

/* ============================================================ */
/* STYLES */
/* ============================================================ */


/** "14 September 2026", or a dash when the API sent nothing */
function formatFullDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function holidayLength(holiday: {
  startDate?: string;
  endDate?: string;
}) {
  if (!holiday.startDate) return "—";
  const start = new Date(holiday.startDate);
  const end = new Date(holiday.endDate || holiday.startDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  const days =
    Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return days <= 1 ? "1 day" : `${days} days`;
}

function ModalRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.modalRow}>
      <Ionicons name={icon} size={16} color="#94A3B8" />
      <Text style={styles.modalRowLabel}>{label}</Text>
      <Text style={styles.modalRowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = {
  birthdayPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    marginHorizontal: 4,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    shadowColor: "#F59E0B",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  birthdayPillText: {
    color: "#7C2D12",
    fontSize: 15,
    fontWeight: "800" as const,
    letterSpacing: 0.3,
  },
  birthdayPillEmoji: {
    fontSize: 16,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end" as const,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 34,
    alignItems: "center" as const,
  },
  modalGrabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    marginBottom: 18,
  },
  modalBadge: {
    width: 74,
    height: 74,
    borderRadius: 24,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 14,
  },
  modalBadgeDay: {
    fontSize: 24,
    fontWeight: "800" as const,
  },
  modalBadgeMonth: {
    fontSize: 12,
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  modalTitle: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "800" as const,
    textAlign: "center" as const,
  },
  modalSubtitle: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600" as const,
    marginTop: 3,
  },
  modalRows: {
    alignSelf: "stretch" as const,
    marginTop: 18,
    gap: 2,
  },
  modalRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalRowLabel: {
    flex: 1,
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600" as const,
    marginLeft: 10,
  },
  modalRowValue: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "700" as const,
    maxWidth: "55%" as const,
  },
  modalClose: {
    alignSelf: "stretch" as const,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#0F172A",
    alignItems: "center" as const,
  },
  modalCloseText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700" as const,
  },

  emptyNote: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "500" as const,
    textAlign: "center" as const,
    paddingVertical: 18,
  },

  /**
   * The shell's own ground. This was #F8FAFC, a shade lighter,
   * which put a seam across the top of the page: the gap below the
   * bar showed the shell colour and the list showed this one, and
   * the join read as a pale band rather than as one background.
   */
  scroll: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },

  content: {
    paddingHorizontal: 16,
    paddingBottom: 150,
  },

  greeting: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 20,
  },

  greetingText: {
    flex: 1,
    paddingRight: 12,
  },

  date: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "800" as const,
    letterSpacing: 1.5,
    marginBottom: 6,
  },

  greetingTitle: {
    color: "#0F172A",
    fontSize: 27,
    fontWeight: "800" as const,
    letterSpacing: -0.7,
  },

  greetingName: {
    color: "#334155",
  },

  greetingSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
    maxWidth: 290,
  },

  profileImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  profileFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E2E8F0",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  profileInitial: {
    color: "#475569",
    fontSize: 18,
    fontWeight: "800" as const,
  },

  sectionHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 10,
  },

  sectionTitleWrap: {
    marginTop: 23,
    marginBottom: 10,
  },

  sectionTitle: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "800" as const,
    letterSpacing: -0.2,
  },

  livePill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#F0FDF4",
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
    marginRight: 5,
  },

  liveText: {
    color: "#16A34A",
    fontSize: 8,
    fontWeight: "900" as const,
    letterSpacing: 0.8,
  },

  glanceGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 10,
  },

  glanceCard: {
    width: "48.5%" as any,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EEF5",
    padding: 14,
  },

  glanceTop: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },

  glanceIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  glanceSuffix: {
    fontSize: 10,
    fontWeight: "800" as const,
  },

  glanceValue: {
    color: "#0F172A",
    fontSize: 25,
    fontWeight: "800" as const,
    marginTop: 12,
  },

  glanceLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600" as const,
    marginTop: 2,
  },

  whiteCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#E8EEF5",
    padding: 17,
  },

  cardHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },

  cardTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "800" as const,
  },

  cardSubtitle: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 3,
  },

  birthdayIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#FDF2F8",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  birthdayList: {
    marginTop: 12,
  },

  birthdayRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 10,
  },

  birthdayBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  birthdayAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  birthdayInitials: {
    color: "#DB2777",
    fontSize: 12,
    fontWeight: "800" as const,
  },

  birthdayInfo: {
    flex: 1,
    marginLeft: 11,
  },

  birthdayName: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700" as const,
  },

  birthdayRole: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 2,
  },

  birthdayEmoji: {
    fontSize: 18,
  },

  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#E8EEF5",
    paddingHorizontal: 16,
  },

  statusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 14,
  },

  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  statusInfo: {
    flex: 1,
    marginLeft: 12,
  },

  statusTitle: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700" as const,
  },

  statusSubtitle: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 2,
  },

  statusValue: {
    color: "#0F172A",
    fontSize: 22,
    fontWeight: "800" as const,
  },

  statusDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },

  attendanceTop: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 16,
  },

  attendancePercent: {
    color: "#0F172A",
    fontSize: 31,
    fontWeight: "800" as const,
  },

  attendanceCaption: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 1,
  },

  attendanceIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  meter: {
    height: 11,
    borderRadius: 6,
    overflow: "hidden" as const,
    flexDirection: "row" as const,
    backgroundColor: "#F1F5F9",
  },

  legendList: {
    marginTop: 15,
    gap: 9,
  },

  legendRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },

  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },

  legendName: {
    flex: 1,
    color: "#475569",
    fontSize: 11,
    fontWeight: "600" as const,
  },

  legendValue: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "800" as const,
  },

  legendPercent: {
    color: "#94A3B8",
    width: 38,
    textAlign: "right" as const,
    fontSize: 10,
    fontWeight: "600" as const,
  },

  holidayList: {
    gap: 9,
  },

  holidayCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EEF5",
    padding: 11,
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },

  holidayDate: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  holidayDateText: {
    fontSize: 16,
    fontWeight: "900" as const,
  },

  holidayMonth: {
    fontSize: 8,
    fontWeight: "800" as const,
    textTransform: "uppercase" as const,
  },

  holidayInfo: {
    flex: 1,
    marginLeft: 12,
  },

  holidayName: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700" as const,
  },

  holidayDay: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 3,
  },

  resourceHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: 6,
  },

  resourceName: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "600" as const,
  },

  resourceValue: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "800" as const,
  },

  resourcePercent: {
    color: "#94A3B8",
    fontWeight: "600" as const,
  },

  track: {
    height: 8,
    borderRadius: 5,
    backgroundColor: "#F1F5F9",
    overflow: "hidden" as const,
  },

  actionGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 10,
  },

  actionCard: {
    width: "48.5%" as any,
    minHeight: 132,
    backgroundColor: "#FFFFFF",
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#E8EEF5",
    padding: 14,
  },

  actionTop: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },

  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  actionBadge: {
    minWidth: 21,
    height: 21,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  actionBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900" as const,
  },

  actionTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "800" as const,
    marginTop: 13,
  },

  actionSubtitle: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 3,
  },

  actionArrow: {
    position: "absolute" as const,
    right: 13,
    bottom: 13,
  },

  emptyText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "500" as const,
    textAlign: "center" as const,
    paddingVertical: 18,
  },

  footer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 28,
    marginBottom: 10,
  },

  footerDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#CBD5E1",
    marginRight: 7,
  },

  footerText: {
    color: "#CBD5E1",
    fontSize: 9,
    fontWeight: "600" as const,
    letterSpacing: 0.3,
  },

  cardHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};

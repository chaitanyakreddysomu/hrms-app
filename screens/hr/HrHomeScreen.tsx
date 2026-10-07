import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { getAuthSession } from "../../utils/authStorage";
import { apiFetch } from "../../utils/api";
import UpdateSheet from "../../components/UpdateSheet";
import { useShellScroll } from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { useToast } from "../../components/Toast";
import { Card, IconTile, SectionTitle, ToneName, formatDate } from "./ui";

/**
 * ============================================================
 * HR DASHBOARD
 * ============================================================
 *
 * Built the way the admin home reads: a greeting with the photo,
 * today at a glance, the workforce split, an attendance bar and
 * what is coming up. The counts come from /api/hr/dashboard, the
 * birthdays and holidays from the routes everyone shares.
 */
interface Props {
  name: string;
  profileImage?: string;
  unread?: number;
  onNavigate: (tab: string, page?: string) => void;
  onSwitchView: () => void;
}

interface Birthday {
  id?: string;
  name: string;
  role?: string;
  designation?: string;
  profileImage?: string | null;
}

interface Holiday {
  _id: string;
  name: string;
  type?: string;
  startDate: string;
  endDate?: string;
}

export default function HrHomeScreen({
  name,
  profileImage,
  unread = 0,
  onNavigate,
  onSwitchView,
}: Props) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(8, true);
  const { showToast } = useToast();

  const [data, setData] = useState<any>(null);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updateSheetOpen, setUpdateSheetOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const [dashRes, birthRes, holidayRes] = await Promise.all([
        apiFetch("/api/hr/dashboard", session.token),
        apiFetch("/api/birthdays", session.token),
        apiFetch("/api/employee/holidays", session.token),
      ]);

      if (!dashRes.ok) {
        showToast({
          type: "error",
          title: "Dashboard Unavailable",
          message: "Could not load the HR overview.",
        });
      } else {
        setData(await dashRes.json().catch(() => null));
      }

      if (birthRes.ok) {
        const list = await birthRes.json().catch(() => []);
        setBirthdays(Array.isArray(list) ? list : []);
      }

      if (holidayRes.ok) {
        const list = await holidayRes.json().catch(() => []);
        setHolidays(Array.isArray(list) ? list : []);
      }
    } catch (error) {
      console.error("HR dashboard error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();

    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";

    return "Good evening";
  }, []);

  const stats = data?.stats || {};

  const total = stats.totalEmployees || 0;
  const present = stats.presentToday || 0;
  const onLeave = stats.onLeave || 0;

  /** whoever is neither in nor on leave has not shown up */
  const absent = Math.max(0, total - present - onLeave);

  const percent = total > 0 ? Math.round((present / total) * 100) : 0;

  const upcoming = holidays
    .filter(
      (h) =>
        new Date(h.endDate || h.startDate).getTime() >=
        new Date().setHours(0, 0, 0, 0)
    )
    .sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    )
    .slice(0, 3);

  return (
    <ScrollView
      {...shellScroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16, backgroundColor: "#FAF9F7", paddingTop: shellTop + 4, paddingBottom: 150 }}
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
      {/* ===================================================== */}
      {/* GREETING */}
      {/* ===================================================== */}

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DBEAFE", overflow: "hidden" }}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={{ width: 40, height: 40, borderRadius: 20 }} />
          ) : (
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="person" size={20} color="#2563EB" />
            </View>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: "#8A8D98", fontSize: 13, fontWeight: "600" }}>{greeting}</Text>
          <Text style={{ color: "#171A24", fontSize: 22, fontWeight: "800", marginTop: 1 }}>
            Hello, {name.split(" ")[0]}
          </Text>
        </View>
        <TouchableOpacity onPress={() => onNavigate("documents", "notifications")} activeOpacity={0.75} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#F0EFED" }}>
          <Ionicons name="notifications-outline" size={20} color="#202331" />
          {unread > 0 ? (
            <View style={{ position: "absolute", top: 1, right: 1, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "800" }}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <TouchableOpacity activeOpacity={0.8} onPress={onSwitchView} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", borderRadius: 18, backgroundColor: "#EFF6FF", paddingHorizontal: 12, paddingVertical: 8, marginTop: -8, marginBottom: 14 }}>
        <Ionicons name="swap-horizontal-outline" size={16} color="#2563EB" />
        <Text style={{ color: "#2563EB", fontSize: 11, fontWeight: "800", marginLeft: 6 }}>Switch to My view</Text>
      </TouchableOpacity>

      {/* ===================================================== */}
      {/* TODAY AT A GLANCE */}
      {/* ===================================================== */}

      <SectionTitle>Today at a glance</SectionTitle>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <Glance
          icon="people-outline"
          label="Total staff"
          value={loading ? "—" : String(total)}
          tone="slate"
        />

        <Glance
          icon="checkmark-circle-outline"
          label="Present"
          value={loading ? "—" : String(present)}
          suffix={`${percent}%`}
          tone="green"
        />

        <Glance
          icon="cafe-outline"
          label="On leave"
          value={loading ? "—" : String(onLeave)}
          tone="purple"
        />

        <Glance
          icon="hourglass-outline"
          label="Awaiting you"
          value={loading ? "—" : String(stats.pendingApprovals ?? 0)}
          tone="amber"
          onPress={() => onNavigate("leaves")}
        />
      </View>

      {/* HR SHORTCUTS */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2, marginBottom: 12 }}>
        {[
          { label: "Holidays", icon: "sunny-outline" as const, page: "holidays" },
          { label: "Complaints", icon: "chatbubble-ellipses-outline" as const, page: "complaints" },
          { label: "Payslips", icon: "receipt-outline" as const, page: "payslips" },
          { label: "Referrals", icon: "people-outline" as const, page: "referrals" },
          { label: "Signup requests", icon: "person-add-outline" as const, page: "requests" },
        ].map((item) => (
          <TouchableOpacity key={item.page} activeOpacity={0.75} onPress={() => onNavigate("documents", item.page)} style={{ width: "19%", alignItems: "center" }}>
            <View style={{ width: 40, height: 40, backgroundColor: "#FFFFFF", borderRadius: 12, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 }}>
              <Ionicons name={item.icon} size={20} color="#2563EB" />
            </View>
            <Text style={{ color: "#334155", fontSize: 8, fontWeight: "700", marginTop: 6, textAlign: "center" }} numberOfLines={2}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ===================================================== */}
      {/* ATTENDANCE OVERVIEW */}
      {/* ===================================================== */}

      <SectionTitle
        action="Open"
        onAction={() => onNavigate("attendance")}
      >
        Attendance overview
      </SectionTitle>

      <Card>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            marginBottom: 14,
          }}
        >
          <Text
            style={{ color: "#0F172A", fontSize: 30, fontWeight: "800" }}
          >
            {percent}%
          </Text>

          <Text
            style={{
              color: "#94A3B8",
              fontSize: 12,
              fontWeight: "600",
              marginLeft: 8,
              marginBottom: 6,
            }}
          >
            of the team is in today
          </Text>
        </View>

        {/* one bar, three slices */}
        <View
          style={{
            flexDirection: "row",
            height: 10,
            borderRadius: 5,
            overflow: "hidden",
            backgroundColor: "#F1F5F9",
          }}
        >
          {[
            { value: present, color: "#10B981" },
            { value: onLeave, color: "#7C3AED" },
            { value: absent, color: "#EF4444" },
          ].map((slice, index) => (
            <View
              key={index}
              style={{
                flex: total > 0 ? slice.value : 0,
                backgroundColor: slice.color,
              }}
            />
          ))}
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 14,
          }}
        >
          {[
            { label: "Present", value: present, color: "#10B981" },
            { label: "On leave", value: onLeave, color: "#7C3AED" },
            { label: "Absent", value: absent, color: "#EF4444" },
          ].map((item) => (
            <View
              key={item.label}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: item.color,
                  marginRight: 6,
                }}
              />

              <Text
                style={{
                  color: "#64748B",
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {item.label} {item.value}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* ===================================================== */}
      {/* UPCOMING HOLIDAY */}
      <SectionTitle action="See all" onAction={() => onNavigate("documents", "holidays")}>
        Upcoming holiday
      </SectionTitle>
      {upcoming[0] ? (
        <Card onPress={() => onNavigate("documents", "holidays")}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconTile icon="sunny-outline" tone="amber" size={42} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ color: "#0F172A", fontSize: 13, fontWeight: "800" }} numberOfLines={1}>{upcoming[0].name}</Text>
              <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "600", marginTop: 3 }}>{formatDate(upcoming[0].startDate)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#CBD5E1" />
          </View>
        </Card>
      ) : (
        <Card onPress={() => onNavigate("documents", "holidays")}>
          <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "600", textAlign: "center", paddingVertical: 4 }}>No upcoming holidays</Text>
        </Card>
      )}

      {/* UPCOMING BIRTHDAYS */}
      <SectionTitle action="See all" onAction={() => onNavigate("documents", "birthdays")}>
        Upcoming birthdays
      </SectionTitle>
      <Card onPress={() => onNavigate("documents", "birthdays")}>
        {birthdays.length === 0 ? (
          <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "600", textAlign: "center", paddingVertical: 4 }}>
            {loading ? "Checking the calendar…" : "No upcoming birthdays"}
          </Text>
        ) : birthdays.slice(0, 3).map((person, index) => (
          <View key={person.id || person.name} style={{ flexDirection: "row", alignItems: "center", marginBottom: index === Math.min(birthdays.length, 3) - 1 ? 0 : 14 }}>
            {person.profileImage ? (
              <Image source={{ uri: person.profileImage }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#F1F5F9" }} />
            ) : (
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFBEB", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#D97706", fontSize: 15, fontWeight: "800" }}>{(person.name || "?").charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: "#0F172A", fontSize: 13, fontWeight: "800" }} numberOfLines={1}>{person.name}</Text>
              <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "600", marginTop: 2 }} numberOfLines={1}>{person.designation || person.role || "Employee"}</Text>
            </View>
            <Text style={{ fontSize: 18 }}>🎂</Text>
          </View>
        ))}
      </Card>

      {/* WORKFORCE STATUS */}
      <SectionTitle action="Employees" onAction={() => onNavigate("employees")}>
        Workforce status
      </SectionTitle>
      <Card>
        {data?.departments?.length ? data.departments.map((dept: any, index: number) => (
          <View key={dept.name} style={{ marginBottom: index === data.departments.length - 1 ? 0 : 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ color: "#0F172A", fontSize: 12, fontWeight: "700" }}>{dept.name}</Text>
              <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "700" }}>{dept.count} · {dept.percent}</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: "#F1F5F9", overflow: "hidden" }}>
              <View style={{ width: dept.percent || "0%", height: "100%", backgroundColor: "#2563EB" }} />
            </View>
          </View>
        )) : (
          <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "600", textAlign: "center", paddingVertical: 4 }}>
            {loading ? "Loading workforce status…" : "No department data available"}
          </Text>
        )}
      </Card>

      <TouchableOpacity activeOpacity={0.85} onPress={() => setUpdateSheetOpen(true)} style={{ minHeight: 54, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE7F8", flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 8, marginBottom: 20 }}>
        <Ionicons name="cloud-download-outline" size={19} color="#2563EB" />
        <Text style={{ color: "#2563EB", fontSize: 14, fontWeight: "700", marginLeft: 9 }}>Check for updates</Text>
      </TouchableOpacity>
      <UpdateSheet visible={updateSheetOpen} onClose={() => setUpdateSheetOpen(false)} />
    </ScrollView>
  );
}

function Glance({
  icon,
  label,
  value,
  suffix,
  tone,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  suffix?: string;
  tone: ToneName;
  onPress?: () => void;
}) {
  const body = (
    <View
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "#EEF2F7",
        padding: 16,
      }}
    >
      <IconTile icon={icon} tone={tone} size={34} />

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          marginTop: 10,
        }}
      >
        <Text
          style={{ color: "#0F172A", fontSize: 20, fontWeight: "800" }}
        >
          {value}
        </Text>

        {!!suffix && (
          <Text
            style={{
              color: "#94A3B8",
              fontSize: 11,
              fontWeight: "700",
              marginLeft: 6,
              marginBottom: 3,
            }}
          >
            {suffix}
          </Text>
        )}
      </View>

      <Text
        style={{ color: "#94A3B8", fontSize: 11, fontWeight: "600" }}
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

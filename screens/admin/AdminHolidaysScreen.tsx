import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  ScrollView,
  Platform,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/AppNavigator";
import { getAuthSession } from "../../utils/authStorage";
import { useShellScroll } from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { apiFetch, resetBaseUrl } from "../../utils/api";
import ModalDismiss from "../../components/ModalDismiss";
import RefreshSessionButton from "../../components/RefreshSessionButton";
import { isAuthError } from "../../utils/authStorage";

type Props = NativeStackScreenProps<RootStackParamList, "AdminHolidays">;

interface Holiday {
  id: string;
  _id?: string;
  name: string;
  type: string;
  startDate: Date;
  endDate: Date;
}

const TYPE_OPTIONS = ["Holiday", "National", "Festival", "Event"];

const TYPE_COLORS: Record<string, { solid: string; bg: string; border: string; text: string }> = {
  Holiday: { solid: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", text: "#1D4ED8" },
  National: { solid: "#EF4444", bg: "#FEF2F2", border: "#FECACA", text: "#DC2626" },
  Festival: { solid: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A", text: "#D97706" },
  Event: { solid: "#A855F7", bg: "#FAF5FF", border: "#E9D5FF", text: "#7C3AED" },
};

const typeColor = (type: string) => TYPE_COLORS[type] || TYPE_COLORS.Holiday;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_PADDING = 24;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - GRID_PADDING * 2 - 24) / 7);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
const inRange = (date: Date, start: Date, end: Date) => {
  const d = startOfDay(date).getTime();
  return d >= startOfDay(start).getTime() && d <= startOfDay(end).getTime();
};
const toISO = (d: Date) => {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

export default function AdminHolidaysScreen({ navigation, embedded }: Props & { embedded?: boolean }) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<"calendar" | "list">("calendar");
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("Holiday");
  const [formStart, setFormStart] = useState(new Date());
  const [formEnd, setFormEnd] = useState(new Date());
  const [picker, setPicker] = useState<"start" | "end" | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);

  const requestIdRef = useRef(0);

  // ============================================================
  // FETCH
  // ============================================================
  const fetchHolidays = useCallback(async (opts: { silent?: boolean; resetUrl?: boolean } = {}) => {
    const requestId = ++requestIdRef.current;

    if (!opts.silent) setLoading(true);
    setError(null);

    if (opts.resetUrl) resetBaseUrl();

    try {
      const session = await getAuthSession();

      if (!session?.token) {
        if (requestId === requestIdRef.current) setError("Not authenticated.");
        return;
      }

      const res = await apiFetch(`/api/admin/holidays`, session.token);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Server error (${res.status})`);
      }

      const data = await res.json();
      if (requestId !== requestIdRef.current) return;

      const formatted: Holiday[] = (Array.isArray(data) ? data : []).map((h: any) => ({
        ...h,
        id: h._id || h.id,
        startDate: new Date(h.startDate),
        endDate: new Date(h.endDate),
      }));

      setHolidays(formatted);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      const message = err?.message?.includes("Network request failed")
        ? "Cannot reach server."
        : err?.message || "Something went wrong.";
      setError(message);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHolidays({ silent: true, resetUrl: true });
  }, [fetchHolidays]);

  // ============================================================
  // SAVE / DELETE
  // ============================================================
  const resetForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormName("");
    setFormType("Holiday");
    setFormStart(new Date());
    setFormEnd(new Date());
    setPicker(null);
    setTypeOpen(false);
  };

  const saveHoliday = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const path = editingId ? `/api/admin/holidays/${editingId}` : `/api/admin/holidays`;

      const res = await apiFetch(path, session.token, {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({
          name: formName.trim(),
          type: formType,
          startDate: toISO(formStart),
          endDate: toISO(formEnd),
        }),
      });

      if (res.ok) {
        resetForm();
        fetchHolidays({ silent: true });
      }
    } catch (err) {
      console.error("Failed to save holiday", err);
    } finally {
      setSaving(false);
    }
  };

  const deleteHoliday = async (id: string) => {
    setDeleting(true);
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(`/api/admin/holidays/${id}`, session.token, { method: "DELETE" });

      if (res.ok) {
        setSelectedHoliday(null);
        setHolidays((prev) => prev.filter((h) => h.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete holiday", err);
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (h: Holiday) => {
    setEditingId(h.id);
    setFormName(h.name);
    setFormType(h.type);
    setFormStart(h.startDate);
    setFormEnd(h.endDate);
    setSelectedHoliday(null);
    setFormOpen(true);
  };

  // ============================================================
  // CALENDAR DATA
  // ============================================================
  const calendarDays = useMemo(() => {
    const first = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());

    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentMonth]);

  const getDayHoliday = useCallback(
    (date: Date) => holidays.find((h) => inRange(date, h.startDate, h.endDate)),
    [holidays]
  );

  const monthHolidays = useMemo(() => {
    const mStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const mEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    return holidays
      .filter((h) => startOfDay(h.startDate) <= mEnd && startOfDay(h.endDate) >= mStart)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [holidays, currentMonth]);

  const yearHolidays = useMemo(() => {
    const year = currentMonth.getFullYear();
    return holidays
      .filter((h) => h.startDate.getFullYear() === year || h.endDate.getFullYear() === year)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [holidays, currentMonth]);

  const formatRange = (h: Holiday) => {
    if (sameDay(h.startDate, h.endDate)) {
      return h.startDate.toLocaleDateString("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    return `${h.startDate.toLocaleDateString("en-US", { day: "numeric", month: "short" })} - ${h.endDate.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`;
  };

  const dayCount = (h: Holiday) => {
    const diff = Math.abs(startOfDay(h.endDate).getTime() - startOfDay(h.startDate).getTime());
    const days = Math.round(diff / 86400000) + 1;
    return days === 1 ? "1 Day" : `${days} Days`;
  };

  // ============================================================
  // CALENDAR CELL
  // ============================================================
  const renderDay = (date: Date, index: number) => {
    const holiday = getDayHoliday(date);
    const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
    const isToday = sameDay(date, new Date());

    const color = holiday ? typeColor(holiday.type) : null;

    // connected range edges
    const isRangeStart = holiday ? sameDay(date, holiday.startDate) || date.getDay() === 0 : false;
    const isRangeEnd = holiday ? sameDay(date, holiday.endDate) || date.getDay() === 6 : false;

    const radius = 10;

    return (
      <TouchableOpacity
        key={index}
        activeOpacity={holiday ? 0.7 : 1}
        disabled={!holiday}
        onPress={() => holiday && setSelectedHoliday(holiday)}
        style={{
          width: CELL_SIZE,
          height: CELL_SIZE,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: color ? color.solid : "transparent",
          opacity: isCurrentMonth ? 1 : 0.35,
          borderTopLeftRadius: !color || isRangeStart ? radius : 0,
          borderBottomLeftRadius: !color || isRangeStart ? radius : 0,
          borderTopRightRadius: !color || isRangeEnd ? radius : 0,
          borderBottomRightRadius: !color || isRangeEnd ? radius : 0,
          borderWidth: !color && isToday ? 1.5 : 0,
          borderColor: "#2563EB",
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: color || isToday ? "800" : "500",
            color: color ? "#FFFFFF" : isToday ? "#2563EB" : "#374151",
          }}
        >
          {date.getDate()}
        </Text>
      </TouchableOpacity>
    );
  };

  // ============================================================
  // HOLIDAY CARD
  // ============================================================
  const renderHolidayCard = (h: Holiday) => {
    const color = typeColor(h.type);
    return (
      <TouchableOpacity
        key={h.id}
        activeOpacity={0.7}
        onPress={() => setSelectedHoliday(h)}
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 20,
          padding: 16,
          borderWidth: 1,
          borderColor: "#F3F4F6",
          borderLeftWidth: 4,
          borderLeftColor: color.solid,
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            backgroundColor: color.solid,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 14,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800" }}>
            {h.startDate.getDate()}
          </Text>
          <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
            {h.startDate.toLocaleDateString("en-US", { month: "short" })}
          </Text>
        </View>

        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: "#111827", fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
            {h.name}
          </Text>
          <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {formatRange(h)}
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: color.bg,
            borderWidth: 1,
            borderColor: color.border,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "800", color: color.text }}>{h.type}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={embedded ? [] : undefined} style={{ flex: 1, backgroundColor: "#F9FAFB" }}>
      <StatusBar style="dark" />

      {/* HEADER */}
      {!embedded && (
        <View
          style={{
            paddingHorizontal: 24,
            paddingVertical: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#FFFFFF",
            borderBottomWidth: 1,
            borderBottomColor: "#F3F4F6",
          }}
        >
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              width: 44,
              height: 44,
              borderRadius: 16,
              backgroundColor: "#F9FAFB",
              borderWidth: 1,
              borderColor: "#E5E7EB",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-back" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={{ color: "#111827", fontSize: 20, fontWeight: "700" }}>Holidays</Text>
          <TouchableOpacity
            onPress={() => {
              resetForm();
              setFormOpen(true);
            }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 16,
              backgroundColor: "#EFF6FF",
              borderWidth: 1,
              borderColor: "#DBEAFE",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="add" size={24} color="#2563EB" />
          </TouchableOpacity>
        </View>
      )}

      {/* TABS + YEAR */}
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: 16,
          backgroundColor: "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            backgroundColor: "#F3F4F6",
            borderRadius: 12,
            padding: 4,
            marginBottom: 12,
          }}
        >
          {(["calendar", "list"] as const).map((t) => {
            const active = tab === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 9,
                  backgroundColor: active ? "#FFFFFF" : "transparent",
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  shadowColor: active ? "#000" : "transparent",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: active ? 0.08 : 0,
                  shadowRadius: 3,
                  elevation: active ? 2 : 0,
                }}
              >
                <Ionicons
                  name={t === "calendar" ? "calendar-outline" : "list-outline"}
                  size={16}
                  color={active ? "#2563EB" : "#6B7280"}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={{
                    color: active ? "#2563EB" : "#6B7280",
                    fontSize: 13,
                    fontWeight: active ? "700" : "500",
                  }}
                >
                  {t === "calendar" ? "Calendar" : "List"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* MONTH / YEAR NAV */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <TouchableOpacity
            onPress={() =>
              setCurrentMonth((prev) =>
                tab === "calendar"
                  ? new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                  : new Date(prev.getFullYear() - 1, prev.getMonth(), 1)
              )
            }
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: "#F9FAFB",
              borderWidth: 1,
              borderColor: "#E5E7EB",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="chevron-back" size={18} color="#374151" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setCurrentMonth(new Date())} activeOpacity={0.7}>
            <Text style={{ color: "#111827", fontSize: 16, fontWeight: "800", textAlign: "center" }}>
              {tab === "calendar" ? MONTHS[currentMonth.getMonth()] : "Year"} {currentMonth.getFullYear()}
            </Text>
            <Text style={{ color: "#9CA3AF", fontSize: 10, fontWeight: "600", textAlign: "center", marginTop: 2 }}>
              Tap for today
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              setCurrentMonth((prev) =>
                tab === "calendar"
                  ? new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                  : new Date(prev.getFullYear() + 1, prev.getMonth(), 1)
              )
            }
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: "#F9FAFB",
              borderWidth: 1,
              borderColor: "#E5E7EB",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="chevron-forward" size={18} color="#374151" />
          </TouchableOpacity>
        </View>
      </View>

      {/* BODY */}
      {error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <Text style={{ color: "#111827", fontSize: 16, fontWeight: "600", textAlign: "center", marginBottom: 8 }}>
            {error}
          </Text>
          {isAuthError(error) && (
            <RefreshSessionButton onDone={onRefresh} />
          )}
          <TouchableOpacity
            onPress={onRefresh}
            style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "#2563EB", borderRadius: 8 }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : tab === "calendar" ? (
        <ScrollView
          {...shellScroll}
          contentContainerStyle={{ padding: 24, paddingTop: shellTop, paddingBottom: 150 }}
          refreshControl={
            <RefreshControl progressViewOffset={shellTop} refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" colors={["#2563EB"]} />
          }
        >
          {/* CALENDAR CARD */}
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "#F3F4F6",
              padding: 12,
              marginBottom: 20,
            }}
          >
            <View style={{ flexDirection: "row", marginBottom: 8 }}>
              {WEEKDAYS.map((d) => (
                <View key={d} style={{ width: CELL_SIZE, alignItems: "center" }}>
                  <Text style={{ color: "#9CA3AF", fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>
                    {d}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {calendarDays.map((d, i) => renderDay(d, i))}
            </View>
          </View>

          {/* LEGEND */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              backgroundColor: "#FFFFFF",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#F3F4F6",
              padding: 16,
              marginBottom: 20,
            }}
          >
            {TYPE_OPTIONS.map((t) => (
              <View key={t} style={{ flexDirection: "row", alignItems: "center", width: "50%", marginBottom: 8 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: typeColor(t).solid,
                    marginRight: 8,
                  }}
                />
                <Text style={{ color: "#4B5563", fontSize: 12, fontWeight: "600" }}>{t}</Text>
              </View>
            ))}
          </View>

          {/* MONTH LIST */}
          <Text style={{ color: "#9CA3AF", fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginBottom: 12 }}>
            {MONTHS[currentMonth.getMonth()]} · {monthHolidays.length} holidays
          </Text>

          {monthHolidays.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 30 }}>
              <Ionicons name="calendar-outline" size={40} color="#D1D5DB" style={{ marginBottom: 12 }} />
              <Text style={{ color: "#6B7280", fontSize: 14 }}>No holidays this month</Text>
            </View>
          ) : (
            monthHolidays.map(renderHolidayCard)
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={yearHolidays}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderHolidayCard(item)}
          {...shellScroll}
          contentContainerStyle={{ padding: 24, paddingTop: shellTop, paddingBottom: 150 }}
          refreshControl={
            <RefreshControl progressViewOffset={shellTop} refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" colors={["#2563EB"]} />
          }
          ListHeaderComponent={() => (
            <Text
              style={{
                color: "#9CA3AF",
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              {currentMonth.getFullYear()} · {yearHolidays.length} holidays
            </Text>
          )}
          ListEmptyComponent={() => (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Ionicons name="calendar-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
              <Text style={{ color: "#6B7280", fontSize: 15, fontWeight: "500" }}>
                No holidays in {currentMonth.getFullYear()}
              </Text>
            </View>
          )}
        />
      )}

      {/* HOLIDAY DETAILS BOTTOM SHEET */}
      <Modal
        visible={!!selectedHoliday}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedHoliday(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ModalDismiss onPress={() => setSelectedHoliday(null)} />
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "90%",
            }}
          >
            <View
              style={{
                padding: 24,
                borderBottomWidth: 1,
                borderBottomColor: "#F3F4F6",
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 4 }}>
                  Holiday Details
                </Text>
                <Text style={{ fontSize: 14, color: "#6B7280" }}>Review or edit this entry</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedHoliday(null)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={20} color="#4B5563" />
              </TouchableOpacity>
            </View>

            {selectedHoliday && (
              <ScrollView contentContainerStyle={{ padding: 24, paddingTop: shellTop, paddingBottom: 40 }}>
                {/* TITLE BLOCK */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 16,
                    backgroundColor: typeColor(selectedHoliday.type).bg,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: typeColor(selectedHoliday.type).border,
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 16,
                      backgroundColor: typeColor(selectedHoliday.type).solid,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 14,
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "800" }}>
                      {selectedHoliday.startDate.getDate()}
                    </Text>
                    <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
                      {selectedHoliday.startDate.toLocaleDateString("en-US", { month: "short" })}
                    </Text>
                  </View>

                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ fontSize: 17, fontWeight: "800", color: "#111827" }} numberOfLines={2}>
                      {selectedHoliday.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>
                      {formatRange(selectedHoliday)}
                    </Text>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: "#FFFFFF",
                      borderWidth: 1,
                      borderColor: typeColor(selectedHoliday.type).border,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: typeColor(selectedHoliday.type).text }}>
                      {selectedHoliday.type}
                    </Text>
                  </View>
                </View>

                {/* START / END */}
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                  <InfoCard
                    icon="calendar-outline"
                    iconBg="#D1FAE5"
                    iconColor="#059669"
                    label="Start Date"
                    value={selectedHoliday.startDate.toLocaleDateString("en-US", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  />
                  <InfoCard
                    icon="calendar-outline"
                    iconBg="#FEE2E2"
                    iconColor="#DC2626"
                    label="End Date"
                    value={selectedHoliday.endDate.toLocaleDateString("en-US", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  />
                </View>

                {/* DURATION / TYPE */}
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
                  <InfoCard
                    icon="time-outline"
                    iconBg="#EDE9FE"
                    iconColor="#7C3AED"
                    label="Duration"
                    value={dayCount(selectedHoliday)}
                  />
                  <InfoCard
                    icon="pricetag-outline"
                    iconBg={typeColor(selectedHoliday.type).bg}
                    iconColor={typeColor(selectedHoliday.type).solid}
                    label="Type"
                    value={selectedHoliday.type}
                  />
                </View>

                {/* ACTIONS */}
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    disabled={deleting}
                    onPress={() => deleteHoliday(selectedHoliday.id)}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
                      borderRadius: 12,
                      backgroundColor: "#DC2626",
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      opacity: deleting ? 0.6 : 1,
                    }}
                  >
                    {deleting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Delete</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => openEdit(selectedHoliday)}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
                      borderRadius: 12,
                      backgroundColor: "#2563EB",
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ADD / EDIT BOTTOM SHEET */}
      <Modal visible={formOpen} animationType="slide" transparent={true} onRequestClose={resetForm}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ModalDismiss onPress={resetForm} />
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "90%",
            }}
          >
            <View
              style={{
                padding: 24,
                borderBottomWidth: 1,
                borderBottomColor: "#F3F4F6",
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 4 }}>
                  {editingId ? "Edit Holiday" : "Add Holiday"}
                </Text>
                <Text style={{ fontSize: 14, color: "#6B7280" }}>
                  {editingId ? "Update this entry" : "Add a holiday or event"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={resetForm}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={20} color="#4B5563" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 24, paddingTop: shellTop, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              {/* NAME */}
              <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>
                Holiday Name
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F9FAFB",
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  height: 46,
                  marginBottom: 16,
                }}
              >
                <Ionicons name="text-outline" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
                <TextInput
                  placeholder="e.g. New Year"
                  placeholderTextColor="#9CA3AF"
                  value={formName}
                  onChangeText={setFormName}
                  style={{ flex: 1, color: "#111827", fontSize: 14, fontWeight: "500", height: "100%" }}
                />
              </View>

              {/* DATES */}
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>
                    Start Date
                  </Text>
                  <TouchableOpacity
                    onPress={() => setPicker("start")}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: "#F9FAFB",
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      height: 46,
                    }}
                  >
                    <Text style={{ color: "#111827", fontSize: 12, fontWeight: "700" }}>{toISO(formStart)}</Text>
                    <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>
                    End Date
                  </Text>
                  <TouchableOpacity
                    onPress={() => setPicker("end")}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: "#F9FAFB",
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      height: 46,
                    }}
                  >
                    <Text style={{ color: "#111827", fontSize: 12, fontWeight: "700" }}>{toISO(formEnd)}</Text>
                    <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* TYPE */}
              <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>
                Event Type
              </Text>
              <TouchableOpacity
                onPress={() => setTypeOpen((v) => !v)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: "#F9FAFB",
                  borderWidth: 1,
                  borderColor: typeOpen ? "#2563EB" : "#E5E7EB",
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  height: 46,
                  marginBottom: typeOpen ? 0 : 20,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: typeColor(formType).solid,
                      marginRight: 8,
                    }}
                  />
                  <Text style={{ color: "#111827", fontSize: 13, fontWeight: "700" }}>{formType}</Text>
                </View>
                <Ionicons name={typeOpen ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
              </TouchableOpacity>

              {typeOpen && (
                <View
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    marginTop: 6,
                    marginBottom: 20,
                    overflow: "hidden",
                  }}
                >
                  {TYPE_OPTIONS.map((option) => {
                    const selected = formType === option;
                    return (
                      <TouchableOpacity
                        key={option}
                        onPress={() => {
                          setFormType(option);
                          setTypeOpen(false);
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 11,
                          backgroundColor: selected ? "#EFF6FF" : "#FFFFFF",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <View
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 5,
                              backgroundColor: typeColor(option).solid,
                              marginRight: 8,
                            }}
                          />
                          <Text
                            style={{
                              color: selected ? "#2563EB" : "#374151",
                              fontSize: 12,
                              fontWeight: selected ? "700" : "500",
                            }}
                          >
                            {option}
                          </Text>
                        </View>
                        {selected && <Ionicons name="checkmark" size={16} color="#2563EB" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* SAVE */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  onPress={resetForm}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 12,
                    backgroundColor: "#F3F4F6",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#4B5563", fontWeight: "600", fontSize: 15 }}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={!formName.trim() || saving}
                  onPress={saveHoliday}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 12,
                    backgroundColor: formName.trim() ? "#2563EB" : "#93C5FD",
                    alignItems: "center",
                  }}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>
                      {editingId ? "Update" : "Add Holiday"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {picker && (
        <DateTimePicker
          value={picker === "start" ? formStart : formEnd}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_event, date) => {
            setPicker(Platform.OS === "ios" ? picker : null);
            if (date) {
              if (picker === "start") {
                setFormStart(date);
                if (date > formEnd) setFormEnd(date);
              } else {
                setFormEnd(date);
              }
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ============================================================
// INFO CARD
// ============================================================
function InfoCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        padding: 14,
        backgroundColor: "#F9FAFB",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E5E7EB",
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
        }}
      >
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text style={{ color: "#111827", fontSize: 13, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

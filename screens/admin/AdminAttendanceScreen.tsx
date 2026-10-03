import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Image,
  RefreshControl,
  FlatList,
  ScrollView,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/AppNavigator";
import { getAuthSession } from "../../utils/authStorage";
import {
  toShellOptions,
  useShellFilters,
  useShellScroll,
  useShellSearch,
} from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { apiFetch, resetBaseUrl } from "../../utils/api";
import { useRegisterScreenAction } from "../../components/ScreenActions";
import ModalDismiss from "../../components/ModalDismiss";
import RefreshSessionButton from "../../components/RefreshSessionButton";
import { isAuthError } from "../../utils/authStorage";

type Props = NativeStackScreenProps<RootStackParamList, "AdminAttendance">;

interface AttendanceRecord {
  id: string;
  _id?: string;
  name: string;
  email: string;
  avatar?: string;
  profileImage?: string;
  designation?: string;
  department?: string;
  date: string;
  punchIn: string;
  punchOut: string;
  status: string;
  timeWorking?: number | null;
  latitude?: number | string;
  longitude?: number | string;
}

const STATUS_OPTIONS = [
  "All",
  "Present",
  "Late",
  "Absent",
  "WFH",
  "Half Day",
  "On Leave",
];

export default function AdminAttendanceScreen({ navigation, embedded }: Props & { embedded?: boolean }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  /** the shell header search field drives this page */
  useShellSearch(setSearchTerm);
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();

  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [openDropdown, setOpenDropdown] = useState<"status" | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [exporting, setExporting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const dateString = selectedDate.toISOString().split("T")[0];

  // ============================================================
  // FETCH ATTENDANCE
  // ============================================================

  const fetchAttendance = useCallback(
    async (opts: { silent?: boolean; resetUrl?: boolean } = {}) => {
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

        const params = new URLSearchParams();
        params.append("date", dateString);
        if (searchTerm.trim()) params.append("search", searchTerm.trim());

        const res = await apiFetch(
          `/api/admin/attendance?${params.toString()}`,
          session.token
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || `Server error (${res.status})`);
        }

        const data = await res.json();
        if (requestId !== requestIdRef.current) return;

        setRecords(Array.isArray(data.records) ? data.records : []);
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
    },
    [searchTerm, dateString]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchAttendance();
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, dateString]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAttendance({ silent: true, resetUrl: true });
  }, [fetchAttendance]);

  // ============================================================
  // EXPORT
  // ============================================================
  const handleExport = async () => {
    setExporting(true);
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        `/api/admin/attendance/export?date=${dateString}`,
        session.token
      );

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.url) {
          await Linking.openURL(data.url);
        }
      }
    } catch (err) {
      console.error("Export error", err);
    } finally {
      setExporting(false);
    }
  };

  // ============================================================
  // HELPERS
  // ============================================================
  const getInitial = (name?: string) => name?.charAt(0)?.toUpperCase() || "?";

  /** exposes Export to the shell header menu */
  useRegisterScreenAction("export", handleExport);

  /** exposes the date picker to the shell header menu */
  useRegisterScreenAction("pickDate", () => {
    setOpenDropdown(null);
    setShowDatePicker(true);
  });

  const formatTime = (time?: string | null) => {
    if (!time || time === "--") return "--";
    const [h, m, s] = time.split(":").map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, s || 0);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const formatDateLabel = (d: Date) =>
    d.toLocaleDateString("en-US", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const statusTheme = (status: string) => {
    switch (status) {
      case "Present":
        return { bg: "#D1FAE5", border: "#A7F3D0", text: "#059669" };
      case "Late":
        return { bg: "#FEF3C7", border: "#FDE68A", text: "#D97706" };
      case "Absent":
        return { bg: "#FEE2E2", border: "#FECACA", text: "#DC2626" };
      case "WFH":
        return { bg: "#EEF2FF", border: "#C7D2FE", text: "#4F46E5" };
      case "Half Day":
        return { bg: "#FFEDD5", border: "#FED7AA", text: "#EA580C" };
      case "On Leave":
        return { bg: "#DBEAFE", border: "#BFDBFE", text: "#2563EB" };
      default:
        return { bg: "#F3F4F6", border: "#E5E7EB", text: "#6B7280" };
    }
  };

  const filteredRecords = records.filter(
    (rec) => statusFilter === "All" || rec.status === statusFilter
  );

  // ============================================================
  // DROPDOWN
  // ============================================================
  const renderDropdown = (
    type: "status",
    label: string,
    value: string,
    options: string[],
    setter: (value: string) => void
  ) => {
    const isOpen = openDropdown === type;
    return (
      <View style={{ flex: 1, position: "relative", zIndex: isOpen ? 100 : 1 }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setOpenDropdown(isOpen ? null : type)}
          style={{
            minHeight: 46,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: "#F9FAFB",
            borderWidth: 1,
            borderColor: isOpen ? "#2563EB" : "#E5E7EB",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
              {label}
            </Text>
            <Text style={{ color: "#111827", fontSize: 12, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
              {value === "All" ? `All ${label}` : value}
            </Text>
          </View>
          <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
        </TouchableOpacity>

        {isOpen && (
          <View
            style={{
              position: "absolute",
              top: 50,
              left: 0,
              right: 0,
              backgroundColor: "#FFFFFF",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 8,
              elevation: 8,
              overflow: "hidden",
            }}
          >
            {options.map((option) => {
              const selected = value === option;
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => {
                    setter(option);
                    setOpenDropdown(null);
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
                  <Text style={{ color: selected ? "#2563EB" : "#374151", fontSize: 12, fontWeight: selected ? "700" : "500" }}>
                    {option === "All" ? `All ${label}` : option}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={16} color="#2563EB" />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // ============================================================
  // RECORD CARD
  // ============================================================
  const renderRecord = ({ item }: { item: AttendanceRecord }) => {
    const photoUri = item.profileImage || item.avatar;
    const theme = statusTheme(item.status);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setSelectedRecord(item)}
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
        <View style={{ marginRight: 14 }}>
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#F3F4F6" }}
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
              <Text style={{ color: "#2563EB", fontSize: 18, fontWeight: "700" }}>
                {getInitial(item.name)}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: "#111827", fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {item.email}
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: theme.bg,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "800", color: theme.text }}>{item.status}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  /** the header menu owns these filters while embedded */
  useShellFilters([
    {
      key: "status",
      label: "Status",
      value: statusFilter,
      defaultValue: "All",
      options: toShellOptions(STATUS_OPTIONS),
      onChange: setStatusFilter,
    },
  ]);

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
          <Text style={{ color: "#111827", fontSize: 20, fontWeight: "700" }}>Attendance</Text>
          <TouchableOpacity
            onPress={onRefresh}
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
            <Ionicons name="refresh-outline" size={20} color="#2563EB" />
          </TouchableOpacity>
        </View>
      )}

      {/* SEARCH + FILTERS */}
      {!embedded && (
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: 16,
            backgroundColor: "#FFFFFF",
            borderBottomWidth: 1,
            borderBottomColor: "#F3F4F6",
            zIndex: 10,
          }}
        >
          {!embedded && (
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
                marginBottom: 12,
              }}
            >
              <Ionicons name="search" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
              <TextInput
                placeholder="Search employees..."
                placeholderTextColor="#9CA3AF"
                value={searchTerm}
                onChangeText={setSearchTerm}
                style={{ flex: 1, color: "#111827", fontSize: 14, fontWeight: "500", height: "100%" }}
              />
              {searchTerm.length > 0 && (
                <TouchableOpacity onPress={() => setSearchTerm("")}>
                  <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {!embedded && (
          <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
            {/* DATE lives in the shell header menu while embedded */}
            {!embedded && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  setOpenDropdown(null);
                  setShowDatePicker(true);
                }}
                style={{
                  flex: 1,
                  minHeight: 46,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: "#F9FAFB",
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
                    Date
                  </Text>
                  <Text style={{ color: "#111827", fontSize: 12, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
                    {dateString}
                  </Text>
                </View>
                <Ionicons name="calendar-outline" size={16} color="#6B7280" />
              </TouchableOpacity>
            )}

            {/* STATUS lives in the shell header menu while embedded */}
            {!embedded &&
              renderDropdown("status", "Status", statusFilter, STATUS_OPTIONS, setStatusFilter)}
          </View>
          )}

          {/* Export lives in the shell header menu when embedded */}
          {!embedded && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleExport}
              disabled={exporting}
              style={{
                height: 46,
                borderRadius: 12,
                backgroundColor: "#2563EB",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                opacity: exporting ? 0.7 : 1,
              }}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>Export Report</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_event, date) => {
            setShowDatePicker(Platform.OS === "ios");
            if (date) setSelectedDate(date);
          }}
        />
      )}

      {/* DATE BANNER */}
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 20,
          paddingBottom: 4,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Ionicons name="calendar" size={14} color="#6B7280" style={{ marginRight: 6 }} />
        <Text style={{ color: "#6B7280", fontSize: 12, fontWeight: "700" }}>
          {formatDateLabel(selectedDate)}
        </Text>
        <Text style={{ color: "#9CA3AF", fontSize: 12, fontWeight: "600", marginLeft: 6 }}>
          • {filteredRecords.length} records
        </Text>
      </View>

      {/* LIST */}
      <View style={{ flex: 1 }}>
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
        ) : (
          <FlatList {...shellScroll}
            data={filteredRecords}
            keyExtractor={(item, index) => item.id || item._id || `att-${index}`}
            renderItem={renderRecord}
            contentContainerStyle={{ padding: 24, paddingTop: shellTop, paddingBottom: 150 }}
            refreshControl={
              <RefreshControl
          progressViewOffset={shellTop}
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#2563EB"
                colors={["#2563EB"]}
              />
            }
            ListEmptyComponent={() =>
              !loading ? (
                <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
                  <Ionicons name="calendar-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
                  <Text style={{ color: "#6B7280", fontSize: 15, fontWeight: "500" }}>
                    No records found for this date
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={() =>
              loading ? (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#2563EB" />
                </View>
              ) : null
            }
          />
        )}
      </View>

      {/* DETAILS BOTTOM SHEET */}
      <Modal
        visible={!!selectedRecord}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedRecord(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ModalDismiss onPress={() => setSelectedRecord(null)} />
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "90%",
            }}
          >
            {/* Sheet Header */}
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
                  Attendance Details
                </Text>
                <Text style={{ fontSize: 14, color: "#6B7280" }}>
                  {formatDateLabel(selectedDate)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedRecord(null)}
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

            {selectedRecord && (
              <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
                {/* EMPLOYEE */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 16,
                    backgroundColor: "#F9FAFB",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    marginBottom: 20,
                  }}
                >
                  {selectedRecord.profileImage || selectedRecord.avatar ? (
                    <Image
                      source={{ uri: selectedRecord.profileImage || selectedRecord.avatar }}
                      style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#F3F4F6", marginRight: 14 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        backgroundColor: "#EFF6FF",
                        borderWidth: 1,
                        borderColor: "#DBEAFE",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 14,
                      }}
                    >
                      <Text style={{ color: "#2563EB", fontSize: 20, fontWeight: "700" }}>
                        {getInitial(selectedRecord.name)}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }} numberOfLines={1}>
                      {selectedRecord.name}
                    </Text>
                    <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }} numberOfLines={1}>
                      {selectedRecord.email}
                    </Text>
                    {!!selectedRecord.designation && (
                      <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }} numberOfLines={1}>
                        {selectedRecord.designation}
                      </Text>
                    )}
                  </View>

                  {/* STATUS */}
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: statusTheme(selectedRecord.status).bg,
                      borderWidth: 1,
                      borderColor: statusTheme(selectedRecord.status).border,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: statusTheme(selectedRecord.status).text }}>
                      {selectedRecord.status}
                    </Text>
                  </View>
                </View>

                {/* PUNCH IN / PUNCH OUT */}
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                  <DetailCard
                    icon="log-in-outline"
                    iconBg="#D1FAE5"
                    iconColor="#059669"
                    label="Punch In"
                    value={formatTime(selectedRecord.punchIn)}
                  />
                  <DetailCard
                    icon="log-out-outline"
                    iconBg="#FEE2E2"
                    iconColor="#DC2626"
                    label="Punch Out"
                    value={formatTime(selectedRecord.punchOut)}
                  />
                </View>

                {/* LOCATION / WORKING TIME */}
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <DetailCard
                    icon="location-outline"
                    iconBg="#FEF3C7"
                    iconColor="#D97706"
                    label="Location"
                    value={
                      selectedRecord.latitude && selectedRecord.longitude
                        ? `${Number(selectedRecord.latitude).toFixed(4)}, ${Number(selectedRecord.longitude).toFixed(4)}`
                        : "--"
                    }
                    onPress={
                      selectedRecord.latitude && selectedRecord.longitude
                        ? () =>
                            Linking.openURL(
                              `https://www.google.com/maps/search/?api=1&query=${selectedRecord.latitude},${selectedRecord.longitude}`
                            )
                        : undefined
                    }
                  />
                  <TimeTracker punchIn={selectedRecord.punchIn} punchOut={selectedRecord.punchOut} />
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================================
// DETAIL CARD (half width)
// ============================================================
function DetailCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flex: 1,
        padding: 14,
        backgroundColor: "#F9FAFB",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E5E7EB",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            backgroundColor: iconBg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        {onPress && <Ionicons name="open-outline" size={14} color="#9CA3AF" />}
      </View>
      <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text style={{ color: "#111827", fontSize: 13, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
        {value}
      </Text>
    </Wrapper>
  );
}

// ============================================================
// LIVE TIME TRACKER
// ============================================================
function TimeTracker({ punchIn, punchOut }: { punchIn: string; punchOut: string }) {
  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    if (!punchIn || punchIn === "--") {
      setElapsed("--");
      return;
    }

    const calculateTime = () => {
      const now = new Date();
      const [inH, inM, inS] = punchIn.split(":").map(Number);
      const inTime = new Date();
      inTime.setHours(inH || 0, inM || 0, inS || 0);

      let diff = 0;

      if (punchOut && punchOut !== "--") {
        const [outH, outM, outS] = punchOut.split(":").map(Number);
        const outTime = new Date();
        outTime.setHours(outH || 0, outM || 0, outS || 0);
        diff = outTime.getTime() - inTime.getTime();
      } else {
        diff = now.getTime() - inTime.getTime();
      }

      if (diff < 0) diff = 0;

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setElapsed(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      );
    };

    calculateTime();

    let interval: ReturnType<typeof setInterval> | undefined;
    if (!punchOut || punchOut === "--") {
      interval = setInterval(calculateTime, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [punchIn, punchOut]);

  const isLive = (!punchOut || punchOut === "--") && !!punchIn && punchIn !== "--";

  return (
    <View
      style={{
        flex: 1,
        padding: 14,
        backgroundColor: isLive ? "#ECFDF5" : "#F9FAFB",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: isLive ? "#A7F3D0" : "#E5E7EB",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            backgroundColor: isLive ? "#D1FAE5" : "#EDE9FE",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="time-outline" size={18} color={isLive ? "#059669" : "#7C3AED"} />
        </View>
        {isLive && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 7,
              paddingVertical: 3,
              borderRadius: 8,
              backgroundColor: "#D1FAE5",
              borderWidth: 1,
              borderColor: "#A7F3D0",
            }}
          >
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 3,
                backgroundColor: "#10B981",
                marginRight: 4,
              }}
            />
            <Text style={{ fontSize: 8, fontWeight: "800", color: "#059669" }}>LIVE</Text>
          </View>
        )}
      </View>
      <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
        Working Time
      </Text>
      <Text
        style={{
          color: isLive ? "#059669" : "#111827",
          fontSize: 15,
          fontWeight: "800",
          marginTop: 2,
          letterSpacing: 0.5,
        }}
        numberOfLines={1}
      >
        {elapsed}
      </Text>
    </View>
  );
}

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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
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
import ModalDismiss from "../../components/ModalDismiss";
import RefreshSessionButton from "../../components/RefreshSessionButton";
import { isAuthError } from "../../utils/authStorage";

type Props = NativeStackScreenProps<RootStackParamList, "AdminPayslips">;

type PayslipStatus = "Draft" | "Created" | "Paid";

interface Payslip {
  id: string;
  _id?: string;
  empId: string;
  name: string;
  email?: string;
  month: string;
  year: string;
  netPay: number;
  status: PayslipStatus;
  generatedOn?: string;
  basicSalary?: number;
  pf?: number;
  esi?: number;
  pt?: number;
  tds?: number;
  leavesTaken?: number;
  leaveDeduction?: number;
  totalWorkingDays?: number;
  paidDays?: number;
  startDate?: string;
  endDate?: string;
  profileImage?: string;
  avatar?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_OPTIONS = ["All", ...MONTHS];
const YEAR_OPTIONS = ["All", "2023", "2024", "2025", "2026"];
const STATUS_OPTIONS = ["All", "Draft", "Created", "Paid"];

const statusTheme = (status: string) => {
  switch (status) {
    case "Paid":
      return {
        bg: "#ECFDF5",
        border: "#A7F3D0",
        text: "#059669",
        dot: "#10B981",
        icon: "checkmark-circle" as const,
      };
    case "Created":
      return {
        bg: "#EFF6FF",
        border: "#BFDBFE",
        text: "#2563EB",
        dot: "#3B82F6",
        icon: "document-text" as const,
      };
    default:
      return {
        bg: "#F9FAFB",
        border: "#E5E7EB",
        text: "#6B7280",
        dot: "#9CA3AF",
        icon: "create" as const,
      };
  }
};

const formatCurrency = (value?: number) => {
  const n = Number(value || 0);
  return `₹ ${n.toLocaleString("en-IN")}`;
};

export default function AdminPayslipsScreen({ navigation, embedded }: Props & { embedded?: boolean }) {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  /** the shell header search field drives this page */
  useShellSearch(setSearchTerm);
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();

  const [monthFilter, setMonthFilter] = useState("All");
  const [yearFilter, setYearFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [openDropdown, setOpenDropdown] = useState<"month" | "year" | "status" | null>(null);
  const [selected, setSelected] = useState<Payslip | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // ============================================================
  // FETCH
  // ============================================================
  const fetchPayslips = useCallback(
    async (pageToLoad = 1, opts: { silent?: boolean; resetUrl?: boolean } = {}) => {
      const requestId = ++requestIdRef.current;

      if (pageToLoad === 1) {
        if (!opts.silent) setLoading(true);
      } else {
        setLoadingMore(true);
      }

      setError(null);

      if (opts.resetUrl) resetBaseUrl();

      try {
        const session = await getAuthSession();

        if (!session?.token) {
          if (requestId === requestIdRef.current) setError("Not authenticated.");
          return;
        }

        const params = new URLSearchParams();
        params.append("page", pageToLoad.toString());
        params.append("limit", "10");
        if (searchTerm.trim()) params.append("search", searchTerm.trim());
        if (monthFilter !== "All") params.append("month", monthFilter);
        if (yearFilter !== "All") params.append("year", yearFilter);
        if (statusFilter !== "All") params.append("status", statusFilter);

        const res = await apiFetch(`/api/admin/payslips?${params.toString()}`, session.token);

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || `Server error (${res.status})`);
        }

        const data = await res.json();
        if (requestId !== requestIdRef.current) return;

        const raw = data.payslips || (Array.isArray(data) ? data : []);
        const mapped: Payslip[] = raw.map((d: any) => ({ ...d, id: d._id || d.id }));

        if (pageToLoad === 1) {
          setPayslips(mapped);
        } else {
          setPayslips((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const unique = mapped.filter((item) => !existingIds.has(item.id));
            return [...prev, ...unique];
          });
        }

        if (data.pagination) {
          setPage(data.pagination.page || pageToLoad);
          setTotalPages(data.pagination.pages || 1);
        } else {
          setPage(pageToLoad);
          setTotalPages(mapped.length < 10 ? pageToLoad : pageToLoad + 1);
        }
      } catch (err: any) {
        if (requestId !== requestIdRef.current) return;
        const message = err?.message?.includes("Network request failed")
          ? "Cannot reach server."
          : err?.message || "Something went wrong.";
        setError(message);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [searchTerm, monthFilter, yearFilter, statusFilter]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchPayslips(1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, monthFilter, yearFilter, statusFilter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchPayslips(1, { silent: true, resetUrl: true });
  }, [fetchPayslips]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return;
    if (page >= totalPages) return;
    fetchPayslips(page + 1, { silent: true });
  }, [loading, loadingMore, page, totalPages, fetchPayslips]);

  // ============================================================
  // UPDATE / DELETE
  // ============================================================
  const updateStatus = async (status: PayslipStatus) => {
    if (!selected) return;
    setUpdating(true);
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(`/api/admin/payslips/${selected.id}`, session.token, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        setPayslips((prev) => prev.map((p) => (p.id === selected.id ? { ...p, status } : p)));
        setSelected((prev) => (prev ? { ...prev, status } : prev));
      }
    } catch (err) {
      console.error("Failed to update status", err);
    } finally {
      setUpdating(false);
    }
  };

  const deletePayslip = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(`/api/admin/payslips/${selected.id}`, session.token, {
        method: "DELETE",
      });

      if (res.ok) {
        setPayslips((prev) => prev.filter((p) => p.id !== selected.id));
        setConfirmDelete(false);
        setSelected(null);
      }
    } catch (err) {
      console.error("Delete error", err);
    } finally {
      setDeleting(false);
    }
  };

  // ============================================================
  // HELPERS
  // ============================================================
  const getInitial = (name?: string) => name?.charAt(0)?.toUpperCase() || "?";

  const formatDate = (date?: string) => {
    if (!date) return "N/A";
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
  };

  const deductionsOf = (p: Payslip) =>
    (p.pf || 0) + (p.esi || 0) + (p.pt || 0) + (p.tds || 0) + (p.leaveDeduction || 0);

  // ============================================================
  // DROPDOWN
  // ============================================================
  const renderDropdown = (
    type: "month" | "year" | "status",
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
          <ScrollView
            nestedScrollEnabled
            style={{
              position: "absolute",
              top: 50,
              left: 0,
              right: 0,
              maxHeight: 220,
              backgroundColor: "#FFFFFF",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            {options.map((option) => {
              const isSelected = value === option;
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
                    backgroundColor: isSelected ? "#EFF6FF" : "#FFFFFF",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      color: isSelected ? "#2563EB" : "#374151",
                      fontSize: 12,
                      fontWeight: isSelected ? "700" : "500",
                    }}
                  >
                    {option === "All" ? `All ${label}` : option}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={16} color="#2563EB" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  };

  // ============================================================
  // PAYSLIP CARD
  // ============================================================
  const renderPayslip = ({ item }: { item: Payslip }) => {
    const photoUri = item.profileImage || item.avatar;
    const theme = statusTheme(item.status);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setSelected(item)}
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 20,
          padding: 16,
          borderWidth: 1,
          borderColor: "#F3F4F6",
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
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
              {item.month} {item.year}
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
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 3,
                backgroundColor: theme.dot,
                marginRight: 5,
              }}
            />
            <Text style={{ fontSize: 10, fontWeight: "800", color: theme.text }}>{item.status}</Text>
          </View>
        </View>

        {/* NET PAY ROW */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 14,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: "#F3F4F6",
          }}
        >
          <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
            Net Pay
          </Text>
          <Text style={{ color: "#059669", fontSize: 16, fontWeight: "800" }}>
            {formatCurrency(item.netPay)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  /** the header menu owns these filters while embedded */
  useShellFilters([
    {
      key: "month",
      label: "Months",
      value: monthFilter,
      defaultValue: "All",
      options: toShellOptions(MONTH_OPTIONS),
      onChange: setMonthFilter,
    },
    {
      key: "year",
      label: "Years",
      value: yearFilter,
      defaultValue: "All",
      options: toShellOptions(YEAR_OPTIONS),
      onChange: setYearFilter,
    },
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
          <Text style={{ color: "#111827", fontSize: 20, fontWeight: "700" }}>Payslips</Text>
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
            <View style={{ flexDirection: "row", gap: 10 }}>
              {renderDropdown("month", "Months", monthFilter, MONTH_OPTIONS, setMonthFilter)}
              {renderDropdown("year", "Years", yearFilter, YEAR_OPTIONS, setYearFilter)}
              {renderDropdown("status", "Status", statusFilter, STATUS_OPTIONS, setStatusFilter)}
            </View>
          )}
        </View>
      )}

      {/* LIST */}
      <View style={{ flex: 1 }}>
        {error ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Ionicons name="alert-circle-outline" size={48} color="#EF4444" style={{ marginBottom: 16 }} />
            <Text
              style={{ color: "#111827", fontSize: 16, fontWeight: "600", textAlign: "center", marginBottom: 8 }}
            >
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
            data={payslips}
            keyExtractor={(item, index) => item.id || `payslip-${index}`}
            renderItem={renderPayslip}
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
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={() =>
              !loading ? (
                <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
                  <Ionicons name="cash-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
                  <Text style={{ color: "#6B7280", fontSize: 15, fontWeight: "500" }}>No payslips found</Text>
                </View>
              ) : null
            }
            ListFooterComponent={() =>
              loading || loadingMore ? (
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
        visible={!!selected}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelected(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ModalDismiss onPress={() => setSelected(null)} />
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
                  Payslip Details
                </Text>
                <Text style={{ fontSize: 14, color: "#6B7280" }}>
                  {selected?.month} {selected?.year}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelected(null)}
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

            {selected && (
              <ScrollView contentContainerStyle={{ padding: 24, paddingTop: shellTop, paddingBottom: 40 }}>
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
                    marginBottom: 12,
                  }}
                >
                  {selected.profileImage || selected.avatar ? (
                    <Image
                      source={{ uri: selected.profileImage || selected.avatar }}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        backgroundColor: "#F3F4F6",
                        marginRight: 14,
                      }}
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
                        {getInitial(selected.name)}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }} numberOfLines={1}>
                      {selected.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }} numberOfLines={1}>
                      {selected.empId}
                    </Text>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: statusTheme(selected.status).bg,
                      borderWidth: 1,
                      borderColor: statusTheme(selected.status).border,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: statusTheme(selected.status).dot,
                        marginRight: 5,
                      }}
                    />
                    <Text style={{ fontSize: 11, fontWeight: "800", color: statusTheme(selected.status).text }}>
                      {selected.status}
                    </Text>
                  </View>
                </View>

                {/* NET PAY HERO */}
                <View
                  style={{
                    padding: 18,
                    backgroundColor: "#ECFDF5",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#A7F3D0",
                    marginBottom: 20,
                  }}
                >
                  <Text style={{ color: "#059669", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
                    Net Pay
                  </Text>
                  <Text style={{ color: "#065F46", fontSize: 30, fontWeight: "800", marginTop: 4 }}>
                    {formatCurrency(selected.netPay)}
                  </Text>
                  <Text style={{ color: "#059669", fontSize: 11, fontWeight: "600", marginTop: 4 }}>
                    Generated on {formatDate(selected.generatedOn)}
                  </Text>
                </View>

                {/* PERIOD */}
                <SectionTitle icon="calendar-outline" color="#2563EB" title="Pay Period" />
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                  <InfoCard
                    icon="play-outline"
                    iconBg="#D1FAE5"
                    iconColor="#059669"
                    label="Start Date"
                    value={formatDate(selected.startDate)}
                  />
                  <InfoCard
                    icon="stop-outline"
                    iconBg="#FEE2E2"
                    iconColor="#DC2626"
                    label="End Date"
                    value={formatDate(selected.endDate)}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
                  <InfoCard
                    icon="today-outline"
                    iconBg="#EFF6FF"
                    iconColor="#2563EB"
                    label="Working Days"
                    value={String(selected.totalWorkingDays ?? "--")}
                  />
                  <InfoCard
                    icon="checkmark-done-outline"
                    iconBg="#F5F3FF"
                    iconColor="#7C3AED"
                    label="Paid Days"
                    value={String(selected.paidDays ?? "--")}
                  />
                </View>

                {/* EARNINGS */}
                <SectionTitle icon="trending-up-outline" color="#059669" title="Earnings" />
                <AmountRow label="Basic Salary" value={selected.basicSalary} positive />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: "#ECFDF5",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#A7F3D0",
                    marginBottom: 20,
                  }}
                >
                  <Text style={{ color: "#065F46", fontSize: 12, fontWeight: "800" }}>Gross Earnings</Text>
                  <Text style={{ color: "#065F46", fontSize: 13, fontWeight: "800" }}>
                    {formatCurrency(selected.basicSalary)}
                  </Text>
                </View>

                {/* DEDUCTIONS */}
                <SectionTitle icon="trending-down-outline" color="#DC2626" title="Deductions" />
                <AmountRow label="Provident Fund (PF)" value={selected.pf} />
                <AmountRow label="ESI" value={selected.esi} />
                <AmountRow label="Professional Tax (PT)" value={selected.pt} />
                <AmountRow label="TDS" value={selected.tds} />
                <AmountRow
                  label={`Leave Deduction${selected.leavesTaken ? ` (${selected.leavesTaken} days)` : ""}`}
                  value={selected.leaveDeduction}
                />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: "#FEF2F2",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#FECACA",
                    marginBottom: 20,
                  }}
                >
                  <Text style={{ color: "#991B1B", fontSize: 12, fontWeight: "800" }}>Total Deductions</Text>
                  <Text style={{ color: "#991B1B", fontSize: 13, fontWeight: "800" }}>
                    {formatCurrency(deductionsOf(selected))}
                  </Text>
                </View>

                {/* UPDATE STATUS */}
                <SectionTitle icon="swap-horizontal-outline" color="#7C3AED" title="Update Status" />
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
                  {(["Draft", "Created", "Paid"] as PayslipStatus[]).map((s) => {
                    const theme = statusTheme(s);
                    const active = selected.status === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        disabled={updating || active}
                        onPress={() => updateStatus(s)}
                        style={{
                          flex: 1,
                          paddingVertical: 12,
                          borderRadius: 12,
                          backgroundColor: active ? theme.bg : "#F9FAFB",
                          borderWidth: 1.5,
                          borderColor: active ? theme.text : "#E5E7EB",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: updating ? 0.6 : 1,
                        }}
                      >
                        <Ionicons
                          name={theme.icon}
                          size={17}
                          color={active ? theme.text : "#9CA3AF"}
                          style={{ marginBottom: 4 }}
                        />
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: active ? "800" : "600",
                            color: active ? theme.text : "#6B7280",
                          }}
                        >
                          {s}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {updating && (
                  <View style={{ alignItems: "center", marginBottom: 14 }}>
                    <ActivityIndicator size="small" color="#2563EB" />
                  </View>
                )}

                {/* DELETE */}
                <TouchableOpacity
                  onPress={() => setConfirmDelete(true)}
                  style={{
                    paddingVertical: 14,
                    borderRadius: 12,
                    backgroundColor: "#FEF2F2",
                    borderWidth: 1,
                    borderColor: "#FECACA",
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#DC2626" style={{ marginRight: 8 }} />
                  <Text style={{ color: "#DC2626", fontWeight: "600", fontSize: 15 }}>Delete Payslip</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* DELETE CONFIRMATION */}
      <Modal
        visible={confirmDelete}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setConfirmDelete(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ModalDismiss onPress={() => setConfirmDelete(false)} />
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>Delete Payslip</Text>
              <TouchableOpacity
                onPress={() => setConfirmDelete(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={18} color="#4B5563" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 14, color: "#6B7280", lineHeight: 21, marginBottom: 24 }}>
              This will permanently remove the {selected?.month} {selected?.year} payslip for{" "}
              {selected?.name}. This action cannot be undone.
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setConfirmDelete(false)}
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
                disabled={deleting}
                onPress={deletePayslip}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: "#DC2626",
                  alignItems: "center",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================================
// SECTION TITLE
// ============================================================
function SectionTitle({
  icon,
  color,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
      }}
    >
      <Ionicons name={icon} size={15} color={color} style={{ marginRight: 7 }} />
      <Text
        style={{
          color: "#374151",
          fontSize: 11,
          fontWeight: "800",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

// ============================================================
// AMOUNT ROW
// ============================================================
function AmountRow({
  label,
  value,
  positive,
}: {
  label: string;
  value?: number;
  positive?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 11,
        paddingHorizontal: 14,
        backgroundColor: "#F9FAFB",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        marginBottom: 8,
      }}
    >
      <Text style={{ color: "#4B5563", fontSize: 12, fontWeight: "600", flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={{
          color: positive ? "#059669" : "#DC2626",
          fontSize: 13,
          fontWeight: "700",
          marginLeft: 10,
        }}
      >
        {positive ? "" : "- "}
        {formatCurrency(value)}
      </Text>
    </View>
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

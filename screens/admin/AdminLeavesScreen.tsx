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

type Props = NativeStackScreenProps<RootStackParamList, "AdminLeaves">;

interface LeaveRequest {
  _id: string;
  id?: string;
  userId: string;
  userName: string;
  email?: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  appliedOn: string;
  rejectionReason?: string;
  profileImage?: string;
  avatar?: string;
}

const TYPE_OPTIONS = ["All", "Casual", "Sick", "Annual", "WFH"];
const STATUS_OPTIONS = ["All", "Pending", "Approved", "Rejected"];

export default function AdminLeavesScreen({ navigation, embedded }: Props & { embedded?: boolean }) {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  /** the shell header search field drives this page */
  useShellSearch(setSearchTerm);
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);

  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [openDropdown, setOpenDropdown] = useState<"type" | "status" | null>(null);

  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [updating, setUpdating] = useState(false);

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // ============================================================
  // FETCH LEAVES
  // ============================================================
  const fetchLeaves = useCallback(
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
        if (statusFilter !== "All") params.append("status", statusFilter);
        if (typeFilter !== "All") params.append("type", typeFilter);

        const res = await apiFetch(`/api/admin/leaves?${params.toString()}`, session.token);

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || `Server error (${res.status})`);
        }

        const data = await res.json();
        if (requestId !== requestIdRef.current) return;

        const newLeaves: LeaveRequest[] = Array.isArray(data.leaves) ? data.leaves : [];

        if (pageToLoad === 1) {
          setLeaves(newLeaves);
        } else {
          setLeaves((prev) => {
            const existingIds = new Set(prev.map((item) => item._id || item.id));
            const unique = newLeaves.filter((item) => !existingIds.has(item._id || item.id));
            return [...prev, ...unique];
          });
        }

        if (data.pagination) {
          setPage(data.pagination.page || pageToLoad);
          setTotalPages(data.pagination.pages || 1);
        } else {
          setPage(pageToLoad);
          setTotalPages(newLeaves.length < 10 ? pageToLoad : pageToLoad + 1);
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
    [searchTerm, statusFilter, typeFilter]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchLeaves(1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, statusFilter, typeFilter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchLeaves(1, { silent: true, resetUrl: true });
  }, [fetchLeaves]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return;
    if (page >= totalPages) return;
    fetchLeaves(page + 1, { silent: true });
  }, [loading, loadingMore, page, totalPages, fetchLeaves]);

  // ============================================================
  // UPDATE STATUS
  // ============================================================
  const performStatusUpdate = async (id: string, status: string, reason?: string) => {
    setUpdating(true);
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(`/api/admin/leaves/${id}`, session.token, {
        method: "PUT",
        body: JSON.stringify({ status, rejectionReason: reason }),
      });

      if (res.ok) {
        setLeaves((prev) =>
          prev.map((l) => ((l._id || l.id) === id ? { ...l, status, rejectionReason: reason } : l))
        );

        setRejectingId(null);
        setRejectionReason("");
        setSelectedLeave(null);
      }
    } catch (err) {
      console.error("Update failed", err);
    } finally {
      setUpdating(false);
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

  const formatTime = (date?: string) => {
    if (!date) return "";
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const getDuration = (start?: string, end?: string) => {
    if (!start || !end) return "N/A";
    const s = new Date(start);
    const e = new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "N/A";
    const diff = Math.abs(e.getTime() - s.getTime());
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
    return days === 1 ? "1 Day" : `${days} Days`;
  };

  const statusTheme = (status: string) => {
    switch (status) {
      case "Approved":
        return { bg: "#D1FAE5", border: "#A7F3D0", text: "#059669" };
      case "Rejected":
        return { bg: "#FEE2E2", border: "#FECACA", text: "#DC2626" };
      default:
        return { bg: "#FEF3C7", border: "#FDE68A", text: "#D97706" };
    }
  };

  const typeTheme = (type: string) => {
    switch (type) {
      case "Casual":
        return { bg: "#EFF6FF", border: "#BFDBFE", text: "#2563EB" };
      case "Sick":
        return { bg: "#FEE2E2", border: "#FECACA", text: "#DC2626" };
      case "Annual":
        return { bg: "#F5F3FF", border: "#DDD6FE", text: "#7C3AED" };
      case "WFH":
        return { bg: "#ECFEFF", border: "#A5F3FC", text: "#0891B2" };
      default:
        return { bg: "#F3F4F6", border: "#E5E7EB", text: "#4B5563" };
    }
  };

  // ============================================================
  // DROPDOWN
  // ============================================================
  const renderDropdown = (
    type: "type" | "status",
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
                  <Text
                    style={{
                      color: selected ? "#2563EB" : "#374151",
                      fontSize: 12,
                      fontWeight: selected ? "700" : "500",
                    }}
                  >
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
  // LEAVE CARD
  // ============================================================
  const renderLeave = ({ item }: { item: LeaveRequest }) => {
    const photoUri = item.profileImage || item.avatar;
    const theme = statusTheme(item.status);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setSelectedLeave(item)}
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
                {getInitial(item.userName)}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: "#111827", fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
            {item.userName || "Unknown"}
          </Text>
          <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {formatDate(item.appliedOn)}
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

  const activeLeaveId = selectedLeave?._id || selectedLeave?.id || "";

  /** the header menu owns these filters while embedded */
  useShellFilters([
    {
      key: "type",
      label: "Types",
      value: typeFilter,
      defaultValue: "All",
      options: toShellOptions(TYPE_OPTIONS),
      onChange: setTypeFilter,
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
          <Text style={{ color: "#111827", fontSize: 20, fontWeight: "700" }}>Leaves</Text>
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
                placeholder="Search employees, type or reason..."
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
            <View style={{ flexDirection: "row", gap: 12 }}>
              {renderDropdown("type", "Types", typeFilter, TYPE_OPTIONS, setTypeFilter)}
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
            data={leaves}
            keyExtractor={(item, index) => item._id || item.id || `leave-${index}`}
            renderItem={renderLeave}
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
                  <Ionicons name="document-text-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
                  <Text style={{ color: "#6B7280", fontSize: 15, fontWeight: "500" }}>
                    No leave requests found
                  </Text>
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
        visible={!!selectedLeave}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedLeave(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ModalDismiss onPress={() => setSelectedLeave(null)} />
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
                  Leave Request
                </Text>
                <Text style={{ fontSize: 14, color: "#6B7280" }}>Review request details</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedLeave(null)}
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

            {selectedLeave && (
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
                    marginBottom: 12,
                  }}
                >
                  {selectedLeave.profileImage || selectedLeave.avatar ? (
                    <Image
                      source={{ uri: selectedLeave.profileImage || selectedLeave.avatar }}
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
                        {getInitial(selectedLeave.userName)}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }} numberOfLines={1}>
                      {selectedLeave.userName}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }} numberOfLines={1}>
                      Applied on {formatDate(selectedLeave.appliedOn)}
                    </Text>
                    {!!formatTime(selectedLeave.appliedOn) && (
                      <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>
                        {formatTime(selectedLeave.appliedOn)}
                      </Text>
                    )}
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: statusTheme(selectedLeave.status).bg,
                      borderWidth: 1,
                      borderColor: statusTheme(selectedLeave.status).border,
                    }}
                  >
                    <Text
                      style={{ fontSize: 11, fontWeight: "800", color: statusTheme(selectedLeave.status).text }}
                    >
                      {selectedLeave.status}
                    </Text>
                  </View>
                </View>

                {/* TYPE / DAYS */}
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
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
                    <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
                      Leave Type
                    </Text>
                    <View
                      style={{
                        alignSelf: "flex-start",
                        marginTop: 6,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                        backgroundColor: typeTheme(selectedLeave.type).bg,
                        borderWidth: 1,
                        borderColor: typeTheme(selectedLeave.type).border,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "800", color: typeTheme(selectedLeave.type).text }}>
                        {selectedLeave.type || "N/A"}
                      </Text>
                    </View>
                  </View>

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
                    <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
                      Duration
                    </Text>
                    <Text style={{ color: "#111827", fontSize: 15, fontWeight: "800", marginTop: 6 }}>
                      {getDuration(selectedLeave.startDate, selectedLeave.endDate)}
                    </Text>
                  </View>
                </View>

                {/* START / END */}
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
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
                        backgroundColor: "#D1FAE5",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 8,
                      }}
                    >
                      <Ionicons name="calendar-outline" size={18} color="#059669" />
                    </View>
                    <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
                      Start Date
                    </Text>
                    <Text
                      style={{ color: "#111827", fontSize: 13, fontWeight: "700", marginTop: 2 }}
                      numberOfLines={1}
                    >
                      {formatDate(selectedLeave.startDate)}
                    </Text>
                  </View>

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
                        backgroundColor: "#FEE2E2",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 8,
                      }}
                    >
                      <Ionicons name="calendar-outline" size={18} color="#DC2626" />
                    </View>
                    <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
                      End Date
                    </Text>
                    <Text
                      style={{ color: "#111827", fontSize: 13, fontWeight: "700", marginTop: 2 }}
                      numberOfLines={1}
                    >
                      {formatDate(selectedLeave.endDate)}
                    </Text>
                  </View>
                </View>

                {/* REASON */}
                <View
                  style={{
                    padding: 14,
                    backgroundColor: "#F9FAFB",
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
                    Reason
                  </Text>
                  <Text style={{ color: "#374151", fontSize: 13, lineHeight: 20, marginTop: 6 }}>
                    {selectedLeave.reason || "No reason provided."}
                  </Text>
                </View>

                {/* REJECTION REASON */}
                {!!selectedLeave.rejectionReason && (
                  <View
                    style={{
                      padding: 14,
                      backgroundColor: "#FEF2F2",
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: "#FECACA",
                      marginBottom: 12,
                    }}
                  >
                    <Text style={{ color: "#DC2626", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
                      Rejection Reason
                    </Text>
                    <Text style={{ color: "#7F1D1D", fontSize: 13, lineHeight: 20, marginTop: 6 }}>
                      {selectedLeave.rejectionReason}
                    </Text>
                  </View>
                )}

                {/* ACTIONS */}
                {selectedLeave.status === "Pending" && (
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                    <TouchableOpacity
                      disabled={updating}
                      onPress={() => setRejectingId(activeLeaveId)}
                      style={{
                        flex: 1,
                        paddingVertical: 14,
                        borderRadius: 12,
                        backgroundColor: "#DC2626",
                        flexDirection: "row",
                        justifyContent: "center",
                        alignItems: "center",
                        opacity: updating ? 0.6 : 1,
                      }}
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Reject</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      disabled={updating}
                      onPress={() => performStatusUpdate(activeLeaveId, "Approved")}
                      style={{
                        flex: 1,
                        paddingVertical: 14,
                        borderRadius: 12,
                        backgroundColor: "#10B981",
                        flexDirection: "row",
                        justifyContent: "center",
                        alignItems: "center",
                        opacity: updating ? 0.6 : 1,
                      }}
                    >
                      {updating ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={18}
                            color="#FFFFFF"
                            style={{ marginRight: 8 }}
                          />
                          <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Approve</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* REJECTION BOTTOM SHEET */}
      <Modal
        visible={!!rejectingId}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setRejectingId(null);
          setRejectionReason("");
        }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ModalDismiss onPress={() => {
          setRejectingId(null);
          setRejectionReason("");
        }} />
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
                marginBottom: 20,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>Reject Leave</Text>
              <TouchableOpacity
                onPress={() => {
                  setRejectingId(null);
                  setRejectionReason("");
                }}
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

            <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>
              Provide a reason. This will be visible to the employee.
            </Text>

            <TextInput
              style={{
                backgroundColor: "#F9FAFB",
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 12,
                padding: 16,
                minHeight: 110,
                textAlignVertical: "top",
                fontSize: 14,
                color: "#111827",
                marginBottom: 16,
              }}
              placeholder="e.g. Insufficient leave balance..."
              placeholderTextColor="#9CA3AF"
              multiline
              value={rejectionReason}
              onChangeText={setRejectionReason}
            />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setRejectingId(null);
                  setRejectionReason("");
                }}
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
                disabled={!rejectionReason.trim() || updating}
                onPress={() =>
                  rejectingId && performStatusUpdate(rejectingId, "Rejected", rejectionReason.trim())
                }
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: rejectionReason.trim() ? "#DC2626" : "#FCA5A5",
                  alignItems: "center",
                }}
              >
                {updating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Confirm Reject</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

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

type Props = NativeStackScreenProps<RootStackParamList, "AdminComplaints">;

type ComplaintStatus = "Open" | "Investigating" | "Resolved";

interface Complaint {
  id: string;
  _id?: string;
  userId?: string;
  userName: string;
  email?: string;
  subject: string;
  description: string;
  date: string;
  status: ComplaintStatus;
  avatar?: string;
  profileImage?: string;
  department?: string;
}

const STATUS_OPTIONS = ["All", "Open", "Investigating", "Resolved"];
const UPDATE_STATUSES: ComplaintStatus[] = ["Open", "Investigating", "Resolved"];

const statusTheme = (status: string) => {
  switch (status) {
    case "Resolved":
      return {
        bg: "#ECFDF5",
        border: "#A7F3D0",
        text: "#059669",
        dot: "#10B981",
        icon: "checkmark-circle" as const,
      };
    case "Investigating":
      return {
        bg: "#FFFBEB",
        border: "#FDE68A",
        text: "#D97706",
        dot: "#F59E0B",
        icon: "search" as const,
      };
    default:
      return {
        bg: "#FEF2F2",
        border: "#FECACA",
        text: "#DC2626",
        dot: "#EF4444",
        icon: "alert-circle" as const,
      };
  }
};

export default function AdminComplaintsScreen({ navigation, embedded }: Props & { embedded?: boolean }) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
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

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [openDropdown, setOpenDropdown] = useState<"status" | null>(null);
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [updating, setUpdating] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // ============================================================
  // FETCH
  // ============================================================
  const fetchComplaints = useCallback(
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
        if (statusFilter !== "All") params.append("status", statusFilter);
        if (searchTerm.trim()) params.append("search", searchTerm.trim());

        const res = await apiFetch(`/api/admin/complaints?${params.toString()}`, session.token);

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || `Server error (${res.status})`);
        }

        const data = await res.json();
        if (requestId !== requestIdRef.current) return;

        const mapped: Complaint[] = (data.complaints || []).map((c: any) => ({
          id: c._id || c.id,
          userId: c.userId,
          userName: c.userName || "Unknown",
          email: c.email,
          subject: c.subject,
          description: c.description,
          date: c.date,
          status: c.status,
          avatar: c.avatar,
          profileImage: c.profileImage,
          department: c.department || "General",
        }));

        if (pageToLoad === 1) {
          setComplaints(mapped);
        } else {
          setComplaints((prev) => {
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
    [searchTerm, statusFilter]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchComplaints(1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, statusFilter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchComplaints(1, { silent: true, resetUrl: true });
  }, [fetchComplaints]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return;
    if (page >= totalPages) return;
    fetchComplaints(page + 1, { silent: true });
  }, [loading, loadingMore, page, totalPages, fetchComplaints]);

  // ============================================================
  // UPDATE STATUS
  // ============================================================
  const updateStatus = async (status: ComplaintStatus) => {
    if (!selected) return;
    setUpdating(true);
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        `/api/admin/complaints/${selected.id}?update=${status}`,
        session.token,
        { method: "PATCH" }
      );

      if (res.ok) {
        const updated = await res.json().catch(() => ({ status }));
        const newStatus = (updated?.status || status) as ComplaintStatus;

        setComplaints((prev) =>
          prev.map((c) => (c.id === selected.id ? { ...c, status: newStatus } : c))
        );
        setSelected((prev) => (prev ? { ...prev, status: newStatus } : prev));
      }
    } catch (err) {
      console.error("Failed to update status", err);
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
          </View>
        )}
      </View>
    );
  };

  // ============================================================
  // COMPLAINT CARD
  // ============================================================
  const renderComplaint = ({ item }: { item: Complaint }) => {
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
            {item.userName}
          </Text>
          <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {formatDate(item.date)}
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
          <Text style={{ color: "#111827", fontSize: 20, fontWeight: "700" }}>Complaints</Text>
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

      {/* SEARCH + FILTER */}
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
                placeholder="Search complaints..."
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
            data={complaints}
            keyExtractor={(item, index) => item.id || `complaint-${index}`}
            renderItem={renderComplaint}
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
                  <Ionicons name="chatbox-ellipses-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
                  <Text style={{ color: "#6B7280", fontSize: 15, fontWeight: "500" }}>No complaints found</Text>
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
                  Complaint Details
                </Text>
                <Text style={{ fontSize: 14, color: "#6B7280" }}>
                  Filed on {formatDate(selected?.date)}
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
                        {getInitial(selected.userName)}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }} numberOfLines={1}>
                      {selected.userName}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }} numberOfLines={1}>
                      {selected.email || selected.userId || "--"}
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

                {/* DEPARTMENT / DATE */}
                <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                  <InfoCard
                    icon="business-outline"
                    iconBg="#F5F3FF"
                    iconColor="#7C3AED"
                    label="Department"
                    value={selected.department || "General"}
                  />
                  <InfoCard
                    icon="calendar-outline"
                    iconBg="#EFF6FF"
                    iconColor="#2563EB"
                    label="Date Filed"
                    value={formatDate(selected.date)}
                  />
                </View>

                {/* SUBJECT */}
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
                    Subject
                  </Text>
                  <Text style={{ color: "#111827", fontSize: 15, fontWeight: "700", marginTop: 4 }}>
                    {selected.subject || "--"}
                  </Text>
                </View>

                {/* DESCRIPTION */}
                <View
                  style={{
                    padding: 14,
                    backgroundColor: "#F9FAFB",
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    marginBottom: 20,
                  }}
                >
                  <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
                    Description
                  </Text>
                  <Text style={{ color: "#374151", fontSize: 13, lineHeight: 21, marginTop: 6 }}>
                    {selected.description || "No description provided."}
                  </Text>
                </View>

                {/* UPDATE STATUS */}
                <Text
                  style={{
                    color: "#9CA3AF",
                    fontSize: 9,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    marginBottom: 10,
                  }}
                >
                  Update Status
                </Text>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  {UPDATE_STATUSES.map((s) => {
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
                  <View style={{ alignItems: "center", marginTop: 14 }}>
                    <ActivityIndicator size="small" color="#2563EB" />
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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

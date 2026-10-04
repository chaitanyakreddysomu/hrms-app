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
  Image,
  Linking,
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

type Props = NativeStackScreenProps<RootStackParamList, "AdminReferrals">;

interface CompanyHistoryItem {
  companyName?: string;
  role?: string;
  from?: string;
  to?: string;
  isCurrent?: boolean | string;
  duration?: string;
  noticePeriod?: string;
}

interface Referral {
  _id: string;
  candidateName: string;
  email?: string;
  phone?: string;
  location?: string;
  role?: string;
  status: string;
  remarks?: string;
  appliedOn?: string;
  relationship?: string;
  experienceType?: string;
  totalExperience?: string;
  qualification?: string;
  college?: string;
  passoutYear?: string;
  currentCompany?: string;
  currentCTC?: string;
  expectedSalary?: string;
  noticePeriod?: string;
  resumeUrl?: string;
  referredByName?: string;
  referredByEmpId?: string;
  referredByRole?: string;
  referredByDesignation?: string;
  referredByImage?: string;
  skills?: string[];
  whyReferring?: string;
  companyHistory?: CompanyHistoryItem[];
}

const STATUS_OPTIONS = [
  "All",
  "Under Review",
  "Interview Scheduled",
  "Shortlisted",
  "Selected",
  "Rejected",
  "Joined",
];

const UPDATE_STATUSES = STATUS_OPTIONS.filter((s) => s !== "All");

const SORT_OPTIONS = [
  { key: "recent", label: "Newest First" },
  { key: "oldest", label: "Oldest First" },
  { key: "name", label: "Name A-Z" },
  { key: "status", label: "Status" },
];

const statusTheme = (status: string) => {
  switch (status) {
    case "Interview Scheduled":
      return { bg: "#EFF6FF", border: "#BFDBFE", text: "#2563EB", icon: "calendar" as const, label: "Interview" };
    case "Shortlisted":
      return { bg: "#ECFEFF", border: "#A5F3FC", text: "#0891B2", icon: "star" as const, label: "Shortlisted" };
    case "Selected":
      return { bg: "#D1FAE5", border: "#A7F3D0", text: "#059669", icon: "checkmark-circle" as const, label: "Selected" };
    case "Rejected":
      return { bg: "#FEE2E2", border: "#FECACA", text: "#DC2626", icon: "close-circle" as const, label: "Rejected" };
    case "Joined":
      return { bg: "#F5F3FF", border: "#DDD6FE", text: "#7C3AED", icon: "business" as const, label: "Joined" };
    default:
      return { bg: "#FEF3C7", border: "#FDE68A", text: "#D97706", icon: "time" as const, label: "Review" };
  }
};

const roleTheme = (role?: string) => {
  switch ((role || "").toUpperCase()) {
    case "ADMIN":
      return { bg: "#FEE2E2", border: "#FECACA", text: "#DC2626" };
    case "HR":
      return { bg: "#F5F3FF", border: "#DDD6FE", text: "#7C3AED" };
    default:
      return { bg: "#EFF6FF", border: "#BFDBFE", text: "#2563EB" };
  }
};

export default function AdminReferralsScreen({ navigation, embedded }: Props & { embedded?: boolean }) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  /** the shell header search field drives this page */
  useShellSearch(setSearchTerm);
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("recent");

  const [openDropdown, setOpenDropdown] = useState<"status" | "sort" | null>(null);

  const [selected, setSelected] = useState<Referral | null>(null);
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftRemarks, setDraftRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // ============================================================
  // FETCH
  // ============================================================
  const fetchReferrals = useCallback(
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
        params.append("status", statusFilter);
        if (searchTerm.trim()) params.append("search", searchTerm.trim());

        const res = await apiFetch(`/api/referrals?${params.toString()}`, session.token);

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || `Server error (${res.status})`);
        }

        const data = await res.json();
        if (requestId !== requestIdRef.current) return;

        setReferrals(Array.isArray(data) ? data : []);
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
    [searchTerm, statusFilter]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchReferrals();
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, statusFilter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchReferrals({ silent: true, resetUrl: true });
  }, [fetchReferrals]);

  // ============================================================
  // UPDATE STATUS
  // ============================================================
  const saveStatus = async () => {
    if (!selected || !draftStatus) return;
    setSaving(true);
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(`/api/referrals/${selected._id}`, session.token, {
        method: "PATCH",
        body: JSON.stringify({ status: draftStatus, remarks: draftRemarks }),
      });

      if (res.ok) {
        setReferrals((prev) =>
          prev.map((r) =>
            r._id === selected._id ? { ...r, status: draftStatus, remarks: draftRemarks } : r
          )
        );
        setSelected((prev) =>
          prev ? { ...prev, status: draftStatus, remarks: draftRemarks } : prev
        );
        setStatusSheetOpen(false);
      }
    } catch (err) {
      console.error("Failed to update status", err);
    } finally {
      setSaving(false);
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

  const formatMonthYear = (date?: string) => {
    if (!date) return "N/A";
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  const calcDuration = (from?: string, to?: string) => {
    if (!from) return "";
    const start = new Date(from);
    const end = !to || to === "Present" ? new Date() : new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    if (months < 0) {
      years--;
      months += 12;
    }

    const parts = [];
    if (years > 0) parts.push(`${years} Year${years > 1 ? "s" : ""}`);
    if (months > 0) parts.push(`${months} Month${months > 1 ? "s" : ""}`);
    return parts.length ? parts.join(" ") : "Less than 1 month";
  };

  const sorted = useMemo(() => {
    const list = [...referrals];
    switch (sortBy) {
      case "oldest":
        return list.sort(
          (a, b) => new Date(a.appliedOn || 0).getTime() - new Date(b.appliedOn || 0).getTime()
        );
      case "name":
        return list.sort((a, b) => (a.candidateName || "").localeCompare(b.candidateName || ""));
      case "status":
        return list.sort((a, b) => (a.status || "").localeCompare(b.status || ""));
      default:
        return list.sort(
          (a, b) => new Date(b.appliedOn || 0).getTime() - new Date(a.appliedOn || 0).getTime()
        );
    }
  }, [referrals, sortBy]);

  // ============================================================
  // DROPDOWN
  // ============================================================
  const renderDropdown = (
    type: "status" | "sort",
    label: string,
    value: string,
    options: { key: string; label: string }[],
    setter: (value: string) => void
  ) => {
    const isOpen = openDropdown === type;
    const current = options.find((o) => o.key === value);

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
              {current?.label || value}
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
              const isSelected = value === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => {
                    setter(option.key);
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
                    {option.label}
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
  // REFERRAL CARD
  // ============================================================
  const renderReferral = ({ item }: { item: Referral }) => {
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
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: theme.bg,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 14,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
              {getInitial(item.candidateName)}
            </Text>
          </View>

          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ color: "#111827", fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
              {item.candidateName}
            </Text>
            <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }} numberOfLines={1}>
              {item.email || "--"}
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
            <Ionicons name={theme.icon} size={10} color={theme.text} style={{ marginRight: 4 }} />
            <Text style={{ fontSize: 10, fontWeight: "800", color: theme.text }}>{theme.label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const isFresher = selected?.experienceType === "Fresher";

  /** the header menu owns these filters while embedded */
  useShellFilters([
    {
      key: "status",
      label: "Status",
      value: statusFilter,
      defaultValue: "All",
      options: toShellOptions(STATUS_OPTIONS, (s) =>
        s === "All" ? "All Status" : s
      ),
      onChange: setStatusFilter,
    },
    {
      key: "sort",
      label: "Sort By",
      value: sortBy,
      defaultValue: "recent",
      options: SORT_OPTIONS.map((o) => ({ value: o.key, label: o.label })),
      onChange: setSortBy,
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
          <Text style={{ color: "#111827", fontSize: 20, fontWeight: "700" }}>Referrals</Text>
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

      {/* SEARCH + SORT */}
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
                placeholder="Search candidate, role or employee..."
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
              {renderDropdown(
                "status",
                "Status",
                statusFilter,
                STATUS_OPTIONS.map((s) => ({ key: s, label: s === "All" ? "All Status" : s })),
                setStatusFilter
              )}
              {renderDropdown("sort", "Sort By", sortBy, SORT_OPTIONS, setSortBy)}
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
        ) : loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : (
          <FlatList {...shellScroll}
            data={sorted}
            keyExtractor={(item, index) => item._id || `ref-${index}`}
            renderItem={renderReferral}
            ListHeaderComponent={
              <>
            <View
              style={{
                paddingHorizontal: 24,
                paddingTop: 20,
                paddingBottom: 4,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Ionicons name="people-outline" size={14} color="#6B7280" style={{ marginRight: 6 }} />
              <Text style={{ color: "#6B7280", fontSize: 12, fontWeight: "700" }}>
                {sorted.length} {sorted.length === 1 ? "referral" : "referrals"}
              </Text>
              <Text style={{ color: "#9CA3AF", fontSize: 12, fontWeight: "600", marginLeft: 6 }}>
                • {SORT_OPTIONS.find((s) => s.key === sortBy)?.label}
              </Text>
            </View>
              </>
            }
            contentContainerStyle={{ padding: 24, paddingTop: shellTop, paddingBottom: 150, flexGrow: 1 }}
            refreshControl={
              <RefreshControl
          progressViewOffset={shellTop}
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#2563EB"
                colors={["#2563EB"]}
              />
            }
            ListEmptyComponent={() => (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
                <Ionicons name="people-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
                <Text style={{ color: "#6B7280", fontSize: 15, fontWeight: "500" }}>No referrals found</Text>
              </View>
            )}
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
                  Referral Details
                </Text>
                <Text style={{ fontSize: 14, color: "#6B7280" }}>
                  Referred on {formatDate(selected?.appliedOn)}
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
                {/* CANDIDATE */}
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
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: statusTheme(selected.status).bg,
                      borderWidth: 1,
                      borderColor: statusTheme(selected.status).border,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 14,
                    }}
                  >
                    <Text
                      style={{ color: statusTheme(selected.status).text, fontSize: 20, fontWeight: "700" }}
                    >
                      {getInitial(selected.candidateName)}
                    </Text>
                  </View>

                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }} numberOfLines={1}>
                      {selected.candidateName}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#2563EB", fontWeight: "600", marginTop: 3 }} numberOfLines={1}>
                      {selected.role || "--"}
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
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: statusTheme(selected.status).text }}>
                      {statusTheme(selected.status).label}
                    </Text>
                  </View>
                </View>

                {/* CONTACT */}
                <SectionTitle icon="person-outline" color="#2563EB" title="Candidate Information" />

                <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                  <InfoCard
                    icon="mail-outline"
                    iconBg="#EFF6FF"
                    iconColor="#2563EB"
                    label="Email"
                    value={selected.email || "--"}
                    onPress={selected.email ? () => Linking.openURL(`mailto:${selected.email}`) : undefined}
                  />
                  <InfoCard
                    icon="call-outline"
                    iconBg="#D1FAE5"
                    iconColor="#059669"
                    label="Phone"
                    value={selected.phone || "--"}
                    onPress={selected.phone ? () => Linking.openURL(`tel:${selected.phone}`) : undefined}
                  />
                </View>

                <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
                  <InfoCard
                    icon="location-outline"
                    iconBg="#FEF3C7"
                    iconColor="#D97706"
                    label="Location"
                    value={selected.location || "--"}
                  />
                  <InfoCard
                    icon="people-outline"
                    iconBg="#F5F3FF"
                    iconColor="#7C3AED"
                    label="Relationship"
                    value={selected.relationship || "--"}
                  />
                </View>

                {/* EDUCATION / EXPERIENCE */}
                {isFresher ? (
                  <>
                    <SectionTitle icon="school-outline" color="#6366F1" title="Education Details" />
                    <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                      <InfoCard
                        icon="ribbon-outline"
                        iconBg="#EEF2FF"
                        iconColor="#4F46E5"
                        label="Qualification"
                        value={selected.qualification || "--"}
                      />
                      <InfoCard
                        icon="calendar-outline"
                        iconBg="#EFF6FF"
                        iconColor="#2563EB"
                        label="Passout Year"
                        value={selected.passoutYear || "--"}
                      />
                    </View>
                    <View style={{ marginBottom: 20 }}>
                      <InfoCard
                        icon="business-outline"
                        iconBg="#F3F4F6"
                        iconColor="#4B5563"
                        label="College"
                        value={selected.college || "--"}
                        full
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <SectionTitle icon="briefcase-outline" color="#EA580C" title="Professional Background" />
                    <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                      <InfoCard
                        icon="business-outline"
                        iconBg="#FFF7ED"
                        iconColor="#EA580C"
                        label="Current Company"
                        value={selected.currentCompany || "--"}
                      />
                      <InfoCard
                        icon="time-outline"
                        iconBg="#FEF3C7"
                        iconColor="#D97706"
                        label="Notice Period"
                        value={selected.noticePeriod || "--"}
                      />
                    </View>
                    <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
                      <InfoCard
                        icon="cash-outline"
                        iconBg="#F3F4F6"
                        iconColor="#4B5563"
                        label="Current CTC"
                        value={selected.currentCTC || "--"}
                      />
                      <InfoCard
                        icon="trending-up-outline"
                        iconBg="#D1FAE5"
                        iconColor="#059669"
                        label="Expected"
                        value={selected.expectedSalary || "--"}
                      />
                    </View>

                    {!!selected.companyHistory?.length && (
                      <>
                        <SectionTitle icon="git-branch-outline" color="#2563EB" title="Employment History" />
                        <View style={{ marginBottom: 20 }}>
                          {selected.companyHistory.map((item, idx) => {
                            const isCurrent = item.isCurrent === true || item.isCurrent === "true";
                            return (
                              <View
                                key={idx}
                                style={{
                                  backgroundColor: "#F9FAFB",
                                  borderRadius: 14,
                                  borderWidth: 1,
                                  borderColor: "#E5E7EB",
                                  borderLeftWidth: 4,
                                  borderLeftColor: "#2563EB",
                                  padding: 14,
                                  marginBottom: 10,
                                }}
                              >
                                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                  <View style={{ flex: 1, marginRight: 10 }}>
                                    <Text
                                      style={{ color: "#111827", fontSize: 14, fontWeight: "800" }}
                                      numberOfLines={1}
                                    >
                                      {item.companyName || "--"}
                                    </Text>
                                    <Text
                                      style={{ color: "#2563EB", fontSize: 12, fontWeight: "600", marginTop: 2 }}
                                      numberOfLines={1}
                                    >
                                      {item.role || "--"}
                                    </Text>
                                    <Text
                                      style={{
                                        color: "#9CA3AF",
                                        fontSize: 10,
                                        fontWeight: "700",
                                        marginTop: 4,
                                        textTransform: "uppercase",
                                      }}
                                    >
                                      {formatMonthYear(item.from)} -{" "}
                                      {isCurrent || item.to === "Present" ? "Present" : formatMonthYear(item.to)}
                                    </Text>
                                  </View>

                                  <View style={{ alignItems: "flex-end" }}>
                                    {isCurrent && (
                                      <View
                                        style={{
                                          paddingHorizontal: 7,
                                          paddingVertical: 3,
                                          borderRadius: 7,
                                          backgroundColor: "#D1FAE5",
                                          borderWidth: 1,
                                          borderColor: "#A7F3D0",
                                          marginBottom: 5,
                                        }}
                                      >
                                        <Text style={{ fontSize: 8, fontWeight: "800", color: "#059669" }}>
                                          CURRENT
                                        </Text>
                                      </View>
                                    )}
                                    <View
                                      style={{
                                        paddingHorizontal: 8,
                                        paddingVertical: 4,
                                        borderRadius: 7,
                                        backgroundColor: "#FFFFFF",
                                        borderWidth: 1,
                                        borderColor: "#E5E7EB",
                                      }}
                                    >
                                      <Text style={{ fontSize: 10, fontWeight: "700", color: "#4B5563" }}>
                                        {calcDuration(
                                          item.from,
                                          isCurrent || item.to === "Present" ? "Present" : item.to
                                        ) ||
                                          item.duration ||
                                          "--"}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </>
                    )}
                  </>
                )}

                {/* SKILLS */}
                {!!selected.skills?.length && (
                  <>
                    <SectionTitle icon="pricetags-outline" color="#0891B2" title="Skills" />
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                      {selected.skills.map((skill, idx) => (
                        <View
                          key={`${skill}-${idx}`}
                          style={{
                            paddingHorizontal: 11,
                            paddingVertical: 7,
                            borderRadius: 9,
                            backgroundColor: "#ECFEFF",
                            borderWidth: 1,
                            borderColor: "#A5F3FC",
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#0891B2" }}>{skill}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {/* REFERRAL NOTE */}
                {!!selected.whyReferring && (
                  <>
                    <SectionTitle icon="chatbubble-ellipses-outline" color="#059669" title="Referral Note" />
                    <View
                      style={{
                        padding: 14,
                        backgroundColor: "#ECFDF5",
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: "#A7F3D0",
                        marginBottom: 20,
                      }}
                    >
                      <Text style={{ color: "#065F46", fontSize: 13, lineHeight: 20 }}>
                        {selected.whyReferring}
                      </Text>
                    </View>
                  </>
                )}

                {/* REFERRED BY */}
                <SectionTitle icon="person-add-outline" color="#7C3AED" title="Referred By" />
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 14,
                    backgroundColor: "#F9FAFB",
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    marginBottom: 20,
                  }}
                >
                  {selected.referredByImage ? (
                    <Image
                      source={{ uri: selected.referredByImage }}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: "#F3F4F6",
                        marginRight: 12,
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: "#EFF6FF",
                        borderWidth: 1,
                        borderColor: "#DBEAFE",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      <Text style={{ color: "#2563EB", fontSize: 16, fontWeight: "700" }}>
                        {getInitial(selected.referredByName)}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ color: "#111827", fontSize: 14, fontWeight: "700" }} numberOfLines={1}>
                      {selected.referredByName || "--"}
                    </Text>
                    <Text
                      style={{
                        color: "#9CA3AF",
                        fontSize: 10,
                        fontWeight: "700",
                        marginTop: 2,
                        textTransform: "uppercase",
                      }}
                    >
                      {selected.referredByEmpId || "--"}
                    </Text>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: roleTheme(selected.referredByRole).bg,
                      borderWidth: 1,
                      borderColor: roleTheme(selected.referredByRole).border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: roleTheme(selected.referredByRole).text,
                      }}
                    >
                      {(selected.referredByRole || "EMPLOYEE").toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* REMARKS */}
                {!!selected.remarks && (
                  <View
                    style={{
                      padding: 14,
                      backgroundColor: "#FFFBEB",
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: "#FDE68A",
                      marginBottom: 20,
                    }}
                  >
                    <Text style={{ color: "#D97706", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
                      Remarks
                    </Text>
                    <Text style={{ color: "#78350F", fontSize: 13, lineHeight: 20, marginTop: 6 }}>
                      {selected.remarks}
                    </Text>
                  </View>
                )}

                {/* ACTIONS */}
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    disabled={!selected.resumeUrl}
                    onPress={() => selected.resumeUrl && Linking.openURL(selected.resumeUrl)}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
                      borderRadius: 12,
                      backgroundColor: "#F3F4F6",
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      opacity: selected.resumeUrl ? 1 : 0.5,
                    }}
                  >
                    <Ionicons name="document-text-outline" size={18} color="#4B5563" style={{ marginRight: 8 }} />
                    <Text style={{ color: "#4B5563", fontWeight: "600", fontSize: 15 }}>Resume</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setDraftStatus(selected.status);
                      setDraftRemarks(selected.remarks || "");
                      setStatusSheetOpen(true);
                    }}
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
                    <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Update</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* STATUS UPDATE BOTTOM SHEET */}
      <Modal
        visible={statusSheetOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setStatusSheetOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ModalDismiss onPress={() => setStatusSheetOpen(false)} />
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
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>Update Status</Text>
              <TouchableOpacity
                onPress={() => setStatusSheetOpen(false)}
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

            <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <Text
                style={{
                  color: "#9CA3AF",
                  fontSize: 9,
                  fontWeight: "700",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Status
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {UPDATE_STATUSES.map((s) => {
                  const theme = statusTheme(s);
                  const active = draftStatus === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setDraftStatus(s)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        borderRadius: 10,
                        backgroundColor: active ? theme.bg : "#F9FAFB",
                        borderWidth: 1.5,
                        borderColor: active ? theme.text : "#E5E7EB",
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Ionicons
                        name={theme.icon}
                        size={13}
                        color={active ? theme.text : "#9CA3AF"}
                        style={{ marginRight: 5 }}
                      />
                      <Text
                        style={{
                          fontSize: 12,
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

              <Text
                style={{
                  color: "#9CA3AF",
                  fontSize: 9,
                  fontWeight: "700",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Remarks
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
                  marginBottom: 20,
                }}
                placeholder="Add a note about this candidate..."
                placeholderTextColor="#9CA3AF"
                multiline
                value={draftRemarks}
                onChangeText={setDraftRemarks}
              />

              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  onPress={() => setStatusSheetOpen(false)}
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
                  disabled={!draftStatus || saving}
                  onPress={saveStatus}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 12,
                    backgroundColor: draftStatus ? "#2563EB" : "#93C5FD",
                    alignItems: "center",
                  }}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
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
      <Text style={{ color: "#374151", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {title}
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
  onPress,
  full,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  onPress?: () => void;
  full?: boolean;
}) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flex: full ? undefined : 1,
        padding: 14,
        backgroundColor: "#F9FAFB",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E5E7EB",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
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

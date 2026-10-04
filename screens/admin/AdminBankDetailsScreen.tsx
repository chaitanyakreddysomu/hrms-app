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
import * as Clipboard from "expo-clipboard";
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

type Props = NativeStackScreenProps<RootStackParamList, "AdminBankDetails">;

interface BankDetails {
  accountNumber?: string;
  holderName?: string;
  bankName?: string;
  branch?: string;
  ifsc?: string;
}

interface Employee {
  id: string;
  _id?: string;
  name: string;
  email?: string;
  role?: string;
  designation?: string;
  department?: string;
  status?: string;
  profileImage?: string;
  avatar?: string;
  bankDetails?: BankDetails;
}

const ROLE_OPTIONS = ["ALL", "HR", "EMPLOYEE"];
const STATUS_OPTIONS = ["ALL", "ADDED", "NOT_ADDED"];

const STATUS_LABELS: Record<string, string> = {
  ALL: "All Status",
  ADDED: "Details Added",
  NOT_ADDED: "Not Added",
};

const ROLE_LABELS: Record<string, string> = {
  ALL: "All Roles",
  HR: "HR",
  EMPLOYEE: "Employee",
};

const roleTheme = (role?: string) => {
  switch ((role || "").toUpperCase()) {
    case "HR":
      return { bg: "#F5F3FF", border: "#DDD6FE", text: "#7C3AED" };
    case "ADMIN":
      return { bg: "#FEE2E2", border: "#FECACA", text: "#DC2626" };
    default:
      return { bg: "#EFF6FF", border: "#BFDBFE", text: "#2563EB" };
  }
};

export default function AdminBankDetailsScreen({ navigation, embedded }: Props & { embedded?: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  /** the shell header search field drives this page */
  useShellSearch(setSearchTerm);
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);

  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [openDropdown, setOpenDropdown] = useState<"role" | "status" | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // ============================================================
  // FETCH
  // ============================================================
  const fetchBankDetails = useCallback(
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
        if (roleFilter !== "ALL") params.append("role", roleFilter);
        if (statusFilter !== "ALL") params.append("status", statusFilter);

        const res = await apiFetch(
          `/api/admin/employee-bank-details?${params.toString()}`,
          session.token
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || `Server error (${res.status})`);
        }

        const data = await res.json();
        if (requestId !== requestIdRef.current) return;

        const newEmployees: Employee[] = Array.isArray(data.employees) ? data.employees : [];

        if (pageToLoad === 1) {
          setEmployees(newEmployees);
        } else {
          setEmployees((prev) => {
            const existingIds = new Set(prev.map((item) => item.id || item._id));
            const unique = newEmployees.filter((item) => !existingIds.has(item.id || item._id));
            return [...prev, ...unique];
          });
        }

        if (data.pagination) {
          setPage(data.pagination.page || pageToLoad);
          setTotalPages(data.pagination.pages || 1);
        } else {
          setPage(pageToLoad);
          setTotalPages(newEmployees.length < 10 ? pageToLoad : pageToLoad + 1);
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
    [searchTerm, roleFilter, statusFilter]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchBankDetails(1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, roleFilter, statusFilter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchBankDetails(1, { silent: true, resetUrl: true });
  }, [fetchBankDetails]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return;
    if (page >= totalPages) return;
    fetchBankDetails(page + 1, { silent: true });
  }, [loading, loadingMore, page, totalPages, fetchBankDetails]);

  // ============================================================
  // HELPERS
  // ============================================================
  const getInitial = (name?: string) => name?.charAt(0)?.toUpperCase() || "?";

  const hasBank = (emp?: Employee | null) => !!emp?.bankDetails?.accountNumber;

  const copyValue = async (label: string, value?: string) => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  // ============================================================
  // DROPDOWN
  // ============================================================
  const renderDropdown = (
    type: "role" | "status",
    label: string,
    value: string,
    options: string[],
    labels: Record<string, string>,
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
              {labels[value] || value}
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
                    {labels[option] || option}
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
  // EMPLOYEE CARD
  // ============================================================
  const renderEmployee = ({ item }: { item: Employee }) => {
    const photoUri = item.profileImage || item.avatar;
    const theme = roleTheme(item.role);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setSelectedEmployee(item)}
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

          {!hasBank(item) && (
            <View
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: "#F59E0B",
                borderWidth: 2,
                borderColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="alert" size={10} color="#FFFFFF" />
            </View>
          )}
        </View>

        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: "#111827", fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {item.email || item.id}
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
          <Text style={{ fontSize: 10, fontWeight: "800", color: theme.text }}>
            {(item.role || "EMPLOYEE").toUpperCase()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const bank = selectedEmployee?.bankDetails;

  /** the header menu owns these filters while embedded */
  useShellFilters([
    {
      key: "role",
      label: "Roles",
      value: roleFilter,
      defaultValue: "ALL",
      options: toShellOptions(ROLE_OPTIONS, (v) => ROLE_LABELS[v] || v),
      onChange: setRoleFilter,
    },
    {
      key: "status",
      label: "Status",
      value: statusFilter,
      defaultValue: "ALL",
      options: toShellOptions(STATUS_OPTIONS, (v) => STATUS_LABELS[v] || v),
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
          <Text style={{ color: "#111827", fontSize: 20, fontWeight: "700" }}>Bank Details</Text>
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
                placeholder="Search employees, banks or accounts..."
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
              {renderDropdown("role", "Roles", roleFilter, ROLE_OPTIONS, ROLE_LABELS, setRoleFilter)}
              {renderDropdown("status", "Status", statusFilter, STATUS_OPTIONS, STATUS_LABELS, setStatusFilter)}
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
            data={employees}
            keyExtractor={(item, index) => item.id || item._id || `emp-${index}`}
            renderItem={renderEmployee}
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
                  <Ionicons name="card-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
                  <Text style={{ color: "#6B7280", fontSize: 15, fontWeight: "500" }}>No employees found</Text>
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
        visible={!!selectedEmployee}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedEmployee(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ModalDismiss onPress={() => setSelectedEmployee(null)} />
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
                  Bank Account
                </Text>
                <Text style={{ fontSize: 14, color: "#6B7280" }}>Employee banking information</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedEmployee(null)}
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

            {selectedEmployee && (
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
                  {selectedEmployee.profileImage || selectedEmployee.avatar ? (
                    <Image
                      source={{ uri: selectedEmployee.profileImage || selectedEmployee.avatar }}
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
                        {getInitial(selectedEmployee.name)}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }} numberOfLines={1}>
                      {selectedEmployee.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }} numberOfLines={1}>
                      {selectedEmployee.email || "--"}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }} numberOfLines={1}>
                      {selectedEmployee.id}
                      {selectedEmployee.designation ? ` · ${selectedEmployee.designation}` : ""}
                    </Text>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 10,
                      backgroundColor: roleTheme(selectedEmployee.role).bg,
                      borderWidth: 1,
                      borderColor: roleTheme(selectedEmployee.role).border,
                    }}
                  >
                    <Text
                      style={{ fontSize: 11, fontWeight: "800", color: roleTheme(selectedEmployee.role).text }}
                    >
                      {(selectedEmployee.role || "EMPLOYEE").toUpperCase()}
                    </Text>
                  </View>
                </View>

                {hasBank(selectedEmployee) ? (
                  <>
                    {/* ACCOUNT NUMBER */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => copyValue("account", bank?.accountNumber)}
                      style={{
                        padding: 16,
                        backgroundColor: "#EFF6FF",
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: "#BFDBFE",
                        marginBottom: 12,
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
                            backgroundColor: "#DBEAFE",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons name="card-outline" size={18} color="#2563EB" />
                        </View>
                        <Ionicons
                          name={copied === "account" ? "checkmark-circle" : "copy-outline"}
                          size={16}
                          color={copied === "account" ? "#059669" : "#6B7280"}
                        />
                      </View>
                      <Text
                        style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}
                      >
                        Account Number
                      </Text>
                      <Text style={{ color: "#111827", fontSize: 18, fontWeight: "800", marginTop: 4, letterSpacing: 1 }}>
                        {bank?.accountNumber}
                      </Text>
                      <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 4 }}>
                        Holder: {bank?.holderName || "--"}
                      </Text>
                    </TouchableOpacity>

                    {/* BANK NAME */}
                    <DetailCard
                      icon="business-outline"
                      iconBg="#F5F3FF"
                      iconColor="#7C3AED"
                      label="Bank Name"
                      value={bank?.bankName || "--"}
                    />

                    {/* BRANCH / IFSC */}
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <DetailCard
                          icon="location-outline"
                          iconBg="#FEF3C7"
                          iconColor="#D97706"
                          label="Branch"
                          value={bank?.branch || "--"}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <DetailCard
                          icon="key-outline"
                          iconBg="#D1FAE5"
                          iconColor="#059669"
                          label="IFSC Code"
                          value={bank?.ifsc || "--"}
                          onPress={bank?.ifsc ? () => copyValue("ifsc", bank?.ifsc) : undefined}
                          copied={copied === "ifsc"}
                        />
                      </View>
                    </View>
                  </>
                ) : (
                  <View
                    style={{
                      alignItems: "center",
                      paddingVertical: 40,
                      backgroundColor: "#F9FAFB",
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      borderStyle: "dashed",
                    }}
                  >
                    <Ionicons name="card-outline" size={40} color="#D1D5DB" style={{ marginBottom: 12 }} />
                    <Text style={{ color: "#111827", fontSize: 15, fontWeight: "700", marginBottom: 4 }}>
                      No Bank Details
                    </Text>
                    <Text style={{ color: "#6B7280", fontSize: 13, textAlign: "center", maxWidth: 240 }}>
                      This employee has not added their bank account information yet.
                    </Text>
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
// DETAIL CARD
// ============================================================
function DetailCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  onPress,
  copied,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  onPress?: () => void;
  copied?: boolean;
}) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        padding: 14,
        backgroundColor: "#F9FAFB",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        marginBottom: 12,
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
        {onPress && (
          <Ionicons
            name={copied ? "checkmark-circle" : "copy-outline"}
            size={16}
            color={copied ? "#059669" : "#9CA3AF"}
          />
        )}
      </View>
      <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text style={{ color: "#111827", fontSize: 14, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
        {value}
      </Text>
    </Wrapper>
  );
}

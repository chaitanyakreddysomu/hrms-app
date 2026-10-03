import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  Animated,
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

type Props = NativeStackScreenProps<RootStackParamList, "AdminPendingRequests">;

interface PendingUser {
  _id: string;      // MongoDB ObjectId
  id: string;       // Custom ID e.g. EMP001
  name: string;
  email: string;
  role: "HR" | "EMPLOYEE" | "ADMIN";
  phone?: string;
  designation?: string;
  department?: string;
  profileImage?: string;
  avatar?: string;
  status: string;
}

export default function PendingRequestsScreen({ navigation, embedded }: Props & { embedded?: boolean }) {
  const [requests, setRequests] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  /** the shell header search field drives this page */
  useShellSearch(setSearchTerm);
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [selectedRequest, setSelectedRequest] = useState<PendingUser | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Shake animation for error ──────────────────────────────────────
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  // ── Core fetch ────────────────────────────────────────────────────
  const fetchRequests = useCallback(
    async (opts: { silent?: boolean; resetUrl?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setError(null);

      if (opts.resetUrl) resetBaseUrl();

      try {
        const session = await getAuthSession();
        if (!session?.token) {
          setError("Not authenticated. Please log in again.");
          return;
        }

        const params = new URLSearchParams();
        if (searchTerm.trim()) params.set("search", searchTerm.trim());
        if (roleFilter !== "ALL") params.set("role", roleFilter);

        const res = await apiFetch(
          `/api/admin/pending-requests?${params.toString()}`,
          session.token
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || `Server error (${res.status})`);
        }

        const data: PendingUser[] = await res.json();
        setRequests(data);
      } catch (err: any) {
        const msg =
          err?.message?.includes("Network request failed") ||
          err?.message?.includes("AbortError") ||
          err?.name === "AbortError"
            ? "Cannot reach server. Make sure you're on the same Wi-Fi network as the backend."
            : err?.message || "Something went wrong.";
        setError(msg);
        triggerShake();
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchTerm, roleFilter]
  );

  // ── Debounced re-fetch on search / filter change ──────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchRequests(), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, roleFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests({ silent: true, resetUrl: true });
  };

  // ── Approve / Reject ──────────────────────────────────────────────
  const handleAction = async (
    user: PendingUser,
    action: "approve" | "reject"
  ) => {
    setActionLoading(true);
    try {
      const session = await getAuthSession();
      if (!session?.token) {
        Alert.alert("Error", "Not authenticated.");
        return;
      }

      // Use custom ID field (e.g. EMP001) which the backend queries by
      const userId = user.id;

      const res = await apiFetch(
        `/api/admin/pending-requests/${userId}?status=${action}`,
        session.token,
        { method: "PATCH" }
      );

      if (res.ok) {
        // Remove from list using _id for safety
        setRequests((prev) =>
          prev.filter((r) => r._id !== user._id && r.id !== user.id)
        );
        setSelectedRequest(null);
        Alert.alert(
          action === "approve" ? "✅ Approved" : "❌ Rejected",
          `${user.name}'s request has been ${action}d successfully.`
        );
      } else {
        const body = await res.json().catch(() => ({}));
        Alert.alert("Error", body?.message || "Failed to update request.");
      }
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Something went wrong.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────
  const getInitial = (name?: string) =>
    name?.charAt(0)?.toUpperCase() ?? "?";

  const roleColor = (role: string) =>
    role === "HR"
      ? { bg: "#FAF5FF", border: "#E9D5FF", text: "#7E22CE" }
      : { bg: "#EFF6FF", border: "#DBEAFE", text: "#1D4ED8" };

  // ── Empty / Error content ─────────────────────────────────────────
  const renderEmptyState = () => {
    if (error) {
      return (
        <Animated.View
          style={{ transform: [{ translateX: shakeAnim }] }}
        >
          <View
            style={{
              backgroundColor: "#FFF7F7",
              borderRadius: 24,
              padding: 32,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#FECACA",
              marginVertical: 24,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "#FEE2E2",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
              }}
            >
              <Ionicons name="wifi-outline" size={30} color="#EF4444" />
            </View>
            <Text
              style={{
                color: "#991B1B",
                fontWeight: "700",
                fontSize: 16,
                marginBottom: 6,
                textAlign: "center",
              }}
            >
              Connection Error
            </Text>
            <Text
              style={{
                color: "#B91C1C",
                fontSize: 13,
                textAlign: "center",
                lineHeight: 20,
                marginBottom: 20,
              }}
            >
              {error}
            </Text>

            {isAuthError(error) && (
              <RefreshSessionButton
                onDone={() => fetchRequests({ resetUrl: true })}
              />
            )}

            <TouchableOpacity
              onPress={() => fetchRequests({ resetUrl: true })}
              style={{
                backgroundColor: "#EF4444",
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      );
    }

    return (
      <View
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 24,
          padding: 32,
          alignItems: "center",
          borderWidth: 1,
          borderColor: "#F3F4F6",
          marginVertical: 24,
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: "#F0FDF4",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <Ionicons
            name="checkmark-done-circle-outline"
            size={32}
            color="#22C55E"
          />
        </View>
        <Text style={{ color: "#111827", fontWeight: "700", fontSize: 16 }}>
          No Pending Requests
        </Text>
        <Text
          style={{
            color: "#9CA3AF",
            fontSize: 12,
            marginTop: 4,
            textAlign: "center",
          }}
        >
          {searchTerm || roleFilter !== "ALL"
            ? "No results match your current filter."
            : "All registration requests have been reviewed."}
        </Text>
      </View>
    );
  };

  // ─────────────────────────────────────────────────────────────────
  /** the header menu owns this filter while embedded */
  useShellFilters([
    {
      key: "role",
      label: "Role",
      value: roleFilter,
      defaultValue: "ALL",
      options: toShellOptions(["ALL", "HR", "EMPLOYEE"], (r) =>
        r === "ALL" ? "All Roles" : r
      ),
      onChange: (value) => setRoleFilter(value as typeof roleFilter),
    },
  ]);

  return (
    <SafeAreaView edges={embedded ? [] : undefined} style={{ flex: 1, backgroundColor: "#F9FAFB" }}>
      <StatusBar style="dark" />

      {/* ── Top Header ── */}
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
  
          <Text style={{ color: "#111827", fontSize: 20, fontWeight: "700" }}>
            Pending Requests
          </Text>
  
          {/* Refresh button */}
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

      {/* ── Count badge ── */}
      {!loading && !error && requests.length > 0 && (
        <View
          style={{
            marginHorizontal: 20,
            marginTop: 14,
            backgroundColor: "#EFF6FF",
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: 1,
            borderColor: "#DBEAFE",
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: "#2563EB",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}
            >
              {requests.length}
            </Text>
          </View>
          <Text style={{ color: "#1D4ED8", fontSize: 13, fontWeight: "600" }}>
            {requests.length === 1
              ? "1 request awaiting review"
              : `${requests.length} requests awaiting review`}
          </Text>
        </View>
      )}

      <ScrollView {...shellScroll}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: shellTop,
          paddingBottom: 150,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
          progressViewOffset={shellTop}
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2563EB"
            colors={["#2563EB"]}
          />
        }
      >
        {/* ── Search & Filter Box ── */}
        {!embedded && (
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 24,
              padding: 16,
              borderWidth: 1,
              borderColor: "#F3F4F6",
              marginBottom: 16,
            }}
          >
            {/* Search Input */}
            {!embedded && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F9FAFB",
                  borderRadius: 16,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  marginBottom: 12,
                }}
              >
                <Ionicons name="search-outline" size={20} color="#9CA3AF" />
                <TextInput
                  style={{
                    flex: 1,
                    color: "#111827",
                    fontSize: 14,
                    marginLeft: 10,
                    padding: 0,
                  }}
                  placeholder="Search by name, email, phone..."
                  placeholderTextColor="#9CA3AF"
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  returnKeyType="search"
                />
                {searchTerm.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchTerm("")}>
                    <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Role Filter Pills */}
            {!embedded && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["ALL", "HR", "EMPLOYEE"] as const).map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setRoleFilter(r)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 12,
                      borderWidth: 1,
                      backgroundColor: roleFilter === r ? "#2563EB" : "#F9FAFB",
                      borderColor: roleFilter === r ? "#2563EB" : "#E5E7EB",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: roleFilter === r ? "#FFFFFF" : "#4B5563",
                      }}
                    >
                      {r === "ALL" ? "All Roles" : r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Requests List ── */}
        {loading ? (
          <View
            style={{
              paddingVertical: 80,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator size="large" color="#2563EB" />
            <Text
              style={{
                color: "#6B7280",
                fontSize: 12,
                marginTop: 12,
                fontWeight: "600",
              }}
            >
              Fetching registration requests...
            </Text>
          </View>
        ) : requests.length === 0 ? (
          renderEmptyState()
        ) : (
          <View style={{ gap: 12 }}>
            {requests.map((item) => {
              const rc = roleColor(item.role);
              const photoUri = item.profileImage || item.avatar;
              return (
                <TouchableOpacity
                  key={item._id || item.id}
                  activeOpacity={0.75}
                  onPress={() => setSelectedRequest(item)}
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 22,
                    padding: 18,
                    borderWidth: 1,
                    borderColor: "#F3F4F6",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.04,
                    shadowRadius: 4,
                    elevation: 2,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      flex: 1,
                      marginRight: 12,
                    }}
                  >
                    {photoUri ? (
                      <Image
                        source={{ uri: photoUri }}
                        style={{
                          width: 50,
                          height: 50,
                          borderRadius: 25,
                          marginRight: 14,
                          backgroundColor: "#F3F4F6",
                          borderWidth: 2,
                          borderColor: "#E5E7EB",
                        }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 50,
                          height: 50,
                          borderRadius: 25,
                          backgroundColor: "#EFF6FF",
                          borderWidth: 2,
                          borderColor: "#DBEAFE",
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 14,
                        }}
                      >
                        <Text
                          style={{
                            color: "#2563EB",
                            fontSize: 20,
                            fontWeight: "700",
                          }}
                        >
                          {getInitial(item.name)}
                        </Text>
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: "#111827",
                          fontWeight: "700",
                          fontSize: 15,
                        }}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={{
                          color: "#6B7280",
                          fontSize: 12,
                          marginTop: 2,
                        }}
                        numberOfLines={1}
                      >
                        {item.email}
                      </Text>
                      {item.phone ? (
                        <Text
                          style={{
                            color: "#9CA3AF",
                            fontSize: 11,
                            marginTop: 1,
                          }}
                        >
                          {item.phone}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Role Badge */}
                  <View
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 12,
                      backgroundColor: rc.bg,
                      borderWidth: 1,
                      borderColor: rc.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "800",
                        color: rc.text,
                      }}
                    >
                      {item.role}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Detail Bottom Sheet Modal ── */}
      <Modal
        animationType="slide"
        transparent
        visible={!!selectedRequest}
        onRequestClose={() => setSelectedRequest(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={() => setSelectedRequest(null)}
          />

          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 36,
              borderTopRightRadius: 36,
              padding: 24,
              paddingBottom: 40,
              borderTopWidth: 1,
              borderTopColor: "#F3F4F6",
            }}
          >
            {/* Handle */}
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View
                style={{
                  width: 48,
                  height: 5,
                  backgroundColor: "#D1D5DB",
                  borderRadius: 3,
                }}
              />
            </View>

            {/* Sheet Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: 16,
                borderBottomWidth: 1,
                borderBottomColor: "#F3F4F6",
                marginBottom: 20,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 16,
                    backgroundColor: "#EFF6FF",
                    borderWidth: 1,
                    borderColor: "#DBEAFE",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Ionicons
                    name="person-add-outline"
                    size={22}
                    color="#2563EB"
                  />
                </View>
                <Text
                  style={{ color: "#111827", fontSize: 20, fontWeight: "700" }}
                >
                  Registration Details
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedRequest(null)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {selectedRequest && (
              <View style={{ gap: 16 }}>
                {/* User Banner */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#F9FAFB",
                    padding: 16,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    marginBottom: 4,
                  }}
                >
                  {selectedRequest.profileImage || selectedRequest.avatar ? (
                    <Image
                      source={{
                        uri:
                          selectedRequest.profileImage ||
                          selectedRequest.avatar,
                      }}
                      style={{
                        width: 54,
                        height: 54,
                        borderRadius: 27,
                        marginRight: 14,
                        backgroundColor: "#F3F4F6",
                        borderWidth: 2,
                        borderColor: "#E5E7EB",
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 54,
                        height: 54,
                        borderRadius: 27,
                        backgroundColor: "#2563EB",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 14,
                      }}
                    >
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 22,
                          fontWeight: "700",
                        }}
                      >
                        {getInitial(selectedRequest.name)}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: "#111827",
                        fontWeight: "700",
                        fontSize: 18,
                      }}
                    >
                      {selectedRequest.name}
                    </Text>
                    <Text style={{ color: "#6B7280", fontSize: 12 }}>
                      {selectedRequest.email}
                    </Text>
                  </View>
                </View>

                {/* Detail Fields */}
                <View
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: 18,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  {[
                    {
                      label: "Requested Role",
                      value: null,
                      badge: selectedRequest.role,
                    },
                    {
                      label: "Phone Number",
                      value: selectedRequest.phone || "Not provided",
                    },
                    {
                      label: "Designation",
                      value: selectedRequest.designation || "Not provided",
                    },
                    {
                      label: "Department",
                      value: selectedRequest.department || "Not provided",
                    },
                  ].map((field, idx, arr) => {
                    const rc = roleColor(selectedRequest.role);
                    return (
                      <View
                        key={field.label}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          paddingBottom: idx < arr.length - 1 ? 10 : 0,
                          borderBottomWidth:
                            idx < arr.length - 1 ? 1 : 0,
                          borderBottomColor: "#E5E7EB",
                        }}
                      >
                        <Text
                          style={{
                            color: "#6B7280",
                            fontSize: 12,
                            fontWeight: "600",
                            textTransform: "uppercase",
                          }}
                        >
                          {field.label}
                        </Text>

                        {field.badge ? (
                          <View
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 4,
                              borderRadius: 10,
                              backgroundColor: rc.bg,
                              borderWidth: 1,
                              borderColor: rc.border,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "700",
                                color: rc.text,
                              }}
                            >
                              {field.badge}
                            </Text>
                          </View>
                        ) : (
                          <Text
                            style={{
                              color: "#111827",
                              fontSize: 14,
                              fontWeight: "700",
                            }}
                          >
                            {field.value}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Action Buttons */}
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    disabled={actionLoading}
                    onPress={() =>
                      handleAction(selectedRequest, "reject")
                    }
                    style={{
                      flex: 1,
                      backgroundColor: actionLoading
                        ? "#F9FAFB"
                        : "#FEF2F2",
                      borderWidth: 1,
                      borderColor: "#FECACA",
                      paddingVertical: 14,
                      borderRadius: 16,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    {actionLoading ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <>
                        <Ionicons
                          name="close-circle-outline"
                          size={20}
                          color="#EF4444"
                        />
                        <Text
                          style={{
                            color: "#DC2626",
                            fontWeight: "700",
                            fontSize: 14,
                          }}
                        >
                          Reject
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={actionLoading}
                    onPress={() =>
                      handleAction(selectedRequest, "approve")
                    }
                    style={{
                      flex: 1,
                      backgroundColor: actionLoading ? "#93C5FD" : "#2563EB",
                      paddingVertical: 14,
                      borderRadius: 16,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    {actionLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={20}
                          color="#FFFFFF"
                        />
                        <Text
                          style={{
                            color: "#FFFFFF",
                            fontWeight: "700",
                            fontSize: 14,
                          }}
                        >
                          Approve
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

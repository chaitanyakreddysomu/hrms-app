import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  RefreshControl,
  SectionList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/AppNavigator";
import { getAuthSession } from "../../utils/authStorage";
import {
  useShellScroll,
  useShellSearch,
} from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { apiFetch, resetBaseUrl } from "../../utils/api";
import RefreshSessionButton from "../../components/RefreshSessionButton";
import { isAuthError } from "../../utils/authStorage";

type Props = NativeStackScreenProps<RootStackParamList, "AdminBirthdays">;

interface BirthdayUser {
  id: string;
  _id?: string;
  name: string;
  email?: string;
  role?: string;
  designation?: string;
  department?: string;
  profileImage?: string;
  avatar?: string;
  dob: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const roleTheme = (role?: string) => {
  switch ((role || "").toUpperCase()) {
    case "ADMIN":
      return { bg: "#FEE2E2", border: "#FECACA", text: "#DC2626" };
    case "HR":
      return { bg: "#D1FAE5", border: "#A7F3D0", text: "#059669" };
    default:
      return { bg: "#EFF6FF", border: "#BFDBFE", text: "#2563EB" };
  }
};

export default function AdminBirthdaysScreen({ navigation, embedded }: Props & { embedded?: boolean }) {
  const [users, setUsers] = useState<BirthdayUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  /** the shell header search field drives this page */
  useShellSearch(setSearchTerm);
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();

  const requestIdRef = useRef(0);

  const today = new Date();
  const todayDate = today.getDate();
  const monthName = MONTHS[today.getMonth()];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  // ============================================================
  // FETCH
  // ============================================================
  const fetchBirthdays = useCallback(async (opts: { silent?: boolean; resetUrl?: boolean } = {}) => {
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

      const res = await apiFetch(`/api/birthdays?range=month`, session.token);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Server error (${res.status})`);
      }

      const data = await res.json();
      if (requestId !== requestIdRef.current) return;

      setUsers(Array.isArray(data) ? data : []);
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
    fetchBirthdays();
  }, [fetchBirthdays]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBirthdays({ silent: true, resetUrl: true });
  }, [fetchBirthdays]);

  // ============================================================
  // HELPERS
  // ============================================================
  const getInitial = (name?: string) => name?.charAt(0)?.toUpperCase() || "?";

  const dobDay = (dob: string) => {
    const d = new Date(dob);
    return Number.isNaN(d.getTime()) ? 0 : d.getDate();
  };

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.department?.toLowerCase().includes(term) ||
        u.designation?.toLowerCase().includes(term)
    );
  }, [users, searchTerm]);

  const sections = useMemo(() => {
    const todayList = filtered.filter((u) => dobDay(u.dob) === todayDate);
    const upcoming = filtered
      .filter((u) => dobDay(u.dob) > todayDate)
      .sort((a, b) => dobDay(a.dob) - dobDay(b.dob));

    const result: { title: string; data: BirthdayUser[] }[] = [];
    if (todayList.length) result.push({ title: "Today", data: todayList });
    if (upcoming.length) result.push({ title: `Upcoming in ${monthName}`, data: upcoming });
    return result;
  }, [filtered, todayDate, monthName]);

  // ============================================================
  // CARD
  // ============================================================
  const renderUser = (item: BirthdayUser, isToday: boolean) => {
    const photoUri = item.profileImage || item.avatar;
    const theme = roleTheme(item.role);
    const day = dobDay(item.dob);

    return (
      <View
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 20,
          padding: 16,
          borderWidth: 1,
          borderColor: isToday ? "#FDE68A" : "#F3F4F6",
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <View style={{ marginRight: 14 }}>
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "#F3F4F6",
                borderWidth: isToday ? 2 : 0,
                borderColor: "#F59E0B",
              }}
            />
          ) : (
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: isToday ? "#FFFBEB" : "#EFF6FF",
                borderWidth: 1,
                borderColor: isToday ? "#FDE68A" : "#DBEAFE",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: isToday ? "#D97706" : "#2563EB", fontSize: 18, fontWeight: "700" }}>
                {getInitial(item.name)}
              </Text>
            </View>
          )}

          {isToday && (
            <View
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: "#F59E0B",
                borderWidth: 2,
                borderColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 9 }}>🎂</Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: "#111827", fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {item.email || item.designation || "--"}
          </Text>
          <Text
            style={{
              color: isToday ? "#D97706" : "#9CA3AF",
              fontSize: 11,
              fontWeight: "700",
              marginTop: 3,
            }}
          >
            {isToday ? "Today 🎉" : `${monthName.slice(0, 3)} ${day}`}
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
      </View>
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
          <Text style={{ color: "#111827", fontSize: 20, fontWeight: "700" }}>Birthdays</Text>
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

      {/* SEARCH */}
      {!embedded && (
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
              }}
            >
              <Ionicons name="search" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
              <TextInput
                placeholder="Search colleagues..."
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
        </View>
      )}

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
      ) : (
        <SectionList
          {...shellScroll}
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
              <Ionicons name="gift-outline" size={14} color="#6B7280" style={{ marginRight: 6 }} />
              <Text style={{ color: "#6B7280", fontSize: 12, fontWeight: "700" }}>
                {monthName} {todayDate} - {lastDay}
              </Text>
              <Text style={{ color: "#9CA3AF", fontSize: 12, fontWeight: "600", marginLeft: 6 }}>
                • {filtered.length} {filtered.length === 1 ? "birthday" : "birthdays"}
              </Text>
            </View>
            </>
          }
          sections={sections}
          keyExtractor={(item, index) => item.id || item._id || `bday-${index}`}
          renderItem={({ item, section }) => renderUser(item, section.title === "Today")}
          renderSectionHeader={({ section }) => (
            <Text
              style={{
                color: "#9CA3AF",
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                marginBottom: 12,
                marginTop: 4,
              }}
            >
              {section.title} · {section.data.length}
            </Text>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ padding: 24, paddingTop: shellTop, paddingBottom: 150, flexGrow: 1 }}
          refreshControl={
            <RefreshControl progressViewOffset={shellTop} refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" colors={["#2563EB"]} />
          }
          ListEmptyComponent={() => (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <Ionicons name="calendar-outline" size={38} color="#D1D5DB" />
              </View>
              <Text style={{ color: "#111827", fontSize: 17, fontWeight: "700", marginBottom: 6 }}>
                {searchTerm ? "No matches found" : "No Birthdays"}
              </Text>
              <Text
                style={{
                  color: "#6B7280",
                  fontSize: 13,
                  textAlign: "center",
                  maxWidth: 260,
                  lineHeight: 19,
                }}
              >
                {searchTerm
                  ? "Try a different name, email or department."
                  : `No colleagues are celebrating between ${monthName} ${todayDate} and ${lastDay}.`}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

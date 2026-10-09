import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  View,
  Modal,
  TouchableOpacity,
} from "react-native";
import { getAuthSession } from "../../utils/authStorage";
import { apiFetch } from "../../utils/api";
import { useShellScroll } from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { useToast } from "../../components/Toast";
import {
  Card,
  EmptyState,
  IconTile,
  Loading,
  SectionTitle,
  ToneName,
  formatDate,
} from "./ui";

/**
 * ============================================================
 * HOLIDAY CALENDAR
 * ============================================================
 *
 * The company calendar from GET /api/employee/holidays, split
 * into what is still ahead and what has already passed.
 */
interface Holiday {
  _id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
}

const TYPE_TONE: Record<string, ToneName> = {
  Holiday: "blue",
  Festival: "purple",
  National: "green",
  Optional: "amber",
};

export default function EmployeeHolidaysScreen() {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);
  const { showToast } = useToast();

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch("/api/employee/holidays", session.token);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Calendar Unavailable",
          message: "Could not load the holiday list.",
        });

        return;
      }

      const data = await res.json();
      setHolidays(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Holidays load error:", error);

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

  const today = new Date().setHours(0, 0, 0, 0);

  const sorted = holidays
    .slice()
    .sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

  const upcoming = sorted.filter(
    (h) => new Date(h.endDate || h.startDate).getTime() >= today
  );

  const past = sorted
    .filter((h) => new Date(h.endDate || h.startDate).getTime() < today)
    .reverse();

  const renderHoliday = (holiday: Holiday, dim?: boolean) => {
    const start = new Date(holiday.startDate);

    const sameDay =
      !holiday.endDate ||
      new Date(holiday.endDate).toDateString() === start.toDateString();

    return (
      <TouchableOpacity
  key={holiday._id}
  activeOpacity={0.7}
  onPress={() => setSelectedHoliday(holiday)}
  style={dim ? { opacity: 0.62 } : undefined}
>
      <Card key={holiday._id} style={dim ? { opacity: 0.62 } : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {/* the date block, the way a wall calendar reads */}
          <View
            style={{
              width: 52,
              borderRadius: 16,
              backgroundColor: "#F8FAFC",
              borderWidth: 1,
              borderColor: "#EEF2F7",
              paddingVertical: 8,
              alignItems: "center",
            }}
          >
            <Text
              style={{ color: "#0F172A", fontSize: 18, fontWeight: "800" }}
            >
              {start.getDate()}
            </Text>

            <Text
              style={{
                color: "#94A3B8",
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
              }}
            >
              {start.toLocaleDateString("en-GB", { month: "short" })}
            </Text>
          </View>

          <View style={{ flex: 1, marginHorizontal: 14 }}>
            <Text
              style={{ color: "#0F172A", fontSize: 14, fontWeight: "800" }}
              numberOfLines={2}
            >
              {holiday.name}
            </Text>

            <Text
              style={{
                color: "#94A3B8",
                fontSize: 11,
                fontWeight: "600",
                marginTop: 3,
              }}
            >
              {sameDay
                ? start.toLocaleDateString("en-GB", { weekday: "long" })
                : `${formatDate(holiday.startDate)} to ${formatDate(
                    holiday.endDate
                  )}`}
            </Text>
          </View>

          <IconTile
            icon="sunny-outline"
            tone={TYPE_TONE[holiday.type] || "blue"}
            size={38}
          />
        </View>
      </Card>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      {...shellScroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16, paddingTop: shellTop, paddingBottom: 150 }}
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
      {loading ? (
        <Loading label="Loading holidays" />
      ) : holidays.length === 0 ? (
        <EmptyState
          icon="sunny-outline"
          title="No holidays listed"
          message="The company calendar has not been published yet."
        />
      ) : (
        <>
          <SectionTitle>Coming up</SectionTitle>

          {upcoming.length === 0 ? (
            <Card>
              <Text
                style={{
                  color: "#94A3B8",
                  fontSize: 12,
                  fontWeight: "600",
                  textAlign: "center",
                  paddingVertical: 8,
                }}
              >
                Nothing left on the calendar this year.
              </Text>
            </Card>
          ) : (
            upcoming.map((holiday) => renderHoliday(holiday))
          )}

          {past.length > 0 && (
            <>
              <SectionTitle>Already passed</SectionTitle>
              {past.map((holiday) => renderHoliday(holiday, true))}
            </>
          )}
        </>
      )}
      <Modal
  visible={!!selectedHoliday}
  animationType="slide"
  transparent
  onRequestClose={() => setSelectedHoliday(null)}
>
  <View
    style={{
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    }}
  >
    {/* Tap outside to close */}
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => setSelectedHoliday(null)}
      style={{ flex: 1 }}
    />

    <View
      style={{
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: "85%",
      }}
    >
      {/* Header */}
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
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: "#111827",
            }}
          >
            Holiday Details
          </Text>

          <Text
            style={{
              fontSize: 14,
              color: "#6B7280",
              marginTop: 4,
            }}
          >
            View holiday information
          </Text>
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
          <Text style={{ fontSize: 20, color: "#4B5563" }}>×</Text>
        </TouchableOpacity>
      </View>

      {selectedHoliday && (
        <ScrollView
          contentContainerStyle={{
            padding: 24,
            paddingBottom: 36,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Holiday title and type */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 16,
              backgroundColor:
                TYPE_TONE[selectedHoliday.type] === "purple"
                  ? "#FAF5FF"
                  : TYPE_TONE[selectedHoliday.type] === "green"
                  ? "#ECFDF5"
                  : TYPE_TONE[selectedHoliday.type] === "amber"
                  ? "#FFFBEB"
                  : "#EFF6FF",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              marginBottom: 16,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor:
                  TYPE_TONE[selectedHoliday.type] === "purple"
                    ? "#9333EA"
                    : TYPE_TONE[selectedHoliday.type] === "green"
                    ? "#059669"
                    : TYPE_TONE[selectedHoliday.type] === "amber"
                    ? "#D97706"
                    : "#2563EB",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 14,
              }}
            >
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 20,
                  fontWeight: "800",
                }}
              >
                {new Date(selectedHoliday.startDate).getDate()}
              </Text>

              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 10,
                  fontWeight: "700",
                  textTransform: "uppercase",
                }}
              >
                {new Date(selectedHoliday.startDate).toLocaleDateString(
                  "en-GB",
                  { month: "short" }
                )}
              </Text>
            </View>

            <View style={{ flex: 1, marginRight: 8 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "800",
                  color: "#111827",
                }}
              >
                {selectedHoliday.name}
              </Text>

              <Text
                style={{
                  fontSize: 12,
                  color: "#6B7280",
                  marginTop: 4,
                }}
              >
                {formatDate(selectedHoliday.startDate)}
                {selectedHoliday.endDate &&
                new Date(selectedHoliday.endDate).toDateString() !==
                  new Date(selectedHoliday.startDate).toDateString()
                  ? ` – ${formatDate(selectedHoliday.endDate)}`
                  : ""}
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 10,
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  color: "#374151",
                }}
              >
                {selectedHoliday.type}
              </Text>
            </View>
          </View>

          {/* Start date and end date */}
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              marginBottom: 12,
            }}
          >
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
              <Text
                style={{
                  color: "#9CA3AF",
                  fontSize: 10,
                  fontWeight: "700",
                  textTransform: "uppercase",
                }}
              >
                Start Date
              </Text>

              <Text
                style={{
                  color: "#111827",
                  fontSize: 13,
                  fontWeight: "700",
                  marginTop: 6,
                }}
              >
                {formatDate(selectedHoliday.startDate)}
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
              <Text
                style={{
                  color: "#9CA3AF",
                  fontSize: 10,
                  fontWeight: "700",
                  textTransform: "uppercase",
                }}
              >
                End Date
              </Text>

              <Text
                style={{
                  color: "#111827",
                  fontSize: 13,
                  fontWeight: "700",
                  marginTop: 6,
                }}
              >
                {formatDate(
                  selectedHoliday.endDate || selectedHoliday.startDate
                )}
              </Text>
            </View>
          </View>

          {/* Duration and type */}
          <View style={{ flexDirection: "row", gap: 12 }}>
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
              <Text
                style={{
                  color: "#9CA3AF",
                  fontSize: 10,
                  fontWeight: "700",
                  textTransform: "uppercase",
                }}
              >
                Duration
              </Text>

              <Text
                style={{
                  color: "#111827",
                  fontSize: 13,
                  fontWeight: "700",
                  marginTop: 6,
                }}
              >
                {Math.max(
                  1,
                  Math.round(
                    (
                      new Date(
                        selectedHoliday.endDate ||
                          selectedHoliday.startDate
                      ).setHours(0, 0, 0, 0) -
                      new Date(selectedHoliday.startDate).setHours(
                        0,
                        0,
                        0,
                        0
                      )
                    ) / 86400000
                  ) + 1
                )}{" "}
                {Math.max(
                  1,
                  Math.round(
                    (
                      new Date(
                        selectedHoliday.endDate ||
                          selectedHoliday.startDate
                      ).setHours(0, 0, 0, 0) -
                      new Date(selectedHoliday.startDate).setHours(
                        0,
                        0,
                        0,
                        0
                      )
                    ) / 86400000
                  ) + 1
                ) === 1
                  ? "Day"
                  : "Days"}
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
              <Text
                style={{
                  color: "#9CA3AF",
                  fontSize: 10,
                  fontWeight: "700",
                  textTransform: "uppercase",
                }}
              >
                Type
              </Text>

              <Text
                style={{
                  color: "#111827",
                  fontSize: 13,
                  fontWeight: "700",
                  marginTop: 6,
                }}
              >
                {selectedHoliday.type}
              </Text>
            </View>
          </View>

          {/* No edit or delete buttons for employees */}
        </ScrollView>
      )}
    </View>
  </View>
</Modal>
    </ScrollView>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

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
  const shellTop = useShellContentTop();
  const { showToast } = useToast();

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    );
  };

  return (
    <ScrollView
      {...shellScroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16, paddingTop: shellTop, paddingBottom: 150 }}
      refreshControl={
        <RefreshControl
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
    </ScrollView>
  );
}

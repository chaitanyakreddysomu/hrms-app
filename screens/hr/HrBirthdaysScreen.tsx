import React, { useCallback, useEffect, useState } from "react";
import { Image, RefreshControl, ScrollView, Text, View } from "react-native";

import { getAuthSession } from "../../utils/authStorage";
import { apiFetch } from "../../utils/api";
import { useShellScroll } from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { useToast } from "../../components/Toast";
import { Card, EmptyState, Loading, SectionTitle, formatDate } from "./ui";

/**
 * ============================================================
 * BIRTHDAYS
 * ============================================================
 *
 * GET /api/birthdays answers with whoever has a birthday today,
 * and falls back to the ones coming up when today is quiet. Both
 * shapes are the same list, so they are told apart by the date.
 */
interface Person {
  id?: string;
  name: string;
  role?: string;
  designation?: string;
  department?: string;
  profileImage?: string | null;
  dob?: string;
}

export default function HrBirthdaysScreen() {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();
  const { showToast } = useToast();

  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch("/api/birthdays", session.token);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Birthdays Unavailable",
          message: "Could not load the birthday list.",
        });

        return;
      }

      const data = await res.json();
      setPeople(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Birthdays error:", error);

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

  const isToday = (dob?: string) => {
    if (!dob) return false;

    const date = new Date(dob);
    const now = new Date();

    return (
      date.getDate() === now.getDate() && date.getMonth() === now.getMonth()
    );
  };

  const today = people.filter((p) => isToday(p.dob));
  const soon = people.filter((p) => !isToday(p.dob));

  const renderPerson = (person: Person, celebrating: boolean) => (
    <Card key={person.id || person.name}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {person.profileImage ? (
          <Image
            source={{ uri: person.profileImage }}
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: "#F1F5F9",
            }}
          />
        ) : (
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: celebrating ? "#FFFBEB" : "#F1F5F9",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: celebrating ? "#D97706" : "#64748B",
                fontSize: 17,
                fontWeight: "800",
              }}
            >
              {(person.name || "?").charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text
            style={{ color: "#0F172A", fontSize: 14, fontWeight: "800" }}
            numberOfLines={1}
          >
            {person.name}
          </Text>

          <Text
            style={{
              color: "#94A3B8",
              fontSize: 11,
              fontWeight: "600",
              marginTop: 3,
            }}
            numberOfLines={1}
          >
            {person.designation || person.role || "Employee"}
            {person.department ? ` · ${person.department}` : ""}
          </Text>
        </View>

        {celebrating ? (
          <Text style={{ fontSize: 20 }}>🎂</Text>
        ) : (
          <Text
            style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700" }}
          >
            {person.dob
              ? new Date(person.dob).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })
              : formatDate(person.dob)}
          </Text>
        )}
      </View>
    </Card>
  );

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
        <Loading label="Loading birthdays" />
      ) : people.length === 0 ? (
        <EmptyState
          icon="gift-outline"
          title="No birthdays"
          message="Nobody is celebrating today or in the days ahead."
        />
      ) : (
        <>
          {today.length > 0 && (
            <>
              <SectionTitle>Celebrating today</SectionTitle>
              {today.map((person) => renderPerson(person, true))}
            </>
          )}

          {soon.length > 0 && (
            <>
              <SectionTitle>Coming up</SectionTitle>
              {soon.map((person) => renderPerson(person, false))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

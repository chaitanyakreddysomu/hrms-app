import React, { useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { RootStackParamList } from "../navigation/AppNavigator";
import { clearAuthSession, getAuthSession } from "../utils/authStorage";
import AppShell, { ShellTab } from "../components/AppShell";
import ConfirmDialog from "../components/ConfirmDialog";
import { apiFetch } from "../utils/api";
import { useNotifications } from "../utils/useNotifications";
import { unregisterPush } from "../utils/push";

import EmployeeHomeScreen from "./employee/EmployeeHomeScreen";
import EmployeeAttendanceScreen from "./employee/EmployeeAttendanceScreen";
import EmployeeLeavesScreen from "./employee/EmployeeLeavesScreen";
import EmployeeDocumentsScreen from "./employee/EmployeeDocumentsScreen";
import EmployeeHolidaysScreen from "./employee/EmployeeHolidaysScreen";
import EmployeePayslipsScreen from "./employee/EmployeePayslipsScreen";
import EmployeeReferralsScreen from "./employee/EmployeeReferralsScreen";
import EmployeeComplaintsScreen from "./employee/EmployeeComplaintsScreen";
import EmployeeNotificationsScreen from "./employee/EmployeeNotificationsScreen";
import EmployeeProfileScreen from "./employee/EmployeeProfileScreen";

const APP_LOGO = require("../assets/ics-logo.png");

type Props = NativeStackScreenProps<RootStackParamList, "UserDashboard">;

/**
 * ============================================================
 * EMPLOYEE DASHBOARD
 * ============================================================
 *
 * The same AppShell the admin side uses, with five bottom tabs:
 *
 *   Home   Attendance   Leaves   More   Profile
 *
 * More is a launcher rather than a destination. Tapping it lifts
 * its sections out of the pill as a menu, the way a long press on
 * Profile offers Edit profile and Log out.
 */
export default function UserDashboardScreen({ route, navigation }: Props) {
  const fallbackName = route.params?.name || "Employee";

  const [user, setUser] = useState<{
    name: string;
    role: string;
    email?: string;
    profileImage?: string;
  }>({ name: fallbackName, role: "Employee" });

  const [confirmLogout, setConfirmLogout] = useState(false);

  /** lets the home shortcuts drive the shell */
  const shellRef = useRef<((tab: string, page?: string) => void) | null>(
    null
  );

  /** the bell count, push registration and the tap that opens it */
  const { unread } = useNotifications({
    onOpen: () => shellRef.current?.("home", "notifications"),
  });

  useEffect(() => {
    let alive = true;

    (async () => {
      const session = await getAuthSession();

      if (alive && session?.user) {
        setUser((prev) => ({
          ...prev,
          name: session.user.name || prev.name,
          email: session.user.email,
        }));
      }

      if (!session?.token) return;

      try {
        const [profileRes] = await Promise.all([
          apiFetch("/api/employee/profile", session.token),
        ]);

        if (alive && profileRes.ok) {
          const data = await profileRes.json().catch(() => null);

          if (data) {
            setUser((prev) => ({
              ...prev,
              name: data.name || prev.name,
              role: data.designation || "Employee",
              email: data.email || prev.email,
              profileImage: data.profileImage,
            }));
          }
        }

      } catch (error) {
        console.error("Employee shell load error:", error);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const logout = () => setConfirmLogout(true);

  const tabs: ShellTab[] = useMemo(
    () => [
      {
        key: "home",
        label: "Home",
        icon: "home-outline",
        activeIcon: "home",
        pages: [
          {
            key: "home",
            title: "My Workspace",
            subtitle: user.role,
            icon: "grid-outline",
            headerAction: {
              icon: "notifications-outline",
              badge: unread,
              onPress: () => shellRef.current?.("home", "notifications"),
            },
            render: () => (
              <EmployeeHomeScreen
                name={user.name}
                onNavigate={(tab, page) => shellRef.current?.(tab, page)}
              />
            ),
          },
          {
            key: "notifications",
            title: "Notifications",
            icon: "notifications-outline",
            hidden: true,
            menu: [
              {
                key: "markAllRead",
                label: "Mark all read",
                icon: "checkmark-done-outline",
                action: "markAllRead",
              },
              { key: "refresh", label: "Refresh", icon: "refresh-outline" },
            ],
            render: ({ reloadKey }) => (
              <EmployeeNotificationsScreen key={reloadKey} />
            ),
          },
        ],
      },
      {
        key: "attendance",
        label: "Attendance",
        icon: "time-outline",
        activeIcon: "time",
        pages: [
          {
            key: "attendance",
            title: "My Attendance",
            subtitle: "This month",
            icon: "time-outline",
            render: ({ reloadKey }) => (
              <EmployeeAttendanceScreen key={reloadKey} />
            ),
          },
        ],
      },
      {
        key: "leaves",
        label: "Leaves",
        icon: "airplane-outline",
        activeIcon: "airplane",
        pages: [
          {
            key: "leaves",
            title: "My Leaves",
            subtitle: "Requests and balances",
            icon: "airplane-outline",
            menu: [
              {
                key: "applyLeave",
                label: "Apply for leave",
                icon: "add-circle-outline",
                action: "applyLeave",
              },
              { key: "refresh", label: "Refresh", icon: "refresh-outline" },
            ],
            render: ({ reloadKey }) => (
              <EmployeeLeavesScreen key={reloadKey} />
            ),
          },
        ],
      },
      {
        /* the launcher: its pages are the menu it opens */
        key: "more",
        label: "More",
        icon: "ellipsis-horizontal-outline",
        activeIcon: "ellipsis-horizontal",
        asMenu: true,
        pickerTitle: "More",
        pages: [
          {
            key: "documents",
            title: "Documents",
            subtitle: "Upload and track",
            icon: "folder-open-outline",
            render: ({ reloadKey }) => (
              <EmployeeDocumentsScreen key={reloadKey} />
            ),
          },
          {
            key: "holidays",
            title: "Holidays",
            subtitle: "Company calendar",
            icon: "sunny-outline",
            render: ({ reloadKey }) => (
              <EmployeeHolidaysScreen key={reloadKey} />
            ),
          },
          {
            key: "payslips",
            title: "Payslips",
            subtitle: "Monthly salary",
            icon: "receipt-outline",
            render: ({ reloadKey }) => (
              <EmployeePayslipsScreen key={reloadKey} />
            ),
          },
          {
            key: "referrals",
            title: "Referrals",
            subtitle: "Candidates you sent",
            icon: "people-outline",
            menu: [
              {
                key: "addReferral",
                label: "Refer someone",
                icon: "person-add-outline",
                action: "addReferral",
              },
              { key: "refresh", label: "Refresh", icon: "refresh-outline" },
            ],
            render: ({ reloadKey }) => (
              <EmployeeReferralsScreen key={reloadKey} />
            ),
          },
          {
            key: "complaints",
            title: "Complaints",
            subtitle: "Raised with HR",
            icon: "chatbubble-ellipses-outline",
            menu: [
              {
                key: "raiseComplaint",
                label: "Raise a complaint",
                icon: "add-circle-outline",
                action: "raiseComplaint",
              },
              { key: "refresh", label: "Refresh", icon: "refresh-outline" },
            ],
            render: ({ reloadKey }) => (
              <EmployeeComplaintsScreen key={reloadKey} />
            ),
          },
        ],
      },
      {
        key: "profile",
        label: "Profile",
        icon: "person-outline",
        activeIcon: "person",
        imageUri: user.profileImage,
        pages: [
          {
            key: "profile",
            title: "Profile",
            subtitle: user.role,
            icon: "person-outline",
            menu: [
              {
                key: "editProfile",
                label: "Edit profile",
                icon: "create-outline",
                action: "editProfile",
              },
              { key: "refresh", label: "Refresh", icon: "refresh-outline" },
              {
                key: "logout",
                label: "Log out",
                icon: "log-out-outline",
                onPress: logout,
                danger: true,
                divider: true,
              },
            ],
            render: ({ reloadKey }) => (
              <EmployeeProfileScreen key={reloadKey} />
            ),
          },
        ],
      },
    ],
    [user, unread]
  );

  return (
    <>
      <StatusBar style="dark" />

      <AppShell tabs={tabs} navigateRef={shellRef} logo={APP_LOGO} />

      <ConfirmDialog
        visible={confirmLogout}
        icon="log-out-outline"
        danger
        title="Log out"
        message={`You are signed in as ${user.name}. End this session?`}
        confirmLabel="Log out"
        onConfirm={async () => {
          /** this phone should stop being pushed to */
          await unregisterPush();
          await clearAuthSession();
          navigation.replace("Login");
        }}
        onClose={() => setConfirmLogout(false)}
      />
    </>
  );
}

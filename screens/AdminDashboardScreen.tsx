import React, { useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { clearAuthSession, getAuthSession } from "../utils/authStorage";
import AppShell, { ShellTab } from "../components/AppShell";
import ConfirmDialog from "../components/ConfirmDialog";

const APP_LOGO = require("../assets/ics-logo.png");

import AdminHomeScreen from "./admin/AdminHomeScreen";
import AdminAttendanceScreen from "./admin/AdminAttendanceScreen";
import AdminEmployeesScreen from "./admin/AdminEmployeesScreen";
import PendingRequestsScreen from "./admin/PendingRequestsScreen";
import AdminDocumentsScreen from "./admin/AdminDocumentsScreen";
import AdminBankDetailsScreen from "./admin/AdminBankDetailsScreen";
import AdminLeavesScreen from "./admin/AdminLeavesScreen";
import AdminPayslipsScreen from "./admin/AdminPayslipsScreen";
import AdminBirthdaysScreen from "./admin/AdminBirthdaysScreen";
import AdminReferralsScreen from "./admin/AdminReferralsScreen";
import AdminHolidaysScreen from "./admin/AdminHolidaysScreen";
import AdminComplaintsScreen from "./admin/AdminComplaintsScreen";
import ProfileScreen from "./admin/ProfileScreen";
import AdminNotificationsScreen from "./admin/AdminNotificationsScreen";
import { API_BASE_URL, apiFetch } from "../utils/api";
import { useNotifications } from "../utils/useNotifications";
import { unregisterPush } from "../utils/push";

type Props = NativeStackScreenProps<RootStackParamList, "AdminDashboard">;

/**
 * ============================================================
 * ADMIN DASHBOARD
 * ============================================================
 *
 * The sidebar is gone. Every admin module is now a page inside
 * AppShell: five floating bottom tabs, and the Employees tab
 * opens a full page section picker from its header title.
 */
export default function AdminDashboardScreen({ route, navigation }: Props) {
  const fallbackName = route.params?.name || "Admin User";
  const fallbackRole = route.params?.role || "ADMIN";

  const [user, setUser] = useState<{
    name: string;
    role: string;
    email: string;
    designation?: string;
    profileImage?: string;
  }>({
    name: fallbackName,
    role: "Super Admin",
    email: "admin@company.com",
  });

  useEffect(() => {
    let alive = true;

    async function loadUser() {
      const session = await getAuthSession();
      if (alive && session?.user) {
        setUser((prev) => ({
          ...prev,
          name: session.user.name || fallbackName,
          role: session.user.role || fallbackRole,
          email: session.user.email || prev.email,
        }));
      }

      if (!session?.token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/profile`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (!res.ok) return;
        const apiUser = await res.json();
        if (!alive) return;
        setUser({
          name: apiUser.name || fallbackName,
          role: apiUser.role || fallbackRole,
          email: apiUser.email || "admin@company.com",
          designation: apiUser.designation || apiUser.department,
          profileImage: apiUser.profileImage || apiUser.avatar,
        });
      } catch {
        /* cached session data is good enough */
      }
    }

    loadUser();
    return () => {
      alive = false;
    };
  }, []);

  /** lets the home shortcuts drive the shell */
  const shellRef = useRef<((tab: string, page?: string) => void) | null>(null);

  /**
   * The bell count, this device on the push list, and the tap that
   * opens the notifications page from outside the app.
   */
  const { unread, setUnread } = useNotifications({
    countPath: "/api/notifications/unread-count",
    onOpen: () => shellRef.current?.("home", "notifications"),
  });

  /**
   * Embedded pages still expect stack props. They only reach for
   * `goBack`, which must not drop the user out of the shell.
   */
  const childNav = useMemo(
    () =>
      ({
        ...navigation,
        goBack: () => {
          if (navigation.canGoBack()) navigation.goBack();
        },
      } as any),
    [navigation]
  );

  const childProps = () => ({
    embedded: true as const,
    navigation: childNav,
    route: { key: "embedded", name: "embedded", params: undefined } as any,
  });

  /** the app dialog, in place of the platform alert */
  const [confirmLogout, setConfirmLogout] = useState(false);

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
            title: "Admin Dashboard",
            subtitle: user.role,
            icon: "grid-outline",
            headerAction: {
              icon: "notifications-outline",
              badge: unread,
              onPress: () => shellRef.current?.("home", "notifications"),
            },
            render: ({ reloadKey }) => (
              <AdminHomeScreen
                reloadKey={reloadKey}
                userName={user.name}
                userRole={user.role}
                userDesignation={user.designation}
                profileImage={user.profileImage}
                onOpenEmployees={() => shellRef.current?.("employees")}
                onOpenRequests={() =>
                  shellRef.current?.("employees", "requests")
                }
                onOpenAttendance={() => shellRef.current?.("attendance")}
                onOpenComplaints={() => shellRef.current?.("complaints")}
              />
            ),
          },
          {
            key: "notifications",
            title: "Notifications",
            subtitle: "Sent to you",
            icon: "notifications-outline",
            hidden: true,
            render: ({ reloadKey }) => (
              <AdminNotificationsScreen
                reloadKey={reloadKey}
                onUnreadChange={setUnread}
              />
            ),
          },
        ],
      },
      {
        key: "attendance",
        label: "Attendance",
        icon: "calendar-outline",
        activeIcon: "calendar",
        pages: [
          {
            key: "attendance",
            title: "Attendance",
            subtitle: "Daily punch records",
            icon: "calendar-outline",
            searchable: true,
            searchPlaceholder: "Search employees",
            menu: [
              {
                key: "date",
                label: "Change date",
                icon: "calendar-outline",
                action: "pickDate",
              },
              { key: "refresh", label: "Refresh", icon: "refresh-outline" },
              {
                key: "export",
                label: "Export",
                icon: "download-outline",
                action: "export",
              },
            ],
            render: ({ reloadKey }) => (
              <AdminAttendanceScreen key={reloadKey} {...childProps()} />
            ),
          },
        ],
      },
      {
        key: "employees",
        label: "Employees",
        icon: "people-outline",
        activeIcon: "people",
        pickerTitle: "Employee modules",
        pages: [
          {
            key: "employees",
            title: "Employees",
            subtitle: "Directory",
            icon: "people-outline",
            searchable: true,
            searchPlaceholder: "Search employees",
            menu: [
              {
                key: "addEmployee",
                label: "Add Employee",
                icon: "person-add-outline",
                action: "addEmployee",
              },
              { key: "refresh", label: "Refresh", icon: "refresh-outline" },
            ],
            render: ({ reloadKey }) => (
              <AdminEmployeesScreen key={reloadKey} {...childProps()} />
            ),
          },
          {
            key: "requests",
            title: "Requests",
            subtitle: "Pending approvals",
            icon: "time-outline",
            searchable: true,
            searchPlaceholder: "Search by name, email, phone",
            render: ({ reloadKey }) => (
              <PendingRequestsScreen key={reloadKey} {...childProps()} />
            ),
          },
          {
            key: "documents",
            title: "Documents",
            subtitle: "Employee files",
            icon: "folder-open-outline",
            searchable: true,
            searchPlaceholder: "Search employees",
            render: ({ reloadKey }) => (
              <AdminDocumentsScreen key={reloadKey} {...childProps()} />
            ),
          },
          {
            key: "bank",
            title: "Bank Details",
            subtitle: "Payout accounts",
            icon: "card-outline",
            searchable: true,
            searchPlaceholder: "Search employees, banks or accounts",
            render: ({ reloadKey }) => (
              <AdminBankDetailsScreen key={reloadKey} {...childProps()} />
            ),
          },
          {
            key: "leaves",
            title: "Leaves",
            subtitle: "Requests and balances",
            icon: "briefcase-outline",
            searchable: true,
            searchPlaceholder: "Search employees, type or reason",
            render: ({ reloadKey }) => (
              <AdminLeavesScreen key={reloadKey} {...childProps()} />
            ),
          },
          {
            key: "payslips",
            title: "Payslips",
            subtitle: "Monthly payroll",
            icon: "cash-outline",
            searchable: true,
            searchPlaceholder: "Search employees",
            render: ({ reloadKey }) => (
              <AdminPayslipsScreen key={reloadKey} {...childProps()} />
            ),
          },
          {
            key: "birthdays",
            title: "Birthdays",
            subtitle: "Upcoming celebrations",
            icon: "gift-outline",
            searchable: true,
            searchPlaceholder: "Search colleagues",
            render: ({ reloadKey }) => (
              <AdminBirthdaysScreen key={reloadKey} {...childProps()} />
            ),
          },
          {
            key: "referrals",
            title: "Referrals",
            subtitle: "Candidate pipeline",
            icon: "person-add-outline",
            searchable: true,
            searchPlaceholder: "Search candidate, role or employee",
            render: ({ reloadKey }) => (
              <AdminReferralsScreen key={reloadKey} {...childProps()} />
            ),
          },
          {
            key: "holidays",
            title: "Holidays",
            subtitle: "Company calendar",
            icon: "airplane-outline",
            render: ({ reloadKey }) => (
              <AdminHolidaysScreen key={reloadKey} {...childProps()} />
            ),
          },
        ],
      },
      {
        key: "complaints",
        label: "Complaints",
        icon: "alert-circle-outline",
        activeIcon: "alert-circle",
        pages: [
          {
            key: "complaints",
            title: "Complaints",
            subtitle: "Raised by employees",
            icon: "alert-circle-outline",
            searchable: true,
            searchPlaceholder: "Search complaints",
            render: ({ reloadKey }) => (
              <AdminComplaintsScreen key={reloadKey} {...childProps()} />
            ),
          },
        ],
      },
      {
        key: "profile",
        label: "Profile",
        icon: "person-circle-outline",
        activeIcon: "person-circle",
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
              <ProfileScreen key={reloadKey} {...childProps()} />
            ),
          },
        ],
      },
    ],
    [user, childNav, unread]
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
        message={`You are signed in as ${user.name}. End this admin session?`}
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

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

import HrHomeScreen from "./hr/HrHomeScreen";
import HrEmployeesScreen from "./hr/HrEmployeesScreen";
import HrAttendanceScreen from "./hr/HrAttendanceScreen";
import HrLeavesScreen from "./hr/HrLeavesScreen";
import HrRequestsScreen from "./hr/HrRequestsScreen";
import HrComplaintsScreen from "./hr/HrComplaintsScreen";
import HrBirthdaysScreen from "./hr/HrBirthdaysScreen";
import HrReferralsScreen from "./hr/HrReferralsScreen";
import HrTeamPayslipsScreen from "./hr/HrTeamPayslipsScreen";
import AdminHolidaysScreen from "./admin/AdminHolidaysScreen";

import EmployeeAttendanceScreen from "./employee/EmployeeAttendanceScreen";
import EmployeeHomeScreen from "./employee/EmployeeHomeScreen";
import EmployeeLeavesScreen from "./employee/EmployeeLeavesScreen";
import EmployeeDocumentsScreen from "./employee/EmployeeDocumentsScreen";
import EmployeeHolidaysScreen from "./employee/EmployeeHolidaysScreen";
import EmployeePayslipsScreen from "./employee/EmployeePayslipsScreen";
import EmployeeComplaintsScreen from "./employee/EmployeeComplaintsScreen";
import EmployeeReferralsScreen from "./employee/EmployeeReferralsScreen";
import EmployeeProfileScreen from "./employee/EmployeeProfileScreen";
import EmployeeNotificationsScreen from "./employee/EmployeeNotificationsScreen";

const APP_LOGO = require("../assets/ics-logo.png");

type Props = NativeStackScreenProps<RootStackParamList, "HrDashboard">;

/**
 * ============================================================
 * HR DASHBOARD
 * ============================================================
 *
 * One person, two jobs. The dropdown under the header swaps the
 * whole set of tabs:
 *
 *   HR view  -> the team: employees, their attendance, their
 *               leave, signups and complaints. Reads like admin.
 *   My view  -> their own workspace: punch clock, own leave,
 *               payslips and documents. Reads like an employee.
 *
 * Every HR view screen speaks to /api/hr. The personal side
 * reuses the employee screens, pointed at the HR routes.
 */
export default function HrDashboardScreen({ route, navigation }: Props) {
  const fallbackName = route.params?.name || "HR";

  const [user, setUser] = useState<{
    name: string;
    role: string;
    profileImage?: string;
  }>({ name: fallbackName, role: "Human Resources" });

  const [view, setView] = useState<"hr" | "my">("hr");
  const [confirmLogout, setConfirmLogout] = useState(false);

  const shellRef = useRef<((tab: string, page?: string) => void) | null>(
    null
  );

  /** the bell count, push registration and the tap that opens it */
  const { unread } = useNotifications({
    countPath: "/api/notifications/unread-count",
    onOpen: () => shellRef.current?.("documents", "notifications"),
  });

  useEffect(() => {
    let alive = true;

    (async () => {
      const session = await getAuthSession();

      if (alive && session?.user) {
        setUser((prev) => ({
          ...prev,
          name: session.user.name || prev.name,
        }));
      }

      if (!session?.token) return;

      try {
        const res = await apiFetch("/api/hr/profile", session.token);

        if (alive && res.ok) {
          const data = await res.json().catch(() => null);

          if (data) {
            setUser({
              name: data.name || fallbackName,
              role: data.designation || "Human Resources",
              profileImage: data.profileImage,
            });
          }
        }
      } catch (error) {
        console.error("HR shell load error:", error);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const logout = () => setConfirmLogout(true);

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

  /** the rows the profile tab offers on a long press */
  const profileMenu = [
    {
      key: "editProfile",
      label: "Edit profile",
      icon: "create-outline" as const,
      action: "editProfile",
    },
    { key: "refresh", label: "Refresh", icon: "refresh-outline" as const },
    {
      key: "logout",
      label: "Log out",
      icon: "log-out-outline" as const,
      onPress: logout,
      danger: true,
      divider: true,
    },
  ];

  /* ============================================================
     HR VIEW: running the team
     ============================================================ */
  const hrTabs: ShellTab[] = useMemo(
    () => [
      {
        key: "home",
        label: "Home",
        icon: "home-outline",
        activeIcon: "home",
        pages: [
          {
            key: "home",
            title: "HR Dashboard",
            subtitle: user.role,
            icon: "grid-outline",
            hideHeader: true,
            render: () => (
              <HrHomeScreen
                name={user.name}
                profileImage={user.profileImage}
                unread={unread}
                onNavigate={(tab, page) => shellRef.current?.(tab, page)}
                onSwitchView={() => setView("my")}
              />
            ),
          },
        ],
      },
      {
        key: "employees",
        label: "Employees",
        icon: "people-outline",
        activeIcon: "people",
        pages: [
          {
            key: "employees",
            title: "Employees",
            subtitle: "Directory",
            icon: "people-outline",
            searchable: true,
            searchPlaceholder: "Search name, id or email",
            render: ({ reloadKey }) => (
              <HrEmployeesScreen key={reloadKey} />
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
            title: "Team Attendance",
            subtitle: "Day by day",
            icon: "time-outline",
            searchable: true,
            searchPlaceholder: "Search name or employee id",
            menu: [
              {
                key: "exportAttendance",
                label: "Export as CSV",
                icon: "download-outline",
                action: "exportAttendance",
              },
              { key: "refresh", label: "Refresh", icon: "refresh-outline" },
            ],
            render: ({ reloadKey }) => (
              <HrAttendanceScreen key={reloadKey} />
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
            title: "Leave Requests",
            subtitle: "Approve or reject",
            icon: "airplane-outline",
            render: ({ reloadKey }) => <HrLeavesScreen key={reloadKey} />,
          },
        ],
      },
      {
        key: "documents",
        label: "Documents",
        icon: "folder-open-outline",
        activeIcon: "folder-open",
        pages: [
          {
            key: "documents",
            title: "Documents",
            subtitle: "Upload and track",
            icon: "folder-open-outline",
            render: ({ reloadKey }) => (
              <EmployeeDocumentsScreen
                key={reloadKey}
                profilePath="/api/hr/profile"
                uploadPath="/api/hr/documents/upload"
                previewPath="/api/hr/documents/preview"
              />
            ),
          },
          {
            key: "requests",
            title: "Signup Requests",
            subtitle: "Waiting for approval",
            icon: "person-add-outline",
            hidden: true,
            highlightBottomTab: false,
            render: ({ reloadKey }) => <HrRequestsScreen key={reloadKey} />,
          },
          {
            key: "complaints",
            title: "Complaints",
            subtitle: "Raised by employees",
            icon: "chatbubble-ellipses-outline",
            hidden: true,
            highlightBottomTab: false,
            searchable: true,
            searchPlaceholder: "Search subject or employee",
            render: ({ reloadKey }) => (
              <HrComplaintsScreen key={reloadKey} />
            ),
          },
          {
            key: "payslips",
            title: "Payslips",
            subtitle: "Across the team",
            icon: "receipt-outline",
            hidden: true,
            highlightBottomTab: false,
            render: ({ reloadKey }) => (
              <HrTeamPayslipsScreen key={reloadKey} />
            ),
          },
          {
            key: "referrals",
            title: "Referrals",
            subtitle: "Candidates put forward",
            icon: "people-circle-outline",
            hidden: true,
            highlightBottomTab: false,
            searchable: true,
            searchPlaceholder: "Search name, email or role",
            render: ({ reloadKey }) => <HrReferralsScreen key={reloadKey} />,
          },
          {
            key: "birthdays",
            title: "Birthdays",
            subtitle: "Today and coming up",
            icon: "gift-outline",
            hidden: true,
            highlightBottomTab: false,
            render: ({ reloadKey }) => <HrBirthdaysScreen key={reloadKey} />,
          },
          {
            key: "holidays",
            title: "Holidays",
            subtitle: "Company calendar",
            icon: "sunny-outline",
            hidden: true,
            highlightBottomTab: false,
            menu: [
              {
                key: "addHoliday",
                label: "Add Holiday",
                icon: "add-circle-outline",
                action: "addHoliday",
              },
            ],
            render: ({ reloadKey }) => (
              <AdminHolidaysScreen
                key={reloadKey}
                basePath="/api/hr/holidays"
                {...childProps()}
              />
            ),
          },
          {
            key: "notifications",
            title: "Notifications",
            icon: "notifications-outline",
            hidden: true,
            highlightBottomTab: false,
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
              <EmployeeNotificationsScreen
                key={reloadKey}
                listPath="/api/hr/notifications/my"
                readPath="/api/hr/notifications"
              />
            ),
          },
        ],
      },
    ],
    [user, unread]
  );

  /* ============================================================
     MY VIEW: the HR person as an employee
     ============================================================ */
  const myTabs: ShellTab[] = useMemo(
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
            hideHeader: true,
            render: () => (
              <EmployeeHomeScreen
                name={user.name}
                profileImage={user.profileImage}
                unread={unread}
                attendancePath="/api/hr/attendance/status"
                payslipsPath="/api/hr/payslips"
                payslipProfilePath="/api/hr/profile"
                punchInPath="/api/hr/punch-in"
                punchOutPath="/api/hr/punch-out"
                notificationsTab="documents"
                switchLabel="Switch to HR view"
                onSwitchView={() => setView("hr")}
                onNavigate={(tab, page) => shellRef.current?.(tab, page)}
              />
            ),
          },
        ],
      },
      {
        key: "myattendance",
        label: "Attendance",
        icon: "time-outline",
        activeIcon: "time",
        pages: [
          {
            key: "myattendance",
            title: "My Attendance",
            subtitle: "This month",
            icon: "time-outline",
            render: ({ reloadKey }) => (
              <EmployeeAttendanceScreen key={reloadKey} self />
            ),
          },
        ],
      },
      {
        key: "myleaves",
        label: "Leaves",
        icon: "airplane-outline",
        activeIcon: "airplane",
        pages: [
          {
            key: "myleaves",
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
              <EmployeeLeavesScreen
                key={reloadKey}
                listPath="/api/leaves/my"
                createPath="/api/leaves"
              />
            ),
          },
        ],
      },
      {
        key: "documents",
        label: "Documents",
        icon: "folder-open-outline",
        activeIcon: "folder-open",
        pages: [
          {
            key: "documents",
            title: "My Documents",
            subtitle: "Upload and track",
            icon: "folder-open-outline",
            render: ({ reloadKey }) => (
              <EmployeeDocumentsScreen
                key={reloadKey}
                profilePath="/api/hr/profile"
                uploadPath="/api/hr/documents/upload"
                previewPath="/api/hr/documents/preview"
              />
            ),
          },
          {
            key: "holidays",
            title: "Holidays",
            subtitle: "Company calendar",
            icon: "sunny-outline",
            hidden: true,
            highlightBottomTab: false,
            render: ({ reloadKey }) => (
              <EmployeeHolidaysScreen key={reloadKey} />
            ),
          },
          {
            key: "referrals",
            title: "My Referrals",
            subtitle: "Candidates you sent",
            icon: "people-outline",
            hidden: true,
            highlightBottomTab: false,
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
            key: "payslips",
            title: "My Payslips",
            subtitle: "Monthly salary",
            icon: "receipt-outline",
            hidden: true,
            highlightBottomTab: false,
            render: ({ reloadKey }) => (
              <EmployeePayslipsScreen
                key={reloadKey}
                listPath="/api/hr/payslips"
                profilePath="/api/hr/profile"
              />
            ),
          },
          {
            key: "notifications",
            title: "Notifications",
            icon: "notifications-outline",
            hidden: true,
            highlightBottomTab: false,
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
              <EmployeeNotificationsScreen
                key={reloadKey}
                listPath="/api/hr/notifications/my"
                readPath="/api/hr/notifications"
              />
            ),
          },
          {
            key: "complaints",
            title: "My Complaints",
            subtitle: "Raised by you",
            icon: "chatbubble-ellipses-outline",
            hidden: true,
            highlightBottomTab: false,
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
              <EmployeeComplaintsScreen
                key={reloadKey}
                path="/api/hr/my-complaints"
              />
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
            menu: profileMenu,
            render: ({ reloadKey }) => (
              <EmployeeProfileScreen
                key={reloadKey}
                profilePath="/api/hr/profile"
                imagePath="/api/hr/profile-image"
              />
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

      {/* remounting on a view change resets the tabs cleanly */}
      <AppShell
        key={view}
        tabs={view === "hr" ? hrTabs : myTabs}
        navigateRef={shellRef}
        logo={APP_LOGO}
      />

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

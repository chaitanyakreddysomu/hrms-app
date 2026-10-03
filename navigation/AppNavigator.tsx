import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SplashScreen from "../screens/SplashScreen";
import LoginScreen from "../screens/LoginScreen";
import TwoFactorScreen from "../screens/TwoFactorScreen";
import AdminDashboardScreen from "../screens/AdminDashboardScreen";
import HrDashboardScreen from "../screens/HrDashboardScreen";
import UserDashboardScreen from "../screens/UserDashboardScreen";
import ProfileScreen from "../screens/admin/ProfileScreen";
import SecurityScreen from "../screens/admin/SecurityScreen";
import PendingRequestsScreen from "../screens/admin/PendingRequestsScreen";
import {
  EmployeesScreen,
  DocumentsScreen,
} from "../screens/admin/AdminScreens";
import AdminAttendanceScreen from "../screens/admin/AdminAttendanceScreen";
import AdminLeavesScreen from "../screens/admin/AdminLeavesScreen";
import AdminHolidaysScreen from "../screens/admin/AdminHolidaysScreen";
import AdminBirthdaysScreen from "../screens/admin/AdminBirthdaysScreen";
import AdminBankDetailsScreen from "../screens/admin/AdminBankDetailsScreen";
import AdminReferralsScreen from "../screens/admin/AdminReferralsScreen";
import AdminComplaintsScreen from "../screens/admin/AdminComplaintsScreen";
import AdminPayslipsScreen from "../screens/admin/AdminPayslipsScreen";

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  TwoFactor: { tempToken: string; email?: string; remember: boolean };
  AdminDashboard: { role?: string; name?: string } | undefined;
  HrDashboard: { role?: string; name?: string } | undefined;
  UserDashboard: { role?: string; name?: string } | undefined;
  AdminProfile: undefined;
  AdminSecurity: undefined;
  AdminPendingRequests: undefined;
  AdminEmployees: undefined;
  AdminDocuments: undefined;
  AdminAttendance: undefined;
  AdminLeaves: undefined;
  AdminHolidays: undefined;
  AdminBirthdays: undefined;
  AdminPayslips: undefined;
  AdminBankDetails: undefined;
  AdminReferrals: undefined;
  AdminComplaints: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{ headerShown: false, animation: "fade" }}
      >
        <Stack.Screen
          name="Splash"
          component={SplashScreen}
          options={{ animation: "fade", gestureEnabled: false }}
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ animation: "fade", animationDuration: 600, gestureEnabled: false }}
        />
        <Stack.Screen
          name="TwoFactor"
          component={TwoFactorScreen}
          options={{ animation: "slide_from_right" }}
        />
        <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
        <Stack.Screen name="HrDashboard" component={HrDashboardScreen} />
        <Stack.Screen name="UserDashboard" component={UserDashboardScreen} />
        <Stack.Screen name="AdminProfile" component={ProfileScreen} />
        <Stack.Screen name="AdminSecurity" component={SecurityScreen} />
        <Stack.Screen name="AdminPendingRequests" component={PendingRequestsScreen} />
        <Stack.Screen name="AdminEmployees" component={EmployeesScreen} />
        <Stack.Screen name="AdminDocuments" component={DocumentsScreen} />
        <Stack.Screen name="AdminAttendance" component={AdminAttendanceScreen} />
        <Stack.Screen name="AdminLeaves" component={AdminLeavesScreen} />
        <Stack.Screen name="AdminHolidays" component={AdminHolidaysScreen} />
        <Stack.Screen name="AdminBirthdays" component={AdminBirthdaysScreen} />
        <Stack.Screen name="AdminPayslips" component={AdminPayslipsScreen} />
        <Stack.Screen name="AdminBankDetails" component={AdminBankDetailsScreen} />
        <Stack.Screen name="AdminReferrals" component={AdminReferralsScreen} />
        <Stack.Screen name="AdminComplaints" component={AdminComplaintsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}


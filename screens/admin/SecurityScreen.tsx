import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "AdminSecurity">;

export default function SecurityScreen({ navigation }: Props) {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-6 py-4 flex-row items-center justify-between bg-white border-b border-gray-100 shadow-sm">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="w-10 h-10 rounded-2xl bg-gray-50 border border-gray-200 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#374151" />
        </TouchableOpacity>
        <Text className="text-gray-900 text-lg font-bold">Security</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        {/* Two-Factor Authentication Card */}
        <View className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm mb-6">
          <View className="flex-row items-center mb-4">
            <View className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 items-center justify-center mr-4">
              <Ionicons name="shield-checkmark-outline" size={24} color="#2563EB" />
            </View>
            <View className="flex-1">
              <Text className="text-gray-900 font-bold text-base">Two-Factor Authentication</Text>
              <Text className="text-gray-400 text-xs mt-0.5">2FA Security Protection</Text>
            </View>
            <View className={`px-3 py-1 rounded-full ${twoFactorEnabled ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-100'}`}>
              <Text className={`text-[10px] font-bold uppercase ${twoFactorEnabled ? 'text-emerald-600' : 'text-gray-500'}`}>
                {twoFactorEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
          </View>

          <Text className="text-gray-600 text-xs leading-5 mb-5">
            Add an extra layer of security to your account using authenticator apps like Google Authenticator or Microsoft Authenticator.
          </Text>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setTwoFactorEnabled(!twoFactorEnabled)}
            className={`rounded-2xl py-3.5 items-center ${
              twoFactorEnabled ? 'bg-red-50 border border-red-200' : 'bg-blue-600 shadow-md shadow-blue-500/20'
            }`}
          >
            <Text className={`font-bold text-sm ${twoFactorEnabled ? 'text-red-600' : 'text-white'}`}>
              {twoFactorEnabled ? 'Disable 2FA' : 'Configure 2FA'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Change Password Quick Card */}
        <View className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm mb-6">
          <View className="flex-row items-center mb-3">
            <View className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 items-center justify-center mr-4">
              <Ionicons name="key-outline" size={24} color="#F59E0B" />
            </View>
            <View className="flex-1">
              <Text className="text-gray-900 font-bold text-base">Password & Credentials</Text>
              <Text className="text-gray-400 text-xs mt-0.5">Last changed 30 days ago</Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            className="flex-row items-center justify-between py-3 border-t border-gray-100 mt-2"
          >
            <Text className="text-gray-700 font-semibold text-xs">Update Password</Text>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

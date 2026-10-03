import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/AppNavigator";

interface Props extends NativeStackScreenProps<RootStackParamList, any> {
  title: string;
}

export function GenericAdminScreen({ title, navigation }: Props) {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="px-6 py-4 flex-row items-center bg-white border-b border-gray-200">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="w-10 h-10 rounded-xl bg-gray-100 items-center justify-center mr-4"
        >
          <Ionicons name="arrow-back" size={20} color="#374151" />
        </TouchableOpacity>
        <Text className="text-gray-900 text-lg font-bold">{title}</Text>
      </View>
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-gray-900 text-xl font-bold">{title}</Text>
        <Text className="text-gray-500 text-xs mt-2 text-center">
          {title} Module Content & Management Screen
        </Text>
      </View>
    </SafeAreaView>
  );
}

export { default as EmployeesScreen } from "./AdminEmployeesScreen";
export { default as DocumentsScreen } from "./AdminDocumentsScreen";

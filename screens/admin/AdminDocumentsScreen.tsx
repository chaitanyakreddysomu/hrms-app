import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Image,
  RefreshControl,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/AppNavigator";
import { getAuthSession } from "../../utils/authStorage";
import {
  toShellOptions,
  useShellFilters,
  useShellScroll,
  useShellSearch,
} from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { apiFetch, resetBaseUrl } from "../../utils/api";
import ModalDismiss from "../../components/ModalDismiss";

type Props = NativeStackScreenProps<RootStackParamList, "AdminDocuments">;

interface Employee {
  id: string;
  _id?: string;
  name: string;
  email: string;
  department?: string;
  designation?: string;
  profileImage?: string;
  avatar?: string;
  uploads: number;
  pending: number;
  verified: number;
  rejected: number;
}

type DocCategory = "Government" | "Educational" | "Personal" | "Experience";
type DocStatus = "Verified" | "Rejected" | "Pending" | "Review";

interface DocItem {
  id: string;
  _id?: string;
  name: string;
  category: DocCategory;
  status: DocStatus;
  uploadedOn: string;
  path: string;
  rejectionReason?: string;
  size?: string;
}

const TABS: DocCategory[] = ["Government", "Educational", "Personal", "Experience"];
const STATUS_OPTIONS = ["All", "Pending", "Verified"];

export default function AdminDocumentsScreen({ navigation, embedded }: Props & { embedded?: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  /** the shell header search field drives this page */
  useShellSearch(setSearchTerm);
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);

  const [statusFilter, setStatusFilter] = useState("All");
  
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const [openDropdown, setOpenDropdown] = useState<"status" | null>(null);

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  // Documents State
  const [docsLoading, setDocsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DocCategory>("Government");
  const [docs, setDocs] = useState<Record<string, DocItem[]>>({ 
    government: [], educational: [], personal: [], experience: [] 
  });

  // Action Bottom Sheet
  const [selectedDoc, setSelectedDoc] = useState<DocItem | null>(null);
  
  // Rejection
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // ============================================================
  // FETCH EMPLOYEES
  // ============================================================

  const fetchEmployees = useCallback(
    async (pageToLoad = 1, opts: { silent?: boolean; resetUrl?: boolean } = {}) => {
      const requestId = ++requestIdRef.current;

      if (pageToLoad === 1) {
        if (!opts.silent) setLoading(true);
      } else {
        setLoadingMore(true);
      }

      setError(null);

      if (opts.resetUrl) resetBaseUrl();

      try {
        const session = await getAuthSession();

        if (!session?.token) {
          if (requestId === requestIdRef.current) setError("Not authenticated.");
          return;
        }

        const params = new URLSearchParams();
        params.append("page", pageToLoad.toString());
        params.append("limit", "10");
        if (searchTerm.trim()) params.append("search", searchTerm.trim());
        if (statusFilter !== "All") params.append("status", statusFilter);

        const res = await apiFetch(`/api/admin/documents?${params.toString()}`, session.token);

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || `Server error (${res.status})`);
        }

        const data = await res.json();
        if (requestId !== requestIdRef.current) return;

        const newEmployees = Array.isArray(data.employees) ? data.employees : [];

        if (pageToLoad === 1) {
          setEmployees(newEmployees);
        } else {
          setEmployees((prev) => {
            const existingIds = new Set(prev.map((item) => item.id || item._id));
            const uniqueNewEmployees = newEmployees.filter(
              (item: Employee) => !existingIds.has(item.id || item._id)
            );
            return [...prev, ...uniqueNewEmployees];
          });
        }

        if (data.pagination) {
          setPage(data.pagination.page || pageToLoad);
          setTotalPages(data.pagination.pages || 1);
          setTotalRecords(data.pagination.total || 0);
        } else {
          setPage(pageToLoad);
          setTotalPages(newEmployees.length < 10 ? pageToLoad : pageToLoad + 1);
        }
      } catch (err: any) {
        if (requestId !== requestIdRef.current) return;
        const message = err?.message?.includes("Network request failed")
          ? "Cannot reach server."
          : err?.message || "Something went wrong.";
        setError(message);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [searchTerm, statusFilter]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchEmployees(1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, statusFilter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchEmployees(1, { silent: true, resetUrl: true });
  }, [fetchEmployees]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return;
    if (page >= totalPages) return;
    fetchEmployees(page + 1, { silent: true });
  }, [loading, loadingMore, page, totalPages, fetchEmployees]);

  // ============================================================
  // FETCH EMPLOYEE DOCS
  // ============================================================
  const fetchEmployeeDocs = async (emp: Employee) => {
    setDocsLoading(true);
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(`/api/admin/documents/${emp.id || emp._id}`, session.token);
      if (res.ok) {
        const data: DocItem[] = await res.json();
        setDocs({
          government: data.filter(d => d.category === 'Government'),
          educational: data.filter(d => d.category === 'Educational'),
          personal: data.filter(d => d.category === 'Personal'),
          experience: data.filter(d => d.category === 'Experience')
        });
      }
    } catch (error) {
      console.error("Failed to fetch employee docs", error);
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEmployee) {
      fetchEmployeeDocs(selectedEmployee);
    } else {
      // Refresh list stats on close
      fetchEmployees(1, { silent: true });
    }
  }, [selectedEmployee]);

  // ============================================================
  // UPDATE STATUS
  // ============================================================
  const updateStatus = async (docId: string, status: DocStatus, reason?: string) => {
    if (!selectedEmployee) return;
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const empId = selectedEmployee.id || selectedEmployee._id;
      const res = await apiFetch(`/api/admin/documents/${empId}/${docId}`, session.token, {
        method: 'PUT',
        body: JSON.stringify({ status, reason })
      });

      if (res.ok) {
        // Update local state
        const categoryKey = activeTab.toLowerCase();
        setDocs(prev => ({
          ...prev,
          [categoryKey]: (prev as any)[categoryKey]?.map((d: DocItem) => 
            (d.id || d._id) === docId ? { ...d, status, rejectionReason: reason } : d
          )
        }));
        
        // Update selected doc if open
        if (selectedDoc && (selectedDoc.id || selectedDoc._id) === docId) {
          setSelectedDoc({ ...selectedDoc, status, rejectionReason: reason });
        }
        
        setRejectingDocId(null);
        setRejectionReason("");
      } else {
        alert("Failed to update status");
      }
    } catch (error) {
      console.error("Error updating status", error);
    }
  };

  const handlePreview = async (path: string) => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(`/api/admin/document-preview?path=${encodeURIComponent(path)}`, session.token);

      if (res.ok) {
        const data = await res.json();
        // Open in an in-app browser for a more polished experience
        await WebBrowser.openBrowserAsync(data.url, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        });
      } else {
        alert("Failed to get preview URL");
      }
    } catch (error) {
      console.error("Preview error", error);
    }
  };

  // ============================================================
  // RENDER HELPERS
  // ============================================================
  const getInitial = (name?: string) => name?.charAt(0)?.toUpperCase() || "?";
  const getStatusColor = (status: string) => {
    if (status === "Verified") return "#10B981";
    if (status === "Pending" || status === "Review") return "#F59E0B";
    if (status === "Rejected") return "#EF4444";
    return "#6B7280";
  };

  const renderDropdown = (
    type: "status",
    label: string,
    value: string,
    options: string[],
    setter: (value: string) => void
  ) => {
    const isOpen = openDropdown === type;
    return (
      <View style={{ flex: 1, position: "relative", zIndex: isOpen ? 100 : 1 }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setOpenDropdown(isOpen ? null : type)}
          style={{
            minHeight: 46,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: "#F9FAFB",
            borderWidth: 1,
            borderColor: isOpen ? "#2563EB" : "#E5E7EB",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>{label}</Text>
            <Text style={{ color: "#111827", fontSize: 12, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
              {value === "All" ? `All ${label}` : value}
            </Text>
          </View>
          <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
        </TouchableOpacity>

        {isOpen && (
          <View
            style={{
              position: "absolute",
              top: 50,
              left: 0,
              right: 0,
              backgroundColor: "#FFFFFF",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 8,
              elevation: 8,
              overflow: "hidden",
            }}
          >
            {options.map((option) => {
              const selected = value === option;
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => { setter(option); setOpenDropdown(null); }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    backgroundColor: selected ? "#EFF6FF" : "#FFFFFF",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: selected ? "#2563EB" : "#374151", fontSize: 12, fontWeight: selected ? "700" : "500" }}>
                    {option === "All" ? `All ${label}` : option}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={16} color="#2563EB" />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderEmployee = ({ item }: { item: Employee }) => {
    const photoUri = item.profileImage || item.avatar;
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setSelectedEmployee(item)}
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 20,
          padding: 16,
          borderWidth: 1,
          borderColor: "#F3F4F6",
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <View style={{ position: "relative", marginRight: 14 }}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#F3F4F6" }} />
          ) : (
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#2563EB", fontSize: 18, fontWeight: "700" }}>{getInitial(item.name)}</Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: "#111827", fontWeight: "700", fontSize: 15 }} numberOfLines={1}>{item.name}</Text>
          <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }} numberOfLines={1}>{item.id}</Text>
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 12, color: "#4B5563", fontWeight: "600", marginBottom: 4 }}>{item.uploads || 0} Files</Text>
          {item.pending > 0 ? (
            <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FDE68A" }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: "#D97706" }}>{item.pending} Pending</Text>
            </View>
          ) : (
             <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: "#D1FAE5", borderWidth: 1, borderColor: "#A7F3D0" }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: "#059669" }}>Verified</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  /** the header menu owns these filters while embedded */
  useShellFilters([
    {
      key: "status",
      label: "Status",
      value: statusFilter,
      defaultValue: "All",
      options: toShellOptions(STATUS_OPTIONS),
      onChange: setStatusFilter,
    },
  ]);

  return (
    <SafeAreaView edges={embedded ? [] : undefined} style={{ flex: 1, backgroundColor: "#F9FAFB" }}>
      <StatusBar style="dark" />
      {/* HEADER */}
      {!embedded && (
        <View style={{ paddingHorizontal: 24, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="arrow-back" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={{ color: "#111827", fontSize: 20, fontWeight: "700" }}>Documents</Text>
          <TouchableOpacity onPress={onRefresh} style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="refresh-outline" size={20} color="#2563EB" />
          </TouchableOpacity>
        </View>
      )}

      {/* SEARCH + FILTER */}
      {!embedded && (
        <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#F3F4F6", zIndex: 10 }}>
          {!embedded && (
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 12, height: 46, marginBottom: 12 }}>
              <Ionicons name="search" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
              <TextInput
                placeholder="Search employees..."
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

          {!embedded && (
            <View style={{ flexDirection: "row", gap: 12 }}>
              {renderDropdown("status", "Status", statusFilter, STATUS_OPTIONS, setStatusFilter)}
            </View>
          )}
        </View>
      )}

      {/* LIST */}
      <View style={{ flex: 1 }}>
        {error ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Ionicons name="alert-circle-outline" size={48} color="#EF4444" style={{ marginBottom: 16 }} />
            <Text style={{ color: "#111827", fontSize: 16, fontWeight: "600", textAlign: "center", marginBottom: 8 }}>{error}</Text>
            <TouchableOpacity onPress={onRefresh} style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "#2563EB", borderRadius: 8 }}>
              <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList {...shellScroll}
            data={employees}
            keyExtractor={(item, index) => item.id || item._id || `emp-${index}`}
            renderItem={renderEmployee}
            contentContainerStyle={{ padding: 24, paddingTop: shellTop, paddingBottom: 150 }}
            refreshControl={<RefreshControl progressViewOffset={shellTop} refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" colors={["#2563EB"]} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={() => (
              !loading ? (
                <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
                  <Ionicons name="people-outline" size={48} color="#D1D5DB" style={{ marginBottom: 16 }} />
                  <Text style={{ color: "#6B7280", fontSize: 15, fontWeight: "500" }}>No employees found</Text>
                </View>
              ) : null
            )}
            ListFooterComponent={() => (
              loading || loadingMore ? (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#2563EB" />
                </View>
              ) : null
            )}
          />
        )}
      </View>

      {/* EMPLOYEE DOCS BOTTOM SHEET */}
      <Modal
        visible={!!selectedEmployee}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedEmployee(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ModalDismiss onPress={() => setSelectedEmployee(null)} />
          <View style={{ backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", flex: 1 }}>
            
            {/* Sheet Header */}
            <View style={{ padding: 24, borderBottomWidth: 1, borderBottomColor: "#F3F4F6", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 4 }}>Review Documents</Text>
                <Text style={{ fontSize: 14, color: "#6B7280" }}>{selectedEmployee?.name} • {selectedEmployee?.department || "Dept N/A"}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedEmployee(null)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="close" size={20} color="#4B5563" />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
               <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={TABS}
                keyExtractor={(item) => item}
                renderItem={({ item }) => {
                  const isActive = activeTab === item;
                  return (
                    <TouchableOpacity
                      onPress={() => setActiveTab(item)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 12,
                        backgroundColor: isActive ? "#2563EB" : "#F3F4F6",
                        marginRight: 8,
                      }}
                    >
                      <Text style={{ color: isActive ? "#FFFFFF" : "#4B5563", fontWeight: "600", fontSize: 13 }}>{item}</Text>
                    </TouchableOpacity>
                  )
                }}
              />
            </View>

            {/* Docs List */}
            <View style={{ flex: 1, padding: 24 }}>
              {docsLoading ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <ActivityIndicator size="large" color="#2563EB" />
                </View>
              ) : (
                <FlatList
                  data={(docs as any)[activeTab.toLowerCase()] || []}
                  keyExtractor={(item, index) => item.id || item._id || `doc-${index}`}
                  ListEmptyComponent={() => (
                    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
                      <Ionicons name="document-text-outline" size={48} color="#D1D5DB" style={{ marginBottom: 12 }} />
                      <Text style={{ color: "#6B7280", fontSize: 14 }}>No {activeTab} documents uploaded.</Text>
                    </View>
                  )}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setSelectedDoc(item)}
                      style={{
                        backgroundColor: "#FFFFFF",
                        borderRadius: 16,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: "#F3F4F6",
                        marginBottom: 12,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                         <Ionicons name="document-outline" size={24} color="#6B7280" />
                      </View>
                      
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827" }} numberOfLines={1}>{item.name}</Text>
                        <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{item.uploadedOn ? new Date(item.uploadedOn).toLocaleDateString() : 'N/A'}</Text>
                      </View>

                      <View style={{
                        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                        backgroundColor: item.status === "Verified" ? "#D1FAE5" : item.status === "Rejected" ? "#FEE2E2" : "#FEF3C7",
                        borderWidth: 1,
                        borderColor: item.status === "Verified" ? "#A7F3D0" : item.status === "Rejected" ? "#FECACA" : "#FDE68A",
                      }}>
                        <Text style={{
                          fontSize: 10, fontWeight: "800",
                          color: item.status === "Verified" ? "#059669" : item.status === "Rejected" ? "#DC2626" : "#D97706"
                        }}>
                          {item.status === "Review" ? "Pending" : item.status}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* DOCUMENT ACTIONS BOTTOM SHEET */}
      <Modal
        visible={!!selectedDoc}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { setSelectedDoc(null); setRejectingDocId(null); }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ModalDismiss onPress={() => { setSelectedDoc(null); setRejectingDocId(null); }} />
          <View style={{ backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>Document Actions</Text>
              <TouchableOpacity onPress={() => { setSelectedDoc(null); setRejectingDocId(null); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="close" size={18} color="#4B5563" />
              </TouchableOpacity>
            </View>

            {selectedDoc && (
              <View style={{ marginBottom: 24, flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: "#F9FAFB", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB" }}>
                 <Ionicons name="document-text" size={32} color="#9CA3AF" style={{ marginRight: 12 }} />
                 <View style={{ flex: 1 }}>
                   <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>{selectedDoc.name}</Text>
                   <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>Status: {selectedDoc.status}</Text>
                 </View>
              </View>
            )}

            {rejectingDocId ? (
              <View>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 }}>Rejection Reason</Text>
                <TextInput
                  style={{
                    backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 16, minHeight: 100, textAlignVertical: "top", fontSize: 14, color: "#111827", marginBottom: 16
                  }}
                  placeholder="Enter reason for rejection..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  value={rejectionReason}
                  onChangeText={setRejectionReason}
                />
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity onPress={() => setRejectingDocId(null)} style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#F3F4F6", alignItems: "center" }}>
                    <Text style={{ color: "#4B5563", fontWeight: "600", fontSize: 15 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => rejectingDocId && updateStatus(rejectingDocId, "Rejected", rejectionReason)}
                    disabled={!rejectionReason.trim()}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: rejectionReason.trim() ? "#DC2626" : "#FCA5A5", alignItems: "center" }}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Confirm Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {selectedDoc?.status === "Rejected" && selectedDoc?.rejectionReason && (
                  <View style={{ padding: 12, backgroundColor: "#FEF2F2", borderRadius: 12, borderWidth: 1, borderColor: "#FCA5A5", marginBottom: 4 }}>
                    <Text style={{ color: "#991B1B", fontSize: 13, fontWeight: "600", marginBottom: 2 }}>Rejection Reason:</Text>
                    <Text style={{ color: "#7F1D1D", fontSize: 13 }}>{selectedDoc.rejectionReason}</Text>
                  </View>
                )}

                <TouchableOpacity onPress={() => selectedDoc && handlePreview(selectedDoc.path)} style={{ width: "100%", paddingVertical: 14, borderRadius: 12, backgroundColor: "#F3F4F6", flexDirection: "row", justifyContent: "center", alignItems: "center" }}>
                  <Ionicons name="eye-outline" size={18} color="#4B5563" style={{ marginRight: 8 }} />
                  <Text style={{ color: "#4B5563", fontWeight: "600", fontSize: 15 }}>Preview Document</Text>
                </TouchableOpacity>

                {(selectedDoc?.status === "Review" || selectedDoc?.status === "Pending") && (
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <TouchableOpacity onPress={() => selectedDoc && updateStatus(selectedDoc.id || selectedDoc._id as string, "Verified")} style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#10B981", flexDirection: "row", justifyContent: "center", alignItems: "center" }}>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => selectedDoc && setRejectingDocId(selectedDoc.id || selectedDoc._id as string)} style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#DC2626", flexDirection: "row", justifyContent: "center", alignItems: "center" }}>
                      <Ionicons name="close-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

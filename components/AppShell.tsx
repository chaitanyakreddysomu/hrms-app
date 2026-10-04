import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurTargetView } from "expo-blur";
import PillHeader from "./PillHeader";
import { InAppBanner, onInAppBanner } from "../utils/push";
import PillTabBar, { PillTab } from "./PillTabBar";
import HeaderMenu, { HeaderMenuItem } from "./HeaderMenu";
import ChangePasswordModal from "./ChangePasswordModal";
/** the header height, shared with the pages that clear it */
import { BAR_HEIGHT } from "./shellMetrics";
import {
  ScreenActionsProvider,
  useShellBridge,
  useShellFilterGroups,
} from "./ScreenActions";

const { width } = Dimensions.get("window");

/**
 * ============================================================
 * APP SHELL
 * ============================================================
 *
 * One reusable frame for every in app page:
 *
 *   - floating pill header (back / title / menu), Telegram style,
 *     over a white to transparent gradient so content scrolling
 *     underneath never collides with the pills
 *   - floating pill bottom navigation, liquid glass on both
 *     platforms
 *   - horizontal slide between pages, direction follows the tab
 *     order so moving right in the bar slides the next screen in
 *     from the right and vice versa
 *   - a tab may own several sections; its header title then
 *     carries a caret that opens a full page section picker
 *
 * Pages are plain components rendered through `render`. They get
 * `embedded` so they can drop their own header, and `reloadKey`
 * which changes when the header refresh action is used.
 */

export interface ShellMenuItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** run a handler the page registered under this name */
  action?: string;
  onPress?: () => void;
  divider?: boolean;
  danger?: boolean;
}

export interface ShellPage {
  key: string;
  title: string;
  subtitle?: string;
  /** icon shown for this page in the section picker */
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * Pages that filter a list opt in here: a long press on the
   * title swaps the header for a search field wired to the page.
   */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** kept out of the section picker, reached from a header action */
  hidden?: boolean;
  /**
   * Replaces the three dot button. A page with its own action has
   * no menu, so its rows and filters are not offered.
   */
  headerAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    /** unread count drawn on the button */
    badge?: number;
  };
  /**
   * Rows for the three dot menu. Each may carry its own handler,
   * or an `action` name that the page registered through
   * useRegisterScreenAction. Defaults to a single Refresh row.
   */
  menu?: ShellMenuItem[];
  render: (props: { embedded: true; reloadKey: number }) => React.ReactNode;
}

export interface ShellTab extends PillTab {
  /** one entry for a plain tab, many to get the section picker */
  pages: ShellPage[];
  /** label above the section list */
  pickerTitle?: string;
  /**
   * A launcher rather than a destination: tapping it lifts its
   * pages out of the pill as a menu, the same list a long press
   * gives, and picking one navigates. Used by the More tab.
   */
  asMenu?: boolean;
}

interface Props {
  tabs: ShellTab[];
  initialTabKey?: string;
  /** shown in the left circle when the first tab has no back target */
  logo?: number;
  /**
   * Filled with the shell navigate function so pages can move the
   * shell themselves, e.g. a home shortcut opening a section.
   */
  navigateRef?: React.MutableRefObject<
    ((tabKey: string, pageKey?: string) => void) | null
  >;
  /**
   * A dropdown pinned under the header, for shells that show the
   * same person two different sets of tabs. HR uses it to move
   * between running the team and their own workspace.
   */
  switcher?: {
    value: string;
    options: { value: string; label: string; icon: keyof typeof Ionicons.glyphMap }[];
    onChange: (value: string) => void;
  };
}

export default function AppShell(props: Props) {
  return (
    <ScreenActionsProvider>
      <Shell {...props} />
    </ScreenActionsProvider>
  );
}

function Shell({ tabs, initialTabKey, logo, navigateRef, switcher }: Props) {
  const bridge = useShellBridge();
  const filters = useShellFilterGroups();
  const insets = useSafeAreaInsets();

  /**
   * What every glass surface in the shell (header, tab bar, menus,
   * section picker) blurs on Android. expo-blur's Android blur has
   * nothing to sample without an explicit target, so it is handed
   * this ref rather than left to find the content on its own.
   */
  const contentRef = useRef<View>(null);

  const [tabKey, setTabKey] = useState(initialTabKey || tabs[0].key);
  /** remembered section per tab, so returning to a tab keeps its page */
  const [pageKeys, setPageKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries(tabs.map((t) => [t.key, t.pages[0].key]))
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** the tab whose long press menu is showing above the pill */
  const [tabMenuKey, setTabMenuKey] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * ============================================================
   * IN-APP NOTIFICATIONS
   * ============================================================
   *
   * Anything arriving while this shell is on screen is shown in
   * the header rather than the system tray. Only the newest is
   * held: a burst should not queue up three seconds each.
   */
  const [banner, setBanner] = useState<InAppBanner | null>(null);

  useEffect(() => onInAppBanner(setBanner), []);

  const tab = tabs.find((t) => t.key === tabKey) || tabs[0];
  const pageKey = pageKeys[tab.key] || tab.pages[0].key;
  const page = tab.pages.find((p) => p.key === pageKey) || tab.pages[0];

  /**
   * ============================================================
   * SLIDE TRANSITION
   * ============================================================
   *
   * `outgoing` holds the page being left so both can be on screen
   * for the length of the animation.
   */
  const [outgoing, setOutgoing] = useState<{
    tab: ShellTab;
    page: ShellPage;
    reloadKey: number;
  } | null>(null);
  const direction = useRef(1);
  const progress = useRef(new Animated.Value(1)).current;
  const currentRef = useRef({ tab, page, reloadKey });

  useEffect(() => {
    currentRef.current = { tab, page, reloadKey };
  });

  const goTo = useCallback(
    (nextTabKey: string, nextPageKey?: string) => {
      const from = currentRef.current;
      const nextTab = tabs.find((t) => t.key === nextTabKey);
      if (!nextTab) return;
      /**
       * A tab remembers the section it was left on, but only one a
       * person could have picked. Hidden pages are reached from an
       * action, so tapping the tab that holds one leaves it rather
       * than returning to it.
       */
      const remembered = nextTab.pages.find(
        (p) => p.key === pageKeys[nextTabKey]
      );

      const resolvedPageKey =
        nextPageKey ||
        (remembered && !remembered.hidden ? remembered.key : null) ||
        nextTab.pages[0].key;
      if (from.tab.key === nextTabKey && from.page.key === resolvedPageKey) {
        return;
      }

      const fromIndex = tabs.findIndex((t) => t.key === from.tab.key);
      const toIndex = tabs.findIndex((t) => t.key === nextTabKey);
      if (fromIndex === toIndex) {
        /** same tab, so the section order decides the direction */
        const fromPage = nextTab.pages.findIndex((p) => p.key === from.page.key);
        const toPage = nextTab.pages.findIndex((p) => p.key === resolvedPageKey);
        direction.current = toPage >= fromPage ? 1 : -1;
      } else {
        direction.current = toIndex > fromIndex ? 1 : -1;
      }

      setOutgoing(from);
      bridge?.scrollY.setValue(0);
      setMenuOpen(false);
      setSearching(false);
      setSearchText("");
      setTabKey(nextTabKey);

      /** the resolved key, not the requested one: a tab tap that
       *  stepped off a hidden page has to record where it landed */
      setPageKeys((prev) => ({ ...prev, [nextTabKey]: resolvedPageKey }));

      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setOutgoing(null);
      });
    },
    [tabs, pageKeys, progress, bridge]
  );

  useEffect(() => {
    if (navigateRef) navigateRef.current = goTo;
  }, [navigateRef, goTo]);

  const enterX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [direction.current * width, 0],
  });

  const exitX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -direction.current * width],
  });

  /**
   * ============================================================
   * SECTION PICKER
   * ============================================================
   */
  const pickerAnim = useRef(new Animated.Value(0)).current;

  /**
   * Mount is held past the close so the picker can animate out.
   * Unmounting on the state change alone cut it away instantly and
   * only the opening was ever seen.
   */
  const [pickerMounted, setPickerMounted] = useState(false);

  const togglePicker = useCallback(
    (open: boolean) => {
      setPickerOpen(open);
      if (open) setPickerMounted(true);

      Animated.timing(pickerAnim, {
        toValue: open ? 1 : 0,
        duration: open ? 260 : 200,
        easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !open) setPickerMounted(false);
      });
    },
    [pickerAnim]
  );

  const searchingRef = useRef(searching);
  const closeSearchRef = useRef(() => {});
  useEffect(() => {
    searchingRef.current = searching;
    closeSearchRef.current = closeSearch;
  });

  /** Android back closes the search field, then the picker, then
   * walks back to the first tab */
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (menuOpen) {
        setMenuOpen(false);
        return true;
      }
      if (searchingRef.current) {
        closeSearchRef.current();
        return true;
      }
      if (pickerOpen) {
        togglePicker(false);
        return true;
      }
      if (currentRef.current.tab.key !== tabs[0].key) {
        goTo(tabs[0].key);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [menuOpen, pickerOpen, togglePicker, goTo, tabs]);

  const pickerTranslate = pickerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-24, 0],
  });

  const visiblePages = tab.pages.filter((p) => !p.hidden);
  const hasSections = visiblePages.length > 1;
  const onFirstPage = tab.pages[0].key === page.key;
  const onFirstTab = tab.key === tabs[0].key && onFirstPage;

  /**
   * The view switcher lives in the title pill, and only on the
   * landing page. Everywhere else the title is just a title.
   */
  const switcherHere = !!switcher && onFirstTab;

  const currentView = switcher?.options.find(
    (option) => option.value === switcher.value
  );

  const renderPage = (
    entry: { tab: ShellTab; page: ShellPage; reloadKey: number },
    style: any
  ) => (
    <Animated.View
      key={entry.tab.key + ":" + entry.page.key}
      style={[
        StyleSheet.absoluteFill,
        /**
         * No padding. The page runs the full height of the screen
         * so its content passes behind the header, which is what
         * makes a transparent bar worth having. Each page's scroll
         * content carries the offset instead — see useShellContentTop.
         */
        style,
      ]}
    >
      {entry.page.render({ embedded: true, reloadKey: entry.reloadKey })}
    </Animated.View>
  );

  const refresh = () => setReloadKey((k) => k + 1);

  const closeSearch = () => {
    setSearching(false);
    setSearchText("");
    bridge?.pushSearch("");
  };

  const changeSearch = (text: string) => {
    setSearchText(text);
    bridge?.pushSearch(text);
  };

  /**
   * The menu is the page filters first, then a divider, then the
   * page own rows. Clear filters only shows once something is off
   * its default.
   */
  const filtersDirty = filters.some((f) => f.value !== f.defaultValue);

  const filterRows: HeaderMenuItem[] = filters.map((group, index) => ({
    key: "filter:" + group.key,
    label: group.label,
    icon: "chevron-down-outline",
    value: group.value,
    options: group.options,
    onSelect: group.onChange,
    divider: !filtersDirty && index === filters.length - 1,
  }));

  const clearRow: HeaderMenuItem[] = filtersDirty
    ? [
        {
          key: "clear",
          label: "Clear filters",
          icon: "close-circle-outline",
          divider: true,
          onPress: () => filters.forEach((f) => f.onChange(f.defaultValue)),
        },
      ]
    : [];

  const pageRows: HeaderMenuItem[] = (
    page.menu || [{ key: "refresh", label: "Refresh", icon: "refresh-outline" }]
  ).map((item) => ({
    key: item.key,
    label: item.label,
    icon: item.icon,
    divider: item.divider,
    danger: item.danger,
    onPress: () => {
      if (item.onPress) return item.onPress();
      if (item.action) {
        /** falls back to a reload when the page exposed nothing */
        if (bridge?.runAction(item.action)) return;
      }
      refresh();
    },
  }));

  const menuItems: HeaderMenuItem[] = [
    ...filterRows,
    ...clearRow,
    ...pageRows,
  ];

  /**
   * A long press on a bottom tab lifts that tab own rows above the
   * pill, so the profile tab reaches Log out without a trip through
   * the three dot button. Only tabs that declared rows respond.
   */
  const tabMenu = tabs.find((t) => t.key === tabMenuKey);

  const tabMenuPage = tabMenu
    ? tabMenu.pages.find((p) => p.key === pageKeys[tabMenu.key]) ||
      tabMenu.pages[0]
    : null;

  /**
   * A launcher tab lists its own pages. Any other tab lists the
   * rows of the page it is currently showing.
   */
  const tabMenuItems: HeaderMenuItem[] = tabMenu?.asMenu
    ? tabMenu.pages
        .filter((p) => !p.hidden)
        .map((p) => ({
          key: p.key,
          label: p.title,
          icon: p.icon,
          onPress: () => goTo(tabMenu.key, p.key),
        }))
    : (tabMenuPage?.menu || [])
        /** a plain reload row belongs in the header menu, not here */
        .filter((item) => item.onPress || item.action)
        .map((item) => ({
          key: item.key,
          label: item.label,
          icon: item.icon,
          divider: item.divider,
          danger: item.danger,
          onPress: () => {
            if (item.onPress) return item.onPress();

            /** rows that drive the page need that page on screen first */
            goTo(tabMenu!.key, tabMenuPage!.key);

            setTimeout(() => {
              if (!bridge?.runAction(item.action!)) refresh();
            }, 260);
          },
        }));

  const bottomTabs = useMemo<PillTab[]>(
    () =>
      tabs.map(({ key, label, icon, activeIcon, imageUri }) => ({
        key,
        label,
        icon,
        activeIcon,
        imageUri,
      })),
    [tabs]
  );

  return (
    <View style={styles.root}>
      <ChangePasswordModal />

      {/* pages ------------------------------------------------ */}
      <BlurTargetView ref={contentRef} style={styles.pages}>
        {outgoing &&
          renderPage(outgoing, { transform: [{ translateX: exitX }] })}
        {renderPage(
          { tab, page, reloadKey },
          { transform: [{ translateX: outgoing ? enterX : 0 }] }
        )}
      </BlurTargetView>

      {/* floating header -------------------------------------- */}
      <View
        style={[styles.header, { paddingTop: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        {/**
         * Plain white, run edge to edge and squared off so it
         * carries the status bar with it. Android's blur fallback
         * was unreliable across devices, so the header is a solid
         * surface instead of glass.
         */}
        <View
          style={[
            styles.headerGlass,
            styles.headerSolid,
            { height: insets.top + BAR_HEIGHT },
          ]}
          pointerEvents="none"
        />

        <PillHeader
          title={switcherHere ? currentView?.label || page.title : page.title}
          logo={onFirstTab ? logo : undefined}
          onBack={
            onFirstTab
              ? undefined
              : () => {
                  if (pickerOpen) togglePicker(false);
                  if (!onFirstPage) return goTo(tab.key, tab.pages[0].key);
                  goTo(tabs[0].key);
                }
          }
          onTitlePress={
            switcherHere
              ? () => {
                  setMenuOpen(false);
                  setTabMenuKey(null);
                  setSwitcherOpen((open) => !open);
                }
              : hasSections
              ? () => togglePicker(!pickerOpen)
              : undefined
          }
          onTitleLongPress={
            page.searchable
              ? () => {
                  if (pickerOpen) togglePicker(false);
                  setMenuOpen(false);
                  setSearching(true);
                }
              : undefined
          }
          searching={searching}
          searchValue={searchText}
          searchPlaceholder={page.searchPlaceholder || "Search"}
          onSearchChange={changeSearch}
          onSearchClose={closeSearch}
          expanded={pickerOpen || switcherOpen}
          menuOpen={menuOpen}
          actionIcon={page.headerAction?.icon}
          actionBadge={page.headerAction?.badge}
          onMenuPress={() => {
            if (pickerOpen) togglePicker(false);
            if (page.headerAction) return page.headerAction.onPress();
            setMenuOpen((open) => !open);
          }}
          banner={banner}
          onBannerPress={() => {
            setBanner(null);

            /** the notifications section, wherever this shell keeps it */
            for (const candidate of tabs) {
              const match = candidate.pages.find((p) =>
                p.key.toLowerCase().includes("notif")
              );

              if (match) return goTo(candidate.key, match.key);
            }
          }}
          onBannerDone={() => setBanner(null)}
        />
      </View>

      {/* section picker --------------------------------------- */}
      {pickerMounted && (
        <Animated.View
          style={[
            styles.picker,
            {
              top: insets.top + BAR_HEIGHT + 4,
              opacity: pickerAnim,
              transform: [{ translateY: pickerTranslate }],
            },
          ]}
          /* on its way out it should not still be catching taps */
          pointerEvents={pickerOpen ? "auto" : "none"}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => togglePicker(false)}
          />
          {/**
           * Plain white, same reasoning as the header and tab bar:
           * Android's blur fallback was unreliable across devices,
           * so this panel is a solid surface instead of glass.
           */}
          <View style={[styles.pickerCard, styles.pickerCardSolid]}>
            <Text style={styles.pickerTitle}>
              {tab.pickerTitle || tab.label}
            </Text>
            <ScrollView
              contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
              showsVerticalScrollIndicator={false}
            >
              {visiblePages.map((item) => {
                const active = item.key === page.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={0.75}
                    onPress={() => {
                      togglePicker(false);
                      goTo(tab.key, item.key);
                    }}
                    style={[styles.pickerRow, active && styles.pickerRowActive]}
                  >
                    <View
                      style={[
                        styles.pickerIcon,
                        active && styles.pickerIconActive,
                      ]}
                    >
                      <Ionicons
                        name={item.icon}
                        size={20}
                        color={active ? "#FFFFFF" : "#2563EB"}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.pickerLabel,
                          active && styles.pickerLabelActive,
                        ]}
                      >
                        {item.title}
                      </Text>
                      {!!item.subtitle && (
                        <Text style={styles.pickerSub}>{item.subtitle}</Text>
                      )}
                    </View>
                    {active && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#2563EB"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Animated.View>
      )}

      {/* view switcher, dropped from the title pill ------------ */}
      <HeaderMenu
        visible={switcherOpen}
        items={(switcher?.options || []).map((option) => ({
          key: option.value,
          label: option.label,
          icon: option.icon,
          onPress: () => switcher?.onChange(option.value),
        }))}
        top={insets.top + BAR_HEIGHT + 4}
        onClose={() => setSwitcherOpen(false)}
      />

      {/* three dot menu --------------------------------------- */}
      <HeaderMenu
        visible={menuOpen && !page.headerAction}
        items={menuItems}
        top={insets.top + BAR_HEIGHT + 4}
        onClose={() => setMenuOpen(false)}
      />

      {/* floating bottom nav ---------------------------------- */}
      {/* long press menu, rising out of the pill ------------- */}
      <HeaderMenu
        visible={!!tabMenuKey && tabMenuItems.length > 0}
        items={tabMenuItems}
        bottom={Math.max(insets.bottom, 14) + 78}
        onClose={() => setTabMenuKey(null)}
      />

      <PillTabBar
        tabs={bottomTabs}
        activeKey={tab.key}
        onChange={(key) => {
          if (pickerOpen) togglePicker(false);

          /** a launcher tab opens its list rather than navigating */
          if (tabs.find((t) => t.key === key)?.asMenu) {
            setMenuOpen(false);
            setTabMenuKey((current) => (current === key ? null : key));
            return;
          }

          /** a tap puts the long press menu away again */
          setTabMenuKey(null);

          goTo(key);
        }}
        onLongPress={(key) => {
          if (pickerOpen) togglePicker(false);
          setMenuOpen(false);
          setTabMenuKey((current) => (current === key ? null : key));
        }}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "transparent",
  },
  pages: {
    flex: 1,
    overflow: "hidden",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  /** sits behind the controls, from the very top of the screen */
  headerGlass: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  headerSolid: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15,23,42,0.08)",
  },
  picker: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  pickerCard: {
    flex: 1,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingTop: 18,
  },
  pickerCardSolid: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.08)",
  },
  pickerTitle: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 20,
    marginBottom: 4,
  },
  pickerRowActive: {
    backgroundColor: "#EFF6FF",
  },
  pickerIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  pickerIconActive: {
    backgroundColor: "#2563EB",
  },
  pickerLabel: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "600",
  },
  pickerLabelActive: {
    fontWeight: "800",
    color: "#1D4ED8",
  },
  pickerSub: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 1,
  },
});

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated } from "react-native";

/**
 * ============================================================
 * SHELL BRIDGE
 * ============================================================
 *
 * The thin wiring between AppShell and the pages inside it:
 *
 *   - named actions, so the header menu can fire something that
 *     lives in the page (Attendance exporting a report)
 *   - the header search field, pushed into the page search state
 *   - the scroll position, so the header can fade its backdrop in
 *     as content slides underneath it
 *   - the page filters, lifted into the header menu as expandable
 *     option lists with a Clear filters row
 *
 * Every hook degrades to a no op without a provider, so pages
 * still work when used outside the shell.
 */
export interface ShellFilterOption {
  value: string;
  label: string;
}

export interface ShellFilterGroup {
  key: string;
  label: string;
  value: string;
  defaultValue: string;
  options: ShellFilterOption[];
  onChange: (value: string) => void;
}

interface ShellBridge {
  setFilters: (groups: ShellFilterGroup[]) => void;
  scrollY: Animated.Value;
  registerAction: (name: string, fn: () => void) => () => void;
  runAction: (name: string) => boolean;
  registerSearch: (fn: (text: string) => void) => () => void;
  pushSearch: (text: string) => void;
  hasSearch: () => boolean;
}

const ShellBridgeContext = createContext<ShellBridge | null>(null);

/**
 * Filters live in their own context. The bridge itself never
 * changes identity, so a page registering its filters can never
 * feed back into its own effect.
 */
const ShellFiltersContext = createContext<ShellFilterGroup[]>([]);

export function ScreenActionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const actions = useRef<Record<string, () => void>>({});
  const searchSetters = useRef<((text: string) => void)[]>([]);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [filters, setFiltersState] = useState<ShellFilterGroup[]>([]);

  const value = useMemo<ShellBridge>(
    () => ({
      scrollY,
      setFilters: (groups) =>
        setFiltersState((prev) =>
          prev.length === 0 && groups.length === 0 ? prev : groups
        ),
      registerAction: (name, fn) => {
        actions.current[name] = fn;
        return () => {
          if (actions.current[name] === fn) delete actions.current[name];
        };
      },
      runAction: (name) => {
        const fn = actions.current[name];
        if (!fn) return false;
        fn();
        return true;
      },
      registerSearch: (fn) => {
        searchSetters.current.push(fn);
        return () => {
          searchSetters.current = searchSetters.current.filter(
            (s) => s !== fn
          );
        };
      },
      pushSearch: (text) => {
        searchSetters.current.forEach((fn) => fn(text));
      },
      hasSearch: () => searchSetters.current.length > 0,
    }),
    [scrollY]
  );

  return (
    <ShellBridgeContext.Provider value={value}>
      <ShellFiltersContext.Provider value={filters}>
        {children}
      </ShellFiltersContext.Provider>
    </ShellBridgeContext.Provider>
  );
}

export function useShellBridge() {
  return useContext(ShellBridgeContext);
}

/** Read by the shell header menu. */
export function useShellFilterGroups() {
  return useContext(ShellFiltersContext);
}

/** Exposes one of the page handlers to the shell header menu. */
export function useRegisterScreenAction(name: string, fn: () => void) {
  const bridge = useContext(ShellBridgeContext);
  const latest = useRef(fn);

  useEffect(() => {
    latest.current = fn;
  });

  useEffect(() => {
    if (!bridge) return;
    return bridge.registerAction(name, () => latest.current());
  }, [bridge, name]);
}

/** Lets the header search field drive the page search state. */
export function useShellSearch(setter: (text: string) => void) {
  const bridge = useContext(ShellBridgeContext);
  const latest = useRef(setter);

  useEffect(() => {
    latest.current = setter;
  });

  useEffect(() => {
    if (!bridge) return;
    return bridge.registerSearch((text) => latest.current(text));
  }, [bridge]);
}

/**
 * Lifts the page filters into the header menu. Pass the groups on
 * every render; the shell keeps them in step with the page state.
 */
export function useShellFilters(groups: ShellFilterGroup[]) {
  const bridge = useContext(ShellBridgeContext);
  const signature = JSON.stringify(
    groups.map((g) => [g.key, g.value, g.options.map((o) => o.value)])
  );

  useEffect(() => {
    if (!bridge) return;
    bridge.setFilters(groups);
    return () => bridge.setFilters([]);
  }, [bridge, signature]);
}

/** Turns a plain option list into the shape the shell expects. */
export function toShellOptions(
  values: string[],
  label?: (value: string) => string
): ShellFilterOption[] {
  return values.map((value) => ({
    value,
    label: label ? label(value) : value,
  }));
}

/**
 * Spread onto the main scrollable of a page so the header knows
 * how far the content has travelled.
 */
export function useShellScroll() {
  const bridge = useContext(ShellBridgeContext);

  return useMemo(() => {
    if (!bridge) return {};
    return {
      scrollEventThrottle: 16,
      onScroll: Animated.event(
        [{ nativeEvent: { contentOffset: { y: bridge.scrollY } } }],
        { useNativeDriver: false }
      ),
    };
  }, [bridge]);
}

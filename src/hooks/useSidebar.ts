import { useCallback, useState } from "react";

const COLLAPSED_KEY = "liquid-insights:sidebar-collapsed";
const DRAWER_QUERY = "(max-width: 899px)";

function readCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    globalThis.localStorage?.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Storage unavailable: the preference just isn't remembered.
  }
}

const isDrawerLayout = () => globalThis.matchMedia?.(DRAWER_QUERY).matches ?? false;

export interface SidebarState {
  /** Desktop: sidebar hidden (remembered per browser). */
  collapsed: boolean;
  /** Small screens: slide-in drawer open. */
  drawerOpen: boolean;
  show: () => void;
  hide: () => void;
  closeDrawer: () => void;
}

/** One show/hide control that means "open the drawer" on phones and "expand the column" on desktop. */
export function useSidebar(): SidebarState {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const setAndRemember = useCallback((value: boolean) => {
    setCollapsed(value);
    writeCollapsed(value);
  }, []);

  const show = useCallback(() => (isDrawerLayout() ? setDrawerOpen(true) : setAndRemember(false)), [setAndRemember]);
  const hide = useCallback(() => (isDrawerLayout() ? setDrawerOpen(false) : setAndRemember(true)), [setAndRemember]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return { collapsed, drawerOpen, show, hide, closeDrawer };
}

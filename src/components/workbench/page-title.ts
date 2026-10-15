"use client";

import { useEffect, useSyncExternalStore } from "react";

// Lets a page name the record it shows (an entry or asset title) so the workbench header can end its breadcrumb with it.
let pageTitle: string | null = null;
const listeners = new Set<() => void>();

function setPageTitle(title: string | null) {
  pageTitle = title;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePageTitle(title: string) {
  useEffect(() => {
    setPageTitle(title);
    return () => setPageTitle(null);
  }, [title]);
}

export function useCurrentPageTitle() {
  return useSyncExternalStore(subscribe, () => pageTitle, () => null);
}

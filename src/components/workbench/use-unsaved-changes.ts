"use client";

import { useEffect } from "react";

const discardMessage = "You have unsaved changes. Leave without saving?";

// Only one editor is mounted at a time, so a module-level flag lets list links,
// selects, and search forms outside the editor ask before discarding its changes.
let hasUnsavedChanges = false;

export function confirmDiscardChanges(): boolean {
  return !hasUnsavedChanges || window.confirm(discardMessage);
}

export function useUnsavedChangesGuard(isDirty: boolean) {
  useEffect(() => {
    hasUnsavedChanges = isDirty;
    return () => {
      hasUnsavedChanges = false;
    };
  }, [isDirty]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (hasUnsavedChanges) event.preventDefault();
    }

    // Capture phase runs before Next.js Link handles the click, so cancelling here stops client navigation too.
    function handleClick(event: MouseEvent) {
      if (!hasUnsavedChanges || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (window.confirm(discardMessage)) return;

      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);
}

"use client";

import { RefObject, useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(", ");

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.hasAttribute("disabled")) {
      return false;
    }

    if (element.getAttribute("aria-hidden") === "true") {
      return false;
    }

    return element.offsetParent !== null || element === document.activeElement;
  });
}

type UseDialogBehaviorOptions = {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

export function useDialogBehavior({
  open,
  containerRef,
  onClose,
  initialFocusRef
}: UseDialogBehaviorOptions) {
  const onCloseRef = useRef(onClose);
  const initialFocusTargetRef = useRef(initialFocusRef);

  useEffect(() => {
    onCloseRef.current = onClose;
    initialFocusTargetRef.current = initialFocusRef;
  }, [initialFocusRef, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    document.body.style.overflow = "hidden";

    const rafId = window.requestAnimationFrame(() => {
      const target =
        initialFocusTargetRef.current?.current ??
        getFocusableElements(containerRef.current)[0] ??
        containerRef.current;
      target?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusableElements(containerRef.current);
      if (!focusable.length) {
        event.preventDefault();
        containerRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (!active || active === first || !containerRef.current?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!active || active === last || !containerRef.current?.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [containerRef, open]);
}

"use client";

import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon, CloseIcon } from "./ui-icons";

type ManagerAccordionSectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function ManagerAccordionSection({
  id,
  eyebrow,
  title,
  description,
  meta,
  isOpen,
  onToggle,
  children
}: ManagerAccordionSectionProps) {
  return (
    <section className={`manager-accordion glass ${isOpen ? "open" : ""}`}>
      <button
        aria-controls={`${id}-panel`}
        aria-expanded={isOpen}
        className="manager-accordion-trigger"
        onClick={onToggle}
        type="button"
      >
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h3 className="section-title">{title}</h3>
          {description ? <p className="muted manager-accordion-copy">{description}</p> : null}
        </div>
        <div className="manager-accordion-side">
          {meta}
          <span className="manager-accordion-icon" aria-hidden="true">
            <ChevronDownIcon />
          </span>
        </div>
      </button>
      <div
        aria-hidden={!isOpen}
        className={`manager-accordion-panel ${isOpen ? "open" : ""}`}
        id={`${id}-panel`}
      >
        <div className="manager-accordion-inner">{children}</div>
      </div>
    </section>
  );
}

type ManagerDrawerProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function ManagerDrawer({
  open,
  title,
  onClose,
  children,
  footer
}: ManagerDrawerProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const content = (
    <div
      className="manager-drawer-shell manager-drawer-shell-portal manager-drawer-scope-v3"
      role="dialog"
      aria-modal="true"
    >
      <button
        aria-label="Arka plani kapat"
        className="manager-drawer-backdrop manager-drawer-backdrop-portal"
        onClick={onClose}
        type="button"
      />
      <aside className="manager-drawer-panel manager-drawer-panel-portal glass">
        <div className="manager-drawer-header">
          <div>
            <h2 className="title lg">{title}</h2>
          </div>
          <button className="button ghost" onClick={onClose} type="button">
            <CloseIcon />
            <span>Kapat</span>
          </button>
        </div>
        <div className="manager-drawer-body">{children}</div>
        {footer ? <div className="manager-drawer-footer">{footer}</div> : null}
      </aside>
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}

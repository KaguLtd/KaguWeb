"use client";

import { ReactNode, RefObject, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useDialogBehavior } from "./dialog-behavior";
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
  description: _description,
  meta,
  isOpen,
  onToggle,
  children
}: ManagerAccordionSectionProps) {
  return (
    <section className={`manager-accordion ${isOpen ? "open" : ""}`}>
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
  description?: string;
  badge?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

export function ManagerDrawer({
  open,
  title,
  onClose,
  children,
  footer,
  description: _description,
  badge,
  initialFocusRef
}: ManagerDrawerProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  useDialogBehavior({
    open,
    containerRef: panelRef,
    onClose,
    initialFocusRef: initialFocusRef ?? closeButtonRef
  });

  if (!open) {
    return null;
  }

  const content = (
    <div
      className="manager-drawer-shell manager-drawer-shell-portal manager-drawer-scope-v3"
      role="dialog"
      aria-labelledby={titleId}
      aria-modal="true"
    >
      <button
        aria-label="Arka plani kapat"
        className="manager-drawer-backdrop manager-drawer-backdrop-portal"
        onClick={onClose}
        type="button"
      />
      <aside className="manager-drawer-panel manager-drawer-panel-portal glass" ref={panelRef} tabIndex={-1}>
        <div className="manager-drawer-header">
          <div className="manager-drawer-copy">
            <div className="manager-drawer-heading-row">
              <h2 className="title lg" id={titleId}>
                {title}
              </h2>
              {badge}
            </div>
          </div>
          <button className="button ghost" onClick={onClose} ref={closeButtonRef} type="button">
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

type ManagerDrawerSectionProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
  tone?: "default" | "danger";
};

export function ManagerDrawerSection({
  eyebrow,
  title,
  description: _description,
  meta,
  children,
  tone = "default"
}: ManagerDrawerSectionProps) {
  return (
    <section className={`manager-drawer-section manager-drawer-section-${tone}`}>
      <div className="manager-section-head compact">
        <div>
          {eyebrow ? <span className="manager-section-kicker">{eyebrow}</span> : null}
          <h3 className="manager-section-title">{title}</h3>
        </div>
        {meta}
      </div>
      {children}
    </section>
  );
}

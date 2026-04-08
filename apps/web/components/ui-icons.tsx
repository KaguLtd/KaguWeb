import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, className, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="20"
      {...props}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="7" rx="1.5" width="7" x="3" y="3" />
      <rect height="11" rx="1.5" width="7" x="14" y="3" />
      <rect height="11" rx="1.5" width="7" x="3" y="14" />
      <rect height="7" rx="1.5" width="7" x="14" y="18" />
    </IconBase>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 7.5a2.5 2.5 0 0 1 2.5-2.5h4l2 2h7a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z" />
    </IconBase>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16.5 19a3.5 3.5 0 0 0-7 0" />
      <circle cx="13" cy="11" r="3" />
      <path d="M6 19a3 3 0 0 1 3-3" />
      <path d="M8.5 12.5A2.5 2.5 0 1 0 6 10" />
    </IconBase>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="16" rx="2.5" width="18" x="3" y="5" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
      <path d="M8 14h3" />
      <path d="M13 14h3" />
    </IconBase>
  );
}

export function MapIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 5 3 7.5v11L9 16l6 2.5 6-2.5V5L15 7.5z" />
      <path d="M9 5v11" />
      <path d="M15 7.5v11" />
    </IconBase>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 18h8" />
      <path d="M10 21h4" />
      <path d="M6 18V11a6 6 0 1 1 12 0v7" />
    </IconBase>
  );
}

export function DeviceIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="16" rx="2.5" width="10" x="7" y="4" />
      <path d="M11 17h2" />
    </IconBase>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M15 18 9 12l6-6" />
    </IconBase>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20 11a8 8 0 0 0-14.5-4.5" />
      <path d="M4 4v5h5" />
      <path d="M4 13a8 8 0 0 0 14.5 4.5" />
      <path d="M20 20v-5h-5" />
    </IconBase>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 17v2a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v2" />
      <path d="M15 12H3" />
      <path d="m7 8-4 4 4 4" />
    </IconBase>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </IconBase>
  );
}

export function TimelineIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 6v12" />
      <circle cx="12" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M6 12h12" />
    </IconBase>
  );
}

export function LocationArrowIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m20 4-7.5 16-2.5-6-6-2.5z" />
    </IconBase>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </IconBase>
  );
}

export function PowerIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3v9" />
      <path d="M7.5 5.5a8 8 0 1 0 9 0" />
    </IconBase>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v5" />
      <path d="M12 7h.01" />
    </IconBase>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </IconBase>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 21s6-5.5 6-10a6 6 0 1 0-12 0c0 4.5 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2.5" />
    </IconBase>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="8" cy="15" r="3" />
      <path d="M10.5 13.5 19 5" />
      <path d="M15 5h4v4" />
      <path d="M17 7l2 2" />
    </IconBase>
  );
}

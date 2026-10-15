import type { ButtonHTMLAttributes, ReactNode } from "react";
import { tapBuzz } from "./mode";
import "./bubbles.css";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Spoken name and tooltip. */
  label: string;
  size?: "sm" | "md" | "lg";
  /** Tiny count/status bubble on the corner; hidden when empty or 0. */
  badge?: ReactNode;
  badgeTone?: "plain" | "warn" | "pulse";
  children: ReactNode;
};

/** NDU-UPG bubbles: one soft embossed round button with an optional badge. */
export function Bubble({ label, size = "md", badge, badgeTone = "plain", className = "", children, onClick, ...rest }: Props) {
  const showBadge = badge !== undefined && badge !== null && badge !== false && badge !== "" && badge !== 0;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`ndu-bub${size === "md" ? "" : ` ndu-bub--${size}`} ${className}`}
      onClick={(event) => {
        tapBuzz();
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
      {showBadge ? (
        <span className={`ndu-badge${badgeTone === "plain" ? "" : ` ndu-badge--${badgeTone}`}`} aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

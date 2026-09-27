import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "series" | "accent" | "outline" | "pill";
  size?: "sm" | "md";
  dot?: boolean;
}

export function Badge({
  className = "",
  variant = "default",
  size = "md",
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const baseClass = "ui-badge";
  const variantClass = `ui-badge-${variant}`;
  const sizeClass = `ui-badge-${size}`;
  const classes = [baseClass, variantClass, sizeClass, className].filter(Boolean).join(" ");

  return (
    <span className={classes} {...props}>
      {dot && <span className="ui-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

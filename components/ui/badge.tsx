import React from "react";
import Link from "next/link";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "series" | "accent" | "outline" | "pill" | "topic";
  size?: "sm" | "md";
  dot?: boolean;
  href?: string;
}

export function Badge({
  className = "",
  variant = "default",
  size = "md",
  dot = false,
  href,
  children,
  ...props
}: BadgeProps) {
  const baseClass = "ui-badge";
  const variantClass = `ui-badge-${variant}`;
  const sizeClass = `ui-badge-${size}`;
  const interactiveClass = href ? "ui-badge-interactive" : "";
  const classes = [baseClass, variantClass, sizeClass, interactiveClass, className]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {dot && <span className="ui-badge-dot" aria-hidden="true" />}
      {children}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <span className={classes} {...props}>
      {content}
    </span>
  );
}

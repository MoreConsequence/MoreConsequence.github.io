import React from "react";
import Link from "next/link";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "icon" | "link";
  size?: "sm" | "md" | "lg";
  href?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  className = "",
  variant = "secondary",
  size = "md",
  type = "button",
  href,
  leftIcon,
  rightIcon,
  children,
  ...props
}: ButtonProps) {
  const baseClass = "ui-button";
  const variantClass = `ui-button-${variant}`;
  const sizeClass = `ui-button-${size}`;
  const classes = [baseClass, variantClass, sizeClass, className]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {leftIcon && <span className="ui-button-icon-slot" aria-hidden="true">{leftIcon}</span>}
      <span>{children}</span>
      {rightIcon && <span className="ui-button-icon-slot" aria-hidden="true">{rightIcon}</span>}
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
    <button type={type} className={classes} {...props}>
      {content}
    </button>
  );
}

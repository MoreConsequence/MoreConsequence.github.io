import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "icon";
  size?: "sm" | "md" | "lg";
}

export function Button({
  className = "",
  variant = "secondary",
  size = "md",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  const baseClass = "ui-button";
  const variantClass = `ui-button-${variant}`;
  const sizeClass = `ui-button-${size}`;
  const classes = [baseClass, variantClass, sizeClass, className].filter(Boolean).join(" ");

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}

import React from "react";
import Link from "next/link";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  href?: string;
}

export function Card({
  className = "",
  hoverable = false,
  href,
  children,
  ...props
}: CardProps) {
  const classes = [
    "ui-card",
    hoverable ? "ui-card-hoverable" : "",
    href ? "ui-card-link" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`ui-card-header ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`ui-card-title ${className}`} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={`ui-card-desc ${className}`} {...props}>
      {children}
    </p>
  );
}

export function CardContent({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`ui-card-content ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`ui-card-footer ${className}`} {...props}>
      {children}
    </div>
  );
}

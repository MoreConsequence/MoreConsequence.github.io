import React from "react";

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function Tabs({
  value,
  onValueChange,
  className = "",
  children,
}: TabsProps) {
  return (
    <div className={`ui-tabs ${className}`} data-active-tab={value}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          activeValue: value,
          onTabSelect: onValueChange,
        });
      })}
    </div>
  );
}

export function TabsList({
  className = "",
  children,
  activeValue,
  onTabSelect,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  activeValue?: string;
  onTabSelect?: (val: string) => void;
}) {
  return (
    <div
      role="tablist"
      className={`ui-tabs-list ${className}`}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          activeValue,
          onTabSelect,
        });
      })}
    </div>
  );
}

export function TabsTrigger({
  value,
  className = "",
  children,
  activeValue,
  onTabSelect,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
  activeValue?: string;
  onTabSelect?: (val: string) => void;
}) {
  const isActive = activeValue === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={`ui-tabs-trigger ${isActive ? "active" : ""} ${className}`}
      onClick={() => onTabSelect?.(value)}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  activeValue,
  className = "",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  value: string;
  activeValue?: string;
}) {
  if (activeValue !== value) return null;

  return (
    <div
      role="tabpanel"
      className={`ui-tabs-content ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

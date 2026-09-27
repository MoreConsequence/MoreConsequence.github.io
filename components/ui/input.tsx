import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
}

export function Input({
  className = "",
  leftIcon,
  rightSlot,
  ...props
}: InputProps) {
  if (!leftIcon && !rightSlot) {
    return <input className={`ui-input ${className}`} {...props} />;
  }

  return (
    <div className="ui-input-wrapper">
      {leftIcon && <span className="ui-input-left-slot" aria-hidden="true">{leftIcon}</span>}
      <input
        className={`ui-input ${leftIcon ? "ui-input-has-left" : ""} ${rightSlot ? "ui-input-has-right" : ""} ${className}`}
        {...props}
      />
      {rightSlot && <div className="ui-input-right-slot">{rightSlot}</div>}
    </div>
  );
}

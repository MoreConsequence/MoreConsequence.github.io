import React from "react";

export interface SectionHeadingProps {
  index: string;
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  className?: string;
}

export function SectionHeading({
  index,
  eyebrow,
  title,
  description,
  action,
  id,
  className = "",
}: SectionHeadingProps) {
  return (
    <div className={`section-heading ${className}`}>
      <div>
        <p className="eyebrow">
          <span className="section-index">{index}</span> {eyebrow}
        </p>
        <h2 id={id}>{title}</h2>
      </div>
      {description ? <p>{description}</p> : action ? action : null}
    </div>
  );
}

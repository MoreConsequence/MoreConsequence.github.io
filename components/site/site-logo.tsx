import Link from "next/link";

export function SiteLogo() {
  return (
    <Link className="site-logo" href="/" aria-label="边界笔记首页">
      <span className="site-logo-mark" aria-hidden="true">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="boundary-mark-svg"
        >
          {/* 四个角的清晰工程边界标记 (Boundary Brackets) */}
          <path
            d="M 4 8 V 4 H 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 16 4 H 20 V 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 20 16 V 20 H 16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 8 20 H 4 V 16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* 内部核心边界方块 (Core Kernel Block) */}
          <rect
            x="7.5"
            y="7.5"
            width="9"
            height="9"
            rx="2.5"
            fill="var(--accent)"
            fillOpacity="0.2"
            stroke="var(--accent)"
            strokeWidth="1.75"
          />
          {/* 核心边界切线 (Boundary Axis) */}
          <line
            x1="12"
            y1="7.5"
            x2="12"
            y2="16.5"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="site-logo-type">
        <strong>边界笔记</strong>
        <small>BOUNDARY NOTES</small>
      </span>
    </Link>
  );
}

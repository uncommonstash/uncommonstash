import clsx from "clsx";
import type React from "react";

const sizes = {
  xs: 16,
  sm: 32,
  md: 48,
  lg: 72,
} as const;

interface SpinnerProps {
  className?: string;
  dir?: "h" | "v";
  size?: keyof typeof sizes;
  value?: number;
}

export function Spinner({
  children,
  className,
  dir,
  size = "md",
  value,
}: React.PropsWithChildren<SpinnerProps>) {
  const determinate = typeof value === "number";

  return (
    <div
      className={clsx(
        "flex gap-2 items-center w-fit",
        dir == "h" ? "flex-row" : "flex-col",
        className,
      )}
    >
      <svg
        width={sizes[size]}
        height={sizes[size]}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          animation:
            typeof value === "undefined"
              ? "spin 1s ease-in-out infinite"
              : undefined,
        }}
      >
        <mask id="path-1-inside-1_514_4085" fill="white">
          <path d="M4 16C4 22.6274 9.37258 28 16 28C22.6274 28 28 22.6274 28 16C28 9.37258 22.6274 4 16 4C9.37258 4 4 9.37258 4 16Z" />
        </mask>
        <g
          clipPath="url(#paint0_angular_514_4085_clip_path)"
          mask="url(#path-1-inside-1_514_4085)"
        >
          <g transform="matrix(0 0.012 0.012 0 16 16)">
            <foreignObject
              x="-1222.22"
              y="-1222.22"
              width="2444.44"
              height="2444.44"
            >
              <div
                style={{
                  background: `conic-gradient(from ${determinate ? -value * 360 - 90 : 90}deg, rgba(62, 99, 221, 1) 0deg, rgba(222, 230, 255, 1) ${
                    determinate ? value * 360 : 360
                  }deg)`,
                  height: "100%",
                  width: "100%",
                  opacity: 1,
                }}
              ></div>
            </foreignObject>
          </g>
        </g>
        <path
          d="M6.66667 16C6.66667 21.1547 10.8453 25.3333 16 25.3333V30.6667C7.89982 30.6667 1.33333 24.1002 1.33333 16H6.66667ZM16 25.3333C21.1547 25.3333 25.3333 21.1547 25.3333 16H30.6667C30.6667 24.1002 24.1002 30.6667 16 30.6667V25.3333ZM25.3333 16C25.3333 10.8453 21.1547 6.66667 16 6.66667V1.33333C24.1002 1.33333 30.6667 7.89982 30.6667 16H25.3333ZM16 6.66667C10.8453 6.66667 6.66667 10.8453 6.66667 16H1.33333C1.33333 7.89982 7.89982 1.33333 16 1.33333V6.66667Z"
          mask="url(#path-1-inside-1_514_4085)"
        />
        <circle
          cx="1.33333"
          cy="1.33333"
          r="1.33333"
          style={{
            transform: `rotate(${determinate ? value * 360 + 15 - 180 : 15}deg) translate(17.3335px, 25px)`,
            transformOrigin: determinate ? "center" : "initial",
          }}
          fill="#3E63DD"
        />
        <defs>
          <clipPath id="paint0_angular_514_4085_clip_path">
            <path
              d="M6.66667 16C6.66667 21.1547 10.8453 25.3333 16 25.3333V30.6667C7.89982 30.6667 1.33333 24.1002 1.33333 16H6.66667ZM16 25.3333C21.1547 25.3333 25.3333 21.1547 25.3333 16H30.6667C30.6667 24.1002 24.1002 30.6667 16 30.6667V25.3333ZM25.3333 16C25.3333 10.8453 21.1547 6.66667 16 6.66667V1.33333C24.1002 1.33333 30.6667 7.89982 30.6667 16H25.3333ZM16 6.66667C10.8453 6.66667 6.66667 10.8453 6.66667 16H1.33333C1.33333 7.89982 7.89982 1.33333 16 1.33333V6.66667Z"
              mask="url(#path-1-inside-1_514_4085)"
            />
          </clipPath>
        </defs>
        <style>
          {`@keyframes spin {
          100% {
            transform: rotate(360deg);
          }
       }`}
        </style>
      </svg>
      {children}
    </div>
  );
}

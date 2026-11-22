import { useId } from "react";

/** The Kavach mark: a white ₹ cut out of a blue-to-green shield ("protected money"). */
export function Shield({ size = 32, className = "" }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#22c58b" />
        </linearGradient>
      </defs>
      <path d="M32 4 9 12.5v15.2c0 13.4 9.6 24.6 23 28.3 13.4-3.7 23-14.9 23-28.3V12.5L32 4Z" fill={`url(#${id})`} />
      <path d="M23 20h18M23 26h18M25 20c9 0 9 12 0 12h-2l12 12" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

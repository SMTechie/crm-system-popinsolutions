import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type CardProps = PropsWithChildren<{
  className?: string;
}>;

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        "theme-surface rounded-[24px] border border-line bg-white shadow-[0_8px_24px_rgba(37,69,132,0.07)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

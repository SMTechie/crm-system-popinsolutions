import type { MouseEventHandler, PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type CardProps = PropsWithChildren<{
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
}>;

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      className={cn(
        "theme-surface theme-card rounded-[24px] border border-line shadow-[0_8px_24px_rgba(37,69,132,0.07)]",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

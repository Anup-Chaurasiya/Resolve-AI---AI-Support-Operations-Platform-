import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border border-indigo-300/20 bg-indigo-300 text-zinc-950 shadow-[0_0_24px_rgba(165,180,252,0.08)] hover:bg-indigo-200",
  secondary: "border border-white/10 bg-white/[0.04] text-zinc-100 hover:border-white/15 hover:bg-white/[0.07]",
  ghost: "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100",
  danger: "border border-rose-400/20 bg-rose-500/90 text-white hover:bg-rose-400",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  icon: "size-9 p-0",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  asChild,
  className,
  size = "md",
  variant = "primary",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-[color,background-color,border-color,box-shadow,opacity] duration-200 disabled:pointer-events-none disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080808]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

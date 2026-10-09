import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors border",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand-500 text-white font-semibold",
        secondary: "border-slate-700/80 bg-slate-800 text-slate-200",
        outline: "border-slate-700 bg-slate-900/60 text-slate-300",
        dark: "border-transparent bg-white text-slate-950 font-semibold",
        success: "border-emerald-800/60 bg-emerald-950/80 text-emerald-300",
        lime: "border-emerald-800/60 bg-emerald-950/80 text-emerald-300",
        warning: "border-amber-800/60 bg-amber-950/80 text-amber-300",
        destructive: "border-rose-800/60 bg-rose-950/80 text-rose-300",
        reprint: "border-rose-700 bg-rose-950 text-rose-300 font-bold tracking-wide uppercase pulse-reprint",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

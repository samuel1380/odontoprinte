import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors border",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#DE5A35] text-white",
        secondary: "border-transparent bg-[#EFEAE2] text-[#2D2A26]",
        outline: "border-[#E2DDD5] bg-white text-[#2D2A26]",
        dark: "border-transparent bg-[#18181B] text-white",
        success: "border-[#C8E6C9] bg-[#E8F5E9] text-[#2E7D32]",
        lime: "border-[#C8E6C9] bg-[#E8F5E9] text-[#2E7D32]",
        warning: "border-[#FFE0B2] bg-[#FFF3E0] text-[#E65100]",
        destructive: "border-[#FFCDD2] bg-[#FFEBEE] text-[#C62828]",
        reprint: "border-[#FFCDD2] bg-[#FFEBEE] text-[#C62828] font-bold tracking-wide uppercase pulse-reprint",
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

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-xs sm:text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-[#18181B] text-white hover:bg-black shadow-xs",
        outline: "border border-[#E2DDD5] bg-white text-[#1E1C1A] hover:bg-[#FAF8F5] shadow-xs",
        secondary: "bg-[#EFEAE2] text-[#2D2A26] hover:bg-[#E5DFD5]",
        accent: "bg-[#DE5A35] text-white hover:bg-[#C94E2B] shadow-xs",
        destructive: "bg-[#DE3535] text-white hover:bg-[#C52A2A] shadow-xs",
        ghost: "hover:bg-[#EFEAE2]/60 text-[#2D2A26]",
        link: "text-[#18181B] underline-offset-4 hover:underline",
        lime: "bg-[#18181B] text-white shadow-xs hover:bg-black",
      },
      size: {
        default: "h-9 sm:h-10 px-4 sm:px-5 py-2",
        sm: "h-8 px-3.5 text-xs",
        lg: "h-11 sm:h-12 px-6 sm:px-7 text-sm sm:text-base font-semibold",
        icon: "h-9 w-9 p-0 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

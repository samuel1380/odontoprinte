import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-xs sm:text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-white text-slate-950 hover:bg-slate-200 font-semibold shadow-xs",
        outline: "border border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800 hover:text-white shadow-xs",
        secondary: "bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700/60",
        accent: "bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 shadow-xs",
        destructive: "bg-rose-600 text-white hover:bg-rose-700 shadow-xs",
        ghost: "hover:bg-slate-800/80 text-slate-300 hover:text-white",
        link: "text-cyan-400 underline-offset-4 hover:underline",
        lime: "bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 shadow-xs",
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

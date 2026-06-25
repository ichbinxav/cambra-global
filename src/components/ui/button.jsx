import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

// CAMBRA unified button system — pill, dark editorial, single source of truth.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[13px] font-bold tracking-[-0.01em] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary — white pill on dark, the ONE action of the screen
        default:
          "bg-white text-black hover:bg-white/90 active:scale-[0.98] shadow-[0_18px_40px_-16px_rgba(34,211,238,0.45)]",
        destructive:
          "bg-red-500 text-white hover:bg-red-500/90",
        // Secondary on dark — outlined translucent pill
        outline:
          "border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08] hover:border-white/25 backdrop-blur",
        secondary:
          "bg-white/[0.06] text-white border border-white/10 hover:bg-white/[0.10]",
        ghost:
          "text-white/70 hover:text-white hover:bg-white/[0.05]",
        link:
          "text-white underline-offset-4 hover:underline rounded-none",
      },
      size: {
        default: "h-9 px-5",
        sm: "h-8 px-3.5 text-[12px]",
        lg: "h-11 px-7 text-[14px]",
        icon: "h-9 w-9 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
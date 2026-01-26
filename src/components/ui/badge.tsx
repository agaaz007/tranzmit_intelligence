import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: "default" | "secondary" | "destructive" | "outline"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
    const baseStyles = "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    
    const variants = {
        default: "border-transparent bg-slate-900 text-white hover:bg-slate-800",
        secondary: "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-200",
        destructive: "border-transparent bg-red-500 text-white hover:bg-red-600",
        outline: "text-slate-900 border-slate-200 hover:bg-slate-100"
    }

    return (
        <div className={cn(baseStyles, variants[variant], className)} {...props} />
    )
}

export { Badge }

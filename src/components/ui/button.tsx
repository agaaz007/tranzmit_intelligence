import * as React from "react"

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'ghost' }>(
    ({ className, variant = 'default', ...props }, ref) => {
        const baseStyles = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2"
        const variants = {
            default: "bg-primary text-primary-foreground hover:bg-primary/90 bg-white text-black",
            outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground border-white/20 text-white",
            ghost: "hover:bg-accent hover:text-accent-foreground hover:bg-white/10 text-white"
        }
        return (
            <button
                ref={ref}
                className={`${baseStyles} ${variants[variant]} ${className}`}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }

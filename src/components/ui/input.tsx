import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./lib/utils";

const inputVariants = cva(
  "flex h-9 w-full text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "rounded-md border border-input bg-transparent shadow-sm px-3 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        plain: "p-0 focus-visible:outline-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange">,
    VariantProps<typeof inputVariants> {
  onChange?: (_value: string) => void;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onChange, variant, ...props }, ref) => {
    const onChangeWrapper = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        if (onChange) {
          onChange(event.target.value);
        }
      },
      [onChange],
    );

    return (
      <input
        type={type}
        className={cn(inputVariants({ variant }), className)}
        onChange={onChangeWrapper}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

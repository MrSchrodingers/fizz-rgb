import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { baseInteractive, sizes, tone, type Size, type Tone } from '../../lib/tokens.js';
import { cn } from '../../lib/classnames.js';

type Variant = 'solid' | 'soft' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  toneName?: Tone;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  active?: boolean;
}

function variantClass(variant: Variant, toneName: Tone, active: boolean): string {
  const t = tone[toneName];
  if (variant === 'solid') {
    if (!('solid' in t)) return tone.accent.solid;
    return (t as { solid: string }).solid;
  }
  if (variant === 'soft') {
    if (active) return t.soft + ' ' + ('ring' in tone.accent ? tone.accent.ring : '');
    return t.soft;
  }
  // ghost
  if (active) {
    const accent = tone.accent;
    return accent.soft + ' ' + accent.ring;
  }
  return tone.neutral.ghost;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'soft',
    toneName = 'accent',
    size = 'sm',
    leftIcon,
    rightIcon,
    active = false,
    className,
    children,
    type,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium select-none',
        sizes[size],
        baseInteractive,
        variantClass(variant, toneName, active),
        className,
      )}
      {...rest}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
});

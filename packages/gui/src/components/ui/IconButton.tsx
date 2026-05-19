import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { baseInteractive, tone, type Tone } from '../../lib/tokens.js';
import { cn } from '../../lib/classnames.js';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  toneName?: Tone;
  active?: boolean;
  /** Visual size; affects both square box and icon */
  size?: 'sm' | 'md' | 'lg';
}

const boxSize = {
  sm: 'w-7 h-7 rounded-md',
  md: 'w-8 h-8 rounded-md',
  lg: 'w-10 h-10 rounded-lg',
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, toneName = 'neutral', active = false, size = 'sm', className, type, ...rest },
  ref,
) {
  const t = tone[toneName];
  const variantClass = active
    ? tone.accent.soft + ' ' + tone.accent.ring
    : 'ghost' in t
      ? (t as { ghost: string }).ghost
      : tone.neutral.ghost;

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center',
        boxSize[size],
        baseInteractive,
        variantClass,
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});

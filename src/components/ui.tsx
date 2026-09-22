import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, TableHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dark'

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  tone?: 'default' | 'dark' | 'accent'
}

export function Card({ children, className = '', tone = 'default', ...props }: CardProps) {
  return (
    <div
      className={`rounded-[1.35rem] border border-ink/8 bg-surface p-5 shadow-[0_16px_40px_rgba(35,37,34,0.055)] ${tone === 'dark' ? 'border-ink bg-night text-white' : ''} ${tone === 'accent' ? 'border-transparent bg-amber' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function Button({ children, className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-amber text-ink hover:bg-amber-dark',
    secondary: 'border border-ink/12 bg-surface text-ink hover:border-ink/25',
    ghost: 'text-muted hover:bg-ink/5 hover:text-ink',
    dark: 'bg-ink text-white hover:bg-ink/90',
  }

  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'warning' | 'negative' }) {
  const styles = {
    neutral: 'bg-ink/6 text-muted',
    positive: 'bg-mint/12 text-mint-dark',
    warning: 'bg-amber/20 text-amber-dark',
    negative: 'bg-coral/12 text-coral-dark',
  }

  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${styles[tone]}`}>{children}</span>
}

export function Table({ children, className = '', ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <div className="overflow-x-auto"><table className={`w-full min-w-[620px] table-fixed border-collapse text-left break-words [&_th.text-right]:text-center [&_td.text-right]:text-center ${className}`} {...props}>{children}</table></div>
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{eyebrow}</p>}
        <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-ink">{title}</h2>
      </div>
      {action}
    </div>
  )
}

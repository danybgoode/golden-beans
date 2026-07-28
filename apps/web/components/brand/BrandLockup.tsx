import { GoldenBeanMark } from './GoldenBeanMark'

export function BrandLockup({ compact = false, href = '/' }: { compact?: boolean; href?: string }) {
  return (
    <a className={`brand-lockup${compact ? ' brand-lockup--compact' : ''}`} href={href}>
      <GoldenBeanMark size={compact ? 25 : 31} />
      <span className="brand-lockup__type">
        <strong>golden beans</strong>
        {!compact && <small>plant signals · grow outcomes</small>}
      </span>
    </a>
  )
}

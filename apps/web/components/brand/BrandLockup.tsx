import { GoldenFrijolMark } from './GoldenFrijolMark'

export function BrandLockup({ compact = false, href = '/' }: { compact?: boolean; href?: string }) {
  return (
    <a className={`brand-lockup${compact ? ' brand-lockup--compact' : ''}`} href={href}>
      <GoldenFrijolMark size={compact ? 25 : 31} />
      <span className="brand-lockup__type">
        <strong>golden frijoles</strong>
        {!compact && <small>the growth engine your agent operates</small>}
      </span>
    </a>
  )
}

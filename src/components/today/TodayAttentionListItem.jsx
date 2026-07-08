import { getTodayAttentionItemA11y } from '../../lib/todayAttentionNavigation'

export function TodayAttentionListItem({
  item,
  attentionPermissions = {},
  onAttentionItemClick,
  variant = 'desktop',
  category = '',
}) {
  const { isActionable, actionLabel } = getTodayAttentionItemA11y(item, attentionPermissions)
  const tone = item?.tone ?? 'default'
  const isMobile = variant === 'mobile'

  const itemClassName = [
    isMobile ? 'mobile-manager-attention-item mobile-manager-priority-item' : 'today-attention-item',
    `tone-${tone}`,
    isMobile && category ? `category-${category}` : '',
    isActionable ? 'is-actionable' : 'is-static',
  ].filter(Boolean).join(' ')

  const triggerClassName = isMobile
    ? 'mobile-manager-attention-trigger is-tappable'
    : 'today-attention-trigger is-tappable'

  const copy = isMobile ? (
    <>
      <span className="mobile-manager-priority-dot" aria-hidden="true" />
      <div className="mobile-manager-attention-copy" aria-hidden={isActionable ? 'true' : undefined}>
        <strong>{item.label}</strong>
        <span>{item.detail}</span>
      </div>
    </>
  ) : (
    <span className="today-attention-copy" aria-hidden={isActionable ? 'true' : undefined}>
      <strong>{item.label}</strong>
      <span>{item.detail}</span>
    </span>
  )

  return (
    <li className={itemClassName}>
      {isActionable ? (
        <button
          type="button"
          className={triggerClassName}
          aria-label={actionLabel}
          onClick={() => onAttentionItemClick?.(item)}
        >
          {copy}
        </button>
      ) : copy}
    </li>
  )
}

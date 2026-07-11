function resolveLoading(loadingProp, isLoadingLegacy) {
  const value = loadingProp ?? isLoadingLegacy ?? false
  return value === true
}

export function LoadingButton({
  type = 'button',
  variant = 'primary',
  className = '',
  loading: loadingProp,
  isLoading: isLoadingLegacy,
  disabled = false,
  loadingLabel,
  children,
  onClick,
  ...rest
}) {
  const loading = resolveLoading(loadingProp, isLoadingLegacy)
  const isDisabled = disabled === true || loading
  const baseClass = variant === 'ghost' ? 'ghost-btn' : 'primary-btn'
  const resolvedLoadingLabel = loadingLabel ?? (typeof children === 'string' ? children : 'Loading…')

  return (
    <button
      {...rest}
      type={type}
      className={`${baseClass}${loading ? ' is-loading' : ''}${className ? ` ${className}` : ''}`}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      onClick={onClick}
    >
      {loading ? (
        <span className="btn-loading-content">
          <span className="btn-loading-spinner" aria-hidden="true" />
          <span>{resolvedLoadingLabel}</span>
        </span>
      ) : (
        children
      )}
    </button>
  )
}

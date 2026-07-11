export function LoadingButton({
  type = 'button',
  variant = 'primary',
  className = '',
  isLoading = false,
  disabled = false,
  loadingLabel,
  children,
  ...rest
}) {
  const baseClass = variant === 'ghost' ? 'ghost-btn' : 'primary-btn'
  const isDisabled = disabled || isLoading
  const resolvedLoadingLabel = loadingLabel ?? (typeof children === 'string' ? children : 'Loading…')

  return (
    <button
      type={type}
      className={`${baseClass}${isLoading ? ' is-loading' : ''}${className ? ` ${className}` : ''}`}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading ? (
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

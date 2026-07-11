import { useEffect, useRef, useState } from 'react'

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
  const loading = loadingProp ?? isLoadingLegacy ?? false
  const [clickPending, setClickPending] = useState(false)
  const loadingRef = useRef(loading)

  useEffect(() => {
    loadingRef.current = loading
    if (loading) {
      setClickPending(false)
    }
  }, [loading])

  const showLoading = loading || clickPending
  const isDisabled = disabled || showLoading
  const baseClass = variant === 'ghost' ? 'ghost-btn' : 'primary-btn'
  const resolvedLoadingLabel = loadingLabel ?? (typeof children === 'string' ? children : 'Loading…')

  const handleClick = onClick
    ? async (event) => {
        if (disabled || showLoading) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        setClickPending(true)
        try {
          await onClick(event)
        } finally {
          if (!loadingRef.current) {
            setClickPending(false)
          }
        }
      }
    : undefined

  const handlePointerDown = (event) => {
    rest.onPointerDown?.(event)
    if (event.defaultPrevented || disabled || showLoading) return
    if (type === 'submit') {
      setClickPending(true)
    }
  }

  const { onPointerDown: _onPointerDown, ...buttonRest } = rest

  return (
    <button
      {...buttonRest}
      type={type}
      className={`${baseClass}${showLoading ? ' is-loading' : ''}${className ? ` ${className}` : ''}`}
      disabled={isDisabled}
      aria-busy={showLoading || undefined}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      {showLoading ? (
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

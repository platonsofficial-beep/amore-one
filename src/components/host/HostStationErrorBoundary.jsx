import { Component } from 'react'
import { logPublishBreadcrumbsOnError } from '../../lib/publishFloorPlanDiagnostics'
import { formatHostLoadError } from '../../lib/hostLoadNotice'
import { t } from '../../i18n/i18n'

export class HostStationErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    logPublishBreadcrumbsOnError(error, {
      componentStack: info?.componentStack,
      boundary: 'HostStationErrorBoundary',
    })
    console.error('[HostStationErrorBoundary] Host Station render failure:', error, info)
  }

  handleRetry = () => {
    this.setState({ error: null })
    this.props.onRetry?.()
  }

  handleReturnToEditor = () => {
    this.setState({ error: null })
    this.props.onReturnToEditor?.()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="host-station-error-boundary" role="alert">
        <h3>{t("Couldn't load")}</h3>
        <p>{formatHostLoadError(error?.message) || 'Something went wrong while loading the host floor.'}</p>
        <div className="host-station-error-actions">
          <button type="button" className="host-station-error-retry" onClick={this.handleRetry}>
            {t("Retry")}
          </button>
          {this.props.onReturnToEditor ? (
            <button
              type="button"
              className="host-station-error-return-editor"
              onClick={this.handleReturnToEditor}
            >
              {t("Open layout editor")}
            </button>
          ) : null}
        </div>
      </div>
    )
  }
}

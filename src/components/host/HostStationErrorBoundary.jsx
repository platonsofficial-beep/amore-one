import { Component } from 'react'
import { logPublishBreadcrumbsOnError } from '../../lib/publishFloorPlanDiagnostics'

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
        <h3>Host Station could not load.</h3>
        <p>{error?.message || 'Something went wrong while loading the host floor view.'}</p>
        <div className="host-station-error-actions">
          <button type="button" className="host-station-error-retry" onClick={this.handleRetry}>
            Retry
          </button>
          {this.props.onReturnToEditor ? (
            <button
              type="button"
              className="host-station-error-return-editor"
              onClick={this.handleReturnToEditor}
            >
              Return to editor
            </button>
          ) : null}
        </div>
      </div>
    )
  }
}

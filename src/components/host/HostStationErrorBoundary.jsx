import { Component } from 'react'

export class HostStationErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[HostStationErrorBoundary] Host Station render failure:', error, info)
  }

  handleRetry = () => {
    this.setState({ error: null })
    this.props.onRetry?.()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="host-station-error-boundary" role="alert">
        <h3>Host Station needs a refresh</h3>
        <p>{error?.message || 'Something went wrong while loading the host floor view.'}</p>
        <button type="button" className="host-station-error-retry" onClick={this.handleRetry}>
          Retry
        </button>
      </div>
    )
  }
}

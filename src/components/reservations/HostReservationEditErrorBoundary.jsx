import { Component } from 'react'

export class HostReservationEditErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, reservationId: props.reservationId }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  static getDerivedStateFromProps(nextProps, prevState) {
    if (nextProps.reservationId !== prevState.reservationId) {
      return { hasError: false, reservationId: nextProps.reservationId }
    }
    return null
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) {
      console.error('[host-reservation-edit] Drawer render failed.', error)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <aside className="host-reservation-edit-panel is-drawer" aria-label="Edit reservation">
          <div className="host-reservation-edit-header">
            <div>
              <p className="host-reservation-edit-eyebrow">Edit reservation</p>
              <h4>Reservation data unavailable</h4>
            </div>
            <div className="host-reservation-edit-header-actions">
              <button type="button" className="icon-btn" onClick={this.props.onClose} aria-label="Close edit panel">
                ✕
              </button>
            </div>
          </div>
          <div className="host-reservation-edit-scroll">
            <p className="host-reservation-edit-unavailable">
              This reservation could not be loaded safely. Close and try again, or refresh the page.
            </p>
          </div>
          <div className="host-reservation-edit-footer">
            <button type="button" className="host-reservation-edit-cancel" onClick={this.props.onClose}>
              Close
            </button>
          </div>
        </aside>
      )
    }

    return this.props.children
  }
}

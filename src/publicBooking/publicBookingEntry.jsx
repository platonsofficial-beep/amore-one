import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { PublicBookingApp } from './PublicBookingApp'

export function mountPublicBooking({ slug, confirm }) {
  const params = new URLSearchParams(window.location.search)
  const root = document.getElementById('root')
  createRoot(root).render(
    <StrictMode>
      <PublicBookingApp
        slug={slug}
        confirm={confirm}
        token={params.get('token') || ''}
      />
    </StrictMode>,
  )
}

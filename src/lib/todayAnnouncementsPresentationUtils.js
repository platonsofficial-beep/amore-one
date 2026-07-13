export function formatTodayAnnouncementsCollapsedSummary(announcements = []) {
  const items = announcements ?? []
  if (items.length === 0) return 'No announcements'

  const unreadCount = items.filter((announcement) => !announcement?.isRead).length
  if (unreadCount === 1) return '1 unread announcement'
  if (unreadCount > 1) return `${unreadCount} unread announcements`

  if (items.length === 1) return '1 announcement'
  return `${items.length} announcements`
}

/**
 * Help mode copy, keyed by the stable ids used in data-help.
 *
 * Each entry keeps title and body per locale so Greek can be added later
 * without changing the buttons. The Assistant (Voithos) should read
 * listHelpEntries() instead of duplicating these sentences.
 */
export const HELP_DEFAULT_LOCALE = 'en'

export const HELP_CATALOG = {
  'nav.today': {
    title: { en: 'Today' },
    body: { en: 'Opens the home screen: who is working, what is booked, and what needs attention right now.' },
  },
  'nav.chat': {
    title: { en: 'Chat' },
    body: { en: 'Opens staff messages. Unread conversations show a badge on this tab.' },
  },
  'nav.reservations': {
    title: { en: 'Reservations' },
    body: { en: 'Opens the booking list and the floor plan for the selected day.' },
  },
  'nav.team': {
    title: { en: 'Team' },
    body: { en: 'Opens people, today’s shift status, and the weekly schedule.' },
  },
  'nav.stock': {
    title: { en: 'Stock' },
    body: { en: 'Opens inventory: what is on hand, what is low, and what to order.' },
  },
  'nav.operations': {
    title: { en: 'Operations' },
    body: { en: 'Opens tasks and checklists for the service.' },
  },
  'nav.insights': {
    title: { en: 'Insights' },
    body: { en: 'Opens reports for reservations, labour, and stock.' },
  },
  'nav.settings': {
    title: { en: 'Settings' },
    body: { en: 'Opens venue setup: profile, seatings, positions, and notifications.' },
  },
  'nav.time-clock': {
    title: { en: 'Time clock' },
    body: { en: 'Opens clock in, clock out, and breaks for people working today.' },
  },
  'nav.my-week': {
    title: { en: 'My week' },
    body: { en: 'Opens your own shifts for this week.' },
  },
  'nav.account': {
    title: { en: 'Profile' },
    body: { en: 'Opens your profile, contact details, and account actions.' },
  },
  'nav.more': {
    title: { en: 'More' },
    body: { en: 'Opens the rest of the menu, including pages that do not fit in the bottom bar.' },
  },
  'header.notifications': {
    title: { en: 'Notifications' },
    body: { en: 'Opens alerts such as shift reminders. A number means unread items.' },
  },
  'header.profile': {
    title: { en: 'Your menu' },
    body: { en: 'Opens your name, role, profile, and sign-out.' },
  },
  'header.search': {
    title: { en: 'Search' },
    body: { en: 'Filters the list on this page by the words you type.' },
  },
  'header.help': {
    title: { en: 'Help mode' },
    body: { en: 'Turns explanations on or off. While it is on, taps describe a control instead of using it.' },
  },
  'home.reservation': {
    title: { en: 'Add a reservation' },
    body: { en: 'Starts a new booking from the home screen.' },
  },
  'home.task': {
    title: { en: 'Add a task' },
    body: { en: 'Creates an operations task for the team.' },
  },
  'home.announcement': {
    title: { en: 'Add an announcement' },
    body: { en: 'Posts a note the team can see on Today.' },
  },
  'home.order': {
    title: { en: 'Create an order' },
    body: { en: 'Starts a supplier order from the home screen.' },
  },
  'reservations.lock': {
    title: { en: 'Lock the map' },
    body: { en: 'Freezes pan and zoom so the floor stays still. Tap again to unlock. Table taps still open the booking.' },
  },
  'reservations.fit': {
    title: { en: 'Fit the map' },
    body: { en: 'Scales the current area so every table fits in the visible plan.' },
  },
  'reservations.zoom-in': {
    title: { en: 'Zoom in' },
    body: { en: 'Makes the floor plan larger. Locked maps ignore this.' },
  },
  'reservations.zoom-out': {
    title: { en: 'Zoom out' },
    body: { en: 'Makes the floor plan smaller. Locked maps ignore this.' },
  },
  'reservations.more': {
    title: { en: 'More floor actions' },
    body: { en: 'Opens Edit layout and dining timers when they do not fit on the toolbar.' },
  },
  'reservations.edit-layout': {
    title: { en: 'Edit layout' },
    body: { en: 'Opens the floor editor so you can move tables. Publish when the room looks right.' },
  },
  'reservations.timers': {
    title: { en: 'Dining timers' },
    body: { en: 'Shows how long seated parties have been at the table.' },
  },
  'reservations.walk-in': {
    title: { en: 'Walk-in' },
    body: { en: 'Seats a guest who does not have a booking. Seat Now saves them as in house.' },
  },
  'reservations.add': {
    title: { en: 'Add reservation' },
    body: { en: 'Creates a booking for a named guest, time, and table.' },
  },
  'reservations.legend': {
    title: { en: 'Table colours' },
    body: { en: 'Explains the floor colours: available, reserved, seated, and problem tables.' },
  },
  'reservations.area-next': {
    title: { en: 'Next area' },
    body: { en: 'Switches the floor to the next room, such as from Main Dining to the Bar.' },
  },
  'reservations.area-prev': {
    title: { en: 'Previous area' },
    body: { en: 'Switches the floor back to the previous room.' },
  },
  'team.today': {
    title: { en: 'Team today' },
    body: { en: 'Shows who is working, who is late, and who is still to come.' },
  },
  'team.members': {
    title: { en: 'People' },
    body: { en: 'Opens the employee list, roles, and contact details.' },
  },
  'team.schedule': {
    title: { en: 'Schedule' },
    body: { en: 'Opens the week grid where shifts are assigned and published.' },
  },
  'stock.dashboard': {
    title: { en: 'Stock dashboard' },
    body: { en: 'Shows on-hand quantities, low items, and what needs an order.' },
  },
  'stock.count': {
    title: { en: 'Counts' },
    body: { en: 'Opens inventory counts so you can record what is actually on the shelf.' },
  },
  'stock.storages': {
    title: { en: 'Storages' },
    body: { en: 'Opens each storage location and the products kept there.' },
  },
  'stock.suppliers': {
    title: { en: 'Suppliers' },
    body: { en: 'Opens the supplier list used when you order.' },
  },
  'stock.orders': {
    title: { en: 'Orders' },
    body: { en: 'Opens supplier orders from draft through receiving.' },
  },
  'stock.migration': {
    title: { en: 'Import' },
    body: { en: 'Brings products in from a spreadsheet.' },
  },
  'stock.more-sections': {
    title: { en: 'More stock sections' },
    body: { en: 'Shows stock pages that do not fit on the tab row.' },
  },
  'stock.count-now': {
    title: { en: 'Count' },
    body: { en: 'Starts a count so quantities can be checked against the book.' },
  },
  'stock.suggest': {
    title: { en: 'Suggest order' },
    body: { en: 'Builds a draft order from items that are under their par.' },
  },
  'stock.create-order': {
    title: { en: 'Create order' },
    body: { en: 'Starts a supplier order and lets you choose the lines.' },
  },
  'stock.exit': {
    title: { en: 'Exit Stock' },
    body: { en: 'Leaves the stock workspace and returns to the previous page.' },
  },
  'operations.dashboard': {
    title: { en: 'Operations dashboard' },
    body: { en: 'Shows today’s tasks and checklists in one place.' },
  },
  'operations.tasks': {
    title: { en: 'Task boards' },
    body: { en: 'Opens the task list so work can be assigned and completed.' },
  },
  'operations.checklists': {
    title: { en: 'Checklists' },
    body: { en: 'Opens opening and closing checklists such as Bar Opening.' },
  },
  'timeclock.clock-in': {
    title: { en: 'Clock in' },
    body: { en: 'Records the start of a shift for the signed-in person.' },
  },
  'timeclock.clock-out': {
    title: { en: 'Clock out' },
    body: { en: 'Records the end of the shift.' },
  },
  'timeclock.break': {
    title: { en: 'Break' },
    body: { en: 'Starts or ends a break without clocking out of the shift.' },
  },
  'chat.new': {
    title: { en: 'New chat' },
    body: { en: 'Starts a direct message with someone on the team.' },
  },
  'chat.search': {
    title: { en: 'Search chats' },
    body: { en: 'Filters the conversation list by a person’s name.' },
  },
  'chat.back': {
    title: { en: 'Back to chats' },
    body: { en: 'Leaves this conversation and returns to the list. The draft stays until you send or clear it.' },
  },
  'chat.info': {
    title: { en: 'Conversation info' },
    body: { en: 'Opens members, mute, and other details for this chat.' },
  },
  'chat.mute': {
    title: { en: 'Mute' },
    body: { en: 'Quiets notifications for this conversation for a while, or until you unmute it.' },
  },
  'chat.emoji': {
    title: { en: 'Emoji' },
    body: { en: 'Opens the emoji picker and adds the one you tap to the message.' },
  },
  'chat.channel': {
    title: { en: 'New channel' },
    body: { en: 'Creates a group channel. Only people who can manage chat see this.' },
  },
  'chat.send': {
    title: { en: 'Send' },
    body: { en: 'Sends the message in the box to the open conversation.' },
  },
  'chat.photo': {
    title: { en: 'Photo' },
    body: { en: 'Attaches a photo to the conversation.' },
  },
  'chat.message': {
    title: { en: 'Message' },
    body: { en: 'The text you will send. It grows as you type.' },
  },
  'settings.profile': {
    title: { en: 'Business profile' },
    body: { en: 'Edits the venue name and the details shown to the team.' },
  },
  'settings.positions': {
    title: { en: 'Positions' },
    body: { en: 'Edits job titles used when you schedule people.' },
  },
  'settings.venue': {
    title: { en: 'Venue setup' },
    body: { en: 'Edits the address and the hours the venue uses.' },
  },
  'settings.reservations': {
    title: { en: 'Seatings' },
    body: { en: 'Edits service periods such as Brunch, Lunch, and Dinner.' },
  },
  'settings.team': {
    title: { en: 'Team settings' },
    body: { en: 'Edits how the team module behaves for this venue.' },
  },
  'settings.notifications': {
    title: { en: 'Notification settings' },
    body: { en: 'Chooses which alerts are sent and the quiet hours.' },
  },
  'settings.system': {
    title: { en: 'System' },
    body: { en: 'Shows workspace system details.' },
  },
}

export function getHelpCopy(id, locale = HELP_DEFAULT_LOCALE) {
  const entry = HELP_CATALOG[`${id ?? ''}`.trim()]
  if (!entry) return null
  const lang = entry.title?.[locale] ? locale : HELP_DEFAULT_LOCALE
  return {
    id: `${id}`.trim(),
    title: entry.title[lang],
    body: entry.body[lang],
  }
}

export function resolveHelpCopy(id, { label = '', locale = HELP_DEFAULT_LOCALE } = {}) {
  const found = id ? getHelpCopy(id, locale) : null
  if (found) return found
  const title = `${label ?? ''}`.trim() || 'This control'
  return {
    id: `${id ?? ''}`.trim(),
    title,
    body: 'No help text yet',
  }
}

/** Same sentences the Assistant (Voithos) can quote. */
export function listHelpEntries(locale = HELP_DEFAULT_LOCALE) {
  return Object.keys(HELP_CATALOG).map((id) => getHelpCopy(id, locale))
}

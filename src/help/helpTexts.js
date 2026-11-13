import { t } from '../i18n/i18n'
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
    body: { en: t("Opens the home screen: who is working, what is booked, and what needs attention right now.") },
  },
  'nav.chat': {
    title: { en: 'Chat' },
    body: { en: t("Opens staff messages. Unread conversations show a badge on this tab.") },
  },
  'nav.reservations': {
    title: { en: 'Reservations' },
    body: { en: t("Opens the booking list and the floor plan for the selected day.") },
  },
  'nav.team': {
    title: { en: 'Team' },
    body: { en: t("Opens people, today’s shift status, and the weekly schedule.") },
  },
  'nav.stock': {
    title: { en: 'Stock' },
    body: { en: t("Opens inventory: what is on hand, what is low, and what to order.") },
  },
  'nav.operations': {
    title: { en: 'Operations' },
    body: { en: t("Opens tasks and checklists for the service.") },
  },
  'nav.insights': {
    title: { en: 'Insights' },
    body: { en: t("Opens reports for reservations, labour, and stock.") },
  },
  'nav.settings': {
    title: { en: 'Settings' },
    body: { en: t("Opens venue setup: profile, seatings, positions, and notifications.") },
  },
  'nav.time-clock': {
    title: { en: t("Time clock") },
    body: { en: t("Opens clock in, clock out, and breaks for people working today.") },
  },
  'nav.my-week': {
    title: { en: t("My week") },
    body: { en: t("Opens your own shifts for this week.") },
  },
  'nav.account': {
    title: { en: 'Profile' },
    body: { en: t("Opens your profile, contact details, and account actions.") },
  },
  'nav.more': {
    title: { en: 'More' },
    body: { en: t("Opens the rest of the menu, including pages that do not fit in the bottom bar.") },
  },
  'header.notifications': {
    title: { en: 'Notifications' },
    body: { en: t("Opens alerts such as shift reminders. A number means unread items.") },
  },
  'header.profile': {
    title: { en: t("Your menu") },
    body: { en: t("Opens your name, role, profile, and sign-out.") },
  },
  'header.search': {
    title: { en: 'Search' },
    body: { en: t("Filters the list on this page by the words you type.") },
  },
  'header.help': {
    title: { en: t("Help mode") },
    body: { en: t("Turns explanations on or off. While it is on, taps describe a control instead of using it.") },
  },
  'home.reservation': {
    title: { en: t("Add a reservation") },
    body: { en: t("Starts a new booking from the home screen.") },
  },
  'home.task': {
    title: { en: t("Add a task") },
    body: { en: t("Creates an operations task for the team.") },
  },
  'home.announcement': {
    title: { en: t("Add an announcement") },
    body: { en: t("Posts a note the team can see on Today.") },
  },
  'home.order': {
    title: { en: t("Create an order") },
    body: { en: t("Starts a supplier order from the home screen.") },
  },
  'reservations.lock': {
    title: { en: t("Lock the map") },
    body: { en: t("Freezes pan and zoom so the floor stays still. Tap again to unlock. Table taps still open the booking.") },
  },
  'reservations.fit': {
    title: { en: t("Fit the map") },
    body: { en: t("Scales the current area so every table fits in the visible plan.") },
  },
  'reservations.zoom-in': {
    title: { en: t("Zoom in") },
    body: { en: t("Makes the floor plan larger. Locked maps ignore this.") },
  },
  'reservations.zoom-out': {
    title: { en: t("Zoom out") },
    body: { en: t("Makes the floor plan smaller. Locked maps ignore this.") },
  },
  'reservations.more': {
    title: { en: t("More floor actions") },
    body: { en: t("Opens Edit layout and dining timers when they do not fit on the toolbar.") },
  },
  'reservations.edit-layout': {
    title: { en: t("Edit layout") },
    body: { en: t("Opens the floor editor so you can move tables. Publish when the room looks right.") },
  },
  'reservations.timers': {
    title: { en: t("Dining timers") },
    body: { en: t("Shows how long seated parties have been at the table.") },
  },
  'reservations.walk-in': {
    title: { en: 'Walk-in' },
    body: { en: t("Seats a guest who does not have a booking. Seat Now saves them as seated.") },
  },
  'reservations.add': {
    title: { en: t("Add reservation") },
    body: { en: t("Creates a booking for a named guest, time, and table.") },
  },
  'reservations.legend': {
    title: { en: t("Table colours") },
    body: { en: t("Explains the floor colours: available, reserved, seated, and problem tables.") },
  },
  'reservations.area-next': {
    title: { en: t("Next area") },
    body: { en: t("Switches the floor to the next room, such as from Main Dining to the Bar.") },
  },
  'reservations.area-prev': {
    title: { en: t("Previous area") },
    body: { en: t("Switches the floor back to the previous room.") },
  },
  'team.today': {
    title: { en: t("Team today") },
    body: { en: t("Shows who is working, who is late, and who is still to come.") },
  },
  'team.members': {
    title: { en: 'People' },
    body: { en: t("Opens the employee list, roles, and contact details.") },
  },
  'team.schedule': {
    title: { en: 'Schedule' },
    body: { en: t("Opens the week grid where shifts are assigned and published.") },
  },
  'stock.dashboard': {
    title: { en: t("Stock dashboard") },
    body: { en: t("Shows on-hand quantities, low items, and what needs an order.") },
  },
  'stock.count': {
    title: { en: 'Counts' },
    body: { en: t("Opens inventory counts so you can record what is actually on the shelf.") },
  },
  'stock.storages': {
    title: { en: 'Storages' },
    body: { en: t("Opens each storage location and the products kept there.") },
  },
  'stock.suppliers': {
    title: { en: 'Suppliers' },
    body: { en: t("Opens the supplier list used when you order.") },
  },
  'stock.orders': {
    title: { en: 'Orders' },
    body: { en: t("Opens supplier orders from draft through receiving.") },
  },
  'stock.migration': {
    title: { en: 'Import' },
    body: { en: t("Brings products in from a spreadsheet.") },
  },
  'stock.more-sections': {
    title: { en: t("More stock sections") },
    body: { en: t("Shows stock pages that do not fit on the tab row.") },
  },
  'stock.count-now': {
    title: { en: 'Count' },
    body: { en: t("Starts a count so quantities can be checked against the book.") },
  },
  'stock.suggest': {
    title: { en: t("Suggest order") },
    body: { en: t("Builds a draft order from items that are under their par.") },
  },
  'stock.create-order': {
    title: { en: t("Create order") },
    body: { en: t("Starts a supplier order and lets you choose the lines.") },
  },
  'stock.exit': {
    title: { en: t("Exit Stock") },
    body: { en: t("Leaves the stock workspace and returns to the previous page.") },
  },
  'operations.dashboard': {
    title: { en: t("Operations dashboard") },
    body: { en: t("Shows today’s tasks and checklists in one place.") },
  },
  'operations.tasks': {
    title: { en: t("Task boards") },
    body: { en: t("Opens the task list so work can be assigned and completed.") },
  },
  'operations.checklists': {
    title: { en: 'Checklists' },
    body: { en: t("Opens opening and closing checklists such as Bar Opening.") },
  },
  'timeclock.clock-in': {
    title: { en: t("Clock in") },
    body: { en: t("Records the start of a shift for the signed-in person.") },
  },
  'timeclock.clock-out': {
    title: { en: t("Clock out") },
    body: { en: t("Records the end of the shift.") },
  },
  'timeclock.break': {
    title: { en: 'Break' },
    body: { en: t("Starts or ends a break without clocking out of the shift.") },
  },
  'chat.new': {
    title: { en: t("New chat") },
    body: { en: t("Starts a direct message with someone on the team.") },
  },
  'chat.search': {
    title: { en: t("Search chats") },
    body: { en: t("Filters the conversation list by a person’s name.") },
  },
  'chat.back': {
    title: { en: t("Back to chats") },
    body: { en: t("Leaves this conversation and returns to the list. The draft stays until you send or clear it.") },
  },
  'chat.info': {
    title: { en: t("Conversation info") },
    body: { en: t("Opens members, mute, and other details for this chat.") },
  },
  'chat.mute': {
    title: { en: 'Mute' },
    body: { en: t("Quiets notifications for this conversation for a while, or until you unmute it.") },
  },
  'chat.emoji': {
    title: { en: 'Emoji' },
    body: { en: t("Opens the emoji picker and adds the one you tap to the message.") },
  },
  'chat.channel': {
    title: { en: t("New channel") },
    body: { en: t("Creates a group channel. Only people who can manage chat see this.") },
  },
  'chat.send': {
    title: { en: 'Send' },
    body: { en: t("Sends the message in the box to the open conversation.") },
  },
  'chat.photo': {
    title: { en: 'Photo' },
    body: { en: t("Attaches a photo to the conversation.") },
  },
  'chat.message': {
    title: { en: 'Message' },
    body: { en: t("The text you will send. It grows as you type.") },
  },
  'settings.profile': {
    title: { en: t("Business profile") },
    body: { en: t("Edits the venue name and the details shown to the team.") },
  },
  'settings.positions': {
    title: { en: 'Positions' },
    body: { en: t("Edits job titles used when you schedule people.") },
  },
  'settings.venue': {
    title: { en: t("Venue setup") },
    body: { en: t("Edits the address and the hours the venue uses.") },
  },
  'settings.reservations': {
    title: { en: 'Seatings' },
    body: { en: t("Edits service periods such as Brunch, Lunch, and Dinner.") },
  },
  'settings.team': {
    title: { en: t("Team settings") },
    body: { en: t("Edits how the team module behaves for this venue.") },
  },
  'settings.notifications': {
    title: { en: t("Notification settings") },
    body: { en: t("Chooses which alerts are sent and the quiet hours.") },
  },
  'settings.system': {
    title: { en: 'System' },
    body: { en: t("Shows workspace system details.") },
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
  const title = `${label ?? ''}`.trim() || t("This control")
  return {
    id: `${id ?? ''}`.trim(),
    title,
    body: t("No help text yet"),
  }
}

/** Same sentences the Assistant (Voithos) can quote. */
export function listHelpEntries(locale = HELP_DEFAULT_LOCALE) {
  return Object.keys(HELP_CATALOG).map((id) => getHelpCopy(id, locale))
}

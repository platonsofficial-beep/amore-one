import {
  canAccessModule,
  canAccessTeamSection,
  canConfigureReservationSeatings,
  canManageAttendance,
  canManageStock,
  canUseChat,
} from '../lib/permissions'
import { isStaffOrHostRole } from '../lib/staffHostPersonalNav'

export const TUTORIAL_STORAGE_PREFIX = 'one.tutorial.v1'

export function emptyTutorial() {
  return { choice: '', seen: {} }
}

export function tutorialStorageKey(userId, workspaceId) {
  return `${TUTORIAL_STORAGE_PREFIX}:${userId || 'local'}:${workspaceId || 'local'}`
}

export function readTutorial(userId, workspaceId, storage) {
  const fallback = emptyTutorial()
  if (!storage) return fallback
  try {
    const raw = storage.getItem(tutorialStorageKey(userId, workspaceId))
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    const seen = parsed?.seen && typeof parsed.seen === 'object' ? parsed.seen : {}
    const choice = parsed?.choice === 'yes' || parsed?.choice === 'no' ? parsed.choice : ''
    return {
      choice,
      seen: Object.fromEntries(Object.entries(seen).filter((entry) => entry[1] === true)),
    }
  } catch {
    return fallback
  }
}

export function writeTutorial(userId, workspaceId, progress, storage) {
  const next = {
    choice: progress?.choice === 'yes' || progress?.choice === 'no' ? progress.choice : '',
    seen: progress?.seen && typeof progress.seen === 'object' ? progress.seen : {},
  }
  if (storage) storage.setItem(tutorialStorageKey(userId, workspaceId), JSON.stringify(next))
  return next
}

export function setTutorialChoice(userId, workspaceId, choice, storage) {
  const current = readTutorial(userId, workspaceId, storage)
  const nextChoice = choice === 'yes' || choice === 'no' ? choice : ''
  return writeTutorial(userId, workspaceId, { ...current, choice: nextChoice }, storage)
}

export function markScreenSeen(userId, workspaceId, screenId, storage) {
  const current = readTutorial(userId, workspaceId, storage)
  const id = `${screenId ?? ''}`.trim()
  if (!id) return current
  return writeTutorial(userId, workspaceId, {
    ...current,
    seen: { ...current.seen, [id]: true },
  }, storage)
}

export function replayTutorial(userId, workspaceId, storage) {
  return writeTutorial(userId, workspaceId, { choice: 'yes', seen: {} }, storage)
}

function allowScreen(role, screenId) {
  if (screenId === 'today') return canAccessModule(role, 'today')
  if (screenId === 'reservations') return canAccessModule(role, 'reservations')
  if (screenId === 'reservations:hours') return canConfigureReservationSeatings(role)
  if (screenId === 'team:schedule') return canAccessTeamSection(role, 'schedule')
  if (screenId === 'team:members') return canAccessTeamSection(role, 'members')
  if (screenId === 'team:today') return canAccessTeamSection(role, 'today')
  if (screenId === 'chat') return canUseChat(role)
  if (screenId.startsWith('stock:')) {
    if (!canAccessModule(role, 'stock')) return false
    const section = screenId.slice('stock:'.length)
    if (!canManageStock(role) && section !== 'take' && section !== 'count') return false
    return true
  }
  if (screenId.startsWith('operations:')) return canAccessModule(role, 'operations')
  if (screenId === 'insights') return canAccessModule(role, 'insights')
  if (screenId.startsWith('settings:')) return canAccessModule(role, 'settings')
  if (screenId === 'my-week' || screenId === 'clock' || screenId === 'account' || screenId === 'notifications') {
    return isStaffOrHostRole(role)
  }
  if (screenId === 'time-clock') return canManageAttendance(role)
  return false
}

function step(id, targets, titleKey, bodyKey) {
  return { id, targets, titleKey, bodyKey }
}

function stockSteps(role, section) {
  const manage = canManageStock(role)
  if (section === 'dashboard' && manage) {
    return [step('stock-dashboard', ['stock.dashboard'], 'The stock home', 'The dashboard shows what is on hand, what is low, and what needs an order.')]
  }
  if (section === 'take') {
    return [
      step('stock-take', ['stock.take', 'stock.take-page', 'stock.more-sections'], 'Take from a storage', 'Open a storage, tap the product, set how many, and confirm. That quantity leaves the storage.'),
      step('stock-take-where', ['stock.take-storage', 'stock.take-page'], 'Choose the storage', 'Start with the storage you are taking from. Then pick the product and confirm.'),
    ]
  }
  if (section === 'count') {
    return manage
      ? [
        step('stock-count', ['stock.count', 'stock.count-page'], 'Inventory counts', 'Start a count, enter what is on the shelf, review the difference, then post the verified levels.'),
        step('stock-start-count', ['stock.start-count', 'stock.count'], 'Start the count', 'Press Start count. Choose the locations or products, then count them one by one.'),
      ]
      : [step('stock-count-staff', ['stock.count', 'stock.count-page'], 'Your counts', 'Open the count a manager started and enter what is on the shelf. A manager posts the result.')]
  }
  if (section === 'storages' && manage) {
    return [
      step('stock-storages', ['stock.storages', 'stock.storages-page'], 'Stock storages', 'Each storage is a place that holds products. Open one to receive a delivery, transfer to another storage, adjust a quantity, or record waste.'),
      step('stock-receive', ['stock.receive', 'stock.storages', 'stock.storages-page'], 'Receive a delivery', 'Open a storage and press Receive to add stock from a delivery. You can also receive a supplier order into a storage.'),
      step('stock-transfer', ['stock.transfer', 'stock.storages', 'stock.storages-page'], 'Transfer between storages', 'Open a storage, press Transfer, and choose the storage that should receive the product.'),
    ]
  }
  if (section === 'orders' && manage) {
    return [
      step('stock-orders', ['stock.orders'], 'Supplier orders', 'Create an order or use Suggest order. When the delivery arrives, receive it into a storage.'),
      step('stock-create-order', ['stock.create-order', 'stock.suggest', 'stock.orders'], 'Create the order', 'Press Create order and add the lines, or let Suggest order draft them from what is under par.'),
    ]
  }
  if (section === 'suppliers' && manage) {
    return [step('stock-suppliers', ['stock.suppliers', 'stock.add-supplier'], 'Your suppliers', 'Suppliers are who you buy from. Add one here before you order.')]
  }
  if (section === 'migration' && manage) {
    return [step('stock-import', ['stock.migration', 'stock.start-import'], 'Import products', 'Import brings products in from a spreadsheet. Review every row before it is saved.')]
  }
  return []
}

function screenSteps(role, screenId) {
  if (screenId === 'today') {
    return [
      step('today-home', ['today.home', 'nav.today', 'nav.home'], 'Today', 'Today is the home screen. It shows who is working, what is booked, and what needs attention.'),
      step('today-search', ['header.search'], 'Search this page', 'Search filters the lists and cards on this screen.'),
      step('today-menu', ['header.profile', 'nav.menu'], 'Your menu', 'Open your name for your profile, the tutorial, and sign out.'),
    ]
  }
  if (screenId === 'reservations') {
    return [
      step('res-list', ['reservations.list', 'nav.reservations'], 'The booking list', 'The list shows every booking for the day. The seating and the filters narrow it.'),
      step('res-floor', ['reservations.floor', 'reservations.zoom-in', 'reservations.fit', 'reservations.edit-layout'], 'The floor plan', 'The floor shows the tables. Zoom and fit change the map. Lock keeps it still. Edit layout moves tables, and Publish makes the floor live.'),
      step('res-add', ['reservations.add', 'reservations.walk-in'], 'Add a booking', 'Add starts a reservation. Walk-in is for a guest who is already here.'),
    ]
  }
  if (screenId === 'reservations:hours') {
    return [
      step('hours-day', ['hours.day'], 'Pick a day', 'Each day can have its own hours. Tap Monday through Sunday to edit that day.'),
      step('hours-open', ['hours.open'], 'Open or closed', 'Turn Open on for the days you serve. Turn it off and that seating is closed that day.'),
      step('hours-times', ['hours.times'], 'Start and end', 'Set when this seating starts and when it ends on the selected day.'),
      step('hours-last', ['hours.last'], 'Last arrival', 'Leave Last arrival blank and it is 30 minutes before the end. Guests booking online can only choose an arrival from the start through this time.'),
      step('hours-copy', ['hours.copy'], 'Copy to other days', 'Select the other days, then Copy hours. Those days get the same open, start, end, and last arrival.'),
      step('hours-save', ['hours.save'], 'Save the hours', 'Update seating saves this seating. The public booking page uses the saved hours for the chosen date.'),
    ]
  }
  if (screenId === 'team:schedule') {
    return [
      step('team-schedule', ['team.schedule', 'nav.team', 'nav.schedule'], 'The team schedule', 'The schedule is the week grid. Each cell is a shift. Open a cell to assign someone or change the time.'),
    ]
  }
  if (screenId === 'team:members') {
    return [step('team-people', ['team.members', 'nav.team'], 'People', 'People is the employee list: roles, contact details, and who can sign in.')]
  }
  if (screenId === 'team:today') {
    return [step('team-today', ['team.today', 'nav.team'], 'Team today', 'Team today shows who is on shift and who is late.')]
  }
  if (screenId === 'chat') {
    return [
      step('chat-home', ['nav.chat'], 'Team messages', 'Read the team chat. A badge means something is unread.'),
      step('chat-new', ['chat.new', 'chat.channel'], 'Start a chat', 'New chat messages one person. New channel is a group the team can join.'),
      step('chat-write', ['chat.message', 'chat.send', 'chat.search'], 'Write a message', 'Type in the box and send. You can add an emoji or a photo. Search finds an older conversation.'),
    ]
  }
  if (screenId.startsWith('stock:')) return stockSteps(role, screenId.slice('stock:'.length))
  if (screenId === 'operations:dashboard') {
    return [step('ops-home', ['operations.dashboard', 'nav.operations', 'nav.tasks'], 'Operations home', 'Operations home shows today\'s tasks and checklists in one place.')]
  }
  if (screenId === 'operations:tasks') {
    return [step('ops-tasks', ['operations.tasks', 'nav.operations', 'nav.tasks'], 'Task boards', 'Task boards are lists of work. Open a task to assign it or mark it done.')]
  }
  if (screenId === 'operations:checklists') {
    return [step('ops-checks', ['operations.checklists', 'nav.operations'], 'Checklists', 'Checklists are the steps of a service. Tick each item as it is done.')]
  }
  if (screenId === 'insights') {
    return [step('insights', ['nav.insights'], 'Insights', 'Insights are the reports for reservations, labour, and stock. Open a report to see the numbers.')]
  }
  if (screenId === 'settings:profile') {
    return [step('set-profile', ['settings.profile', 'setup.profile-name'], 'Business profile', 'The business profile is the venue name, time zone, and phone country. The schedule and the booking page use these.')]
  }
  if (screenId === 'settings:positions') {
    return [step('set-positions', ['settings.positions', 'setup.add-position'], 'Positions', 'Add the jobs you roster, such as Server or Cook, and set a department on each.')]
  }
  if (screenId === 'settings:venue') {
    return [step('set-venue', ['settings.venue'], 'Venue setup', 'Venue setup holds the rooms and service details that the rest of ONE reads.')]
  }
  if (screenId === 'settings:reservations') {
    return [step('set-seatings', ['settings.reservations', 'setup.add-seating'], 'Seatings', 'Add each service, for example Dinner 19:00 for 120 minutes, on the days you open.')]
  }
  if (screenId === 'settings:team') {
    return [step('set-team', ['settings.team'], 'Team settings', 'Team settings choose how roles and invites work for this venue.')]
  }
  if (screenId === 'settings:notifications') {
    return [step('set-alerts', ['settings.notifications'], 'Notification settings', 'Notification settings choose which alerts this venue sends.')]
  }
  if (screenId === 'settings:system') {
    return [step('set-system', ['settings.system', 'tutorial.settings'], 'System', 'System shows the app version and whether each module has live data. The tutorial controls are here.')]
  }
  if (screenId === 'settings:privacy') {
    return [step('set-privacy', ['settings.privacy'], 'Privacy', 'Privacy is where personal data requests and retention are handled.')]
  }
  if (screenId === 'settings:online') {
    return [step('set-online', ['settings.online'], 'Online reservations', 'Online reservations is the public booking link, the limits, and how a request is confirmed.')]
  }
  if (screenId === 'my-week') {
    return [step('my-week', ['nav.my-week', 'nav.schedule'], 'Your scheduled week', 'This is the week you are scheduled to work.')]
  }
  if (screenId === 'clock') {
    return [step('clock', ['timeclock.clock-in', 'timeclock.break', 'timeclock.clock-out', 'staff.clock'], 'Clock in and out', 'Clock in when you arrive. Break pauses the shift. Clock out when you leave.')]
  }
  if (screenId === 'account') {
    return [step('account', ['staff.profile', 'header.profile', 'nav.menu'], 'Your profile', 'Your name, contact details, and sign out are here.')]
  }
  if (screenId === 'notifications') {
    return [step('notes', ['header.notifications'], 'Notifications', 'Notifications are the alerts for this phone, such as a shift reminder.')]
  }
  if (screenId === 'time-clock') {
    return [step('time-clock', ['nav.time-clock', 'timeclock.clock-in'], 'Time clock', 'The time clock shows who is in, who is late, and the hours for today.')]
  }
  return []
}

export function screenGuide(role, screenId) {
  const id = `${screenId ?? ''}`.trim()
  if (!id || !allowScreen(role, id)) return null
  const steps = screenSteps(role, id)
  if (!steps.length) return null
  return { id, steps }
}

export function tutorialScreenId({
  view = '',
  teamSection = '',
  stockSection = '',
  operationsSection = '',
  settingsSection = '',
  mobile = false,
  mobileTab = '',
  seatingHours = false,
} = {}) {
  if (seatingHours) return 'reservations:hours'
  if (view === 'my-week' || view === 'clock' || view === 'account' || view === 'notifications') return view
  if (mobile && mobileTab) {
    if (mobileTab === 'home' || mobileTab === 'today') return 'today'
    if (mobileTab === 'schedule' || mobileTab === 'availability') {
      return view === 'team' ? `team:${teamSection || 'schedule'}` : 'my-week'
    }
    if (mobileTab === 'chat') return 'chat'
    if (mobileTab === 'tasks') return `operations:${operationsSection || 'dashboard'}`
    if (mobileTab === 'stock') return `stock:${stockSection || 'take'}`
    if (mobileTab === 'reservations') return 'reservations'
    if (mobileTab === 'menu') return 'account'
  }
  if (view === 'team') return `team:${teamSection || 'schedule'}`
  if (view === 'stock') return `stock:${stockSection || 'dashboard'}`
  if (view === 'operations') return `operations:${operationsSection || 'dashboard'}`
  if (view === 'settings') return `settings:${settingsSection || 'profile'}`
  return `${view || ''}`
}

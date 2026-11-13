import { t } from '../i18n/i18n'
/**
 * How-to articles for the in-app assistant. Steps describe what ONE actually
 * does. Owner-only billing stays on audience "managers".
 */

export const HELP_ARTICLES = [
  {
    id: 'today',
    audience: 'everyone',
    screen: { view: 'today' },
    title: { en: t("Use Today"), el: 'Η οθόνη Σήμερα' },
    summary: {
      en: t("Today is the home screen: who is on shift, what is booked, and what needs attention."),
      el: 'Η Σήμερα είναι η αρχική οθόνη: βάρδιες, κρατήσεις και ό,τι θέλει προσοχή.',
    },
    keywords: ['today', 'home', 'dashboard', 'on shift', 'σημερα', 'αρχικη'],
    questions: {
      en: ['What is the Today screen?', 'How do I see who is working?'],
      el: ['Τι είναι η οθόνη Σήμερα;'],
    },
    steps: {
      en: [
        'Open Today from the sidebar or the bottom tab.',
        'Read the status line under the greeting. It summarises the service.',
        'Use the chips for schedule, who is on shift, reservations, and tasks.',
        'The clock card on Today is where you clock in and out.',
      ],
      el: [
        'Άνοιξε τη Σήμερα από το μενού ή την κάτω μπάρα.',
        'Διάβασε τη γραμμή κατάστασης κάτω από τον χαιρετισμό.',
        'Οι κάρτες δείχνουν πρόγραμμα, βάρδια, κρατήσεις και εργασίες.',
        'Η κάρτα ρολογιού είναι για clock in και clock out.',
      ],
    },
  },
  {
    id: 'reservation-new',
    audience: 'everyone',
    screen: { view: 'reservations' },
    title: { en: t("Make a reservation"), el: 'Νέα κράτηση' },
    summary: {
      en: t("Add a booking with a name, party size, time, and phone."),
      el: 'Νέα κράτηση με όνομα, άτομα, ώρα και τηλέφωνο.',
    },
    keywords: ['reservation', 'booking', 'book a table', 'new reservation', 'κρατηση'],
    questions: {
      en: ['How do I make a reservation?', 'How do I book a table?'],
      el: ['Πώς κάνω κράτηση;'],
    },
    steps: {
      en: [
        'Open Reservations.',
        'Tap New reservation.',
        'Enter the guest name, phone, party size, date, and time.',
        'Pick a table if you already know it. You can assign one later from the floor.',
        'Save. The booking appears on that day and seating.',
      ],
      el: [
        'Άνοιξε τις Κρατήσεις.',
        'Πάτα Νέα κράτηση.',
        'Συμπλήρωσε όνομα, τηλέφωνο, άτομα, ημερομηνία και ώρα.',
        'Διάλεξε τραπέζι αν το ξέρεις. Μπορείς να το βάλεις και μετά από την κάτοψη.',
        'Αποθήκευσε. Η κράτηση φαίνεται σε εκείνη την ημέρα και το seating.',
      ],
    },
  },
  {
    id: 'walk-in',
    audience: 'everyone',
    screen: { view: 'reservations' },
    title: { en: t("Add a walk-in"), el: 'Walk-in' },
    summary: {
      en: t("Seat a guest who arrived without a booking."),
      el: 'Για επισκέπτη που ήρθε χωρίς κράτηση.',
    },
    keywords: ['walk-in', 'walk in', 'walkin', 'no reservation', 'χωρις κρατηση'],
    questions: {
      en: ['How do I add a walk-in?', 'How do I seat someone without a reservation?'],
      el: ['Πώς προσθέτω walk-in;'],
    },
    steps: {
      en: [
        'Open Reservations.',
        'Tap Walk-in.',
        'Enter the name, party size, and phone.',
        'Choose a free table if you are seating them now.',
        'Save. The walk-in is listed with the other bookings for today.',
      ],
      el: [
        'Άνοιξε τις Κρατήσεις.',
        'Πάτα Walk-in.',
        'Βάλε όνομα, άτομα και τηλέφωνο.',
        'Διάλεξε ελεύθερο τραπέζι αν κάθεται τώρα.',
        'Αποθήκευσε. Το walk-in μπαίνει στη λίστα της ημέρας.',
      ],
    },
  },
  {
    id: 'floor-plan',
    audience: 'everyone',
    screen: { view: 'reservations' },
    title: { en: t("Use the floor plan"), el: 'Κάτοψη' },
    summary: {
      en: t("See tables for the day and open a table’s bookings."),
      el: 'Δες τα τραπέζια της ημέρας και τις κρατήσεις τους.',
    },
    keywords: ['floor', 'table', 'tables', 'κατοψη', 'τραπεζι'],
    questions: {
      en: ['How do I use the floor plan?', 'How do I see bookings for a table?'],
      el: ['Πώς βλέπω τις κρατήσεις ενός τραπεζιού;'],
    },
    steps: {
      en: [
        'Open Reservations and stay on the floor for the selected day.',
        'Switch area if the venue has more than one room.',
        'Tap a table. ONE opens that table’s bookings for the day.',
        'From a booking, open it to change the time, party, or table.',
      ],
      el: [
        'Άνοιξε τις Κρατήσεις και μείνε στην κάτοψη της ημέρας.',
        'Άλλαξε χώρο αν υπάρχουν περισσότεροι.',
        'Πάτα ένα τραπέζι για τις κρατήσεις του εκείνη την ημέρα.',
        'Άνοιξε μια κράτηση για ώρα, άτομα ή τραπέζι.',
      ],
    },
  },
  {
    id: 'guest-history',
    audience: 'everyone',
    screen: { view: 'reservations' },
    title: { en: t("Guest history and blacklist"), el: 'Ιστορικό επισκέπτη' },
    summary: {
      en: t("ONE remembers a guest by phone number, including visits and a blacklist."),
      el: 'Το ONE θυμάται τον επισκέπτη από το τηλέφωνο, με επισκέψεις και blacklist.',
    },
    keywords: ['guest', 'guest history', 'blacklist', 'phone', 'visits', 'επισκεπτης', 'τηλεφωνο'],
    questions: {
      en: ['How do I see a guest’s history?', 'How does the blacklist work?'],
      el: ['Πώς βλέπω το ιστορικό επισκέπτη;'],
    },
    steps: {
      en: [
        'Open Reservations and open Guests, or start a reservation and enter the phone.',
        'ONE matches the phone to past bookings at this venue.',
        'The card shows visits, no-shows, and cancellations.',
        'A blacklisted guest is blocked for hosts and staff. An owner, general manager, or manager can override that and still book.',
      ],
      el: [
        'Άνοιξε τις Κρατήσεις και τους Επισκέπτες, ή γράψε το τηλέφωνο σε νέα κράτηση.',
        'Το ONE ταιριάζει το τηλέφωνο με παλιές κρατήσεις.',
        'Η κάρτα δείχνει επισκέψεις, no-show και ακυρώσεις.',
        'Το blacklist σταματά host και staff. Ιδιοκτήτης ή manager μπορεί να προχωρήσει την κράτηση.',
      ],
    },
  },
  {
    id: 'seatings',
    audience: 'managers',
    screen: { view: 'settings', settingsSection: 'reservations' },
    title: { en: t("Edit seatings"), el: 'Seatings' },
    summary: {
      en: t("Seatings are the service periods for a day, such as lunch and dinner."),
      el: 'Τα seatings είναι οι περίοδοι της ημέρας, όπως μεσημέρι και βράδυ.',
    },
    keywords: ['seating', 'seatings', 'service period', 'lunch', 'dinner', 'hours'],
    questions: {
      en: ['How do I edit seatings?', 'How do I change lunch and dinner hours?'],
      el: ['Πώς αλλάζω τις ώρες σερβιρίσματος;'],
    },
    steps: {
      en: [
        'Open Settings.',
        'Open Reservations (Seatings).',
        'Edit the name and hours of a seating, or add one.',
        'Save. Reservations for that day follow the seating you pick.',
      ],
      el: [
        'Άνοιξε τις Ρυθμίσεις.',
        'Άνοιξε Κρατήσεις (Seatings).',
        'Άλλαξε όνομα και ώρες ή πρόσθεσε seating.',
        'Αποθήκευσε. Οι κρατήσεις ακολουθούν το seating που διαλέγεις.',
      ],
    },
  },
  {
    id: 'schedule-assign',
    audience: 'managers',
    screen: { view: 'team', teamSection: 'schedule' },
    title: { en: t("Assign a shift"), el: 'Ανάθεση βάρδιας' },
    summary: {
      en: t("Put an employee on the weekly schedule."),
      el: 'Βάλε έναν υπάλληλο στο εβδομαδιαίο πρόγραμμα.',
    },
    keywords: ['schedule', 'shift', 'assign', 'roster', 'employee', 'προγραμμα', 'βαρδια'],
    questions: {
      en: ['How do I assign an employee to a shift?', 'How do I build the weekly schedule?'],
      el: ['Πώς αναθέτω βάρδια;'],
    },
    steps: {
      en: [
        'Open Team, then Schedule.',
        'Move to the week you want.',
        'Tap an empty cell or an existing shift.',
        'Choose the employee, role, and times, then save.',
        'Publish the week when the team should see it. Until then, only managers see the draft.',
      ],
      el: [
        'Άνοιξε Ομάδα και μετά Πρόγραμμα.',
        'Πήγαινε στην εβδομάδα.',
        'Πάτα κενό κελί ή υπάρχουσα βάρδια.',
        'Διάλεξε υπάλληλο, ρόλο και ώρες και αποθήκευσε.',
        'Κάνε δημοσίευση όταν πρέπει να το δει η ομάδα. Πριν, το βλέπουν μόνο οι managers.',
      ],
    },
  },
  {
    id: 'availability',
    audience: 'everyone',
    screen: { view: 'team', teamSection: 'schedule' },
    title: { en: t("Staff availability"), el: 'Διαθεσιμότητα' },
    summary: {
      en: t("Availability shows which days a person can work. Managers use it when assigning shifts."),
      el: 'Η διαθεσιμότητα δείχνει ποιες μέρες μπορεί να δουλέψει κάποιος.',
    },
    keywords: ['availability', 'available', 'day off', 'cannot work', 'διαθεσιμοτητα'],
    questions: {
      en: ['How does staff availability work?', 'How do I see who can work?'],
      el: ['Πώς δουλεύει η διαθεσιμότητα;'],
    },
    steps: {
      en: [
        'Open Team, then Schedule.',
        'When you assign a shift, ONE marks people against their availability.',
        'Use the availability filters to hide people who cannot work that day.',
        'Staff update their own days from their schedule when that screen is open for them.',
      ],
      el: [
        'Άνοιξε Ομάδα και Πρόγραμμα.',
        'Στην ανάθεση, το ONE δείχνει τη διαθεσιμότητα.',
        'Τα φίλτρα κρύβουν όσους δεν μπορούν εκείνη την ημέρα.',
        'Το προσωπικό ενημερώνει τις δικές του μέρες από το πρόγραμμά του.',
      ],
    },
  },
  {
    id: 'clock',
    audience: 'everyone',
    screen: { view: 'today' },
    title: { en: t("Clock in and out"), el: t("Clock in και out") },
    summary: {
      en: t("Clock in when you start and clock out when you finish. The card is on Today."),
      el: t("Clock in στην αρχή και clock out στο τέλος. Η κάρτα είναι στη Σήμερα."),
    },
    keywords: ['clock', 'clock in', 'clock out', 'clock-in', 'time clock', 'ρολοι'],
    questions: {
      en: ['How do I clock in?', 'How do I clock out?'],
      el: ['Πώς κάνω clock in;'],
    },
    steps: {
      en: [
        'Open Today.',
        'Find the clock card. It shows today’s shift when you have one.',
        'Tap Clock in at the start of the shift.',
        'Tap Clock out when you finish. Break starts and ends from the same card.',
        'If the venue asks for location, allow it or send a note to a manager.',
      ],
      el: [
        'Άνοιξε τη Σήμερα.',
        'Βρες την κάρτα ρολογιού. Δείχνει τη βάρδια αν έχεις.',
        'Πάτα Clock in στην αρχή.',
        'Πάτα Clock out στο τέλος. Το διάλειμμα είναι στην ίδια κάρτα.',
        'Αν ζητηθεί τοποθεσία, επέτρεψέ την ή στείλε σημείωμα σε manager.',
      ],
    },
  },
  {
    id: 'tasks',
    audience: 'everyone',
    screen: { view: 'operations' },
    title: { en: 'Tasks', el: 'Εργασίες' },
    summary: {
      en: t("Tasks and checklists live in Operations."),
      el: 'Οι εργασίες και οι λίστες είναι στις Λειτουργίες.',
    },
    keywords: ['task', 'tasks', 'checklist', 'operations', 'to do', 'εργασιες'],
    questions: {
      en: ['How do I complete a task?', 'Where are checklists?'],
      el: ['Πού είναι οι εργασίες;'],
    },
    steps: {
      en: [
        'Open Operations.',
        'Today lists open tasks. Boards and checklists are the other sections.',
        'Open a task and mark it done when the work is finished.',
        'Owners and managers can add tasks. Staff complete the ones assigned to the shift.',
      ],
      el: [
        'Άνοιξε τις Λειτουργίες.',
        'Η Σήμερα έχει τις ανοιχτές εργασίες. Οι λίστες είναι σε άλλη ενότητα.',
        'Άνοιξε μια εργασία και μάρκαρέ την όταν τελειώσει.',
        'Ιδιοκτήτες και managers προσθέτουν εργασίες. Το προσωπικό κλείνει όσες του ανατέθηκαν.',
      ],
    },
  },
  {
    id: 'stock-orders',
    audience: 'managers',
    screen: { view: 'stock', stockSection: 'orders' },
    title: { en: t("Order from a supplier"), el: 'Παραγγελία προμηθευτή' },
    summary: {
      en: t("Supplier orders are created in Stock and marked received when the delivery arrives."),
      el: 'Οι παραγγελίες προμηθευτών γίνονται στο Stock και κλείνουν όταν έρθει η παράδοση.',
    },
    keywords: ['stock', 'order', 'supplier', 'purchase', 'delivery', 'προμηθευτης', 'παραγγελια'],
    questions: {
      en: ['How do I order from a supplier?', 'How do I receive a delivery?'],
      el: ['Πώς παραγγέλνω από προμηθευτή;'],
    },
    steps: {
      en: [
        'Open Stock, then Orders.',
        'Create an order and choose the supplier and the items.',
        'Send it when it is ready.',
        'When the goods arrive, open the order and receive it. Stock quantities update from the received lines.',
      ],
      el: [
        'Άνοιξε Stock και μετά Παραγγελίες.',
        'Φτιάξε παραγγελία με προμηθευτή και είδη.',
        'Στείλε την όταν είναι έτοιμη.',
        'Όταν έρθει η παράδοση, άνοιξε την παραγγελία και κάνε παραλαβή. Οι ποσότητες ενημερώνονται.',
      ],
    },
  },
  {
    id: 'stock-invoice',
    audience: 'managers',
    screen: { view: 'stock', stockSection: 'orders' },
    title: { en: t("Add a supplier invoice"), el: 'Τιμολόγιο προμηθευτή' },
    summary: {
      en: t("Attach a photo or file of the invoice to the supplier order."),
      el: 'Βάλε φωτογραφία ή αρχείο του τιμολογίου στην παραγγελία.',
    },
    keywords: ['invoice', 'bill', 'receipt', 'scan', 'camera', 'τιμολογιο'],
    questions: {
      en: ['How do I add an invoice to an order?', 'How do I photograph a supplier invoice?'],
      el: ['Πώς προσθέτω τιμολόγιο;'],
    },
    steps: {
      en: [
        'Open Stock, then Orders, and open the supplier order.',
        'In the invoice section, tap Add invoice.',
        'Take a photo or choose an image or PDF. You can add more than one file.',
        'ONE stores the file on the order. If invoice scanning is not connected, the file is still kept and you can read it yourself.',
        'Received orders can show a badge when an invoice is attached.',
      ],
      el: [
        'Άνοιξε Stock, Παραγγελίες, και την παραγγελία.',
        'Στο τιμολόγιο πάτα Προσθήκη.',
        'Βγάλε φωτογραφία ή διάλεξε εικόνα ή PDF.',
        'Το αρχείο μένει στην παραγγελία. Αν δεν υπάρχει σάρωση, το αρχείο πάλι φυλάσσεται.',
        'Η παραλαβή μπορεί να δείξει σήμα όταν υπάρχει τιμολόγιο.',
      ],
    },
  },
  {
    id: 'chat',
    audience: 'everyone',
    screen: { view: 'chat' },
    title: { en: t("Chat with the team"), el: 'Συνομιλίες' },
    summary: {
      en: t("Chat is for direct messages and channels. Unread chats show a badge."),
      el: 'Το Chat είναι για προσωπικά μηνύματα και κανάλια. Τα αδιάβαστα έχουν σήμα.',
    },
    keywords: ['chat', 'message', 'channel', 'unread', 'μηνυμα', 'συνομιλια'],
    questions: {
      en: ['How do I message the team?', 'How do I start a chat?'],
      el: ['Πώς στέλνω μήνυμα στην ομάδα;'],
    },
    steps: {
      en: [
        'Open Chat.',
        'Tap New chat for a person, or New channel if you manage chat.',
        'Type in the box and send. You can attach a photo.',
        'Some channels are limited so only managers can post.',
      ],
      el: [
        'Άνοιξε το Chat.',
        'Πάτα Νέα συνομιλία ή, αν διαχειρίζεσαι το chat, Νέο κανάλι.',
        'Γράψε και στείλε. Μπορείς να βάλεις φωτογραφία.',
        'Σε κάποια κανάλια γράφουν μόνο managers.',
      ],
    },
  },
  {
    id: 'insights',
    audience: 'managers',
    screen: { view: 'insights' },
    title: { en: t("Read Insights"), el: 'Αναφορές' },
    summary: {
      en: t("Insights shows reports for reservations, labour, and stock."),
      el: 'Οι Αναφορές δείχνουν κρατήσεις, εργασία και stock.',
    },
    keywords: ['insights', 'reports', 'analytics', 'labour', 'αναφορες'],
    questions: {
      en: ['Where are the reports?', 'How do I see labour or reservation reports?'],
      el: ['Πού είναι οι αναφορές;'],
    },
    steps: {
      en: [
        'Open Insights.',
        'Pick the report: reservations, labour, or stock.',
        'Change the dates if you need another period.',
        'The numbers come from the bookings, clock entries, and stock movements already in ONE.',
      ],
      el: [
        'Άνοιξε τις Αναφορές.',
        'Διάλεξε κρατήσεις, εργασία ή stock.',
        'Άλλαξε τις ημερομηνίες αν θέλεις άλλη περίοδο.',
        'Οι αριθμοί βγαίνουν από κρατήσεις, clock και κινήσεις stock.',
      ],
    },
  },
  {
    id: 'settings',
    audience: 'managers',
    screen: { view: 'settings', settingsSection: 'profile' },
    title: { en: t("Change venue settings"), el: 'Ρυθμίσεις' },
    summary: {
      en: t("Settings holds the venue profile, positions, seatings, and notifications."),
      el: 'Οι Ρυθμίσεις έχουν προφίλ, θέσεις, seatings και ειδοποιήσεις.',
    },
    keywords: ['settings', 'venue name', 'notifications', 'positions', 'ρυθμισεις'],
    questions: {
      en: ['How do I change the venue name?', 'Where are notification settings?'],
      el: ['Πώς αλλάζω το όνομα του καταστήματος;'],
    },
    steps: {
      en: [
        'Open Settings.',
        'Business Profile changes the venue name and the details the team sees.',
        'Positions are the job titles used on the schedule.',
        'Notifications chooses alerts and quiet hours.',
        'Reservations in Settings is where seatings are edited.',
      ],
      el: [
        'Άνοιξε τις Ρυθμίσεις.',
        'Το προφίλ αλλάζει το όνομα και τα στοιχεία που βλέπει η ομάδα.',
        'Οι θέσεις είναι οι τίτλοι δουλειάς στο πρόγραμμα.',
        'Οι ειδοποιήσεις ορίζουν alerts και ώρες ησυχίας.',
        'Οι Κρατήσεις στις Ρυθμίσεις είναι τα seatings.',
      ],
    },
  },
  {
    id: 'roles',
    audience: 'everyone',
    title: { en: t("Roles in ONE"), el: 'Ρόλοι' },
    summary: {
      en: t("Owner, general manager, and manager run the venue. Hosts and staff use the service screens."),
      el: 'Ιδιοκτήτης και managers τρέχουν το κατάστημα. Host και staff δουλεύουν στη βάρδια.',
    },
    keywords: ['role', 'roles', 'owner', 'manager', 'host', 'staff', 'permission', 'ρολος'],
    questions: {
      en: ['What can each role do?', 'Why can’t I see a screen?'],
      el: ['Τι μπορεί να κάνει κάθε ρόλος;'],
    },
    steps: {
      en: [
        'Owner, general manager, and manager can change settings, the schedule, supplier orders, and billing.',
        'Hosts run reservations: bookings, walk-ins, and the floor. They cannot override a blacklist.',
        'Staff see their shift, clock, tasks, and chat. They do not see Plans & billing or the grace banner.',
        'If a screen is missing, the role does not include it. Ask an owner or manager.',
      ],
      el: [
        'Ιδιοκτήτης και managers αλλάζουν ρυθμίσεις, πρόγραμμα, παραγγελίες και χρέωση.',
        'Οι hosts κάνουν κρατήσεις, walk-in και κάτοψη. Δεν παρακάμπτουν blacklist.',
        'Το staff βλέπει βάρδια, clock, εργασίες και chat. Όχι πλάνα ή grace banner.',
        'Αν λείπει μια οθόνη, ο ρόλος δεν την έχει. Ρώτα ιδιοκτήτη ή manager.',
      ],
    },
  },
  {
    id: 'billing-plans',
    audience: 'managers',
    screen: { view: 'settings', settingsSection: 'billing' },
    title: { en: t("Choose a plan"), el: 'Επιλογή πλάνου' },
    summary: {
      en: t("Start, Pro, and Group are billed per venue. A new Start or Pro venue can have one free month."),
      el: t("Start, Pro και Group χρεώνονται ανά κατάστημα. Νέο Start ή Pro μπορεί να έχει έναν δωρεάν μήνα."),
    },
    keywords: ['plan', 'plans', 'billing', 'subscription', 'price', 'free month', 'start', 'pro', 'group', 'πλανο', 'χρεωση'],
    questions: {
      en: ['How do I choose a plan?', 'Who gets a free month?'],
      el: ['Πώς διαλέγω πλάνο;', 'Ποιος έχει δωρεάν μήνα;'],
    },
    steps: {
      en: [
        'Plans & billing is for owners, general managers, and managers. It appears in Settings when subscriptions are turned on for the venue.',
        'Start is one venue. Pro includes one venue and can add more, up to three. Group includes five venues and more after that.',
        'Prices are per venue and exclude VAT. Periods are monthly, 3 months, 6 months, and yearly. Longer periods cost less per month.',
        'A new Start or Pro venue that has not had a trial yet gets one free month. Group does not. The free month is not offered again after the trial has started or ended.',
        'Open Settings, then Plans & billing, pick a period and a plan, and continue to pay.',
      ],
      el: [
        'Τα πλάνα είναι για ιδιοκτήτη και managers, στις Ρυθμίσεις όταν οι συνδρομές είναι ανοιχτές.',
        'Το Start είναι ένα κατάστημα. Το Pro μέχρι τρία. Το Group περιλαμβάνει πέντε και μετά επιπλέον.',
        'Οι τιμές είναι ανά κατάστημα χωρίς ΦΠΑ. Υπάρχει μήνας, 3 μήνες, 6 μήνες και έτος.',
        'Νέο Start ή Pro χωρίς δοκιμή έχει έναν δωρεάν μήνα. Το Group όχι. Μετά την έναρξη της δοκιμής δεν ξαναεμφανίζεται.',
        'Ρυθμίσεις, Plans & billing, διάλεξε περίοδο και πλάνο.',
      ],
    },
  },
  {
    id: 'billing-grace',
    audience: 'managers',
    screen: { view: 'settings', settingsSection: 'billing' },
    title: { en: t("Grace period"), el: 'Περίοδος χάριτος' },
    summary: {
      en: t("After the free month or a failed payment, the venue keeps working for 7 days."),
      el: 'Μετά τον δωρεάν μήνα ή μια αποτυχημένη πληρωμή, το κατάστημα δουλεύει για 7 μέρες.',
    },
    keywords: ['grace', 'grace period', 'payment failed', '7 days', 'banner', 'χαρητος'],
    questions: {
      en: ['What happens when the free month ends?', 'What if a payment fails?'],
      el: ['Τι γίνεται όταν τελειώσει ο δωρεάν μήνας;'],
    },
    steps: {
      en: [
        'When the free month ends, or a renewal payment fails, ONE stays fully usable for 7 days.',
        'Owners, general managers, and managers see a banner with the days left and a button to choose a plan or update payment.',
        'Hosts and staff do not see that banner.',
        'A successful payment during those 7 days clears the banner immediately.',
        'The 7 days are one setting. They are not extended by opening the app.',
      ],
      el: [
        'Όταν τελειώσει ο δωρεάν μήνας ή αποτύχει μια πληρωμή, το ONE μένει ανοιχτό για 7 μέρες.',
        'Ιδιοκτήτης και managers βλέπουν banner με τις μέρες που μένουν.',
        'Host και staff δεν βλέπουν το banner.',
        'Επιτυχής πληρωμή μέσα στις 7 μέρες το καθαρίζει αμέσως.',
      ],
    },
  },
  {
    id: 'billing-lock',
    audience: 'managers',
    screen: { view: 'settings', settingsSection: 'billing' },
    title: { en: t("When ONE is paused"), el: 'Όταν το ONE σταματά' },
    summary: {
      en: t("After the 7-day grace, managers must choose a plan. Data is kept."),
      el: 'Μετά τις 7 μέρες, οι managers διαλέγουν πλάνο. Τα δεδομένα μένουν.',
    },
    keywords: ['paused', 'locked', 'lock', 'paywall', 'subscription ended'],
    questions: {
      en: ['Why is the venue paused?', 'What happens after the grace period?'],
      el: ['Γιατί είναι σε παύση το κατάστημα;'],
    },
    steps: {
      en: [
        'On the 7th day after the free month or a failed payment, the venue pauses.',
        'Owners, general managers, and managers see a screen to choose a plan. Sign out stays available.',
        'Hosts and staff see a short note to ask their manager. They do not see prices.',
        'Bookings, stock, and the schedule stay in ONE. Paying opens the venue again.',
        'Demo and complimentary venues that are marked free do not pause.',
      ],
      el: [
        'Την 7η μέρα μετά τον δωρεάν μήνα ή μια αποτυχημένη πληρωμή, το κατάστημα σταματά.',
        'Ιδιοκτήτης και managers βλέπουν οθόνη επιλογής πλάνου. Η αποσύνδεση μένει.',
        'Host και staff βλέπουν μόνο να ρωτήσουν τον manager, χωρίς τιμές.',
        'Κρατήσεις, stock και πρόγραμμα μένουν. Η πληρωμή το ξανανοίγει.',
        'Τα demo καταστήματα που είναι δωρεάν δεν σταματούν.',
      ],
    },
  },
  {
    id: 'billing-staff',
    audience: 'everyone',
    title: { en: t("If the app asks you to wait"), el: 'Αν η εφαρμογή ζητά αναμονή' },
    summary: {
      en: t("Hosts and staff do not manage the plan. If ONE is paused, ask a manager."),
      el: t("Host και staff δεν διαχειρίζονται το πλάνο. Αν σταματήσει, ρώτα έναν manager."),
    },
    keywords: ['paused', 'locked', 'ask your manager', 'subscription', 'plan', 'billing'],
    questions: {
      en: ['Why can’t I keep working?', 'Who do I ask if ONE is paused?'],
      el: ['Ποιον ρωτάω αν το ONE σταματήσει;'],
    },
    steps: {
      en: [
        'Hosts and staff do not see prices or Plans & billing.',
        'If a screen says the venue’s subscription needs renewing, ask an owner or manager.',
        'Your bookings and other work are kept. You do not need to re-enter them.',
        'Sign out is still available.',
      ],
      el: [
        'Host και staff δεν βλέπουν τιμές ή πλάνα.',
        'Αν μια οθόνη λέει ότι η συνδρομή θέλει ανανέωση, ρώτα ιδιοκτήτη ή manager.',
        'Οι κρατήσεις και η δουλειά μένουν.',
        'Η αποσύνδεση είναι διαθέσιμη.',
      ],
    },
  },
]

export function helpText(field, locale) {
  if (!field) return ''
  if (typeof field === 'string') return field
  return field[locale] || field.en || ''
}

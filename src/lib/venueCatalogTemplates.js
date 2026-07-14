import {
  findMatchingDepartment,
  findMatchingPosition,
  normalizeDepartmentKey,
  normalizePositionKey,
} from './departmentCatalogUtils'

const ALL_VENUE_TYPE_KEYS = Object.freeze([
  'restaurant',
  'bar',
  'cafe',
  'bistro',
  'nightclub',
  'beach_club',
  'hotel',
  'resort',
  'hotel_fb',
  'event_venue',
  'bakery',
  'fast_casual',
])

const FNB_VENUES = Object.freeze([
  'restaurant', 'bar', 'cafe', 'bistro', 'nightclub', 'beach_club',
  'hotel', 'resort', 'hotel_fb', 'event_venue', 'fast_casual',
])

const HOSPITALITY_VENUES = Object.freeze(['hotel', 'resort', 'beach_club', 'hotel_fb', 'event_venue'])

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value
  Object.freeze(value)
  for (const item of Object.values(value)) {
    if (item && typeof item === 'object' && !Object.isFrozen(item)) {
      deepFreeze(item)
    }
  }
  return value
}

function defineVenueType(entry) {
  return deepFreeze({
    description: '',
    ...entry,
    aliases: Object.freeze([...(entry.aliases ?? [])]),
    departmentKeys: Object.freeze([...(entry.departmentKeys ?? [])]),
  })
}

function defineDepartment(entry) {
  return deepFreeze({
    description: '',
    sortOrder: 0,
    ...entry,
    aliases: Object.freeze([...(entry.aliases ?? [])]),
    venueTypes: Object.freeze([...(entry.venueTypes ?? [])]),
  })
}

function definePosition(entry) {
  const defaultForVenueTypes = [...(entry.defaultForVenueTypes ?? [])]
  const optionalForVenueTypes = [...(entry.optionalForVenueTypes ?? [])]
    .filter((venueType) => !defaultForVenueTypes.includes(venueType))

  return deepFreeze({
    seniority: 2,
    sortOrder: 0,
    ...entry,
    aliases: Object.freeze([...(entry.aliases ?? [])]),
    venueTypes: Object.freeze([...(entry.venueTypes ?? [])]),
    defaultForVenueTypes: Object.freeze(defaultForVenueTypes),
    optionalForVenueTypes: Object.freeze(optionalForVenueTypes),
  })
}

function defineTemplate(entry) {
  return deepFreeze({
    ...entry,
    departmentKeys: Object.freeze([...(entry.departmentKeys ?? [])]),
    defaultPositionKeys: Object.freeze([...(entry.defaultPositionKeys ?? [])]),
    optionalPositionKeys: Object.freeze([...(entry.optionalPositionKeys ?? [])]),
    optionalDepartmentKeys: Object.freeze([...(entry.optionalDepartmentKeys ?? [])]),
  })
}

export const VENUE_TYPES = deepFreeze([
  defineVenueType({
    key: 'restaurant',
    label: 'Restaurant',
    description: 'Full-service restaurant operations.',
    departmentKeys: ['management', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house', 'host_reservations'],
  }),
  defineVenueType({
    key: 'bar',
    label: 'Bar / Cocktail Bar',
    description: 'Beverage-led bar or cocktail lounge.',
    aliases: ['Cocktail Bar', 'Lounge Bar', 'Pub'],
    departmentKeys: ['management', 'bar_beverage', 'service_front_of_house', 'host_reservations'],
  }),
  defineVenueType({
    key: 'cafe',
    label: 'Café',
    description: 'Coffee shop or café service.',
    aliases: ['Coffee Shop', 'Café Bar'],
    departmentKeys: ['management', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house'],
  }),
  defineVenueType({
    key: 'bistro',
    label: 'All-Day Bistro',
    description: 'All-day bistro with food and beverage service.',
    aliases: ['All Day', 'All-Day', 'Bistro'],
    departmentKeys: ['management', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house', 'host_reservations'],
  }),
  defineVenueType({
    key: 'nightclub',
    label: 'Nightclub',
    description: 'Late-night club operations.',
    aliases: ['Club', 'Night Club'],
    departmentKeys: ['management', 'bar_beverage', 'service_front_of_house', 'host_reservations', 'security'],
  }),
  defineVenueType({
    key: 'beach_club',
    label: 'Beach Club',
    description: 'Beach and pool club hospitality.',
    aliases: ['Beach Bar', 'Pool Club'],
    departmentKeys: ['management', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house', 'host_reservations', 'pool_beach', 'security'],
  }),
  defineVenueType({
    key: 'hotel',
    label: 'Hotel',
    description: 'Hotel property operations.',
    departmentKeys: ['management', 'reception_front_office', 'guest_relations', 'housekeeping', 'laundry', 'maintenance_engineering', 'security', 'purchasing_stores', 'finance_administration'],
  }),
  defineVenueType({
    key: 'resort',
    label: 'Resort',
    description: 'Resort property with extended departments.',
    departmentKeys: ['management', 'reception_front_office', 'guest_relations', 'housekeeping', 'laundry', 'maintenance_engineering', 'security', 'purchasing_stores', 'finance_administration', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house', 'events', 'spa_wellness', 'pool_beach'],
  }),
  defineVenueType({
    key: 'hotel_fb',
    label: 'Hotel Restaurant / F&B Outlet',
    description: 'Food and beverage outlet within a hotel.',
    aliases: ['Hotel F&B', 'Hotel Restaurant', 'F&B Outlet'],
    departmentKeys: ['management', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house', 'host_reservations'],
  }),
  defineVenueType({
    key: 'event_venue',
    label: 'Event Venue',
    description: 'Events-led venue operations.',
    departmentKeys: ['management', 'events', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house', 'security'],
  }),
  defineVenueType({
    key: 'bakery',
    label: 'Bakery / Pastry',
    description: 'Bakery and pastry production.',
    departmentKeys: ['management', 'production_pastry', 'service_front_of_house'],
  }),
  defineVenueType({
    key: 'fast_casual',
    label: 'Fast Casual / Quick Service',
    description: 'Counter-service and quick-service operations.',
    aliases: ['Quick Service', 'QSR', 'Fast Food'],
    departmentKeys: ['management', 'service_front_of_house', 'kitchen_back_of_house'],
  }),
])

export const DEPARTMENT_CATALOG = deepFreeze([
  defineDepartment({ key: 'management', label: 'Management', sortOrder: 1, venueTypes: ALL_VENUE_TYPE_KEYS, description: 'Leadership and management.' }),
  defineDepartment({ key: 'service_front_of_house', label: 'Service / Front of House', sortOrder: 2, venueTypes: FNB_VENUES, aliases: ['Service', 'Front of House', 'FOH', 'Restaurant Service'], description: 'Guest-facing service operations.' }),
  defineDepartment({ key: 'bar_beverage', label: 'Bar / Beverage', sortOrder: 3, venueTypes: [...FNB_VENUES, 'bakery'], aliases: ['Bar', 'Beverage', 'Drinks', 'Beverage Department'], description: 'Bar and beverage service.' }),
  defineDepartment({ key: 'kitchen_back_of_house', label: 'Kitchen / Back of House', sortOrder: 4, venueTypes: [...FNB_VENUES, 'bakery'], aliases: ['Kitchen', 'Back of House', 'BOH', 'Culinary'], description: 'Kitchen and culinary operations.' }),
  defineDepartment({ key: 'host_reservations', label: 'Host / Reservations', sortOrder: 5, venueTypes: ['restaurant', 'bar', 'bistro', 'nightclub', 'beach_club', 'hotel', 'resort', 'hotel_fb', 'event_venue'], aliases: ['Host', 'Reservations', 'Hosting'], description: 'Hosting and reservations.' }),
  defineDepartment({ key: 'reception_front_office', label: 'Reception / Front Office', sortOrder: 6, venueTypes: ['hotel', 'resort'], aliases: ['Reception', 'Front Office', 'Front Desk'], description: 'Front office and reception.' }),
  defineDepartment({ key: 'housekeeping', label: 'Housekeeping', sortOrder: 7, venueTypes: ['hotel', 'resort'], description: 'Housekeeping operations.' }),
  defineDepartment({ key: 'maintenance_engineering', label: 'Maintenance / Engineering', sortOrder: 8, venueTypes: ['hotel', 'resort', 'beach_club', 'nightclub', 'event_venue'], aliases: ['Maintenance', 'Engineering', 'Technical'], description: 'Maintenance and engineering.' }),
  defineDepartment({ key: 'security', label: 'Security', sortOrder: 9, venueTypes: ['nightclub', 'beach_club', 'hotel', 'resort', 'event_venue'], description: 'Security operations.' }),
  defineDepartment({ key: 'events', label: 'Events', sortOrder: 10, venueTypes: ['hotel', 'resort', 'event_venue', 'beach_club', 'nightclub', 'restaurant'], description: 'Events and banqueting.' }),
  defineDepartment({ key: 'spa_wellness', label: 'Spa / Wellness', sortOrder: 11, venueTypes: ['hotel', 'resort', 'beach_club'], description: 'Spa and wellness.' }),
  defineDepartment({ key: 'pool_beach', label: 'Pool / Beach', sortOrder: 12, venueTypes: ['beach_club', 'resort', 'hotel'], description: 'Pool and beach operations.' }),
  defineDepartment({ key: 'purchasing_stores', label: 'Purchasing / Stores', sortOrder: 13, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery'], aliases: ['Purchasing', 'Stores', 'Procurement', 'Warehouse'], description: 'Purchasing and stores.' }),
  defineDepartment({ key: 'finance_administration', label: 'Finance / Administration', sortOrder: 14, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery', 'fast_casual'], aliases: ['Finance', 'Administration', 'Admin', 'Accounting'], description: 'Finance and administration.' }),
  defineDepartment({ key: 'production_pastry', label: 'Production / Pastry', sortOrder: 15, venueTypes: ['bakery', 'hotel', 'resort', 'restaurant', 'cafe', 'bistro'], aliases: ['Bakery', 'Pastry', 'Production'], description: 'Bakery and pastry production.' }),
  defineDepartment({ key: 'delivery', label: 'Delivery', sortOrder: 16, venueTypes: ['restaurant', 'cafe', 'bistro', 'bakery', 'fast_casual'], description: 'Delivery operations.' }),
  defineDepartment({ key: 'guest_relations', label: 'Guest Relations', sortOrder: 17, venueTypes: HOSPITALITY_VENUES, description: 'Guest relations and experience.' }),
  defineDepartment({ key: 'laundry', label: 'Laundry', sortOrder: 18, venueTypes: ['hotel', 'resort', 'event_venue', 'beach_club'], description: 'Laundry operations.' }),
])

function pos(entry) {
  return definePosition(entry)
}

export const POSITION_CATALOG = deepFreeze([
  pos({ key: 'owner', label: 'Owner', departmentKey: 'management', seniority: 5, sortOrder: 1, venueTypes: ALL_VENUE_TYPE_KEYS, defaultForVenueTypes: [], optionalForVenueTypes: ALL_VENUE_TYPE_KEYS }),
  pos({ key: 'general_manager', label: 'General Manager', departmentKey: 'management', seniority: 5, sortOrder: 2, aliases: ['GM'], venueTypes: ALL_VENUE_TYPE_KEYS, defaultForVenueTypes: ['restaurant', 'bar', 'hotel', 'resort'], optionalForVenueTypes: ALL_VENUE_TYPE_KEYS }),
  pos({ key: 'operations_manager', label: 'Operations Manager', departmentKey: 'management', seniority: 5, sortOrder: 3, venueTypes: ALL_VENUE_TYPE_KEYS, defaultForVenueTypes: [], optionalForVenueTypes: ALL_VENUE_TYPE_KEYS }),
  pos({ key: 'hotel_manager', label: 'Hotel Manager', departmentKey: 'management', seniority: 5, sortOrder: 4, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: ['hotel'], optionalForVenueTypes: ['resort'] }),
  pos({ key: 'resort_manager', label: 'Resort Manager', departmentKey: 'management', seniority: 5, sortOrder: 5, venueTypes: ['resort'], defaultForVenueTypes: ['resort'], optionalForVenueTypes: [] }),
  pos({ key: 'venue_manager', label: 'Venue Manager', departmentKey: 'management', seniority: 5, sortOrder: 6, venueTypes: ['event_venue', 'nightclub', 'beach_club'], defaultForVenueTypes: [], optionalForVenueTypes: ['event_venue', 'nightclub', 'beach_club'] }),
  pos({ key: 'restaurant_manager', label: 'Restaurant Manager', departmentKey: 'management', seniority: 5, sortOrder: 7, venueTypes: ['restaurant', 'bistro', 'hotel_fb', 'cafe', 'fast_casual'], defaultForVenueTypes: ['restaurant', 'bistro', 'hotel_fb'], optionalForVenueTypes: ['cafe', 'fast_casual'] }),
  pos({ key: 'assistant_restaurant_manager', label: 'Assistant Restaurant Manager', departmentKey: 'management', seniority: 4, sortOrder: 8, venueTypes: ['restaurant', 'bistro', 'hotel_fb'], defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant', 'bistro', 'hotel_fb'] }),
  pos({ key: 'shift_manager', label: 'Shift Manager', departmentKey: 'management', seniority: 4, sortOrder: 9, venueTypes: FNB_VENUES, defaultForVenueTypes: ['restaurant', 'bar', 'bistro'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'duty_manager', label: 'Duty Manager', departmentKey: 'management', seniority: 4, sortOrder: 10, venueTypes: ALL_VENUE_TYPE_KEYS, defaultForVenueTypes: ['hotel', 'resort'], optionalForVenueTypes: ALL_VENUE_TYPE_KEYS }),
  pos({ key: 'supervisor', label: 'Supervisor', departmentKey: 'management', seniority: 3, sortOrder: 11, venueTypes: ALL_VENUE_TYPE_KEYS, defaultForVenueTypes: [], optionalForVenueTypes: ALL_VENUE_TYPE_KEYS }),
  pos({ key: 'human_resources_manager', label: 'Human Resources Manager', departmentKey: 'management', seniority: 5, sortOrder: 12, aliases: ['HR Manager', 'People Manager'], venueTypes: ALL_VENUE_TYPE_KEYS, defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort', 'restaurant'] }),

  pos({ key: 'food_runner', label: 'Food Runner', departmentKey: 'service_front_of_house', seniority: 1, sortOrder: 1, venueTypes: FNB_VENUES, defaultForVenueTypes: ['restaurant', 'bistro', 'hotel_fb', 'resort'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'drink_runner', label: 'Drink Runner', departmentKey: 'service_front_of_house', seniority: 1, sortOrder: 2, venueTypes: FNB_VENUES, defaultForVenueTypes: ['restaurant', 'bistro', 'hotel_fb'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'busser', label: 'Busser', departmentKey: 'service_front_of_house', seniority: 1, sortOrder: 3, aliases: ['Bus Boy', 'Table Clearer'], venueTypes: FNB_VENUES, defaultForVenueTypes: ['restaurant', 'bistro'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'waiter_server', label: 'Waiter / Server', departmentKey: 'service_front_of_house', seniority: 2, sortOrder: 4, aliases: ['Waiter', 'Server', 'Waitress'], venueTypes: FNB_VENUES, defaultForVenueTypes: ['restaurant', 'bistro', 'hotel_fb', 'cafe', 'fast_casual', 'resort'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'senior_waiter', label: 'Senior Waiter', departmentKey: 'service_front_of_house', seniority: 3, sortOrder: 5, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'captain', label: 'Captain', departmentKey: 'service_front_of_house', seniority: 3, sortOrder: 6, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant', 'hotel_fb', 'resort'] }),
  pos({ key: 'head_waiter', label: 'Head Waiter', departmentKey: 'service_front_of_house', seniority: 4, sortOrder: 7, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'cashier', label: 'Cashier', departmentKey: 'service_front_of_house', seniority: 2, sortOrder: 8, venueTypes: [...FNB_VENUES, 'bakery', 'fast_casual'], defaultForVenueTypes: ['cafe', 'fast_casual', 'bakery'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'service_supervisor', label: 'Service Supervisor', departmentKey: 'service_front_of_house', seniority: 4, sortOrder: 9, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'shift_supervisor', label: 'Shift Supervisor', departmentKey: 'service_front_of_house', seniority: 4, sortOrder: 10, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'maitre_d', label: 'Maître d\u2019', departmentKey: 'service_front_of_house', seniority: 4, sortOrder: 11, aliases: ["Maitre d'", 'Maitre D', 'Head of Service'], venueTypes: ['restaurant', 'bistro', 'hotel_fb', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant', 'hotel_fb', 'resort'] }),
  pos({ key: 'floor_supervisor', label: 'Service Floor Supervisor', departmentKey: 'service_front_of_house', seniority: 4, sortOrder: 12, aliases: ['Floor Supervisor'], venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: FNB_VENUES }),

  pos({ key: 'barback', label: 'Barback', departmentKey: 'bar_beverage', seniority: 1, sortOrder: 1, venueTypes: [...FNB_VENUES, 'bakery'], defaultForVenueTypes: ['restaurant', 'bar', 'bistro', 'nightclub', 'beach_club'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'junior_bartender', label: 'Junior Bartender', departmentKey: 'bar_beverage', seniority: 2, sortOrder: 2, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'bartender', label: 'Bartender', departmentKey: 'bar_beverage', seniority: 2, sortOrder: 3, venueTypes: FNB_VENUES, defaultForVenueTypes: ['restaurant', 'bar', 'bistro', 'nightclub', 'beach_club', 'resort'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'senior_bartender', label: 'Senior Bartender', departmentKey: 'bar_beverage', seniority: 3, sortOrder: 4, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'mixologist', label: 'Mixologist', departmentKey: 'bar_beverage', seniority: 3, sortOrder: 5, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: ['bar', 'restaurant', 'bistro', 'nightclub'] }),
  pos({ key: 'head_bartender', label: 'Head Bartender', departmentKey: 'bar_beverage', seniority: 4, sortOrder: 6, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'bar_supervisor', label: 'Bar Supervisor', departmentKey: 'bar_beverage', seniority: 4, sortOrder: 7, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'sommelier', label: 'Sommelier', departmentKey: 'bar_beverage', seniority: 3, sortOrder: 8, venueTypes: ['restaurant', 'hotel', 'resort', 'hotel_fb', 'bar', 'bistro'], defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant', 'hotel', 'resort', 'hotel_fb', 'bar', 'bistro'] }),
  pos({ key: 'bar_manager', label: 'Bar Manager', departmentKey: 'bar_beverage', seniority: 5, sortOrder: 9, venueTypes: FNB_VENUES, defaultForVenueTypes: ['bar', 'nightclub'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'beverage_manager', label: 'Beverage Manager', departmentKey: 'bar_beverage', seniority: 5, sortOrder: 10, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort', 'restaurant'] }),
  pos({ key: 'barista', label: 'Barista', departmentKey: 'bar_beverage', seniority: 2, sortOrder: 11, venueTypes: ['cafe', 'bistro', 'restaurant', 'hotel', 'resort', 'bakery', 'fast_casual'], defaultForVenueTypes: ['cafe', 'bakery'], optionalForVenueTypes: ['bistro', 'restaurant', 'hotel', 'resort', 'fast_casual'] }),

  pos({ key: 'dishwasher_steward', label: 'Dishwasher / Steward', departmentKey: 'kitchen_back_of_house', seniority: 1, sortOrder: 1, aliases: ['Dishwasher', 'Steward', 'Kitchen Steward'], venueTypes: FNB_VENUES, defaultForVenueTypes: ['restaurant', 'bistro', 'hotel_fb', 'resort'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'kitchen_porter', label: 'Kitchen Porter', departmentKey: 'kitchen_back_of_house', seniority: 1, sortOrder: 2, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'prep_cook', label: 'Prep Cook', departmentKey: 'kitchen_back_of_house', seniority: 2, sortOrder: 3, venueTypes: FNB_VENUES, defaultForVenueTypes: ['restaurant', 'fast_casual'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'commis_chef', label: 'Commis Chef', departmentKey: 'kitchen_back_of_house', seniority: 2, sortOrder: 4, aliases: ['Commis'], venueTypes: FNB_VENUES, defaultForVenueTypes: ['restaurant', 'bistro', 'hotel_fb'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'demi_chef_de_partie', label: 'Demi Chef de Partie', departmentKey: 'kitchen_back_of_house', seniority: 3, sortOrder: 5, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'chef_de_partie', label: 'Chef de Partie', departmentKey: 'kitchen_back_of_house', seniority: 3, sortOrder: 6, aliases: ['CDP'], venueTypes: FNB_VENUES, defaultForVenueTypes: ['restaurant', 'bistro', 'hotel_fb', 'resort'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'line_cook', label: 'Line Cook', departmentKey: 'kitchen_back_of_house', seniority: 2, sortOrder: 7, venueTypes: FNB_VENUES, defaultForVenueTypes: ['fast_casual', 'cafe'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'sous_chef', label: 'Sous Chef', departmentKey: 'kitchen_back_of_house', seniority: 4, sortOrder: 8, aliases: ['Sous'], venueTypes: FNB_VENUES, defaultForVenueTypes: ['restaurant', 'bistro', 'hotel_fb', 'resort'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'head_chef', label: 'Head Chef', departmentKey: 'kitchen_back_of_house', seniority: 5, sortOrder: 9, venueTypes: FNB_VENUES, defaultForVenueTypes: ['restaurant', 'bistro', 'hotel_fb', 'resort'], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'executive_chef', label: 'Executive Chef', departmentKey: 'kitchen_back_of_house', seniority: 5, sortOrder: 10, aliases: ['Executive Head Chef'], venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant', 'hotel', 'resort', 'hotel_fb'] }),
  pos({ key: 'kitchen_supervisor', label: 'Kitchen Supervisor', departmentKey: 'kitchen_back_of_house', seniority: 4, sortOrder: 11, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'kitchen_manager', label: 'Kitchen Manager', departmentKey: 'kitchen_back_of_house', seniority: 5, sortOrder: 12, venueTypes: FNB_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant', 'hotel', 'resort'] }),

  pos({ key: 'host', label: 'Host', departmentKey: 'host_reservations', seniority: 2, sortOrder: 1, aliases: ['Hostess', 'Greeter'], venueTypes: ['restaurant', 'bar', 'bistro', 'nightclub', 'beach_club', 'hotel', 'resort', 'hotel_fb', 'event_venue'], defaultForVenueTypes: ['restaurant', 'bistro', 'bar', 'hotel_fb'], optionalForVenueTypes: ['restaurant', 'bar', 'bistro', 'nightclub', 'beach_club', 'hotel', 'resort', 'hotel_fb', 'event_venue'] }),
  pos({ key: 'senior_host', label: 'Senior Host', departmentKey: 'host_reservations', seniority: 3, sortOrder: 2, venueTypes: ['restaurant', 'bar', 'bistro', 'hotel', 'resort', 'hotel_fb'], defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant', 'hotel', 'resort'] }),
  pos({ key: 'reservations_agent', label: 'Reservations Agent', departmentKey: 'host_reservations', seniority: 2, sortOrder: 3, venueTypes: ['restaurant', 'hotel', 'resort', 'hotel_fb', 'event_venue'], defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant', 'hotel', 'resort', 'hotel_fb'] }),
  pos({ key: 'reservations_coordinator', label: 'Reservations Coordinator', departmentKey: 'host_reservations', seniority: 3, sortOrder: 4, venueTypes: ['restaurant', 'hotel', 'resort', 'hotel_fb'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'reservations_supervisor', label: 'Reservations Supervisor', departmentKey: 'host_reservations', seniority: 4, sortOrder: 5, venueTypes: ['restaurant', 'hotel', 'resort', 'hotel_fb'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'host_supervisor', label: 'Host Supervisor', departmentKey: 'host_reservations', seniority: 4, sortOrder: 6, venueTypes: ['restaurant', 'bar', 'bistro', 'hotel_fb'], defaultForVenueTypes: [], optionalForVenueTypes: FNB_VENUES }),
  pos({ key: 'host_manager', label: 'Host Manager', departmentKey: 'host_reservations', seniority: 5, sortOrder: 7, venueTypes: ['restaurant', 'hotel', 'resort', 'hotel_fb'], defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant', 'hotel', 'resort'] }),

  pos({ key: 'bell_attendant', label: 'Bell Attendant', departmentKey: 'reception_front_office', seniority: 1, sortOrder: 1, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'porter', label: 'Porter', departmentKey: 'reception_front_office', seniority: 1, sortOrder: 2, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'doorman', label: 'Doorman', departmentKey: 'reception_front_office', seniority: 2, sortOrder: 3, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'front_desk_agent', label: 'Front Desk Agent', departmentKey: 'reception_front_office', seniority: 2, sortOrder: 4, aliases: ['Receptionist', 'Front Office Agent'], venueTypes: ['hotel', 'resort'], defaultForVenueTypes: ['hotel', 'resort'], optionalForVenueTypes: [] }),
  pos({ key: 'night_auditor', label: 'Night Auditor', departmentKey: 'reception_front_office', seniority: 3, sortOrder: 5, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: ['hotel', 'resort'], optionalForVenueTypes: [] }),
  pos({ key: 'concierge', label: 'Concierge', departmentKey: 'reception_front_office', seniority: 3, sortOrder: 6, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: ['hotel', 'resort'], optionalForVenueTypes: [] }),
  pos({ key: 'front_office_supervisor', label: 'Front Office Supervisor', departmentKey: 'reception_front_office', seniority: 4, sortOrder: 7, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'assistant_front_office_manager', label: 'Assistant Front Office Manager', departmentKey: 'reception_front_office', seniority: 4, sortOrder: 8, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'front_office_manager', label: 'Front Office Manager', departmentKey: 'reception_front_office', seniority: 5, sortOrder: 9, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: ['hotel', 'resort'], optionalForVenueTypes: [] }),

  pos({ key: 'room_attendant', label: 'Room Attendant', departmentKey: 'housekeeping', seniority: 1, sortOrder: 1, aliases: ['Housekeeper', 'Chambermaid'], venueTypes: ['hotel', 'resort'], defaultForVenueTypes: ['hotel', 'resort'], optionalForVenueTypes: [] }),
  pos({ key: 'public_area_attendant', label: 'Public Area Attendant', departmentKey: 'housekeeping', seniority: 1, sortOrder: 2, aliases: ['Public Area Cleaner', 'Cleaner'], venueTypes: ['hotel', 'resort'], defaultForVenueTypes: ['hotel', 'resort'], optionalForVenueTypes: [] }),
  pos({ key: 'housekeeping_attendant', label: 'Housekeeping Attendant', departmentKey: 'housekeeping', seniority: 1, sortOrder: 3, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'housekeeping_supervisor', label: 'Housekeeping Supervisor', departmentKey: 'housekeeping', seniority: 4, sortOrder: 4, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: ['hotel', 'resort'], optionalForVenueTypes: [] }),
  pos({ key: 'housekeeping_floor_supervisor', label: 'Housekeeping Floor Supervisor', departmentKey: 'housekeeping', seniority: 4, sortOrder: 5, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'assistant_executive_housekeeper', label: 'Assistant Executive Housekeeper', departmentKey: 'housekeeping', seniority: 4, sortOrder: 6, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'executive_housekeeper', label: 'Executive Housekeeper', departmentKey: 'housekeeping', seniority: 5, sortOrder: 7, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: ['hotel', 'resort'], optionalForVenueTypes: [] }),
  pos({ key: 'housekeeping_manager', label: 'Housekeeping Manager', departmentKey: 'housekeeping', seniority: 5, sortOrder: 8, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),

  pos({ key: 'laundry_attendant', label: 'Laundry Attendant', departmentKey: 'laundry', seniority: 1, sortOrder: 1, venueTypes: ['hotel', 'resort', 'event_venue', 'beach_club'], defaultForVenueTypes: ['hotel', 'resort'], optionalForVenueTypes: ['event_venue', 'beach_club'] }),
  pos({ key: 'linen_room_attendant', label: 'Linen Room Attendant', departmentKey: 'laundry', seniority: 1, sortOrder: 2, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'laundry_supervisor', label: 'Laundry Supervisor', departmentKey: 'laundry', seniority: 4, sortOrder: 3, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'laundry_manager', label: 'Laundry Manager', departmentKey: 'laundry', seniority: 5, sortOrder: 4, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),

  pos({ key: 'maintenance_technician', label: 'Maintenance Technician', departmentKey: 'maintenance_engineering', seniority: 2, sortOrder: 1, venueTypes: ['hotel', 'resort', 'beach_club', 'nightclub', 'event_venue'], defaultForVenueTypes: ['hotel', 'resort'], optionalForVenueTypes: ['beach_club', 'nightclub', 'event_venue'] }),
  pos({ key: 'electrician', label: 'Electrician', departmentKey: 'maintenance_engineering', seniority: 3, sortOrder: 2, venueTypes: ['hotel', 'resort', 'beach_club', 'event_venue'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'plumber', label: 'Plumber', departmentKey: 'maintenance_engineering', seniority: 3, sortOrder: 3, venueTypes: ['hotel', 'resort', 'beach_club'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'hvac_technician', label: 'HVAC Technician', departmentKey: 'maintenance_engineering', seniority: 3, sortOrder: 4, venueTypes: ['hotel', 'resort', 'beach_club'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'carpenter', label: 'Carpenter', departmentKey: 'maintenance_engineering', seniority: 2, sortOrder: 5, venueTypes: ['hotel', 'resort', 'event_venue'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'painter', label: 'Painter', departmentKey: 'maintenance_engineering', seniority: 2, sortOrder: 6, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'maintenance_supervisor', label: 'Maintenance Supervisor', departmentKey: 'maintenance_engineering', seniority: 4, sortOrder: 7, venueTypes: ['hotel', 'resort', 'beach_club', 'event_venue'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'chief_engineer', label: 'Chief Engineer', departmentKey: 'maintenance_engineering', seniority: 5, sortOrder: 8, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'maintenance_manager', label: 'Maintenance Manager', departmentKey: 'maintenance_engineering', seniority: 5, sortOrder: 9, venueTypes: ['hotel', 'resort', 'beach_club'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),

  pos({ key: 'security_officer', label: 'Security Officer', departmentKey: 'security', seniority: 2, sortOrder: 1, venueTypes: ['nightclub', 'beach_club', 'hotel', 'resort', 'event_venue'], defaultForVenueTypes: ['hotel', 'resort', 'nightclub'], optionalForVenueTypes: ['beach_club', 'event_venue'] }),
  pos({ key: 'door_supervisor', label: 'Door Supervisor', departmentKey: 'security', seniority: 3, sortOrder: 2, venueTypes: ['nightclub', 'beach_club', 'event_venue'], defaultForVenueTypes: ['nightclub'], optionalForVenueTypes: ['beach_club', 'event_venue'] }),
  pos({ key: 'security_supervisor', label: 'Security Supervisor', departmentKey: 'security', seniority: 4, sortOrder: 3, venueTypes: ['nightclub', 'beach_club', 'hotel', 'resort', 'event_venue'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort', 'nightclub'] }),
  pos({ key: 'head_of_security', label: 'Head of Security', departmentKey: 'security', seniority: 5, sortOrder: 4, venueTypes: ['nightclub', 'beach_club', 'hotel', 'resort', 'event_venue'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort', 'nightclub'] }),

  pos({ key: 'event_staff', label: 'Event Staff', departmentKey: 'events', seniority: 1, sortOrder: 1, venueTypes: ['hotel', 'resort', 'event_venue', 'beach_club', 'nightclub', 'restaurant'], defaultForVenueTypes: ['event_venue'], optionalForVenueTypes: ['hotel', 'resort', 'restaurant'] }),
  pos({ key: 'event_coordinator', label: 'Event Coordinator', departmentKey: 'events', seniority: 3, sortOrder: 2, aliases: ['Events Coordinator'], venueTypes: ['hotel', 'resort', 'event_venue', 'beach_club'], defaultForVenueTypes: ['event_venue'], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'banqueting_waiter', label: 'Banqueting Waiter', departmentKey: 'events', seniority: 2, sortOrder: 3, aliases: ['Banquet Waiter'], venueTypes: ['hotel', 'resort', 'event_venue'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort', 'event_venue'] }),
  pos({ key: 'banqueting_captain', label: 'Banqueting Captain', departmentKey: 'events', seniority: 3, sortOrder: 4, venueTypes: ['hotel', 'resort', 'event_venue'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'banqueting_supervisor', label: 'Banqueting Supervisor', departmentKey: 'events', seniority: 4, sortOrder: 5, venueTypes: ['hotel', 'resort', 'event_venue'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'event_manager', label: 'Event Manager', departmentKey: 'events', seniority: 5, sortOrder: 6, venueTypes: ['hotel', 'resort', 'event_venue', 'beach_club'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort', 'event_venue'] }),
  pos({ key: 'banqueting_manager', label: 'Banqueting Manager', departmentKey: 'events', seniority: 5, sortOrder: 7, venueTypes: ['hotel', 'resort', 'event_venue'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'av_technician', label: 'AV Technician', departmentKey: 'events', seniority: 2, sortOrder: 8, venueTypes: ['hotel', 'resort', 'event_venue'], defaultForVenueTypes: [], optionalForVenueTypes: ['event_venue', 'hotel'] }),

  pos({ key: 'spa_receptionist', label: 'Spa Receptionist', departmentKey: 'spa_wellness', seniority: 2, sortOrder: 1, venueTypes: ['hotel', 'resort', 'beach_club'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort', 'beach_club'] }),
  pos({ key: 'spa_therapist', label: 'Spa Therapist', departmentKey: 'spa_wellness', seniority: 2, sortOrder: 2, venueTypes: ['hotel', 'resort', 'beach_club'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort', 'beach_club'] }),
  pos({ key: 'massage_therapist', label: 'Massage Therapist', departmentKey: 'spa_wellness', seniority: 2, sortOrder: 3, venueTypes: ['hotel', 'resort', 'beach_club'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'beauty_therapist', label: 'Beauty Therapist', departmentKey: 'spa_wellness', seniority: 2, sortOrder: 4, venueTypes: ['hotel', 'resort', 'beach_club'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'fitness_instructor', label: 'Fitness Instructor', departmentKey: 'spa_wellness', seniority: 3, sortOrder: 5, venueTypes: ['hotel', 'resort', 'beach_club'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'wellness_coach', label: 'Wellness Coach', departmentKey: 'spa_wellness', seniority: 3, sortOrder: 6, venueTypes: ['hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'spa_supervisor', label: 'Spa Supervisor', departmentKey: 'spa_wellness', seniority: 4, sortOrder: 7, venueTypes: ['hotel', 'resort', 'beach_club'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'spa_manager', label: 'Spa Manager', departmentKey: 'spa_wellness', seniority: 5, sortOrder: 8, venueTypes: ['hotel', 'resort', 'beach_club'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),

  pos({ key: 'lifeguard', label: 'Lifeguard', departmentKey: 'pool_beach', seniority: 2, sortOrder: 1, venueTypes: ['beach_club', 'resort', 'hotel'], defaultForVenueTypes: ['beach_club', 'resort'], optionalForVenueTypes: ['hotel'] }),
  pos({ key: 'pool_attendant', label: 'Pool Attendant', departmentKey: 'pool_beach', seniority: 2, sortOrder: 2, venueTypes: ['beach_club', 'resort', 'hotel'], defaultForVenueTypes: ['beach_club', 'resort'], optionalForVenueTypes: ['hotel'] }),
  pos({ key: 'beach_attendant', label: 'Beach Attendant', departmentKey: 'pool_beach', seniority: 2, sortOrder: 3, venueTypes: ['beach_club', 'resort'], defaultForVenueTypes: ['beach_club'], optionalForVenueTypes: ['resort'] }),
  pos({ key: 'cabana_attendant', label: 'Cabana Attendant', departmentKey: 'pool_beach', seniority: 2, sortOrder: 4, venueTypes: ['beach_club', 'resort'], defaultForVenueTypes: ['beach_club'], optionalForVenueTypes: ['resort'] }),
  pos({ key: 'pool_supervisor', label: 'Pool Supervisor', departmentKey: 'pool_beach', seniority: 4, sortOrder: 5, venueTypes: ['beach_club', 'resort', 'hotel'], defaultForVenueTypes: [], optionalForVenueTypes: ['beach_club', 'resort'] }),
  pos({ key: 'beach_supervisor', label: 'Beach Supervisor', departmentKey: 'pool_beach', seniority: 4, sortOrder: 6, venueTypes: ['beach_club', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['beach_club', 'resort'] }),
  pos({ key: 'pool_beach_manager', label: 'Pool / Beach Manager', departmentKey: 'pool_beach', seniority: 5, sortOrder: 7, venueTypes: ['beach_club', 'resort', 'hotel'], defaultForVenueTypes: [], optionalForVenueTypes: ['beach_club', 'resort'] }),

  pos({ key: 'storekeeper', label: 'Storekeeper', departmentKey: 'purchasing_stores', seniority: 2, sortOrder: 1, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort', 'restaurant'] }),
  pos({ key: 'receiving_clerk', label: 'Receiving Clerk', departmentKey: 'purchasing_stores', seniority: 2, sortOrder: 2, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'purchasing_assistant', label: 'Purchasing Assistant', departmentKey: 'purchasing_stores', seniority: 2, sortOrder: 3, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'purchasing_officer', label: 'Purchasing Officer', departmentKey: 'purchasing_stores', seniority: 3, sortOrder: 4, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'purchasing_manager', label: 'Purchasing Manager', departmentKey: 'purchasing_stores', seniority: 5, sortOrder: 5, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery'], defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant', 'hotel', 'resort'] }),
  pos({ key: 'cost_controller', label: 'Cost Controller', departmentKey: 'purchasing_stores', seniority: 4, sortOrder: 6, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'inventory_controller', label: 'Inventory Controller', departmentKey: 'purchasing_stores', seniority: 3, sortOrder: 7, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),

  pos({ key: 'accountant', label: 'Accountant', departmentKey: 'finance_administration', seniority: 3, sortOrder: 1, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery', 'fast_casual'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'accounts_assistant', label: 'Accounts Assistant', departmentKey: 'finance_administration', seniority: 2, sortOrder: 2, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery', 'fast_casual'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'payroll_officer', label: 'Payroll Officer', departmentKey: 'finance_administration', seniority: 3, sortOrder: 3, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery', 'fast_casual'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'finance_manager', label: 'Finance Manager', departmentKey: 'finance_administration', seniority: 5, sortOrder: 4, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery', 'fast_casual'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'office_administrator', label: 'Office Administrator', departmentKey: 'finance_administration', seniority: 2, sortOrder: 5, venueTypes: ['hotel', 'resort', 'restaurant', 'bar', 'beach_club', 'event_venue', 'bakery', 'fast_casual'], defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'administrative_assistant', label: 'Administrative Assistant', departmentKey: 'finance_administration', seniority: 2, sortOrder: 6, venueTypes: ALL_VENUE_TYPE_KEYS, defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),

  pos({ key: 'baker', label: 'Baker', departmentKey: 'production_pastry', seniority: 2, sortOrder: 1, venueTypes: ['bakery', 'hotel', 'resort', 'restaurant', 'cafe', 'bistro'], defaultForVenueTypes: ['bakery'], optionalForVenueTypes: ['hotel', 'resort', 'cafe'] }),
  pos({ key: 'pastry_assistant', label: 'Pastry Assistant', departmentKey: 'production_pastry', seniority: 2, sortOrder: 2, venueTypes: ['bakery', 'hotel', 'resort', 'restaurant'], defaultForVenueTypes: ['bakery'], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'pastry_chef', label: 'Pastry Chef', departmentKey: 'production_pastry', seniority: 4, sortOrder: 3, venueTypes: ['bakery', 'hotel', 'resort', 'restaurant'], defaultForVenueTypes: ['bakery'], optionalForVenueTypes: ['restaurant', 'hotel', 'resort'] }),
  pos({ key: 'head_pastry_chef', label: 'Head Pastry Chef', departmentKey: 'production_pastry', seniority: 5, sortOrder: 4, venueTypes: ['bakery', 'hotel', 'resort', 'restaurant'], defaultForVenueTypes: ['bakery'], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'production_assistant', label: 'Production Assistant', departmentKey: 'production_pastry', seniority: 2, sortOrder: 5, venueTypes: ['bakery', 'hotel', 'resort'], defaultForVenueTypes: ['bakery'], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'production_supervisor', label: 'Production Supervisor', departmentKey: 'production_pastry', seniority: 4, sortOrder: 6, venueTypes: ['bakery', 'hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['bakery', 'hotel'] }),
  pos({ key: 'production_manager', label: 'Production Manager', departmentKey: 'production_pastry', seniority: 5, sortOrder: 7, venueTypes: ['bakery', 'hotel', 'resort'], defaultForVenueTypes: [], optionalForVenueTypes: ['bakery', 'hotel'] }),

  pos({ key: 'delivery_driver', label: 'Delivery Driver', departmentKey: 'delivery', seniority: 2, sortOrder: 1, venueTypes: ['restaurant', 'cafe', 'bistro', 'bakery', 'fast_casual'], defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant', 'cafe', 'fast_casual'] }),
  pos({ key: 'delivery_rider', label: 'Delivery Rider', departmentKey: 'delivery', seniority: 2, sortOrder: 2, venueTypes: ['restaurant', 'cafe', 'bistro', 'bakery', 'fast_casual'], defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant', 'fast_casual'] }),
  pos({ key: 'dispatcher', label: 'Dispatcher', departmentKey: 'delivery', seniority: 3, sortOrder: 3, venueTypes: ['restaurant', 'cafe', 'bistro', 'bakery', 'fast_casual'], defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant'] }),
  pos({ key: 'delivery_coordinator', label: 'Delivery Coordinator', departmentKey: 'delivery', seniority: 3, sortOrder: 4, venueTypes: ['restaurant', 'cafe', 'bistro', 'bakery', 'fast_casual'], defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant'] }),
  pos({ key: 'delivery_supervisor', label: 'Delivery Supervisor', departmentKey: 'delivery', seniority: 4, sortOrder: 5, venueTypes: ['restaurant', 'cafe', 'bistro', 'bakery', 'fast_casual'], defaultForVenueTypes: [], optionalForVenueTypes: ['restaurant'] }),

  pos({ key: 'guest_relations_agent', label: 'Guest Relations Agent', departmentKey: 'guest_relations', seniority: 2, sortOrder: 1, venueTypes: HOSPITALITY_VENUES, defaultForVenueTypes: ['hotel', 'resort'], optionalForVenueTypes: HOSPITALITY_VENUES }),
  pos({ key: 'guest_relations_officer', label: 'Guest Relations Officer', departmentKey: 'guest_relations', seniority: 3, sortOrder: 2, venueTypes: HOSPITALITY_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'guest_experience_agent', label: 'Guest Experience Agent', departmentKey: 'guest_relations', seniority: 2, sortOrder: 3, venueTypes: HOSPITALITY_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort', 'beach_club'] }),
  pos({ key: 'guest_relations_supervisor', label: 'Guest Relations Supervisor', departmentKey: 'guest_relations', seniority: 4, sortOrder: 4, venueTypes: HOSPITALITY_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
  pos({ key: 'guest_relations_manager', label: 'Guest Relations Manager', departmentKey: 'guest_relations', seniority: 5, sortOrder: 5, venueTypes: HOSPITALITY_VENUES, defaultForVenueTypes: [], optionalForVenueTypes: ['hotel', 'resort'] }),
])

export const VENUE_CATALOG_TEMPLATES = deepFreeze({
  restaurant: defineTemplate({
    venueTypeKey: 'restaurant',
    departmentKeys: ['management', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house', 'host_reservations'],
    optionalDepartmentKeys: ['delivery', 'purchasing_stores', 'finance_administration', 'events', 'production_pastry'],
    defaultPositionKeys: ['restaurant_manager', 'shift_manager', 'waiter_server', 'food_runner', 'drink_runner', 'host', 'bartender', 'barback', 'commis_chef', 'chef_de_partie', 'sous_chef', 'head_chef', 'dishwasher_steward'],
    optionalPositionKeys: ['sommelier', 'mixologist', 'maitre_d', 'executive_chef', 'pastry_chef', 'event_manager', 'purchasing_manager', 'general_manager'],
  }),
  bar: defineTemplate({
    venueTypeKey: 'bar',
    departmentKeys: ['management', 'bar_beverage', 'service_front_of_house', 'host_reservations'],
    optionalDepartmentKeys: ['kitchen_back_of_house', 'security', 'events', 'purchasing_stores'],
    defaultPositionKeys: ['shift_manager', 'bartender', 'barback', 'bar_manager', 'host', 'waiter_server', 'general_manager'],
    optionalPositionKeys: ['mixologist', 'door_supervisor', 'security_officer', 'head_bartender'],
  }),
  cafe: defineTemplate({
    venueTypeKey: 'cafe',
    departmentKeys: ['management', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house'],
    optionalDepartmentKeys: ['delivery', 'production_pastry', 'purchasing_stores'],
    defaultPositionKeys: ['waiter_server', 'cashier', 'barista', 'line_cook', 'restaurant_manager'],
    optionalPositionKeys: ['baker', 'delivery_driver', 'pastry_chef'],
  }),
  bistro: defineTemplate({
    venueTypeKey: 'bistro',
    departmentKeys: ['management', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house', 'host_reservations'],
    optionalDepartmentKeys: ['delivery', 'production_pastry', 'purchasing_stores', 'events'],
    defaultPositionKeys: ['restaurant_manager', 'waiter_server', 'host', 'bartender', 'barback', 'commis_chef', 'chef_de_partie', 'sous_chef', 'head_chef', 'dishwasher_steward'],
    optionalPositionKeys: ['maitre_d', 'sommelier', 'pastry_chef'],
  }),
  nightclub: defineTemplate({
    venueTypeKey: 'nightclub',
    departmentKeys: ['management', 'bar_beverage', 'service_front_of_house', 'host_reservations', 'security'],
    optionalDepartmentKeys: ['events', 'kitchen_back_of_house', 'purchasing_stores'],
    defaultPositionKeys: ['bar_manager', 'bartender', 'barback', 'host', 'security_officer', 'door_supervisor', 'waiter_server'],
    optionalPositionKeys: ['head_bartender', 'event_coordinator', 'line_cook'],
  }),
  beach_club: defineTemplate({
    venueTypeKey: 'beach_club',
    departmentKeys: ['management', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house', 'host_reservations', 'pool_beach', 'security'],
    optionalDepartmentKeys: ['events', 'guest_relations', 'purchasing_stores', 'maintenance_engineering'],
    defaultPositionKeys: ['bartender', 'barback', 'waiter_server', 'host', 'lifeguard', 'pool_attendant', 'beach_attendant', 'commis_chef', 'head_chef', 'security_officer'],
    optionalPositionKeys: ['cabana_attendant', 'pool_beach_manager', 'guest_relations_agent'],
  }),
  hotel: defineTemplate({
    venueTypeKey: 'hotel',
    departmentKeys: ['management', 'reception_front_office', 'guest_relations', 'housekeeping', 'laundry', 'maintenance_engineering', 'security', 'purchasing_stores', 'finance_administration'],
    optionalDepartmentKeys: ['service_front_of_house', 'bar_beverage', 'kitchen_back_of_house', 'host_reservations', 'events', 'spa_wellness', 'pool_beach'],
    defaultPositionKeys: ['hotel_manager', 'front_desk_agent', 'night_auditor', 'concierge', 'room_attendant', 'public_area_attendant', 'housekeeping_supervisor', 'maintenance_technician', 'security_officer', 'front_office_manager', 'executive_housekeeper', 'guest_relations_agent'],
    optionalPositionKeys: ['spa_therapist', 'lifeguard', 'banqueting_manager', 'chief_engineer', 'cost_controller', 'beverage_manager', 'waiter_server'],
  }),
  resort: defineTemplate({
    venueTypeKey: 'resort',
    departmentKeys: ['management', 'reception_front_office', 'guest_relations', 'housekeeping', 'laundry', 'maintenance_engineering', 'security', 'purchasing_stores', 'finance_administration', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house', 'events', 'spa_wellness', 'pool_beach'],
    optionalDepartmentKeys: ['host_reservations', 'production_pastry'],
    defaultPositionKeys: ['resort_manager', 'front_desk_agent', 'concierge', 'room_attendant', 'housekeeping_supervisor', 'maintenance_technician', 'security_officer', 'waiter_server', 'bartender', 'head_chef', 'lifeguard', 'pool_attendant', 'spa_therapist', 'event_coordinator', 'guest_relations_agent'],
    optionalPositionKeys: ['host', 'pastry_chef', 'banqueting_manager', 'chief_engineer'],
  }),
  hotel_fb: defineTemplate({
    venueTypeKey: 'hotel_fb',
    departmentKeys: ['management', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house', 'host_reservations'],
    optionalDepartmentKeys: ['guest_relations', 'purchasing_stores', 'events'],
    defaultPositionKeys: ['restaurant_manager', 'waiter_server', 'host', 'bartender', 'commis_chef', 'chef_de_partie', 'sous_chef', 'head_chef', 'dishwasher_steward'],
    optionalPositionKeys: ['sommelier', 'maitre_d', 'guest_relations_agent'],
  }),
  event_venue: defineTemplate({
    venueTypeKey: 'event_venue',
    departmentKeys: ['management', 'events', 'service_front_of_house', 'bar_beverage', 'kitchen_back_of_house', 'security'],
    optionalDepartmentKeys: ['host_reservations', 'maintenance_engineering', 'purchasing_stores'],
    defaultPositionKeys: ['event_coordinator', 'event_staff', 'banqueting_waiter', 'bartender', 'commis_chef', 'head_chef', 'security_officer', 'av_technician'],
    optionalPositionKeys: ['banqueting_manager', 'host', 'maintenance_technician'],
  }),
  bakery: defineTemplate({
    venueTypeKey: 'bakery',
    departmentKeys: ['management', 'production_pastry', 'service_front_of_house'],
    optionalDepartmentKeys: ['bar_beverage', 'kitchen_back_of_house', 'delivery', 'purchasing_stores'],
    defaultPositionKeys: ['baker', 'pastry_chef', 'production_assistant', 'cashier', 'barista', 'restaurant_manager'],
    optionalPositionKeys: ['head_pastry_chef', 'delivery_driver', 'line_cook'],
  }),
  fast_casual: defineTemplate({
    venueTypeKey: 'fast_casual',
    departmentKeys: ['management', 'service_front_of_house', 'kitchen_back_of_house'],
    optionalDepartmentKeys: ['bar_beverage', 'delivery', 'purchasing_stores'],
    defaultPositionKeys: ['restaurant_manager', 'waiter_server', 'cashier', 'line_cook', 'prep_cook', 'dishwasher_steward'],
    optionalPositionKeys: ['barista', 'delivery_driver'],
  }),
})

const venueTypeByKey = new Map(VENUE_TYPES.map((entry) => [entry.key, entry]))
const departmentByKey = new Map(DEPARTMENT_CATALOG.map((entry) => [entry.key, entry]))
const positionByKey = new Map(POSITION_CATALOG.map((entry) => [entry.key, entry]))

function normalizeVenueTypeKey(value) {
  const normalized = `${value ?? ''}`.trim().toLowerCase()
  return normalized || null
}

function resolveVenueTypeKey(venueTypeKey) {
  const normalized = normalizeVenueTypeKey(venueTypeKey)
  if (!normalized) return null
  return venueTypeByKey.has(normalized) ? normalized : null
}

function resolveDepartmentKeysForTemplate(template, includeOptional = false) {
  const keys = [...(template?.departmentKeys ?? [])]
  if (includeOptional) {
    for (const key of template?.optionalDepartmentKeys ?? []) {
      if (!keys.includes(key)) keys.push(key)
    }
  }
  return keys
}

function resolvePositionKeysForTemplate(template, includeOptional = false) {
  const keys = [...(template?.defaultPositionKeys ?? [])]
  if (includeOptional) {
    for (const key of template?.optionalPositionKeys ?? []) {
      if (!keys.includes(key)) keys.push(key)
    }
  }
  return keys
}

function mapKeysToDepartments(keys) {
  return keys.map((key) => departmentByKey.get(key)).filter(Boolean)
}

function mapKeysToPositions(keys) {
  return keys.map((key) => positionByKey.get(key)).filter(Boolean)
}

function sortPositions(entries) {
  return [...entries].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
    return left.label.localeCompare(right.label)
  })
}

export function getVenueTypeByKey(value) {
  const key = normalizeVenueTypeKey(value)
  if (!key) return null
  return venueTypeByKey.get(key) ?? null
}

export function findVenueType(value) {
  const normalizedKey = normalizeVenueTypeKey(value)
  if (!normalizedKey) return null

  const direct = venueTypeByKey.get(normalizedKey)
  if (direct) return direct

  for (const entry of VENUE_TYPES) {
    if (normalizeVenueTypeKey(entry.label) === normalizedKey) return entry
  }

  for (const entry of VENUE_TYPES) {
    for (const alias of entry.aliases) {
      if (normalizeVenueTypeKey(alias) === normalizedKey) return entry
    }
  }

  return null
}

export function getDepartmentByKey(value) {
  const key = normalizeDepartmentKey(value)
  if (!key) return null
  return departmentByKey.get(key) ?? null
}

export function findDepartment(value) {
  return findMatchingDepartment(value, DEPARTMENT_CATALOG)
}

export function getPositionByKey(value) {
  const key = normalizePositionKey(value)
  if (!key) return null
  return positionByKey.get(key) ?? null
}

export function findPosition(value, departmentKey) {
  return findMatchingPosition(value, POSITION_CATALOG, departmentKey)
}

export function getVenueTemplate(venueTypeKey) {
  const key = resolveVenueTypeKey(venueTypeKey)
  if (!key) return null
  return VENUE_CATALOG_TEMPLATES[key] ?? null
}

export function getDepartmentsForVenueType(venueTypeKey, options = {}) {
  const template = getVenueTemplate(venueTypeKey)
  if (!template) return []

  const keys = resolveDepartmentKeysForTemplate(template, options.includeOptional === true)
  return mapKeysToDepartments(keys)
}

export function getPositionsForDepartment(departmentKey, options = {}) {
  const normalizedDepartmentKey = normalizeDepartmentKey(departmentKey)
  if (!normalizedDepartmentKey) return []

  const venueTypeKey = resolveVenueTypeKey(options.venueTypeKey)
  const includeOptional = options.includeOptional !== false

  let entries = POSITION_CATALOG.filter((entry) => normalizeDepartmentKey(entry.departmentKey) === normalizedDepartmentKey)

  if (venueTypeKey) {
    entries = entries.filter((entry) => entry.venueTypes.includes(venueTypeKey))
    if (!includeOptional) {
      entries = entries.filter((entry) => entry.defaultForVenueTypes.includes(venueTypeKey))
    }
  }

  return sortPositions(entries)
}

export function getPositionsForVenueType(venueTypeKey, options = {}) {
  const template = getVenueTemplate(venueTypeKey)
  if (!template) return []

  const keys = resolvePositionKeysForTemplate(template, options.includeOptional === true)
  return mapKeysToPositions(keys)
}

export function getDefaultPositionsForVenueType(venueTypeKey) {
  return getPositionsForVenueType(venueTypeKey, { includeOptional: false })
}

export function getOptionalPositionsForVenueType(venueTypeKey) {
  const template = getVenueTemplate(venueTypeKey)
  if (!template) return []
  return mapKeysToPositions([...(template.optionalPositionKeys ?? [])])
}

export function isDepartmentAvailableForVenueType(departmentKey, venueTypeKey) {
  const department = getDepartmentByKey(departmentKey)
  const venueKey = resolveVenueTypeKey(venueTypeKey)
  if (!department || !venueKey) return false
  return department.venueTypes.includes(venueKey)
}

export function isPositionAvailableForVenueType(positionKey, venueTypeKey) {
  const position = getPositionByKey(positionKey)
  const venueKey = resolveVenueTypeKey(venueTypeKey)
  if (!position || !venueKey) return false
  return position.venueTypes.includes(venueKey)
}

function collectNormalizedTokens(entry, normalizeKey) {
  const tokens = []
  if (entry?.key) tokens.push({ token: normalizeKey(entry.key), kind: 'key', entryKey: entry.key })
  if (entry?.label) tokens.push({ token: normalizeKey(entry.label), kind: 'label', entryKey: entry.key })
  for (const alias of entry?.aliases ?? []) {
    tokens.push({ token: normalizeKey(alias), kind: 'alias', entryKey: entry.key })
  }
  return tokens.filter((item) => item.token)
}

function findCatalogTokenCollisions(entries, normalizeKey, catalogName) {
  const errors = []
  const tokenOwners = new Map()

  for (const entry of entries) {
    for (const item of collectNormalizedTokens(entry, normalizeKey)) {
      const owners = tokenOwners.get(item.token) ?? new Set()
      owners.add(item.entryKey)
      tokenOwners.set(item.token, owners)
    }
  }

  for (const [token, owners] of tokenOwners.entries()) {
    if (owners.size > 1) {
      errors.push(`${catalogName} normalized token collision: ${token}`)
    }
  }

  return errors
}

export function validateVenueCatalogIntegrity() {
  const errors = []
  const venueKeys = new Set()
  const departmentKeys = new Set()
  const positionKeys = new Set()

  for (const entry of VENUE_TYPES) {
    if (venueKeys.has(entry.key)) errors.push(`Duplicate venue key: ${entry.key}`)
    venueKeys.add(entry.key)
  }

  errors.push(...findCatalogTokenCollisions(VENUE_TYPES, normalizeVenueTypeKey, 'Venue'))

  for (const entry of DEPARTMENT_CATALOG) {
    if (departmentKeys.has(entry.key)) errors.push(`Duplicate department key: ${entry.key}`)
    departmentKeys.add(entry.key)
    for (const venueType of entry.venueTypes) {
      if (!venueKeys.has(venueType)) errors.push(`Department ${entry.key} references unknown venue type ${venueType}`)
    }
  }

  errors.push(...findCatalogTokenCollisions(DEPARTMENT_CATALOG, normalizeDepartmentKey, 'Department'))

  for (const entry of POSITION_CATALOG) {
    if (positionKeys.has(entry.key)) errors.push(`Duplicate position key: ${entry.key}`)
    positionKeys.add(entry.key)
    if (!departmentKeys.has(entry.departmentKey)) {
      errors.push(`Position ${entry.key} references unknown department ${entry.departmentKey}`)
    }
    for (const venueType of entry.venueTypes) {
      if (!venueKeys.has(venueType)) errors.push(`Position ${entry.key} references unknown venue type ${venueType}`)
    }
    for (const venueType of entry.defaultForVenueTypes) {
      if (!venueKeys.has(venueType)) errors.push(`Position ${entry.key} defaultForVenueTypes references unknown venue ${venueType}`)
      if (entry.optionalForVenueTypes.includes(venueType)) {
        errors.push(`Position ${entry.key} lists ${venueType} in both default and optional arrays`)
      }
    }
    for (const venueType of entry.optionalForVenueTypes) {
      if (!venueKeys.has(venueType)) errors.push(`Position ${entry.key} optionalForVenueTypes references unknown venue ${venueType}`)
    }
  }

  errors.push(...findCatalogTokenCollisions(POSITION_CATALOG, normalizePositionKey, 'Position'))

  for (const venueType of ALL_VENUE_TYPE_KEYS) {
    if (!VENUE_CATALOG_TEMPLATES[venueType]) {
      errors.push(`Missing venue template for ${venueType}`)
      continue
    }

    const template = VENUE_CATALOG_TEMPLATES[venueType]
    const templateDepartments = resolveDepartmentKeysForTemplate(template, true)
    const seenDepartments = new Set()
    for (const key of templateDepartments) {
      if (!departmentKeys.has(key)) errors.push(`Template ${venueType} references unknown department ${key}`)
      if (seenDepartments.has(key)) errors.push(`Template ${venueType} has duplicate department ${key}`)
      seenDepartments.add(key)
    }

    const allowedDepartments = new Set(templateDepartments)
    const templatePositions = resolvePositionKeysForTemplate(template, true)
    const seenPositions = new Set()
    for (const key of templatePositions) {
      if (!positionKeys.has(key)) errors.push(`Template ${venueType} references unknown position ${key}`)
      if (seenPositions.has(key)) errors.push(`Template ${venueType} has duplicate position ${key}`)
      seenPositions.add(key)

      const position = positionByKey.get(key)
      if (position && !allowedDepartments.has(position.departmentKey)) {
        errors.push(`Template ${venueType} position ${key} belongs to department ${position.departmentKey} outside template departments`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

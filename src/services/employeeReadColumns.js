// Sensitive fields are fetched separately through the authorization-checked RPC.
// Keep this explicit: wildcard selects also expose future private columns.
export const EMPLOYEE_PUBLIC_COLUMNS = [
  'id', 'workspace_id', 'full_name', 'position', 'primary_position',
  'additional_positions', 'phone', 'email', 'hire_date', 'weekly_hours',
  'shift', 'status', 'department', 'identity_color', 'created_at', 'updated_at',
].join(', ')

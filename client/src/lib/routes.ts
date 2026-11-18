import type { Role } from '../types/api';

/** Where a signed-in user lands: staff on the dashboard, customers in the assistant. */
export function homePathFor(role: Role): string {
  return role === 'CUSTOMER' ? '/assistant' : '/overview';
}

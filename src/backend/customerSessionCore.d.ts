export const CUSTOMER_SESSION_MAX_AGE_SECONDS: number;

export type CustomerSession = {
  customerId: number;
};

export type CustomerSessionVerification = {
  session: CustomerSession | null;
  error: string | null;
};

export function createCustomerSessionToken(customerId: number, now?: number): string;

export function verifyCustomerSessionToken(
  token?: string,
  now?: number,
): CustomerSession | null;

export function verifyCustomerSessionTokenDetailed(
  token?: string,
  now?: number,
): CustomerSessionVerification;

export const QUERY_RESULTS = [
  'FOUND',
  'NOT_FOUND',
  'INCONCLUSIVE',
  'SOURCE_UNAVAILABLE',
] as const;

export const REGISTRATION_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'CANCELLED',
  'UNKNOWN',
] as const;

export const STATUS_SEMANTICS = ['EXPLICIT', 'INFERRED', 'UNKNOWN'] as const;
export const FRESHNESS_STATES = ['FRESH', 'AGING', 'STALE', 'UNKNOWN'] as const;
export const ACQUISITION_MODES = ['SCHEDULED', 'ON_DEMAND', 'MANUAL'] as const;

export type QueryResult = (typeof QUERY_RESULTS)[number];
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];
export type StatusSemantics = (typeof STATUS_SEMANTICS)[number];
export type FreshnessState = (typeof FRESHNESS_STATES)[number];
export type AcquisitionMode = (typeof ACQUISITION_MODES)[number];

export interface RegistryQuery {
  council: string;
  uf: string;
  registration_number: string;
}

export interface RegistryVerification {
  result: QueryResult;
  professional_name?: string;
  registration_number: string;
  registration_status: RegistrationStatus;
  status_semantics: StatusSemantics;
  council: string;
  regional_council?: string;
  uf: string;
  category?: string;
}

export interface RegistryVerificationResponse {
  verification: RegistryVerification;
  source: {
    authority: string;
    provider: string;
    live: boolean;
    registry_store: boolean;
  };
  data: {
    last_seen_at?: string;
    last_verified_at?: string;
    freshness: FreshnessState;
    acquisition_mode: AcquisitionMode;
  };
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  queried_at: string;
}

export interface ValidationError {
  field: keyof RegistryQuery | 'body';
  message: string;
}

export type ParseRegistryQueryResult =
  | { ok: true; value: RegistryQuery }
  | { ok: false; errors: ValidationError[] };

export function normalizeRegistration(value: string): string {
  return value.normalize('NFKC').trim().toUpperCase().replace(/\s+/g, '');
}

export function parseRegistryQuery(input: unknown): ParseRegistryQueryResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: [{ field: 'body', message: 'Expected JSON object.' }] };
  }

  const source = input as Record<string, unknown>;
  const errors: ValidationError[] = [];

  const council =
    typeof source.council === 'string' ? source.council.trim().toUpperCase() : '';
  const uf = typeof source.uf === 'string' ? source.uf.trim().toUpperCase() : '';
  const registration =
    typeof source.registration_number === 'string'
      ? normalizeRegistration(source.registration_number)
      : '';

  if (!/^[A-Z]{2,12}$/.test(council)) {
    errors.push({ field: 'council', message: 'Council must contain 2-12 letters.' });
  }

  if (!/^[A-Z]{2}$/.test(uf)) {
    errors.push({ field: 'uf', message: 'UF must contain exactly 2 letters.' });
  }

  if (registration.length < 1 || registration.length > 40) {
    errors.push({
      field: 'registration_number',
      message: 'Registration number must contain 1-40 normalized characters.',
    });
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: { council, uf, registration_number: registration } };
}

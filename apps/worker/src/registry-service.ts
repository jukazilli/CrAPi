import type { RegistryQuery, RegistryVerificationResponse } from '@crapi/contracts';

import type { ApiPrincipal } from './api-key-auth.js';
import { SupabaseServerClient } from './supabase-server-client.js';

interface QuotaRow {
  daily_limit: number;
  used: number;
  remaining: number;
  allowed: boolean;
}

interface RegistryRow {
  id: string;
  council: string;
  uf: string;
  registration_number: string;
  professional_name: string | null;
  registration_status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'UNKNOWN';
  status_semantics: 'EXPLICIT' | 'INFERRED' | 'UNKNOWN';
  regional_council: string | null;
  category: string | null;
  provider_id: string | null;
  freshness_state: 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';
  acquisition_mode: 'SCHEDULED' | 'ON_DEMAND' | 'MANUAL';
  last_seen_at: string | null;
  last_verified_at: string | null;
}

interface ApiRequestRow {
  id: string;
}

export interface RegistryServiceResult {
  status: number;
  body: unknown;
}

export class RegistryService {
  constructor(private readonly db: SupabaseServerClient) {}

  private async recordRequest(params: {
    requestId: string;
    principal: ApiPrincipal;
    httpStatus: number;
    queryResult?: 'FOUND' | 'NOT_FOUND' | 'INCONCLUSIVE' | 'SOURCE_UNAVAILABLE';
    providerId?: string | null;
    registryStoreHit: boolean;
    latencyMs: number;
  }): Promise<string | null> {
    const inserted = await this.db.insert<ApiRequestRow>('api_requests', {
      request_id: params.requestId,
      application_id: params.principal.applicationId,
      api_key_id: params.principal.apiKeyId,
      route: '/v1/professional-registrations/verify',
      method: 'POST',
      http_status: params.httpStatus,
      query_result: params.queryResult ?? null,
      provider_id: params.providerId ?? null,
      registry_store_hit: params.registryStoreHit,
      live_refresh: false,
      latency_ms: params.latencyMs,
    });
    return inserted[0]?.id ?? null;
  }

  private async markKeyUsed(apiKeyId: string): Promise<void> {
    const query = new URLSearchParams({ id: `eq.${apiKeyId}` });
    await this.db.update('api_keys', query, { last_used_at: new Date().toISOString() });
  }

  async verify(query: RegistryQuery, principal: ApiPrincipal): Promise<RegistryServiceResult> {
    const startedAt = Date.now();
    const requestId = `req_${crypto.randomUUID()}`;

    const quota = (
      await this.db.rpc<QuotaRow>('check_api_key_daily_quota', {
        p_api_key_id: principal.apiKeyId,
      })
    )[0];

    if (!quota) {
      return {
        status: 503,
        body: { error: 'QUOTA_UNAVAILABLE', request_id: requestId },
      };
    }

    if (!quota.allowed) {
      await this.recordRequest({
        requestId,
        principal,
        httpStatus: 429,
        registryStoreHit: false,
        latencyMs: Date.now() - startedAt,
      });
      return {
        status: 429,
        body: {
          error: 'RATE_LIMITED',
          request_id: requestId,
          quota: {
            daily_limit: quota.daily_limit,
            used: quota.used,
            remaining: quota.remaining,
          },
        },
      };
    }

    const registry = (
      await this.db.rpc<RegistryRow>('lookup_registry_snapshot', {
        p_council: query.council,
        p_uf: query.uf,
        p_normalized_registration: query.registration_number,
      })
    )[0];

    const queriedAt = new Date().toISOString();
    const response: RegistryVerificationResponse = registry
      ? {
          verification: {
            result: 'FOUND',
            professional_name: registry.professional_name ?? undefined,
            registration_number: registry.registration_number,
            registration_status: registry.registration_status,
            status_semantics: registry.status_semantics,
            council: registry.council,
            regional_council: registry.regional_council ?? undefined,
            uf: registry.uf,
            category: registry.category ?? undefined,
          },
          source: {
            authority: 'CrAPi Registry Store',
            provider: registry.provider_id ?? 'registry-store',
            live: false,
            registry_store: true,
          },
          data: {
            last_seen_at: registry.last_seen_at ?? undefined,
            last_verified_at: registry.last_verified_at ?? undefined,
            freshness: registry.freshness_state,
            acquisition_mode: registry.acquisition_mode,
          },
          confidence: registry.status_semantics === 'EXPLICIT' ? 'HIGH' : 'MEDIUM',
          queried_at: queriedAt,
        }
      : {
          verification: {
            result: 'INCONCLUSIVE',
            registration_number: query.registration_number,
            registration_status: 'UNKNOWN',
            status_semantics: 'UNKNOWN',
            council: query.council,
            uf: query.uf,
          },
          source: {
            authority: 'CrAPi Registry Store',
            provider: 'registry-store',
            live: false,
            registry_store: false,
          },
          data: {
            freshness: 'UNKNOWN',
            acquisition_mode: 'ON_DEMAND',
          },
          confidence: 'LOW',
          queried_at: queriedAt,
        };

    const latencyMs = Date.now() - startedAt;
    const apiRequestId = await this.recordRequest({
      requestId,
      principal,
      httpStatus: 200,
      queryResult: response.verification.result,
      providerId: registry?.provider_id,
      registryStoreHit: Boolean(registry),
      latencyMs,
    });

    if (apiRequestId) {
      await this.db.insert('professional_verifications', {
        api_request_id: apiRequestId,
        registry_id: registry?.id ?? null,
        council: query.council,
        uf: query.uf,
        registration_number: query.registration_number,
        query_result: response.verification.result,
        registration_status: response.verification.registration_status,
        status_semantics: response.verification.status_semantics,
        confidence: response.confidence,
        freshness_state: response.data.freshness,
        provider_id: registry?.provider_id ?? null,
        source_live: false,
        queried_at: queriedAt,
      });
    }

    await this.markKeyUsed(principal.apiKeyId);

    return {
      status: 200,
      body: {
        ...response,
        request_id: requestId,
        quota: {
          daily_limit: quota.daily_limit,
          used: quota.used + 1,
          remaining: Math.max(quota.remaining - 1, 0),
        },
      },
    };
  }
}

import type { SupabaseServerClient } from './supabase-server-client.js';

export type AdminRole = 'OWNER' | 'ADMIN';
export type AdminMembershipStatus = 'ACTIVE' | 'REVOKED';

export interface AdminMembership {
  user_id: string;
  role: AdminRole;
  status: AdminMembershipStatus;
  created_at: string;
  updated_at: string;
}

export class AdminAuthorizationService {
  constructor(private readonly db: SupabaseServerClient) {}

  async getMembership(userId: string): Promise<AdminMembership | null> {
    const rows = await this.db.rpc<AdminMembership>('lookup_admin_membership', {
      p_user_id: userId,
    });
    return rows[0] ?? null;
  }

  async ownerExists(): Promise<boolean> {
    const query = new URLSearchParams({
      select: 'user_id',
      role: 'eq.OWNER',
      status: 'eq.ACTIVE',
      limit: '1',
    });
    const rows = await this.db.select<{ user_id: string }>('admin_memberships', query);
    return rows.length > 0;
  }

  async bootstrapOwner(userId: string): Promise<AdminMembership> {
    const rows = await this.db.rpc<AdminMembership>('bootstrap_admin_owner', {
      p_user_id: userId,
      p_actor_subject: `auth-user:${userId}`,
    });
    const membership = rows[0];
    if (!membership) throw new Error('OWNER_BOOTSTRAP_FAILED');
    return membership;
  }

  async isAuthorized(userId: string): Promise<AdminMembership | null> {
    const membership = await this.getMembership(userId);
    if (!membership || membership.status !== 'ACTIVE') return null;
    if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') return null;
    return membership;
  }
}

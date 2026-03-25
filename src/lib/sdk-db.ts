/**
 * SDK Database client (neon-sdk-db)
 *
 * The SDK backend (Express/Drizzle) uses a separate Postgres database
 * with tenants, api_keys, and sessions tables. This client lets the
 * dashboard provision and sync tenant data in that DB.
 *
 * Uses @neondatabase/serverless for Vercel edge/serverless compatibility.
 * Requires env: SDK_DATABASE_URL
 */

import { Pool } from '@neondatabase/serverless';
import crypto from 'crypto';

let pool: Pool | null = null;

function getPool(): Pool | null {
  if (pool) return pool;
  const url = process.env.SDK_DATABASE_URL;
  if (!url) {
    console.warn('[sdk-db] SDK_DATABASE_URL not set, SDK provisioning disabled');
    return null;
  }
  pool = new Pool({ connectionString: url, max: 3 });
  return pool;
}

/**
 * Generate an SDK API key in the eb_live_* format.
 * Format: eb_live_ + 24 random hex chars (total 32 chars)
 */
export function generateSdkApiKey(): string {
  return `eb_live_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Provision a new tenant + API key in the SDK database.
 * Called during signup (Clerk webhook) after creating the dashboard Org/Project.
 */
export async function provisionSdkTenant(opts: {
  name: string;
  apiKey: string;
  posthogApiKey?: string | null;
  posthogProjectId?: string | null;
  posthogHost?: string | null;
  amplitudeApiKey?: string | null;
  amplitudeSecretKey?: string | null;
}): Promise<{ tenantId: string } | null> {
  const p = getPool();
  if (!p) return null;

  const client = await p.connect();
  try {
    await client.query('BEGIN');

    const tenantResult = await client.query(
      `INSERT INTO tenants (name, api_key_hash, posthog_api_key, posthog_project_id, posthog_host, amplitude_api_key, amplitude_secret_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        opts.name,
        opts.apiKey,
        opts.posthogApiKey || null,
        opts.posthogProjectId || null,
        opts.posthogHost || null,
        opts.amplitudeApiKey || null,
        opts.amplitudeSecretKey || null,
      ]
    );
    const tenantId = tenantResult.rows[0].id;

    const keyPrefix = opts.apiKey.substring(0, 12);
    await client.query(
      `INSERT INTO api_keys (tenant_id, key_prefix, key_hash, name)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, keyPrefix, opts.apiKey, `${opts.name} Production Key`]
    );

    await client.query('COMMIT');
    console.log(`[sdk-db] Provisioned tenant ${tenantId} for "${opts.name}"`);
    return { tenantId };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[sdk-db] Failed to provision tenant:', err);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Sync analytics credentials from dashboard to SDK tenant.
 * Looks up the tenant by api_key_hash (which matches the project's apiKey).
 */
export async function syncTenantAnalytics(opts: {
  apiKey: string;
  posthogApiKey?: string | null;
  posthogProjectId?: string | null;
  posthogHost?: string | null;
  amplitudeApiKey?: string | null;
  amplitudeSecretKey?: string | null;
}): Promise<boolean> {
  const p = getPool();
  if (!p) return false;

  try {
    const result = await p.query(
      `UPDATE tenants SET
        posthog_api_key = COALESCE($2, posthog_api_key),
        posthog_project_id = COALESCE($3, posthog_project_id),
        posthog_host = COALESCE($4, posthog_host),
        amplitude_api_key = COALESCE($5, amplitude_api_key),
        amplitude_secret_key = COALESCE($6, amplitude_secret_key)
       WHERE api_key_hash = $1`,
      [
        opts.apiKey,
        opts.posthogApiKey || null,
        opts.posthogProjectId || null,
        opts.posthogHost || null,
        opts.amplitudeApiKey || null,
        opts.amplitudeSecretKey || null,
      ]
    );
    if (result.rowCount === 0) {
      console.warn(`[sdk-db] No tenant found for apiKey prefix ${opts.apiKey.substring(0, 12)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[sdk-db] Failed to sync analytics:', err);
    return false;
  }
}

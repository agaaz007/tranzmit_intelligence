import { Project } from '@prisma/client';
import { createProjectClient } from '@/lib/posthog-factory';
import { RawUserMetrics } from './types';

const PAGE_SIZE = 5000;

const HOGQL_QUERY = `
SELECT
  distinct_id,
  person.properties.email AS email,
  person.properties.is_pro AS is_pro,
  person.properties.subscription_status AS subscription_status,
  person.created_at AS person_created_at,
  dateDiff('day', max(timestamp), now()) AS days_since_last_event,
  dateDiff('day', maxIf(timestamp, event = 'chat_started'), now()) AS days_since_last_chat_started,
  dateDiff('day', maxIf(timestamp, event = 'message_sent'), now()) AS days_since_last_message_sent,
  uniqIf(properties.$session_id, timestamp > now() - INTERVAL 7 DAY) AS sessions_last_7d,
  uniqIf(properties.$session_id, timestamp > now() - INTERVAL 14 DAY AND timestamp <= now() - INTERVAL 7 DAY) AS sessions_prev_7d,
  countIf(event = 'message_sent' AND timestamp > now() - INTERVAL 7 DAY) AS message_sent_last_7d,
  countIf(event = 'message_sent' AND timestamp > now() - INTERVAL 14 DAY AND timestamp <= now() - INTERVAL 7 DAY) AS message_sent_prev_7d,
  countIf(event = 'chat_started' AND timestamp > now() - INTERVAL 7 DAY) AS chat_started_last_7d,
  countIf(event = 'chat_started' AND timestamp > now() - INTERVAL 14 DAY AND timestamp <= now() - INTERVAL 7 DAY) AS chat_started_prev_7d,
  countIf(event = 'chat_ended' AND timestamp > now() - INTERVAL 7 DAY) AS chat_ended_last_7d,
  countIf(event = 'feature_used' AND timestamp > now() - INTERVAL 7 DAY) AS feature_used_last_7d,
  countIf(event = 'feature_used' AND timestamp > now() - INTERVAL 14 DAY AND timestamp <= now() - INTERVAL 7 DAY) AS feature_used_prev_7d,
  countIf(event = 'paywall_viewed' AND timestamp > now() - INTERVAL 7 DAY) AS paywall_viewed_last_7d,
  countIf(event = 'manage_subscription_tapped' AND timestamp > now() - INTERVAL 30 DAY) AS manage_sub_tapped_last_30d
FROM events
WHERE timestamp > now() - INTERVAL 60 DAY
  AND distinct_id != ''
GROUP BY distinct_id, email, is_pro, subscription_status, person_created_at
HAVING days_since_last_event <= 60
ORDER BY days_since_last_event ASC
`;

function parseRow(row: any[]): RawUserMetrics {
  return {
    distinct_id: String(row[0] ?? ''),
    email: row[1] != null ? String(row[1]) : null,
    is_pro: row[2] === true || row[2] === 'true' || row[2] === 1,
    subscription_status: row[3] != null ? String(row[3]) : null,
    person_created_at: row[4] != null ? String(row[4]) : null,
    days_since_last_event: row[5] != null ? Number(row[5]) : null,
    days_since_last_chat_started: row[6] != null ? Number(row[6]) : null,
    days_since_last_message_sent: row[7] != null ? Number(row[7]) : null,
    sessions_last_7d: Number(row[8] ?? 0),
    sessions_prev_7d: Number(row[9] ?? 0),
    message_sent_last_7d: Number(row[10] ?? 0),
    message_sent_prev_7d: Number(row[11] ?? 0),
    chat_started_last_7d: Number(row[12] ?? 0),
    chat_started_prev_7d: Number(row[13] ?? 0),
    chat_ended_last_7d: Number(row[14] ?? 0),
    feature_used_last_7d: Number(row[15] ?? 0),
    feature_used_prev_7d: Number(row[16] ?? 0),
    paywall_viewed_last_7d: Number(row[17] ?? 0),
    manage_sub_tapped_last_30d: Number(row[18] ?? 0),
  };
}

export async function fetchAllUserMetrics(project: Project): Promise<RawUserMetrics[]> {
  const client = createProjectClient(project);
  const allMetrics: RawUserMetrics[] = [];
  let offset = 0;

  while (true) {
    const paginatedQuery = `${HOGQL_QUERY}LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
    console.log(`[ChurnScoring] Fetching users offset=${offset} for project ${project.id}`);

    const result = await client.executeHogQL(paginatedQuery);
    const rows: any[][] = result.results ?? [];

    for (const row of rows) {
      allMetrics.push(parseRow(row));
    }

    if (rows.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  console.log(`[ChurnScoring] Fetched ${allMetrics.length} users for project ${project.id}`);
  return allMetrics;
}

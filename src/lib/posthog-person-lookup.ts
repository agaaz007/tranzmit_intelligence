import { fetchFromPostHog } from '@/lib/session-sync';

interface PostHogPerson {
  id: number;
  uuid: string;
  distinct_ids: string[];
  properties: Record<string, unknown>;
}

interface PersonResult {
  personUuid: string;
  distinctIds: string[];
  name: string | null;
}

interface PostHogRecording {
  id: string;
  distinct_id: string;
  start_time: string;
  end_time: string;
  recording_duration: number;
  click_count: number;
  keypress_count: number;
  active_seconds: number;
}

/**
 * Find a PostHog person by email using the $email property filter.
 * The search= parameter doesn't match on person properties, so we use
 * the properties query parameter with a $email filter instead.
 */
export async function findPersonByEmail(
  email: string,
  headers: Record<string, string>,
  host: string,
  projectId: string
): Promise<PersonResult | null> {
  // Use property filter on $email — PostHog stores emails as $email
  const propsFilter = JSON.stringify([{ key: '$email', value: email, type: 'person' }]);
  const { response, error } = await fetchFromPostHog(
    host,
    projectId,
    `/persons?properties=${encodeURIComponent(propsFilter)}`,
    headers
  );

  if (!response || error) {
    console.log(`[PersonLookup] Failed to search for ${email}: ${error}`);
    return null;
  }

  const data = await response.json();
  const results: PostHogPerson[] = data.results || [];

  if (results.length === 0) {
    console.log(`[PersonLookup] No person found for email: ${email}`);
    return null;
  }

  const person = results[0];
  return {
    personUuid: person.uuid,
    distinctIds: person.distinct_ids,
    name: (person.properties?.name as string) || (person.properties?.$name as string) || null,
  };
}

/**
 * Get session recordings for a person by their UUID.
 */
export async function getRecordingsForPerson(
  personUuid: string,
  headers: Record<string, string>,
  host: string,
  projectId: string,
  limit: number = 10
): Promise<PostHogRecording[]> {
  const { response, error } = await fetchFromPostHog(
    host,
    projectId,
    `/session_recordings?person_uuid=${personUuid}&limit=${limit}`,
    headers
  );

  if (!response || error) {
    console.log(`[PersonLookup] Failed to get recordings for person ${personUuid}: ${error}`);
    return [];
  }

  const data = await response.json();
  return data.results || [];
}

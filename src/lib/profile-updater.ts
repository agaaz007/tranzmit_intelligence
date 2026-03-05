import { resolveOrCreateProfile } from './identity-resolver';
import { aggregateProfile } from './profile-aggregator';

type EventType = 'session_synced' | 'session_analyzed' | 'interview_completed' | 'churned_batch_processed';

interface ProfileEventInput {
  email?: string | null;
  distinctId?: string | null;
  source?: string | null;
  userType?: string | null;
  displayName?: string | null;
}

export async function updateProfileForEvent(
  projectId: string,
  _eventType: EventType,
  input: ProfileEventInput
): Promise<void> {
  const profile = await resolveOrCreateProfile(projectId, input);
  if (profile) {
    await aggregateProfile(profile.id);
  }
}

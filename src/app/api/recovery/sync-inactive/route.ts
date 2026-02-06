import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface PostHogPerson {
  id: string;
  distinct_ids: string[];
  properties: {
    email?: string;
    $email?: string;
    name?: string;
    $name?: string;
    phone?: string;
    $phone?: string;
    $last_seen_timestamp?: string;
    $first_seen_timestamp?: string;
    [key: string]: unknown;
  };
  created_at: string;
}

// Helper to try fetching from PostHog with both API patterns
async function fetchFromPostHog(
  host: string,
  projectId: string,
  endpoint: string,
  headers: Record<string, string>
): Promise<{ data: any; error?: string }> {
  // Try the newer /api/environments/ pattern first
  const urlPatterns = [
    `${host}/api/environments/${projectId}${endpoint}`,
    `${host}/api/projects/${projectId}${endpoint}`,
  ];

  for (const url of urlPatterns) {
    try {
      console.log(`[PostHog] Trying: ${url}`);
      const response = await fetch(url, { headers });

      if (response.ok) {
        const data = await response.json();
        console.log(`[PostHog] Success with: ${url}`);
        return { data };
      }

      // Log the error but continue to try next pattern
      const errorText = await response.text().catch(() => 'No error body');
      console.log(`[PostHog] Failed (${response.status}): ${url} - ${errorText.substring(0, 200)}`);
    } catch (err) {
      console.log(`[PostHog] Network error for ${url}:`, err);
    }
  }

  return { data: null, error: 'All PostHog API patterns failed' };
}

// POST: Sync inactive users from PostHog
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, count = 10, inactiveDays = 14 } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Get project to retrieve PostHog credentials
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        posthogKey: true,
        posthogHost: true,
        posthogProjId: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const apiKey = project.posthogKey;
    const host = (project.posthogHost || 'https://us.posthog.com').replace(/\/$/, '');
    const posthogProjectId = project.posthogProjId;

    if (!apiKey) {
      return NextResponse.json({
        error: 'PostHog API key not configured for this project',
        details: { projectName: project.name, projectId: project.id }
      }, { status: 400 });
    }

    if (!posthogProjectId) {
      return NextResponse.json({
        error: 'PostHog Project ID not configured for this project',
        details: { projectName: project.name, projectId: project.id }
      }, { status: 400 });
    }

    console.log(`[Inactive Sync] Project: ${project.name}, PostHog Project: ${posthogProjectId}, Host: ${host}`);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    // Calculate the cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

    console.log(`[Inactive Sync] Looking for users inactive since ${cutoffDate.toISOString()}`);

    // Fetch persons from PostHog - fetch more to account for filtering
    const fetchLimit = Math.min(count * 5, 500);
    const { data: personsData, error: fetchError } = await fetchFromPostHog(
      host,
      posthogProjectId,
      `/persons/?limit=${fetchLimit}`,
      headers
    );

    if (fetchError || !personsData) {
      return NextResponse.json({
        error: 'Failed to fetch persons from PostHog',
        details: fetchError,
        hint: 'Check that your PostHog API key has read access to persons'
      }, { status: 502 });
    }

    const allPersons: PostHogPerson[] = personsData.results || [];
    console.log(`[Inactive Sync] Found ${allPersons.length} total persons from PostHog`);

    if (allPersons.length === 0) {
      return NextResponse.json({
        success: true,
        synced: 0,
        skipped: 0,
        total: 0,
        message: 'No persons found in PostHog. Make sure your project has tracked users.',
      });
    }

    // Filter for inactive users
    const inactivePersons = allPersons.filter(person => {
      const lastSeen = person.properties.$last_seen_timestamp;
      if (!lastSeen) {
        // If no last_seen, check created_at
        const createdAt = new Date(person.created_at);
        return createdAt < cutoffDate;
      }
      const lastSeenDate = new Date(lastSeen);
      return lastSeenDate < cutoffDate;
    });

    console.log(`[Inactive Sync] Found ${inactivePersons.length} inactive users (${inactiveDays}+ days)`);

    // Take only the requested count
    const usersToSync = inactivePersons.slice(0, count);

    if (usersToSync.length === 0) {
      return NextResponse.json({
        success: true,
        synced: 0,
        skipped: 0,
        total: allPersons.length,
        message: `No inactive users found (inactive for ${inactiveDays}+ days). All ${allPersons.length} users are active.`,
      });
    }

    // Create/update churned users records
    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const person of usersToSync) {
      const email = person.properties.email || person.properties.$email;
      if (!email) {
        console.log(`[Inactive Sync] Skipping person without email: ${person.id}`);
        skipped++;
        continue;
      }

      const distinctId = person.distinct_ids[0];
      const name = person.properties.name || person.properties.$name || null;
      const phone = person.properties.phone || person.properties.$phone || null;

      try {
        await prisma.churnedUser.upsert({
          where: {
            projectId_email: { projectId, email },
          },
          create: {
            projectId,
            email,
            name,
            phone,
            posthogDistinctId: distinctId,
            analysisStatus: 'pending',
            outreachStatus: 'pending',
          },
          update: {
            name: name || undefined,
            phone: phone || undefined,
            posthogDistinctId: distinctId,
          },
        });

        synced++;
        console.log(`[Inactive Sync] Synced: ${email}`);
      } catch (err) {
        console.error(`[Inactive Sync] Failed to upsert ${email}:`, err);
        errors.push(`Failed: ${email}`);
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      synced,
      skipped,
      total: allPersons.length,
      inactive: inactivePersons.length,
      message: `Synced ${synced} inactive users from PostHog`,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[Inactive Sync] Error:', error);
    return NextResponse.json({
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

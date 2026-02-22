import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findPersonByEmail, getRecordingsForPerson } from '@/lib/posthog-person-lookup';
import { fetchSessionEvents } from '@/lib/session-sync';
import { analyzeSession } from '@/lib/session-analysis';
import { synthesizeInsightsWithSessionLinkage } from '@/lib/session-synthesize';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const BATCH_SIZE = 3; // Process 3 emails per call to respect PostHog rate limits

interface EmailResult {
  email: string;
  status: string;
  recordingCount: number;
  personName: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const { batchId } = await request.json();

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    const batch = await prisma.churnedSessionBatch.findUnique({
      where: { id: batchId },
      include: {
        project: {
          select: {
            id: true,
            posthogKey: true,
            posthogHost: true,
            posthogProjId: true,
          },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const project = batch.project;
    if (!project.posthogKey || !project.posthogProjId) {
      return NextResponse.json(
        { error: 'PostHog API key or Project ID not configured' },
        { status: 400 }
      );
    }

    const host = (project.posthogHost || 'https://us.posthog.com').replace(/\/$/, '');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${project.posthogKey}`,
      'Content-Type': 'application/json',
    };

    // Parse email results
    let emailResults: EmailResult[] = [];
    try {
      emailResults = JSON.parse(batch.emailResults || '[]');
    } catch {
      emailResults = [];
    }

    // Find unprocessed emails
    const pendingEmails = emailResults.filter((r) => r.status === 'pending');
    const emailsToProcess = pendingEmails.slice(0, BATCH_SIZE);

    if (emailsToProcess.length === 0) {
      // All done - run synthesis
      if (batch.status !== 'completed') {
        try {
          await synthesizeInsightsWithSessionLinkage(project.id);
        } catch (err) {
          console.error('[ChurnedSessions] Synthesis failed:', err);
        }

        await prisma.churnedSessionBatch.update({
          where: { id: batchId },
          data: { status: 'completed' },
        });
      }

      return NextResponse.json({
        status: 'completed',
        processedEmails: batch.totalEmails,
        totalEmails: batch.totalEmails,
        emailsFound: batch.emailsFound,
        emailsNotFound: batch.emailsNotFound,
        sessionsImported: batch.sessionsImported,
        hasMore: false,
      });
    }

    // Mark as processing
    if (batch.status === 'pending') {
      await prisma.churnedSessionBatch.update({
        where: { id: batchId },
        data: { status: 'processing' },
      });
    }

    let emailsFoundDelta = 0;
    let emailsNotFoundDelta = 0;
    let sessionsImportedDelta = 0;

    for (const emailEntry of emailsToProcess) {
      const { email } = emailEntry;
      console.log(`[ChurnedSessions] Processing email: ${email}`);

      try {
        // 1. Find person by email
        const person = await findPersonByEmail(email, headers, host, project.posthogProjId!);

        if (!person) {
          emailEntry.status = 'not_found';
          emailsNotFoundDelta++;
          console.log(`[ChurnedSessions] Person not found: ${email}`);
          continue;
        }

        emailEntry.personName = person.name;
        emailEntry.status = 'found';
        emailsFoundDelta++;

        // 2. Get recordings for this person
        const recordings = await getRecordingsForPerson(
          person.personUuid,
          headers,
          host,
          project.posthogProjId!,
          2 // limit to 2 recordings per person to avoid rate limits
        );

        if (recordings.length === 0) {
          emailEntry.recordingCount = 0;
          console.log(`[ChurnedSessions] No recordings for: ${email}`);
          continue;
        }

        emailEntry.recordingCount = recordings.length;

        // 3. For each recording, fetch events and create session
        for (let ri = 0; ri < recordings.length; ri++) {
          const recording = recordings[ri];
          // Delay between recordings to respect rate limits
          if (ri > 0) await sleep(2000);
          try {
            // Check if session already exists
            const existing = await prisma.session.findUnique({
              where: {
                projectId_posthogSessionId: {
                  projectId: project.id,
                  posthogSessionId: recording.id,
                },
              },
              select: { id: true },
            });

            if (existing) {
              console.log(`[ChurnedSessions] Session already exists: ${recording.id}`);
              continue;
            }

            // Fetch rrweb events
            const events = await fetchSessionEvents(
              recording.id,
              headers,
              host,
              project.posthogProjId!
            );

            if (events.length === 0) {
              console.log(`[ChurnedSessions] No events for recording: ${recording.id}`);
              continue;
            }

            // Create session with source='churned'
            const sessionName = `Churned: ${email} - ${new Date(recording.start_time).toLocaleDateString()} ${new Date(recording.start_time).toLocaleTimeString()}`;

            const session = await prisma.session.create({
              data: {
                projectId: project.id,
                source: 'churned',
                posthogSessionId: recording.id,
                name: sessionName,
                distinctId: recording.distinct_id,
                startTime: new Date(recording.start_time),
                endTime: new Date(recording.end_time),
                duration: Math.round(recording.recording_duration),
                events: JSON.stringify(events),
                eventCount: events.length,
                analysisStatus: 'pending',
                metadata: JSON.stringify({
                  batchId,
                  email,
                  personName: person.name,
                  clickCount: recording.click_count,
                  keypressCount: recording.keypress_count,
                  activeSeconds: recording.active_seconds,
                }),
              },
            });

            sessionsImportedDelta++;

            // 4. Run analysis on this session
            try {
              await analyzeSession(session.id);
              console.log(`[ChurnedSessions] Analyzed session: ${session.id}`);
            } catch (err) {
              console.error(`[ChurnedSessions] Analysis failed for session ${session.id}:`, err);
            }
          } catch (err) {
            console.error(`[ChurnedSessions] Failed to import recording ${recording.id}:`, err);
          }
        }
      } catch (err) {
        console.error(`[ChurnedSessions] Error processing email ${email}:`, err);
        emailEntry.status = 'error';
      }
    }

    // Update batch with progress
    const processedCount = emailResults.filter((r) => r.status !== 'pending').length;

    await prisma.churnedSessionBatch.update({
      where: { id: batchId },
      data: {
        processedEmails: processedCount,
        emailsFound: batch.emailsFound + emailsFoundDelta,
        emailsNotFound: batch.emailsNotFound + emailsNotFoundDelta,
        sessionsImported: batch.sessionsImported + sessionsImportedDelta,
        emailResults: JSON.stringify(emailResults),
        status: processedCount >= batch.totalEmails ? 'completed' : 'processing',
      },
    });

    const hasMore = processedCount < batch.totalEmails;

    // If all done, run synthesis
    if (!hasMore) {
      try {
        await synthesizeInsightsWithSessionLinkage(project.id);
      } catch (err) {
        console.error('[ChurnedSessions] Synthesis failed:', err);
      }
    }

    return NextResponse.json({
      status: hasMore ? 'processing' : 'completed',
      processedEmails: processedCount,
      totalEmails: batch.totalEmails,
      emailsFound: batch.emailsFound + emailsFoundDelta,
      emailsNotFound: batch.emailsNotFound + emailsNotFoundDelta,
      sessionsImported: batch.sessionsImported + sessionsImportedDelta,
      hasMore,
    });
  } catch (error) {
    console.error('Churned session process error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}

import { prisma } from "@/lib/prisma"; // Assuming a global prisma client exists here, standard for Next.js+Prisma
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

// DTOs for the returned data
export interface AggregatedInsight {
  id: string;
  theme: string;
  description: string;
  severity: "low" | "medium" | "high";
  impactScore: number;
  sources: Array<{
    reportId: string;
    reportName: string;
    quote: string;
    context: string;
  }>;
}

export interface AggregatedMetrics {
  totalAnalyzed: number;
  averageSatisfaction: number;
  commonFrictionPoints: number;
  willingnessToPayAvg: number;
  timePeriod: string;
}

export interface AggregatedData {
  metrics: AggregatedMetrics;
  insights: AggregatedInsight[];
}

/**
 * EXPERIMENTAL AGDB REPORT LOGIC
 * Fetches real Interview reports from the Prisma Database and synthesizes 
 * them into a single Macro-Aggregated Dashboard report using Gemini 2.5 Flash.
 */
export async function generateExperimentalAGDBReport(projectId: string): Promise<AggregatedData> {
  // 1. Fetch all completed interviews/reports for this project from the database
  const reports = await prisma.interview.findMany({
    where: {
      projectId: projectId,
      status: "completed",
      transcript: { not: null }, // Ensure there is actual data to analyze
    },
    include: {
      insights: true, // Bring in any existing micro-insights attached to the interview
    },
    orderBy: {
      completedAt: 'desc'
    },
    take: 50 // Limit to distinct 50 most recent to avoid overwhelming AI context window, adjust as needed
  });

  if (!reports || reports.length === 0) {
    throw new Error("No completed reports found for this project to aggregate.");
  }

  // 2. Format the retrieved database records into a clean text chunk for Gemini
  const formattedContext = reports.map((report, index) => {
    // Extract micro-insights if they exist
    const childInsights = report.insights.map(i => i.summary).filter(Boolean).join(" | ");

    return \`
    --- REPORT \${index + 1} ---
    REPORT ID: \${report.id}
    USER/SUBJECT: \${report.userName || report.userEmail || 'Anonymous'}
    DATE: \${report.completedAt?.toISOString()}
    
    TRANSCRIPT / CORE NOTES:
    \${report.transcript || report.notes || 'No raw notes available.'}
    
    EXISTING MICRO-INSIGHTS:
    \${childInsights || 'None recorded.'}
    -----------------------
    \`;
  }).join("\\n\\n");

  // 3. Define the strict JSON Output Schema
  const schema = z.object({
    metrics: z.object({
      totalAnalyzed: z.number().describe("Must exactly match the number of reports provided in the context"),
      averageSatisfaction: z.number().describe("Calculated average satisfaction score 0-100 across all users"),
      commonFrictionPoints: z.number().describe("Count of unique macro-level friction points identified"),
      willingnessToPayAvg: z.number().describe("Estimated average willingness to pay (WTP) index 0-100"),
      timePeriod: z.string().describe("The chronological time period these reports cover (e.g. 'Last 30 Days' or 'Q3')"),
    }),
    insights: z.array(z.object({
      id: z.string(),
      theme: z.string().describe("A professional, catchy title for this macro-insight (e.g. 'Somatic Triage')"),
      description: z.string().describe("A 3-sentence executive summary of the insight synthesized from the reports"),
      severity: z.enum(["low", "medium", "high"]).describe("How critical this behavioral insight is for the product"),
      impactScore: z.number().describe("A score from 0-100 indicating the product impact of this insight"),
      sources: z.array(z.object({
        reportId: z.string().describe("The exact REPORT ID from the context that provided this evidence"),
        reportName: z.string().describe("The USER/SUBJECT name from the context"),
        quote: z.string().describe("The exact verbatim quote from the transcript/notes that proves this insight"),
        context: z.string().describe("Provide explanation on why this specific quote matters for this thematic insight")
      }))
    })).describe("An array of 3 to 6 major thematic insights that appear across multiple reports.")
  });

  // 4. Execute the prompt via Gemini 2.5 Flash
  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: schema,
      prompt: \`
        You are an elite Consumer Intelligence Analyst and Behavioral Data Scientist for a voice AI research startup.
        Your objective is to ingest the following batch of \${reports.length} raw customer interview reports and synthesize an "Aggregated Analysis Dashboard" (AGDB).
        
        You must find the underlying behavioral patterns, identify systemic product friction, and gauge willingness-to-pay.
        Whenever you identify a thematic insight, you MUST pull direct quotes from the specific reports to back up your claims, serving as an "empathy bridge".
        
        RAW DATABASE REPORTS:
        \${formattedContext}
        
        Analyze these reports according to the JSON schema provided. Ensure accuracy, don't hallucinate quotes that don't exist in the text, and map quotes precisely to the report ID they came from.
      \`,
    });

    return object;
  } catch (error) {
    console.error("Experimental AGDB Report Generation Failed:", error);
    throw new Error("Failed to synthesize database reports via Gemini.");
  }
}

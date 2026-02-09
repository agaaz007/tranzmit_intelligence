"use server";

import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { sampleReport1, sampleReport2 } from "../sample-reports";

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

export async function fetchAggregatedDashboardData(): Promise<AggregatedData> {
  const schema = z.object({
    metrics: z.object({
      totalAnalyzed: z.number().describe("Total number of reports analyzed (should be 2 based on the input)"),
      averageSatisfaction: z.number().describe("Average satisfaction score 0-100"),
      commonFrictionPoints: z.number().describe("Number of major friction points identified"),
      willingnessToPayAvg: z.number().describe("Average willingness to pay index 0-100"),
      timePeriod: z.string().describe("The time period this data covers, e.g. Q1 2026"),
    }),
    insights: z.array(z.object({
      id: z.string(),
      theme: z.string().describe("A catchy title for this macro-insight"),
      description: z.string().describe("A 2-3 sentence description of the insight synthesized from the reports"),
      severity: z.enum(["low", "medium", "high"]).describe("How critical this insight is for product strategy"),
      impactScore: z.number().describe("A score from 0-100 representing the impact of this insight"),
      sources: z.array(z.object({
        reportId: z.string().describe("The Respondent ID or report ID"),
        reportName: z.string().describe("The archetype or subject name"),
        quote: z.string().describe("The exact verbatim quote from the report that proves this insight"),
        context: z.string().describe("Provide explanation on why this quote matters for this insight")
      }))
    }))
  });

  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: schema,
      prompt: \`
        You are a Consumer Intelligence Analyst for a voice AI startup.
        Your task is to analyze the following individual user research reports and synthesize an aggregated dashboard view.
        The dashboard should provide macro-level metrics and thematic insights.
        Whenever you identify a thematic insight, you MUST pull direct quotes from the reports to back up your claims, serving as an "empathy bridge".
        
        Here are the reports (in Text format):
        
        REPORT 1:
        ---
        \${sampleReport1}
        ---
        
        REPORT 2:
        ---
        \${sampleReport2}
        ---
        
        Aggregate these reports according to the JSON schema provided. Look deeply into their behaviors, frictions, and willingness to pay (WTP). Ensure you cite properly where the insights came from.
      \`,
    });

    return object;
  } catch (error) {
    console.error("Error generating aggregated insights from Gemini:", error);
    throw new Error("Failed to generate insights from Gemini");
  }
}

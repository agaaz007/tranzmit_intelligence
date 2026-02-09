/**
 * Parses uploaded HTML customer insight reports and extracts structured data.
 * Designed to work with Growth & Experience Audit style reports.
 */

export interface ParsedKPI {
  label: string;
  value: string;
  type: 'risk' | 'positive' | 'opportunity';
}

export interface ParsedVerbatim {
  text: string;
  context?: string;
}

export interface ParsedInsightCard {
  type: 'pain' | 'gap' | 'behavior';
  label: string;
  title: string;
  body: string;
}

export interface ParsedIssue {
  id: string;
  title: string;
  verbatims: ParsedVerbatim[];
  insights: ParsedInsightCard[];
  priorityScore: number;
  sentiment: number;
  category: string;
}

export interface ParsedRecommendation {
  title: string;
  description: string;
}

export interface ParsedReport {
  title: string;
  subtitle: string;
  executiveSummary: string;
  kpis: ParsedKPI[];
  issues: ParsedIssue[];
  recommendations: ParsedRecommendation[];
  totalVerbatims: number;
  avgSentiment: number;
  reportDate: string;
}

function classifyKpiType(el: Element): 'risk' | 'positive' | 'opportunity' {
  const classes = el.querySelector('span')?.className || '';
  const text = el.textContent?.toLowerCase() || '';
  if (classes.includes('text-red') || text.includes('churn') || text.includes('risk') || text.includes('friction')) return 'risk';
  if (classes.includes('text-green') || text.includes('retention') || text.includes('moat')) return 'positive';
  return 'opportunity';
}

function classifyInsightType(el: Element): 'pain' | 'gap' | 'behavior' {
  if (el.classList.contains('pain')) return 'pain';
  if (el.classList.contains('gap')) return 'gap';
  if (el.classList.contains('behavior')) return 'behavior';

  const label = el.querySelector('.card-label')?.textContent?.toLowerCase() || '';
  if (label.includes('risk') || label.includes('pain') || label.includes('ceiling')) return 'pain';
  if (label.includes('opportunity') || label.includes('upsell') || label.includes('catalyst')) return 'gap';
  return 'behavior';
}

function estimateSentiment(insightType: 'pain' | 'gap' | 'behavior'): number {
  switch (insightType) {
    case 'pain': return -0.8;
    case 'gap': return -0.4;
    case 'behavior': return 0.3;
  }
}

function classifyCategory(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('churn') || lower.includes('friction') || lower.includes('risk')) return 'Churn Risk';
  if (lower.includes('retention') || lower.includes('moat') || lower.includes('empathy')) return 'Retention';
  if (lower.includes('monetiz') || lower.includes('revenue') || lower.includes('acv') || lower.includes('upsell')) return 'Monetization';
  if (lower.includes('strateg') || lower.includes('intervention') || lower.includes('product')) return 'Strategy';
  return 'General';
}

export function parseHTMLReport(html: string): ParsedReport {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Title & subtitle
  const title = doc.querySelector('h1')?.textContent?.trim() || 'Untitled Report';
  const subtitle = doc.querySelector('.subtitle')?.textContent?.trim() || '';

  // Executive summary
  const summaryBox = doc.querySelector('.summary-box');
  const summaryParagraphs = summaryBox?.querySelectorAll('p') || [];
  const executiveSummary = Array.from(summaryParagraphs)
    .map(p => p.textContent?.trim())
    .filter(Boolean)
    .join(' ');

  // KPIs
  const kpiItems = doc.querySelectorAll('.kpi-item');
  const kpis: ParsedKPI[] = Array.from(kpiItems).map(item => {
    const label = item.querySelector('h4')?.textContent?.trim() || '';
    const value = item.querySelector('span')?.textContent?.trim() || '';
    return { label, value, type: classifyKpiType(item) };
  });

  // Parse sections into issues
  const sections = doc.querySelectorAll('section');
  const issues: ParsedIssue[] = [];
  let issueIndex = 0;

  sections.forEach(section => {
    const sectionTitle = section.querySelector('h2')?.textContent?.trim() || '';
    if (!sectionTitle) return;

    // Extract verbatims from this section
    const verbatimBlocks = section.querySelectorAll('.verbatim-block');
    const verbatims: ParsedVerbatim[] = Array.from(verbatimBlocks).map(block => {
      const textEl = block.querySelector('.verbatim-text');
      if (!textEl) return { text: '' };

      // Separate main text from context spans
      const contextEl = textEl.querySelector('span');
      const contextText = contextEl?.textContent?.trim().replace(/^\*/, '').replace(/\*$/, '') || undefined;

      // Get the full text, then remove the context portion
      let mainText = textEl.textContent?.trim() || '';
      if (contextText) {
        mainText = mainText.replace(contextText, '').trim();
      }
      // Clean up extra whitespace
      mainText = mainText.replace(/\s+/g, ' ').trim();

      return { text: mainText, context: contextText };
    }).filter(v => v.text.length > 0);

    // Extract insight cards from this section
    const insightCards = section.querySelectorAll('.insight-card');
    const insights: ParsedInsightCard[] = Array.from(insightCards).map(card => {
      const type = classifyInsightType(card);
      const label = card.querySelector('.card-label')?.textContent?.trim() || '';
      const cardTitle = card.querySelector('.card-title')?.textContent?.trim() || '';
      const body = card.querySelector('.card-body')?.textContent?.trim() || '';
      return { type, label, title: cardTitle, body };
    });

    // Skip the "Strategic" section — those become recommendations
    if (sectionTitle.toLowerCase().includes('strateg') || sectionTitle.toLowerCase().includes('intervention')) {
      return;
    }

    // Compute a priority score based on insights composition
    const painCount = insights.filter(i => i.type === 'pain').length;
    const gapCount = insights.filter(i => i.type === 'gap').length;
    const basePriority = painCount * 35 + gapCount * 20 + verbatims.length * 10;
    const priorityScore = Math.min(100, Math.max(10, basePriority + (sections.length - issueIndex) * 5));

    const avgSentiment = insights.length > 0
      ? insights.reduce((sum, i) => sum + estimateSentiment(i.type), 0) / insights.length
      : -0.5;

    issues.push({
      id: `issue-${issueIndex}`,
      title: sectionTitle.replace(/^[IVX]+\.\s*/, '').trim(),
      verbatims,
      insights,
      priorityScore: Math.round(priorityScore),
      sentiment: parseFloat(avgSentiment.toFixed(2)),
      category: classifyCategory(sectionTitle),
    });

    issueIndex++;
  });

  // Sort issues by priority score descending
  issues.sort((a, b) => b.priorityScore - a.priorityScore);

  // Extract recommendations from strategic section
  const recommendations: ParsedRecommendation[] = [];
  const takeawaysBox = doc.querySelector('.takeaways-box');
  if (takeawaysBox) {
    const h3s = takeawaysBox.querySelectorAll('h3');
    h3s.forEach(h3 => {
      const recTitle = h3.textContent?.trim() || '';
      // Get the paragraph immediately following the h3
      let nextEl = h3.nextElementSibling;
      let desc = '';
      while (nextEl && nextEl.tagName !== 'H3') {
        desc += (nextEl.textContent?.trim() || '') + ' ';
        nextEl = nextEl.nextElementSibling;
      }
      if (recTitle) {
        recommendations.push({
          title: recTitle.replace(/^\d+\.\s*/, '').trim(),
          description: desc.trim(),
        });
      }
    });
  }

  const totalVerbatims = issues.reduce((sum, issue) => sum + issue.verbatims.length, 0);
  const avgSentiment = issues.length > 0
    ? issues.reduce((sum, issue) => sum + issue.sentiment, 0) / issues.length
    : 0;

  return {
    title,
    subtitle,
    executiveSummary,
    kpis,
    issues,
    recommendations,
    totalVerbatims,
    avgSentiment: parseFloat(avgSentiment.toFixed(2)),
    reportDate: new Date().toISOString(),
  };
}

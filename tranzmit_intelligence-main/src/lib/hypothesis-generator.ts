/**
 * Hypothesis Generator
 * Generates evidence-backed hypotheses and interview questions from behavioral data
 */

import { prisma } from './prisma';
import { BehavioralSignal } from './posthog';

export interface GeneratedHypothesis {
  title: string;
  description: string;
  behaviorPattern: string;
  confidence: number;
  evidence: string[];
  questions: GeneratedQuestion[];
}

export interface GeneratedQuestion {
  question: string;
  purpose: string;
  category: 'opening' | 'discovery' | 'pain_point' | 'solution' | 'closing';
  priority: number;
}

// Hypothesis templates based on signal types
const HYPOTHESIS_TEMPLATES: Record<BehavioralSignal['type'], {
  templates: Array<{
    title: string;
    description: string;
    confidence: number;
  }>;
  questions: GeneratedQuestion[];
}> = {
  funnel_dropoff: {
    templates: [
      {
        title: 'UX friction at critical conversion point',
        description: 'Users are encountering unexpected friction or confusion at this step that prevents them from completing the desired action.',
        confidence: 0.7,
      },
      {
        title: 'Missing information or unclear value proposition',
        description: 'Users may not have enough information or clarity about what happens next to feel comfortable proceeding.',
        confidence: 0.65,
      },
      {
        title: 'Technical or performance issues',
        description: 'Users may be experiencing technical problems like slow loading, errors, or broken functionality at this step.',
        confidence: 0.5,
      },
    ],
    questions: [
      {
        question: 'Can you walk me through what happened when you reached this step?',
        purpose: 'Understand the exact moment of friction',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'What were you expecting to see or happen at this point?',
        purpose: 'Identify expectation mismatches',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Was there anything confusing or unclear about this step?',
        purpose: 'Surface UX friction points',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'Did you encounter any errors or technical issues?',
        purpose: 'Identify technical blockers',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'What would have made it easier for you to complete this step?',
        purpose: 'Gather improvement suggestions',
        category: 'solution',
        priority: 3,
      },
    ],
  },

  churn_risk: {
    templates: [
      {
        title: 'Unmet core value expectation',
        description: 'Users initially saw value in the product but are not experiencing the core benefit they expected.',
        confidence: 0.75,
      },
      {
        title: 'Feature gap or missing capability',
        description: 'Users need functionality that the product doesn\'t currently provide, leading to disengagement.',
        confidence: 0.6,
      },
      {
        title: 'Changed circumstances or priorities',
        description: 'External factors in the user\'s life or work may have reduced their need for the product.',
        confidence: 0.5,
      },
    ],
    questions: [
      {
        question: 'What initially brought you to our product? What problem were you trying to solve?',
        purpose: 'Understand initial motivation and expectations',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'Has the product been helping you achieve that goal? Why or why not?',
        purpose: 'Assess value delivery',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'What would need to change for you to use the product more regularly?',
        purpose: 'Identify re-engagement opportunities',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'Are you using any alternatives or workarounds for things our product doesn\'t do?',
        purpose: 'Surface feature gaps',
        category: 'discovery',
        priority: 4,
      },
      {
        question: 'If you could change one thing about the product, what would it be?',
        purpose: 'Prioritize improvements',
        category: 'solution',
        priority: 3,
      },
    ],
  },

  error_encounter: {
    templates: [
      {
        title: 'Critical workflow blocker',
        description: 'Errors are preventing users from completing key tasks, causing significant frustration.',
        confidence: 0.8,
      },
      {
        title: 'Edge case handling gaps',
        description: 'The product doesn\'t handle certain user inputs or scenarios gracefully.',
        confidence: 0.65,
      },
      {
        title: 'Integration or data issues',
        description: 'Problems with external integrations or data handling are causing errors.',
        confidence: 0.55,
      },
    ],
    questions: [
      {
        question: 'Can you describe what you were trying to do when you encountered the error?',
        purpose: 'Understand error context',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'How did the error affect what you were trying to accomplish?',
        purpose: 'Assess impact severity',
        category: 'pain_point',
        priority: 5,
      },
      {
        question: 'Was the error message helpful in understanding what went wrong?',
        purpose: 'Evaluate error messaging',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'Did you find a workaround, or did you have to give up on the task?',
        purpose: 'Understand user resilience and alternatives',
        category: 'discovery',
        priority: 3,
      },
      {
        question: 'How often do you encounter errors when using the product?',
        purpose: 'Gauge error frequency',
        category: 'discovery',
        priority: 3,
      },
    ],
  },

  low_engagement: {
    templates: [
      {
        title: 'Onboarding gap or incomplete setup',
        description: 'Users may not have completed onboarding or understood how to get value from the product.',
        confidence: 0.7,
      },
      {
        title: 'Product-market fit mismatch',
        description: 'The product may not be the right solution for this user\'s specific needs.',
        confidence: 0.55,
      },
      {
        title: 'Competing priorities or time constraints',
        description: 'Users may intend to use the product but haven\'t found the time or established a habit.',
        confidence: 0.5,
      },
    ],
    questions: [
      {
        question: 'What made you sign up for our product originally?',
        purpose: 'Understand initial interest',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'Have you had a chance to explore the main features? What\'s your impression so far?',
        purpose: 'Assess onboarding completion',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Is there anything preventing you from using the product more often?',
        purpose: 'Surface blockers to engagement',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'What would make this product a must-have for you?',
        purpose: 'Identify value gaps',
        category: 'solution',
        priority: 4,
      },
      {
        question: 'How does our product compare to other solutions you\'ve tried?',
        purpose: 'Understand competitive landscape',
        category: 'discovery',
        priority: 3,
      },
    ],
  },

  rage_click: {
    templates: [
      {
        title: 'Non-responsive UI element',
        description: 'Users are clicking on elements that look clickable but don\'t respond as expected.',
        confidence: 0.85,
      },
      {
        title: 'Slow response time frustration',
        description: 'Users are repeatedly clicking because the UI is not responding quickly enough.',
        confidence: 0.7,
      },
    ],
    questions: [
      {
        question: 'Have you noticed any parts of the interface that don\'t respond when you click?',
        purpose: 'Confirm UI responsiveness issues',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Are there times when the app feels slow or unresponsive?',
        purpose: 'Identify performance issues',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'What do you expect to happen when you click on [specific element]?',
        purpose: 'Understand expectation mismatch',
        category: 'discovery',
        priority: 4,
      },
    ],
  },

  high_session_time: {
    templates: [
      {
        title: 'Complex workflow requiring simplification',
        description: 'Users are spending excessive time because tasks are more complicated than necessary.',
        confidence: 0.6,
      },
      {
        title: 'High engagement power user',
        description: 'Users are deeply engaged and finding significant value (positive signal).',
        confidence: 0.7,
      },
    ],
    questions: [
      {
        question: 'What tasks do you typically spend the most time on in the product?',
        purpose: 'Identify time-consuming workflows',
        category: 'discovery',
        priority: 4,
      },
      {
        question: 'Are there any tasks that feel like they take longer than they should?',
        purpose: 'Surface efficiency opportunities',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'What features do you find most valuable?',
        purpose: 'Understand value drivers',
        category: 'discovery',
        priority: 3,
      },
    ],
  },

  repeat_visitor: {
    templates: [
      {
        title: 'High intent but incomplete conversion',
        description: 'Users are returning frequently, indicating interest, but haven\'t converted.',
        confidence: 0.65,
      },
    ],
    questions: [
      {
        question: 'What brings you back to the site/app repeatedly?',
        purpose: 'Understand return motivation',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Is there something specific you\'re trying to decide or evaluate?',
        purpose: 'Identify decision blockers',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'What information would help you make a decision?',
        purpose: 'Surface information gaps',
        category: 'solution',
        priority: 4,
      },
    ],
  },

  technical_victim: {
    templates: [
      {
        title: 'Technical blocker preventing completion',
        description: 'User encountered errors, browser compatibility issues, or technical problems that prevented them from completing their goal.',
        confidence: 0.85,
      },
      {
        title: 'Environment-specific bug',
        description: 'Issues may be specific to certain browsers, devices, or network conditions that need investigation.',
        confidence: 0.75,
      },
    ],
    questions: [
      {
        question: 'Did you encounter any error messages or unexpected behavior?',
        purpose: 'Confirm technical issues',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'What browser and device were you using when the issue occurred?',
        purpose: 'Identify environment-specific issues',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Can you describe exactly what happened when things went wrong?',
        purpose: 'Get detailed bug report',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'Were you able to find any workaround, or did you have to stop completely?',
        purpose: 'Assess severity and user resilience',
        category: 'pain_point',
        priority: 3,
      },
    ],
  },

  confused_browser: {
    templates: [
      {
        title: 'UX confusion causing abandonment',
        description: 'User spent significant time trying to understand the interface, indicating unclear design or missing guidance.',
        confidence: 0.8,
      },
      {
        title: 'Information architecture mismatch',
        description: 'User couldn\'t find what they were looking for, suggesting navigation or labeling issues.',
        confidence: 0.7,
      },
      {
        title: 'Unclear value proposition or next steps',
        description: 'User engaged deeply but didn\'t convert, possibly due to unclear benefits or call-to-action.',
        confidence: 0.65,
      },
    ],
    questions: [
      {
        question: 'Can you walk me through what you were trying to accomplish during your visit?',
        purpose: 'Understand user intent and goals',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'Was there anything confusing or hard to find in the interface?',
        purpose: 'Surface UX friction points',
        category: 'pain_point',
        priority: 5,
      },
      {
        question: 'What were you expecting to see that you didn\'t find?',
        purpose: 'Identify expectation gaps',
        category: 'discovery',
        priority: 4,
      },
      {
        question: 'At what point did you decide to stop? What was going through your mind?',
        purpose: 'Understand abandonment trigger',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'What would have made the experience clearer or easier?',
        purpose: 'Gather improvement suggestions',
        category: 'solution',
        priority: 3,
      },
    ],
  },

  wrong_fit: {
    templates: [
      {
        title: 'Product-market fit mismatch',
        description: 'User quickly determined the product doesn\'t meet their needs - may be targeting wrong audience.',
        confidence: 0.6,
      },
      {
        title: 'Misaligned expectations from acquisition',
        description: 'User arrived with expectations that don\'t match what the product offers, possibly due to marketing messaging.',
        confidence: 0.55,
      },
    ],
    questions: [
      {
        question: 'What were you hoping to find or accomplish when you visited?',
        purpose: 'Understand initial expectations',
        category: 'opening',
        priority: 4,
      },
      {
        question: 'How did you hear about us or find us?',
        purpose: 'Identify acquisition channel alignment',
        category: 'discovery',
        priority: 3,
      },
      {
        question: 'What would a product need to have for it to be useful to you?',
        purpose: 'Understand actual needs',
        category: 'discovery',
        priority: 3,
      },
    ],
  },

  // =============================================
  // NEW SIGNAL TYPES FROM ENHANCED PERSONS API
  // =============================================

  new_user: {
    templates: [
      {
        title: 'Onboarding experience needs optimization',
        description: 'New users in their first week have high potential for feedback on initial experience and first impressions.',
        confidence: 0.75,
      },
      {
        title: 'First value moment may not be clear',
        description: 'New users need quick time-to-value - understanding their early journey reveals onboarding gaps.',
        confidence: 0.7,
      },
    ],
    questions: [
      {
        question: 'What was your very first impression when you signed up?',
        purpose: 'Capture initial sentiment',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'Did you find what you were looking for in your first session?',
        purpose: 'Assess first-session success',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Was there anything confusing during your first few minutes using the product?',
        purpose: 'Surface onboarding friction',
        category: 'pain_point',
        priority: 5,
      },
      {
        question: 'What made you decide to sign up? What problem were you hoping to solve?',
        purpose: 'Understand acquisition motivation',
        category: 'discovery',
        priority: 4,
      },
      {
        question: 'What would have made your first experience better?',
        purpose: 'Gather onboarding improvements',
        category: 'solution',
        priority: 4,
      },
    ],
  },

  mobile_user: {
    templates: [
      {
        title: 'Mobile experience may need optimization',
        description: 'Mobile users often have different needs and constraints - touch targets, screen size, and mobile context matter.',
        confidence: 0.7,
      },
      {
        title: 'On-the-go use cases may differ',
        description: 'Mobile users often have different contexts and time constraints than desktop users.',
        confidence: 0.6,
      },
    ],
    questions: [
      {
        question: 'Do you primarily use the product on mobile or desktop? Why?',
        purpose: 'Understand device preference context',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'Are there features that are harder to use on mobile?',
        purpose: 'Surface mobile-specific friction',
        category: 'pain_point',
        priority: 5,
      },
      {
        question: 'Where and when do you typically use the product on mobile?',
        purpose: 'Understand mobile context',
        category: 'discovery',
        priority: 4,
      },
      {
        question: 'What features do you wish worked better on mobile?',
        purpose: 'Prioritize mobile improvements',
        category: 'solution',
        priority: 4,
      },
    ],
  },

  international_user: {
    templates: [
      {
        title: 'Localization or language barriers',
        description: 'International users may face language, currency, or cultural context issues that affect their experience.',
        confidence: 0.65,
      },
      {
        title: 'Timezone-related challenges',
        description: 'Users in different timezones may have support, sync, or scheduling issues.',
        confidence: 0.55,
      },
    ],
    questions: [
      {
        question: 'Is there anything about the product that doesn\'t quite fit your local context?',
        purpose: 'Surface localization issues',
        category: 'discovery',
        priority: 4,
      },
      {
        question: 'Are there language, currency, or format issues you\'ve encountered?',
        purpose: 'Identify i18n gaps',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'Do you face any challenges with timing, support, or availability?',
        purpose: 'Understand timezone impact',
        category: 'pain_point',
        priority: 3,
      },
    ],
  },

  organic_traffic: {
    templates: [
      {
        title: 'Content and SEO expectations alignment',
        description: 'Organic search users found you through specific queries - their expectations may reveal content-to-product alignment.',
        confidence: 0.6,
      },
    ],
    questions: [
      {
        question: 'What were you searching for when you found us?',
        purpose: 'Understand search intent',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'Did the product match what you were expecting based on your search?',
        purpose: 'Assess search-to-product fit',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'What content or information helped you understand what we offer?',
        purpose: 'Evaluate content effectiveness',
        category: 'discovery',
        priority: 4,
      },
    ],
  },

  paid_traffic: {
    templates: [
      {
        title: 'Ad-to-landing page experience alignment',
        description: 'Paid users came through specific campaigns - understanding their journey reveals ad-to-conversion optimization opportunities.',
        confidence: 0.7,
      },
      {
        title: 'Campaign targeting accuracy',
        description: 'These users represent direct marketing ROI - their fit indicates targeting quality.',
        confidence: 0.65,
      },
    ],
    questions: [
      {
        question: 'Do you remember what ad or promotion brought you to us?',
        purpose: 'Connect user to campaign',
        category: 'opening',
        priority: 4,
      },
      {
        question: 'Did what you found match what the ad promised?',
        purpose: 'Assess ad-to-experience alignment',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'What ultimately convinced you to sign up or try the product?',
        purpose: 'Understand conversion drivers',
        category: 'discovery',
        priority: 4,
      },
      {
        question: 'Would you recommend this product to someone else? Why or why not?',
        purpose: 'Gauge satisfaction and referral potential',
        category: 'closing',
        priority: 3,
      },
    ],
  },

  returning_visitor: {
    templates: [
      {
        title: 'Strong retention driver identification',
        description: 'Returning visitors are showing product-market fit - understanding what brings them back is valuable.',
        confidence: 0.75,
      },
      {
        title: 'Habit formation success',
        description: 'Regular return visits indicate successful habit loops - understanding these can help replicate for other users.',
        confidence: 0.7,
      },
    ],
    questions: [
      {
        question: 'What brings you back to use the product regularly?',
        purpose: 'Identify retention drivers',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'Has the product become part of your regular workflow? How?',
        purpose: 'Understand habit integration',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'What features do you use most often?',
        purpose: 'Identify core value features',
        category: 'discovery',
        priority: 4,
      },
      {
        question: 'What would make you stop using the product?',
        purpose: 'Identify churn risk factors',
        category: 'pain_point',
        priority: 4,
      },
    ],
  },

  power_user: {
    templates: [
      {
        title: 'Power user as product advocate opportunity',
        description: 'Power users are highly engaged and can provide deep insights, testimonials, and referrals.',
        confidence: 0.8,
      },
      {
        title: 'Advanced feature demand',
        description: 'Power users often push product limits and need more sophisticated capabilities.',
        confidence: 0.7,
      },
    ],
    questions: [
      {
        question: 'What makes you spend so much time with the product?',
        purpose: 'Understand deep engagement drivers',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'Are there advanced features you wish existed?',
        purpose: 'Gather power user feature requests',
        category: 'pain_point',
        priority: 5,
      },
      {
        question: 'Have you recommended the product to others? What do you tell them?',
        purpose: 'Capture testimonial content',
        category: 'discovery',
        priority: 4,
      },
      {
        question: 'What workflows have you built around the product?',
        purpose: 'Understand advanced use cases',
        category: 'discovery',
        priority: 4,
      },
      {
        question: 'Would you be interested in beta testing new features?',
        purpose: 'Identify beta testers',
        category: 'closing',
        priority: 3,
      },
    ],
  },

  feature_adopter: {
    templates: [
      {
        title: 'Feature-specific feedback opportunity',
        description: 'Users who engage with specific features can provide targeted feedback on that functionality.',
        confidence: 0.7,
      },
    ],
    questions: [
      {
        question: 'What made you try this particular feature?',
        purpose: 'Understand feature adoption motivation',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'How well does this feature solve your need?',
        purpose: 'Assess feature effectiveness',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'What would make this feature more useful for you?',
        purpose: 'Gather feature improvements',
        category: 'solution',
        priority: 4,
      },
    ],
  },

  upgrade_candidate: {
    templates: [
      {
        title: 'Premium conversion opportunity',
        description: 'Users showing upgrade-worthy behavior may convert with the right offer or feature.',
        confidence: 0.65,
      },
    ],
    questions: [
      {
        question: 'Have you considered upgrading to a premium plan? What would influence that decision?',
        purpose: 'Understand upgrade barriers',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'What premium features would be most valuable to you?',
        purpose: 'Prioritize premium feature development',
        category: 'solution',
        priority: 5,
      },
      {
        question: 'What price point would you consider fair for those features?',
        purpose: 'Gather pricing feedback',
        category: 'discovery',
        priority: 4,
      },
    ],
  },

  // =============================================
  // ADVANCED FRICTION SIGNAL TEMPLATES
  // =============================================

  step_retry: {
    templates: [
      {
        title: 'Step requires multiple attempts to complete',
        description: 'Users are retrying the same action multiple times, indicating unclear feedback or confusing UI.',
        confidence: 0.85,
      },
      {
        title: 'Action success state is unclear',
        description: 'Users may not know if their action succeeded, leading to unnecessary retries.',
        confidence: 0.75,
      },
    ],
    questions: [
      {
        question: 'When you tried to complete this step, what happened the first time?',
        purpose: 'Understand initial failure experience',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Was it clear whether your action succeeded or failed?',
        purpose: 'Assess feedback clarity',
        category: 'pain_point',
        priority: 5,
      },
      {
        question: 'What made you try again instead of giving up?',
        purpose: 'Understand user motivation and persistence',
        category: 'discovery',
        priority: 4,
      },
      {
        question: 'What would have made this easier to complete on the first try?',
        purpose: 'Gather UX improvement suggestions',
        category: 'solution',
        priority: 4,
      },
    ],
  },

  step_loop: {
    templates: [
      {
        title: 'Users stuck in navigation loop',
        description: 'Users are going back and forth between steps, unable to find what they need or complete their goal.',
        confidence: 0.9,
      },
      {
        title: 'Information architecture confusion',
        description: 'The flow between steps may be unclear, causing users to backtrack repeatedly.',
        confidence: 0.8,
      },
    ],
    questions: [
      {
        question: 'I noticed you went back and forth between these screens - what were you trying to find?',
        purpose: 'Identify the missing information or unclear flow',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'At what point did you feel lost or confused?',
        purpose: 'Pinpoint confusion moment',
        category: 'pain_point',
        priority: 5,
      },
      {
        question: 'What information would have helped you move forward?',
        purpose: 'Surface information gaps',
        category: 'solution',
        priority: 4,
      },
      {
        question: 'How would you expect the flow to work ideally?',
        purpose: 'Gather user expectations for redesign',
        category: 'solution',
        priority: 3,
      },
    ],
  },

  high_time_variance: {
    templates: [
      {
        title: 'Step takes abnormally long to complete',
        description: 'Users are spending much longer than average on this step, suggesting confusion or complexity.',
        confidence: 0.75,
      },
      {
        title: 'Hidden complexity or unclear requirements',
        description: 'The step may have unclear requirements or hidden complexity not visible upfront.',
        confidence: 0.7,
      },
    ],
    questions: [
      {
        question: 'This step seemed to take you a while - what was going through your mind?',
        purpose: 'Understand the source of delay',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Was there anything you needed to look up or figure out during this step?',
        purpose: 'Identify information gaps',
        category: 'pain_point',
        priority: 5,
      },
      {
        question: 'Were the instructions or requirements clear from the start?',
        purpose: 'Assess instruction clarity',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'What would have helped you complete this faster?',
        purpose: 'Gather efficiency improvement ideas',
        category: 'solution',
        priority: 4,
      },
    ],
  },

  feature_abandoned: {
    templates: [
      {
        title: 'Feature tried but not adopted',
        description: 'User tried a feature once but never returned to it, suggesting it didn\'t meet expectations.',
        confidence: 0.8,
      },
      {
        title: 'Feature discovery succeeded but value unclear',
        description: 'User found the feature but didn\'t see enough value to continue using it.',
        confidence: 0.7,
      },
    ],
    questions: [
      {
        question: 'You tried [feature] once but didn\'t come back to it - what was your experience?',
        purpose: 'Understand initial feature experience',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'Did the feature do what you expected? Why or why not?',
        purpose: 'Assess expectation alignment',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'What would make this feature more valuable to you?',
        purpose: 'Gather feature improvement ideas',
        category: 'solution',
        priority: 4,
      },
      {
        question: 'Are you using something else to accomplish this task?',
        purpose: 'Identify competing solutions',
        category: 'discovery',
        priority: 4,
      },
    ],
  },

  feature_regression: {
    templates: [
      {
        title: 'Previously used feature now abandoned',
        description: 'User was actively using a feature but completely stopped, possibly due to a recent change or found alternative.',
        confidence: 0.85,
      },
      {
        title: 'Feature value diminished over time',
        description: 'Initial feature value didn\'t sustain, or user\'s needs changed.',
        confidence: 0.7,
      },
    ],
    questions: [
      {
        question: 'You used to use [feature] regularly but stopped recently - what changed?',
        purpose: 'Identify reason for stopping',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'Did something about the feature change, or did your needs change?',
        purpose: 'Distinguish product vs user change',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Are you accomplishing that task differently now?',
        purpose: 'Identify workarounds or alternatives',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'What would bring you back to using this feature?',
        purpose: 'Gather re-engagement requirements',
        category: 'solution',
        priority: 4,
      },
    ],
  },

  engagement_decay: {
    templates: [
      {
        title: 'User engagement declining significantly',
        description: 'User activity has dropped substantially compared to previous weeks, early churn signal.',
        confidence: 0.8,
      },
      {
        title: 'Habit loop breaking down',
        description: 'User had established a usage pattern that is now deteriorating.',
        confidence: 0.7,
      },
    ],
    questions: [
      {
        question: 'We noticed you\'ve been using the product less recently - is everything okay?',
        purpose: 'Open-ended check-in',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'Has something changed in how you work or what you need?',
        purpose: 'Identify external factors',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Is there something about the product that\'s been frustrating you?',
        purpose: 'Surface hidden friction',
        category: 'pain_point',
        priority: 5,
      },
      {
        question: 'What would need to change for you to use it more regularly again?',
        purpose: 'Identify re-engagement opportunities',
        category: 'solution',
        priority: 4,
      },
    ],
  },

  power_user_churning: {
    templates: [
      {
        title: 'Power user going silent - high priority save',
        description: 'A previously highly engaged user is becoming inactive. This is a critical retention opportunity.',
        confidence: 0.9,
      },
      {
        title: 'Champion at risk',
        description: 'User who was likely an internal advocate is disengaging, risking broader account churn.',
        confidence: 0.85,
      },
    ],
    questions: [
      {
        question: 'You were one of our most active users - we noticed you\'ve been away. What happened?',
        purpose: 'Direct acknowledgment of their value',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'Did something disappoint you or not work as expected?',
        purpose: 'Surface critical issues',
        category: 'pain_point',
        priority: 5,
      },
      {
        question: 'Is there anything we could do to win you back?',
        purpose: 'Direct recovery ask',
        category: 'solution',
        priority: 5,
      },
      {
        question: 'Would you be willing to share what you\'re using instead?',
        purpose: 'Competitive intelligence',
        category: 'discovery',
        priority: 4,
      },
    ],
  },

  activated_abandoned: {
    templates: [
      {
        title: 'Completed onboarding but never returned',
        description: 'User went through activation but didn\'t form a habit, suggesting value wasn\'t clear enough.',
        confidence: 0.8,
      },
      {
        title: 'First value moment didn\'t land',
        description: 'Despite completing setup, the user didn\'t experience the promised value.',
        confidence: 0.75,
      },
    ],
    questions: [
      {
        question: 'You set everything up but didn\'t come back - what was missing?',
        purpose: 'Identify gap after activation',
        category: 'opening',
        priority: 5,
      },
      {
        question: 'Did you accomplish what you signed up for?',
        purpose: 'Assess goal completion',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Was there a specific moment where you decided not to continue?',
        purpose: 'Pinpoint abandonment trigger',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'What would have made you want to come back?',
        purpose: 'Gather retention hooks',
        category: 'solution',
        priority: 4,
      },
    ],
  },

  excessive_navigation: {
    templates: [
      {
        title: 'User lost in navigation',
        description: 'Excessive back-and-forth navigation indicates the user couldn\'t find what they were looking for.',
        confidence: 0.85,
      },
      {
        title: 'Information architecture failure',
        description: 'The site/app structure doesn\'t match user mental models.',
        confidence: 0.75,
      },
    ],
    questions: [
      {
        question: 'What were you trying to find when you were navigating around?',
        purpose: 'Identify search goal',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Where did you expect to find it?',
        purpose: 'Understand user mental model',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Did you eventually find what you needed?',
        purpose: 'Assess task completion',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'How would you organize things if you were designing this?',
        purpose: 'Gather IA improvement ideas',
        category: 'solution',
        priority: 3,
      },
    ],
  },

  idle_after_action: {
    templates: [
      {
        title: 'User stuck after specific action',
        description: 'Long idle time after an action suggests the user got confused or encountered an unexpected state.',
        confidence: 0.8,
      },
      {
        title: 'Unclear next step after action',
        description: 'The user completed an action but didn\'t know what to do next.',
        confidence: 0.75,
      },
    ],
    questions: [
      {
        question: 'After you did [action], what happened next? What were you expecting?',
        purpose: 'Understand post-action confusion',
        category: 'discovery',
        priority: 5,
      },
      {
        question: 'Was it clear what you should do after that step?',
        purpose: 'Assess guidance clarity',
        category: 'pain_point',
        priority: 5,
      },
      {
        question: 'Did something unexpected happen that made you pause?',
        purpose: 'Surface unexpected behavior',
        category: 'pain_point',
        priority: 4,
      },
      {
        question: 'What guidance would have helped you move forward faster?',
        purpose: 'Gather UX improvement ideas',
        category: 'solution',
        priority: 4,
      },
    ],
  },
};

// Generate hypotheses from signals with enhanced cohort context
export function generateHypothesesFromSignals(
  signals: BehavioralSignal[],
  cohortContext?: { 
    name: string; 
    type: string; 
    size: number;
    category?: string;
    statistics?: {
      geoDistribution?: Record<string, number>;
      deviceDistribution?: Record<string, number>;
      acquisitionDistribution?: Record<string, number>;
      avgSessionDuration?: number;
      avgSignalWeight?: number;
    };
  }
): GeneratedHypothesis[] {
  const hypotheses: GeneratedHypothesis[] = [];
  const processedTypes = new Set<string>();

  for (const signal of signals) {
    // Avoid duplicate hypotheses for same signal type
    if (processedTypes.has(signal.type)) continue;
    processedTypes.add(signal.type);

    const template = HYPOTHESIS_TEMPLATES[signal.type];
    if (!template) continue;

    for (const t of template.templates) {
      // Build rich contextual description using signal and cohort data
      let contextualDescription = t.description;
      
      // Add signal-specific context
      if (signal.metadata) {
        contextualDescription += ` Context: ${signal.description}`;
      }
      
      // Add cohort statistics context if available
      if (cohortContext?.statistics) {
        const stats = cohortContext.statistics;
        const additionalContext: string[] = [];
        
        // Add geo insight
        if (stats.geoDistribution) {
          const topCountry = Object.entries(stats.geoDistribution)
            .sort(([, a], [, b]) => b - a)[0];
          if (topCountry && topCountry[1] > 0) {
            additionalContext.push(`${Math.round(topCountry[1] / cohortContext.size * 100)}% from ${topCountry[0]}`);
          }
        }
        
        // Add device insight
        if (stats.deviceDistribution) {
          const mobileCount = stats.deviceDistribution['mobile'] || 0;
          if (mobileCount > 0) {
            additionalContext.push(`${Math.round(mobileCount / cohortContext.size * 100)}% mobile users`);
          }
        }
        
        // Add session duration insight
        if (stats.avgSessionDuration && stats.avgSessionDuration > 0) {
          additionalContext.push(`avg session: ${Math.round(stats.avgSessionDuration)}s`);
        }
        
        if (additionalContext.length > 0) {
          contextualDescription += ` [Cohort: ${additionalContext.join(', ')}]`;
        }
      }

      // Build evidence array with richer context
      const evidence = [signal.description];
      if (cohortContext) {
        evidence.push(`Cohort: ${cohortContext.name} (${cohortContext.size} users)`);
        if (cohortContext.category) {
          evidence.push(`Category: ${cohortContext.category}`);
        }
      }

      hypotheses.push({
        title: t.title,
        description: contextualDescription,
        behaviorPattern: signal.type,
        confidence: t.confidence,
        evidence,
        questions: template.questions.map(q => ({ ...q })),
      });
    }
  }

  // Sort by confidence, then by evidence count
  return hypotheses.sort((a, b) => {
    const confidenceDiff = b.confidence - a.confidence;
    if (confidenceDiff !== 0) return confidenceDiff;
    return b.evidence.length - a.evidence.length;
  });
}

// Store hypotheses in database
export async function storeHypotheses(
  cohortId: string,
  hypotheses: GeneratedHypothesis[]
): Promise<number> {
  let stored = 0;

  for (const hyp of hypotheses) {
    try {
      const hypothesis = await prisma.hypothesis.create({
        data: {
          cohortId,
          title: hyp.title,
          description: hyp.description,
          behaviorPattern: hyp.behaviorPattern,
          confidence: hyp.confidence,
          evidence: JSON.stringify(hyp.evidence),
          status: 'active',
        },
      });

      // Store associated questions
      for (const q of hyp.questions) {
        await prisma.interviewQuestion.create({
          data: {
            hypothesisId: hypothesis.id,
            question: q.question,
            purpose: q.purpose,
            category: q.category,
            priority: q.priority,
          },
        });
      }

      stored++;
    } catch (e) {
      console.error(`Failed to store hypothesis: ${hyp.title}`, e);
    }
  }

  return stored;
}

// Get hypotheses for a cohort
export async function getCohortHypotheses(
  cohortId: string,
  options: { status?: string } = {}
): Promise<Array<{
  id: string;
  title: string;
  description: string;
  behaviorPattern: string | null;
  confidence: number;
  evidence: string[];
  status: string;
  questions: GeneratedQuestion[];
}>> {
  const hypotheses = await prisma.hypothesis.findMany({
    where: {
      cohortId,
      ...(options.status ? { status: options.status } : {}),
    },
    include: {
      questions: {
        orderBy: { priority: 'desc' },
      },
    },
    orderBy: { confidence: 'desc' },
  });

  return hypotheses.map(h => ({
    id: h.id,
    title: h.title,
    description: h.description,
    behaviorPattern: h.behaviorPattern,
    confidence: h.confidence,
    evidence: h.evidence ? JSON.parse(h.evidence) : [],
    status: h.status,
    questions: h.questions.map(q => ({
      question: q.question,
      purpose: q.purpose || '',
      category: (q.category || 'discovery') as GeneratedQuestion['category'],
      priority: q.priority,
    })),
  }));
}

// Update hypothesis status (validate/invalidate)
export async function updateHypothesisStatus(
  hypothesisId: string,
  status: 'active' | 'validated' | 'invalidated',
  validationNotes?: string
): Promise<void> {
  await prisma.hypothesis.update({
    where: { id: hypothesisId },
    data: {
      status,
      validationNotes,
    },
  });
}

// Generate interview script from hypotheses
export function generateInterviewScript(
  hypotheses: GeneratedHypothesis[],
  options: { maxQuestions?: number } = {}
): string {
  const { maxQuestions = 15 } = options;

  const allQuestions: Array<{ question: string; category: string; priority: number }> = [];

  // Collect all questions from hypotheses
  for (const hyp of hypotheses) {
    for (const q of hyp.questions) {
      allQuestions.push({
        question: q.question,
        category: q.category,
        priority: q.priority,
      });
    }
  }

  // Dedupe and sort by priority
  const uniqueQuestions = allQuestions
    .filter((q, idx, self) =>
      idx === self.findIndex(other => other.question === q.question)
    )
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxQuestions);

  // Group by category
  const grouped: Record<string, string[]> = {
    opening: [],
    discovery: [],
    pain_point: [],
    solution: [],
    closing: [],
  };

  for (const q of uniqueQuestions) {
    grouped[q.category]?.push(q.question);
  }

  // Build script
  let script = '# Interview Script\n\n';

  if (grouped.opening.length > 0) {
    script += '## Opening Questions\n';
    grouped.opening.forEach((q, i) => {
      script += `${i + 1}. ${q}\n`;
    });
    script += '\n';
  }

  if (grouped.discovery.length > 0) {
    script += '## Discovery Questions\n';
    grouped.discovery.forEach((q, i) => {
      script += `${i + 1}. ${q}\n`;
    });
    script += '\n';
  }

  if (grouped.pain_point.length > 0) {
    script += '## Pain Point Questions\n';
    grouped.pain_point.forEach((q, i) => {
      script += `${i + 1}. ${q}\n`;
    });
    script += '\n';
  }

  if (grouped.solution.length > 0) {
    script += '## Solution Questions\n';
    grouped.solution.forEach((q, i) => {
      script += `${i + 1}. ${q}\n`;
    });
    script += '\n';
  }

  if (grouped.closing.length > 0) {
    script += '## Closing Questions\n';
    grouped.closing.forEach((q, i) => {
      script += `${i + 1}. ${q}\n`;
    });
  }

  return script;
}

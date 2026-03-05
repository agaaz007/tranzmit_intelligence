import { describe, it, expect } from 'vitest';
import { UnpaidArchetypeSchema, PaidArchetypeSchema } from '../archetype-generator';

const validBase = {
  name: 'The Ghost',
  tagline: 'Signs up and vanishes',
  description: 'Users who create an account but never return after first visit.',
  behavioral_signature: {
    engagement_pattern: 'Single session, short duration',
    frustration_level: 'Low - leaves before encountering issues',
    trigger_events: ['signup_complete', 'first_page_view'],
    session_pattern: 'One and done',
  },
  product_fixes: ['Improve onboarding flow', 'Add welcome email series'],
  interview_questions: ['What made you sign up?', 'What prevented you from coming back?'],
  color: '#FF6B6B',
  icon: 'ghost',
};

describe('UnpaidArchetypeSchema', () => {
  it('validates a valid unpaid archetype', () => {
    const data = {
      archetypes: [{ ...validBase, conversion_blockers: ['No clear value proposition', 'Complicated pricing'] }],
    };
    const result = UnpaidArchetypeSchema.parse(data);
    expect(result.archetypes).toHaveLength(1);
    expect(result.archetypes[0].conversion_blockers).toHaveLength(2);
  });

  it('rejects unpaid archetype without conversion_blockers', () => {
    const data = { archetypes: [validBase] };
    expect(() => UnpaidArchetypeSchema.parse(data)).toThrow();
  });
});

describe('PaidArchetypeSchema', () => {
  it('validates a valid paid archetype', () => {
    const data = {
      archetypes: [{ ...validBase, recovery_strategy: 'Offer personalized onboarding call' }],
    };
    const result = PaidArchetypeSchema.parse(data);
    expect(result.archetypes).toHaveLength(1);
    expect(result.archetypes[0].recovery_strategy).toBe('Offer personalized onboarding call');
  });

  it('rejects paid archetype without recovery_strategy', () => {
    const data = { archetypes: [validBase] };
    expect(() => PaidArchetypeSchema.parse(data)).toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { PatternSchema } from '../pattern-analyzer';

describe('PatternSchema', () => {
  it('validates a well-formed pattern', () => {
    const data = {
      patterns: [{
        title: 'Onboarding Drop-off',
        description: 'Users consistently abandon at step 3 of the onboarding wizard.',
        patternType: 'conversion_blocker',
        confidence: 0.85,
        evidence: [
          { source: 'session', sourceId: 'sess_1', detail: '3/5 sessions show exit at onboarding step 3' },
          { source: 'interview', sourceId: 'int_1', detail: 'User mentioned confusion about required fields' },
        ],
        suggestion: 'Simplify onboarding step 3 by reducing required fields',
        priority: 'high',
        affectedUserCount: 42,
      }],
    };
    const result = PatternSchema.parse(data);
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0].confidence).toBe(0.85);
  });

  it('rejects confidence outside 0-1 range', () => {
    const data = {
      patterns: [{
        title: 'Bad confidence',
        description: 'test',
        patternType: 'behavioral_cluster',
        confidence: 1.5,
        evidence: [],
        priority: 'low',
        affectedUserCount: 0,
      }],
    };
    expect(() => PatternSchema.parse(data)).toThrow();
  });

  it('rejects invalid patternType', () => {
    const data = {
      patterns: [{
        title: 'Invalid type',
        description: 'test',
        patternType: 'invalid_type',
        confidence: 0.5,
        evidence: [],
        priority: 'low',
        affectedUserCount: 0,
      }],
    };
    expect(() => PatternSchema.parse(data)).toThrow();
  });

  it('allows optional suggestion', () => {
    const data = {
      patterns: [{
        title: 'No suggestion',
        description: 'test',
        patternType: 'risk_indicator',
        confidence: 0.6,
        evidence: [],
        priority: 'medium',
        affectedUserCount: 10,
      }],
    };
    const result = PatternSchema.parse(data);
    expect(result.patterns[0].suggestion).toBeUndefined();
  });

  it('accepts all valid pattern types', () => {
    const types = ['conversion_blocker', 'behavioral_cluster', 'feature_suggestion', 'risk_indicator'];
    for (const type of types) {
      const data = {
        patterns: [{
          title: `Type: ${type}`,
          description: 'test',
          patternType: type,
          confidence: 0.5,
          evidence: [],
          priority: 'low',
          affectedUserCount: 0,
        }],
      };
      expect(() => PatternSchema.parse(data)).not.toThrow();
    }
  });
});

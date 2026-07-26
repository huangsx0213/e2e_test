import { describe, expect, it } from 'vitest';
import {
  arrayFromRecordValues,
  coerceNumber,
  nullToEmptyArray,
  nullToUndefined,
  wrapSingleObjectInArray,
} from '../graph/structured-output/helpers.ts';
import { createAnalystOutputProfile } from '../graph/structured-output/analyst.ts';
import { createDesignerOutputProfile, designerOutputProfile } from '../graph/structured-output/designer.ts';
import { createQualityOutputProfile, qualityOutputProfile } from '../graph/structured-output/quality.ts';

describe('structured-output helpers', () => {
  it('converts null to undefined', () => {
    expect(nullToUndefined(null)).toBeUndefined();
  });

  it('converts null to empty array', () => {
    expect(nullToEmptyArray(null)).toEqual([]);
  });

  it('converts record values to an array', () => {
    expect(arrayFromRecordValues({ a: { id: '1' }, b: { id: '2' } })).toEqual([
      { id: '1' },
      { id: '2' },
    ]);
  });

  it('wraps a single object into an array', () => {
    expect(wrapSingleObjectInArray({ id: 'tc-1' })).toEqual([{ id: 'tc-1' }]);
  });

  it('coerces numeric text to a number', () => {
    expect(coerceNumber('2', 1)).toBe(2);
  });
});

describe('qualityOutputProfile', () => {
  it('normalizes final test cases before parsing', () => {
    const parsed = qualityOutputProfile.parse(qualityOutputProfile.normalize({
      finalTestCases: {
        a: {
          id: 'TC-1',
          title: 'Verify login',
          conditionId: 'C-1',
          requirementId: 'REQ-1',
          priority: 'high',
          category: 'functional',
          testLevel: 'component',
          techniqueApplied: 'Equivalence Partitioning',
          preconditions: [],
          testData: [],
          steps: [{ stepNumber: '1', action: 'Click login', expected: 'Login starts' }],
          tags: null,
          reviewSummary: 'Looks good',
          changeLog: [{ field: 'title', from: null, to: null, reason: 'Retained original title' }],
        },
      },
    }));

    expect(parsed.finalTestCases).toHaveLength(1);
    expect(parsed.finalTestCases[0].steps[0].stepNumber).toBe(1);
    expect(parsed.finalTestCases[0].tags).toEqual([]);
    expect(parsed.finalTestCases[0].changeLog[0].from).toBeUndefined();
    expect(parsed.finalTestCases[0].changeLog[0].to).toBeUndefined();
  });

  it('rejects outputs that do not preserve every draft case id', () => {
    const profile = createQualityOutputProfile([
      { id: 'TC-1', conditionId: 'C-1', requirementId: 'REQ-1' },
      { id: 'TC-2', conditionId: 'C-2', requirementId: 'REQ-2' },
    ]);

    expect(() => profile.parse(profile.normalize({
      finalTestCases: [{
        id: 'TC-1',
        title: 'Verify login',
        conditionId: 'C-1',
        requirementId: 'REQ-1',
        priority: 'high',
        category: 'functional',
        testLevel: 'component',
        techniqueApplied: 'Equivalence Partitioning',
        preconditions: [],
        testData: [],
        steps: [{ stepNumber: 1, action: 'Enter credentials', expected: 'Dashboard shown' }],
        tags: [],
        status: 'approved',
        reviewSummary: 'ok',
        changeLog: [],
      }],
    }))).toThrow(/Missing final reviewed cases for draft case ids: TC-2/);
  });

  it('rejects outputs that drift conditionId or requirementId for an existing draft case id', () => {
    const profile = createQualityOutputProfile([
      { id: 'TC-1', conditionId: 'C-1', requirementId: 'REQ-1' },
    ]);

    const parsed = profile.parse(profile.normalize({
      finalTestCases: [{
        id: 'TC-1',
        title: 'Verify login',
        conditionId: 'C-999',
        requirementId: 'REQ-999',
        priority: 'high',
        category: 'functional',
        testLevel: 'component',
        techniqueApplied: 'Equivalence Partitioning',
        preconditions: [],
        testData: [],
        steps: [{ stepNumber: 1, action: 'Enter credentials', expected: 'Dashboard shown' }],
        tags: [],
        status: 'approved',
        reviewSummary: 'ok',
        changeLog: [],
      }],
    }));

    expect(parsed.finalTestCases[0].conditionId).toBe('C-1');
    expect(parsed.finalTestCases[0].requirementId).toBe('REQ-1');
  });

  it('rejects final cases whose testLevel contradicts the draft case', () => {
    const profile = createQualityOutputProfile([
      { id: 'TC-1', conditionId: 'C-1', requirementId: 'REQ-1', expectedTestLevel: 'component' },
    ]);

    let threw = false;
    try {
      profile.parse(profile.normalize({
        finalTestCases: [{
          id: 'TC-1',
          title: 'Verify login',
          conditionId: 'C-1',
          requirementId: 'REQ-1',
          priority: 'high',
          category: 'functional',
          testLevel: 'integration',
          techniqueApplied: 'Equivalence Partitioning',
          preconditions: [],
          testData: [],
          steps: [{ stepNumber: 1, action: 'Enter credentials', expected: 'Dashboard shown' }],
          tags: [],
          status: 'approved',
          reviewSummary: 'ok',
          changeLog: [],
        }],
      }));
    } catch (err: any) {
      threw = true;
      expect(err.message).toContain('testLevel');
      expect(err.message).toContain('integration');
      expect(err.message).toContain('component');
      expect(err.message).toContain('TC-1');
    }
    expect(threw).toBe(true);
  });
});

describe('designerOutputProfile', () => {
  it('wraps a top-level test case object and normalizes nullable fields', () => {
    const parsed = designerOutputProfile.parse(designerOutputProfile.normalize({
      id: 'TC-1',
      title: 'Verify login',
      conditionId: 'C-1',
      requirementId: 'REQ-1',
      priority: 'critical',
      category: 'functional',
      testLevel: 'component',
      techniqueApplied: 'Equivalence Partitioning',
      preconditions: [],
      testData: [],
      steps: [{ stepNumber: '1', action: 'Enter username', expected: 'Username is shown' }],
      postconditions: null,
      tags: null,
      selfReview: {
        score: '8',
        strengths: [],
        weaknesses: [],
        suggestions: [],
      },
    }));

    expect(parsed.draftTestCases).toHaveLength(1);
    expect(parsed.draftTestCases[0].steps[0].stepNumber).toBe(1);
    expect(parsed.draftTestCases[0].postconditions).toEqual([]);
    expect(parsed.draftTestCases[0].tags).toEqual([]);
    expect(parsed.draftTestCases[0].selfReview.score).toBe(8);
  });

  it('rejects outputs that do not cover every expected condition at least once', () => {
    const profile = createDesignerOutputProfile([{ id: 'C-1', requirementId: 'REQ-1' }, { id: 'C-2', requirementId: 'REQ-2' }]);

    expect(() => profile.parse(profile.normalize({
      draftTestCases: [{
        id: 'TC-1',
        title: 'Verify login',
        conditionId: 'C-1',
        requirementId: 'REQ-1',
        priority: 'critical',
        category: 'functional',
        testLevel: 'component',
        techniqueApplied: 'Equivalence Partitioning',
        preconditions: [],
        testData: [],
        steps: [{ stepNumber: 1, action: 'Enter credentials', expected: 'Dashboard shown' }],
        postconditions: [],
        tags: [],
        selfReview: {
          score: 8,
          strengths: [],
          weaknesses: [],
          suggestions: [],
        },
      }],
    }))).toThrow(/Missing draft test cases for conditionIds: C-2/);
  });

  it('rejects draft cases whose testLevel contradicts the Analyst tag', () => {
    const profile = createDesignerOutputProfile([
      { id: 'C-1', requirementId: 'REQ-1', expectedTestLevel: 'component' },
    ]);

    let threw = false;
    try {
      profile.parse(profile.normalize({
        draftTestCases: [{
          id: 'TC-1',
          title: 'Verify login',
          conditionId: 'C-1',
          requirementId: 'REQ-1',
          priority: 'critical',
          category: 'functional',
          testLevel: 'integration',
          techniqueApplied: 'Equivalence Partitioning',
          preconditions: [],
          testData: [],
          steps: [{ stepNumber: 1, action: 'Enter credentials', expected: 'Dashboard shown' }],
          postconditions: [],
          tags: [],
          selfReview: { score: 8, strengths: [], weaknesses: [], suggestions: [] },
        }],
      }));
    } catch (err: any) {
      threw = true;
      expect(err.message).toContain('testLevel');
      expect(err.message).toContain('integration');
      expect(err.message).toContain('component');
      expect(err.message).toContain('C-1');
    }
    expect(threw).toBe(true);
  });
});

describe('analystOutputProfile', () => {
  const profile = createAnalystOutputProfile();
  it('normalizes nullable optional fields in test conditions', () => {
    const parsed = profile.parse(profile.normalize({
      requirementAnalysis: {
        overallApproach: 'Use risk-based analysis',
        riskAssessmentSummary: 'High authentication risk',
      },
      testConditions: [{
        id: 'C-1',
        requirementId: 'REQ-1',
        condition: 'Verify login with valid credentials',
        category: 'functional',
        priority: 'high',
        riskLevel: 'medium',
        primaryTechnique: 'Equivalence Partitioning',
        secondaryTechniques: [],
        techniqueRationale: 'Valid and invalid partitions',
        coverageDimensions: ['functional', 'testLevel:component'],
        dataRequirements: null,
        dependencies: null,
        requirementLevel: null,
      }],
    }));

    expect(parsed.testConditions).toHaveLength(1);
    expect(parsed.testConditions[0].dataRequirements).toBeUndefined();
    expect(parsed.testConditions[0].dependencies).toEqual([]);
    expect(parsed.testConditions[0].requirementLevel).toBeUndefined();
  });

  it('rejects conditions missing a testLevel tag in coverageDimensions', () => {
    expect(() => profile.parse(profile.normalize({
      requirementAnalysis: {
        overallApproach: 'Use risk-based analysis',
        riskAssessmentSummary: 'High authentication risk',
      },
      testConditions: [{
        id: 'C-1',
        requirementId: 'REQ-1',
        condition: 'Verify login with valid credentials',
        category: 'functional',
        priority: 'high',
        riskLevel: 'medium',
        primaryTechnique: 'Equivalence Partitioning',
        secondaryTechniques: [],
        techniqueRationale: 'Valid and invalid partitions',
        coverageDimensions: ['functional'],
      }],
    }))).toThrow();
  });

  it('rejects conditions with both testLevel tags in coverageDimensions', () => {
    expect(() => profile.parse(profile.normalize({
      requirementAnalysis: {
        overallApproach: 'Use risk-based analysis',
        riskAssessmentSummary: 'High authentication risk',
      },
      testConditions: [{
        id: 'C-1',
        requirementId: 'REQ-1',
        condition: 'Verify login with valid credentials',
        category: 'functional',
        priority: 'high',
        riskLevel: 'medium',
        primaryTechnique: 'Equivalence Partitioning',
        secondaryTechniques: [],
        techniqueRationale: 'Valid and invalid partitions',
        coverageDimensions: ['functional', 'testLevel:component', 'testLevel:integration'],
      }],
    }))).toThrow();
  });

  it('formats field-specific hints for missing required condition fields', () => {
    const message = profile.formatValidationError({
      issues: [{
        path: ['testConditions', 0, 'category'],
        message: 'Invalid input: expected string, received undefined',
      }],
    });

    expect(message).toContain('category');
    expect(message).toContain('Set category explicitly');
  });
});

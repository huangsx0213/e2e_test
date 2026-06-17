import { describe, it, expect, vi } from 'vitest';
import { bridgeConsolidatedStep, buildStepDescription } from '../recording-bridge';
import type { RecorderStepPayload } from '../protocol';

describe('RecordingBridge', () => {
  it('emits both step-recorded and element-recorded for steps with locator', () => {
    const emitStep = vi.fn();
    const emitElement = vi.fn();
    const payload: RecorderStepPayload = {
      action: 'click',
      locator: { kind: 'official', selector: 'internal:role=button[name="Login"]' },
      locatorCandidates: [],
      value: '',
      pageUrl: 'https://app.com/login',
      timestamp: Date.now(),
    };
    bridgeConsolidatedStep(payload, 'proj-1', 'case-1', 'suite-1', {
      emitStepRecorded: emitStep,
      emitElementRecorded: emitElement,
    });
    expect(emitStep).toHaveBeenCalledTimes(1);
    expect(emitElement).toHaveBeenCalledTimes(1);
    expect(emitStep.mock.calls[0][0]).toMatchObject({ projectId: 'proj-1', caseId: 'case-1', suiteId: 'suite-1', type: 'UI' });
    expect(emitElement.mock.calls[0][0]).toMatchObject({ projectId: 'proj-1', caseId: 'case-1', suiteId: 'suite-1' });
  });

  it('emits only step-recorded for goto (no locator)', () => {
    const emitStep = vi.fn();
    const emitElement = vi.fn();
    const payload: RecorderStepPayload = {
      action: 'goto',
      locatorCandidates: [],
      value: 'https://app.com/home',
      pageUrl: 'https://app.com/home',
      timestamp: Date.now(),
    };
    bridgeConsolidatedStep(payload, 'proj-1', 'case-1', 'suite-1', {
      emitStepRecorded: emitStep,
      emitElementRecorded: emitElement,
    });
    expect(emitStep).toHaveBeenCalledTimes(1);
    expect(emitElement).not.toHaveBeenCalled();
  });

  it('step-recorded data includes stepInfo with action and element', () => {
    const emitStep = vi.fn();
    const emitElement = vi.fn();
    const payload: RecorderStepPayload = {
      action: 'fill',
      locator: { kind: 'official', selector: 'internal:label="Username"' },
      locatorCandidates: [],
      value: 'admin',
      pageUrl: 'https://app.com/login',
      timestamp: Date.now(),
    };
    bridgeConsolidatedStep(payload, 'proj-1', 'case-1', 'suite-1', {
      emitStepRecorded: emitStep,
      emitElementRecorded: emitElement,
    });
    const stepData = emitStep.mock.calls[0][0];
    expect(stepData.stepInfo.action).toBe('fill');
    expect(stepData.stepInfo.dataValue).toBe('admin');
    expect(stepData.stepInfo.element).toBeDefined();
    expect(stepData.stepInfo.element.name).toBeTruthy();
    expect(stepData.stepInfo.step.action).toBe('fill');
    expect(stepData.stepInfo.step.target).toBeTruthy();
  });

  it('element-recorded data includes element with selectorType and locators', () => {
    const emitStep = vi.fn();
    const emitElement = vi.fn();
    const payload: RecorderStepPayload = {
      action: 'click',
      locator: { kind: 'official', selector: 'internal:role=button[name="Submit"]' },
      locatorCandidates: [],
      value: '',
      pageUrl: 'https://app.com/form',
      timestamp: Date.now(),
    };
    bridgeConsolidatedStep(payload, 'proj-1', 'case-1', 'suite-1', {
      emitStepRecorded: emitStep,
      emitElementRecorded: emitElement,
    });
    const elemData = emitElement.mock.calls[0][0];
    expect(elemData.element.selectorType).toBeDefined();
    expect(elemData.element.value).toBeDefined();
    expect(elemData.element.locators).toBeInstanceOf(Array);
    expect(elemData.element.locators.length).toBeGreaterThan(0);
  });

  it('goto step has target set to URL', () => {
    const emitStep = vi.fn();
    const emitElement = vi.fn();
    const payload: RecorderStepPayload = {
      action: 'goto',
      locatorCandidates: [],
      value: 'https://app.com/dashboard',
      pageUrl: 'https://app.com/dashboard',
      timestamp: Date.now(),
    };
    bridgeConsolidatedStep(payload, 'proj-1', 'case-1', 'suite-1', {
      emitStepRecorded: emitStep,
      emitElementRecorded: emitElement,
    });
    expect(emitStep.mock.calls[0][0].stepInfo.step.target).toBe('https://app.com/dashboard');
  });
});

describe('buildStepDescription', () => {
  it('builds goto description', () => {
    expect(buildStepDescription('goto', undefined, 'https://x.com')).toBe('Navigate to https://x.com');
  });

  it('builds click description with locator name', () => {
    const locator = { kind: 'official' as const, selector: 'internal:role=button[name="Login"]' };
    expect(buildStepDescription('click', locator, '')).toContain('Login');
  });

  it('builds fill description with value', () => {
    const locator = { kind: 'official' as const, selector: 'internal:label="Email"' };
    const desc = buildStepDescription('fill', locator, 'test@example.com');
    expect(desc).toContain('test@example.com');
    expect(desc).toContain('Email');
  });
});

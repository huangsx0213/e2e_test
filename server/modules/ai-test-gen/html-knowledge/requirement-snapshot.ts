import { createHash } from 'node:crypto';

import type { Requirement } from '../../../../shared/contracts/index.ts';
import {
  HtmlKnowledgeValidationError,
  validateHtmlRequirementId,
} from './normalization.ts';
import type {
  HtmlRequirementSnapshot,
  HtmlRequirementSnapshotRecord,
} from './types.ts';

interface BuildHtmlRequirementSnapshotInput {
  readonly projectId: string;
  readonly selectedRequirementIds: readonly string[];
  readonly selectedFlowIds: readonly string[];
  readonly requirements: readonly Requirement[];
}

export function buildHtmlRequirementSnapshot(
  input: BuildHtmlRequirementSnapshotInput,
): HtmlRequirementSnapshot {
  if (typeof input.projectId !== 'string' || input.projectId.length === 0) {
    throw new HtmlKnowledgeValidationError('HTML requirement snapshot projectId is required');
  }

  const requirementsById = new Map<string, Requirement>();
  const childrenByParent = new Map<string, Requirement[]>();
  for (const requirement of input.requirements) {
    if (requirement.projectId !== input.projectId) {
      throw new HtmlKnowledgeValidationError(
        `Requirement ${requirement.id} does not belong to project ${input.projectId}`,
      );
    }
    if (requirementsById.has(requirement.id)) {
      throw new HtmlKnowledgeValidationError(`Duplicate requirement ID: ${requirement.id}`);
    }
    requirementsById.set(requirement.id, requirement);
    if (requirement.parentId) {
      const children = childrenByParent.get(requirement.parentId) ?? [];
      children.push(requirement);
      childrenByParent.set(requirement.parentId, children);
    }
  }

  const selectedRequirementIds = canonicalIds(input.selectedRequirementIds, 'selected requirement');
  const selectedFlowIds = canonicalIds(input.selectedFlowIds, 'selected flow');
  const included = new Map<string, Requirement>();

  for (const id of selectedRequirementIds) {
    const selected = requireKnownRequirement(id, 'Selected requirement');
    if (selected.level !== 'story') {
      throw new HtmlKnowledgeValidationError(`Selected requirement ${id} must be a story`);
    }
    if (selected.status !== 'APPROVED') {
      throw new HtmlKnowledgeValidationError(`Selected requirement ${id} must be APPROVED`);
    }
    includeStory(selected);
  }

  for (const id of selectedFlowIds) {
    const selected = requireKnownRequirement(id, 'Selected flow');
    if (selected.level !== 'story' || !selected.isFlow) {
      throw new HtmlKnowledgeValidationError(`Selected flow ${id} must be a flow story`);
    }
    if (selected.status !== 'APPROVED') {
      throw new HtmlKnowledgeValidationError(`Selected flow ${id} must be APPROVED`);
    }
    includeStory(selected);
  }

  const processedAcceptanceCriteria = new Set<string>();
  while (true) {
    const pending = [...included.values()]
      .filter((requirement) =>
        requirement.level === 'ac' && !processedAcceptanceCriteria.has(requirement.id)
      )
      .sort(compareRequirements);
    if (pending.length === 0) break;

    for (const acceptanceCriterion of pending) {
      processedAcceptanceCriteria.add(acceptanceCriterion.id);
      const parent = acceptanceCriterion.parentId
        ? requireKnownRequirement(
            acceptanceCriterion.parentId,
            `Parent of acceptance criterion ${acceptanceCriterion.id}`,
          )
        : undefined;
      for (const relatedId of canonicalIds(
        acceptanceCriterion.relatedRequirementIds ?? [],
        `related requirement on ${acceptanceCriterion.id}`,
      )) {
        const related = requireKnownRequirement(
          relatedId,
          `Acceptance criterion ${acceptanceCriterion.id} related requirement`,
        );
        if (parent?.isFlow && (related.level !== 'story' || related.isFlow)) {
          throw new HtmlKnowledgeValidationError(
            `Flow acceptance criterion ${acceptanceCriterion.id} must reference a component story: ${relatedId}`,
          );
        }
        if (parent?.isFlow && related.status !== 'APPROVED') {
          throw new HtmlKnowledgeValidationError(
            `Flow acceptance criterion ${acceptanceCriterion.id} must reference an APPROVED component story: ${relatedId}`,
          );
        }
        if (related.level === 'story') includeStory(related);
        else includeWithAncestors(related);
      }
    }
  }

  for (const requirement of included.values()) {
    if (requirement.parentId) {
      requireKnownRequirement(requirement.parentId, `Parent of requirement ${requirement.id}`);
    }
    for (const relatedId of requirement.relatedRequirementIds ?? []) {
      requireKnownRequirement(relatedId, `Related requirement on ${requirement.id}`);
    }
  }

  const records = [...included.values()]
    .map(toSnapshotRecord)
    .sort((left, right) => compareText(left.id, right.id));

  return Object.freeze({
    version: 1 as const,
    projectId: input.projectId,
    selectedRequirementIds: Object.freeze(selectedRequirementIds),
    selectedFlowIds: Object.freeze(selectedFlowIds),
    records: Object.freeze(records),
  });

  function requireKnownRequirement(id: string, context: string): Requirement {
    const requirement = requirementsById.get(id);
    if (!requirement) {
      throw new HtmlKnowledgeValidationError(`${context} references unknown requirement: ${id}`);
    }
    if (requirement.projectId !== input.projectId) {
      throw new HtmlKnowledgeValidationError(
        `${context} ${id} does not belong to project ${input.projectId}`,
      );
    }
    return requirement;
  }

  function includeStory(story: Requirement): void {
    includeWithAncestors(story);
    for (const acceptanceCriterion of acceptanceCriteriaFor(story.id)) {
      included.set(acceptanceCriterion.id, acceptanceCriterion);
    }
  }

  function acceptanceCriteriaFor(storyId: string): Requirement[] {
    return [...(childrenByParent.get(storyId) ?? [])]
      .filter((requirement) => requirement.level === 'ac')
      .sort(compareRequirements);
  }

  function includeWithAncestors(requirement: Requirement): void {
    let current: Requirement | undefined = requirement;
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current.id)) {
        throw new HtmlKnowledgeValidationError(`Requirement parent cycle detected at ${current.id}`);
      }
      visited.add(current.id);
      included.set(current.id, current);
      current = current.parentId
        ? requireKnownRequirement(current.parentId, `Parent of requirement ${current.id}`)
        : undefined;
    }
  }
}

export function serializeHtmlRequirementSnapshot(snapshot: HtmlRequirementSnapshot): string {
  if (snapshot.version !== 1) {
    throw new HtmlKnowledgeValidationError(`Unsupported HTML requirement snapshot version: ${snapshot.version}`);
  }

  const canonical: HtmlRequirementSnapshot = {
    version: 1,
    projectId: snapshot.projectId,
    selectedRequirementIds: canonicalIds(snapshot.selectedRequirementIds, 'selected requirement'),
    selectedFlowIds: canonicalIds(snapshot.selectedFlowIds, 'selected flow'),
    records: [...snapshot.records]
      .map((record): HtmlRequirementSnapshotRecord => ({
        id: validateHtmlRequirementId(record.id, 'Snapshot requirement'),
        projectId: record.projectId,
        level: record.level,
        ...(record.parentId
          ? { parentId: validateHtmlRequirementId(record.parentId, 'Snapshot parent requirement') }
          : {}),
        title: record.title,
        description: record.description,
        position: record.position,
        status: record.status,
        flowType: record.flowType,
        isFlow: Boolean(record.isFlow),
        relatedRequirementIds: canonicalIds(
          record.relatedRequirementIds,
          `related requirement on ${record.id}`,
        ),
      }))
      .sort((left, right) => compareText(left.id, right.id)),
  };
  return JSON.stringify(canonical);
}

export function hashHtmlRequirementSnapshot(snapshot: HtmlRequirementSnapshot): string {
  return createHash('sha256')
    .update(serializeHtmlRequirementSnapshot(snapshot))
    .digest('hex');
}

export function requirementsFromHtmlSnapshot(
  snapshot: HtmlRequirementSnapshot,
): Requirement[] {
  if (snapshot.version !== 1 || typeof snapshot.projectId !== 'string' || !snapshot.projectId) {
    throw new HtmlKnowledgeValidationError('HTML requirement snapshot is invalid');
  }

  const recordsById = new Map<string, HtmlRequirementSnapshotRecord>();
  for (const record of snapshot.records) {
    const id = validateHtmlRequirementId(record.id, 'Snapshot requirement');
    if (record.projectId !== snapshot.projectId) {
      throw new HtmlKnowledgeValidationError(
        `Snapshot requirement ${id} does not belong to project ${snapshot.projectId}`,
      );
    }
    if (recordsById.has(id)) {
      throw new HtmlKnowledgeValidationError(`Duplicate snapshot requirement ID: ${id}`);
    }
    recordsById.set(id, record);
  }

  for (const record of snapshot.records) {
    if (record.parentId) {
      const parent = recordsById.get(record.parentId);
      if (!parent) {
        throw new HtmlKnowledgeValidationError(
          `Snapshot requirement ${record.id} references unknown parent: ${record.parentId}`,
        );
      }
    }
    for (const relatedId of record.relatedRequirementIds) {
      if (!recordsById.has(relatedId)) {
        throw new HtmlKnowledgeValidationError(
          `Snapshot requirement ${record.id} references unknown requirement: ${relatedId}`,
        );
      }
    }

    const visited = new Set<string>();
    let current: HtmlRequirementSnapshotRecord | undefined = record;
    while (current?.parentId) {
      if (visited.has(current.id)) {
        throw new HtmlKnowledgeValidationError(
          `Requirement parent cycle detected at ${current.id}`,
        );
      }
      visited.add(current.id);
      current = recordsById.get(current.parentId);
    }
  }

  for (const id of snapshot.selectedRequirementIds) {
    const selected = recordsById.get(id);
    if (!selected || selected.level !== 'story') {
      throw new HtmlKnowledgeValidationError(
        `Selected snapshot requirement ${id} must be a story`,
      );
    }
  }
  for (const id of snapshot.selectedFlowIds) {
    const selected = recordsById.get(id);
    if (!selected || selected.level !== 'story' || !selected.isFlow) {
      throw new HtmlKnowledgeValidationError(
        `Selected snapshot flow ${id} must be a flow story`,
      );
    }
  }

  return snapshot.records.map((record): Requirement => {
    return {
      id: record.id,
      projectId: record.projectId,
      ...(record.parentId ? { parentId: record.parentId } : {}),
      title: record.title,
      description: record.description,
      level: record.level,
      flowType: record.flowType,
      status: record.status,
      position: record.position,
      isFlow: record.isFlow,
      relatedRequirementIds: [...record.relatedRequirementIds],
    };
  });
}

function toSnapshotRecord(requirement: Requirement): HtmlRequirementSnapshotRecord {
  return Object.freeze({
    id: validateHtmlRequirementId(requirement.id),
    projectId: requirement.projectId,
    level: requirement.level,
    ...(requirement.parentId
      ? { parentId: validateHtmlRequirementId(requirement.parentId, 'Parent requirement') }
      : {}),
    title: requirement.title,
    description: requirement.description ?? '',
    position: requirement.position,
    status: requirement.status,
    flowType: requirement.flowType ?? null,
    isFlow: Boolean(requirement.isFlow),
    relatedRequirementIds: Object.freeze(canonicalIds(
      requirement.relatedRequirementIds ?? [],
      `related requirement on ${requirement.id}`,
    )),
  });
}

function canonicalIds(ids: readonly string[], context: string): string[] {
  const unique = new Set<string>();
  for (const id of ids) {
    unique.add(validateHtmlRequirementId(id, context));
  }
  return [...unique].sort(compareText);
}

function compareRequirements(left: Requirement, right: Requirement): number {
  return left.position - right.position || compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

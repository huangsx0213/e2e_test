import { createHash } from 'node:crypto';

import { parse, type DefaultTreeAdapterTypes } from 'parse5';

import {
  HtmlKnowledgeLimitError,
  HtmlKnowledgeValidationError,
  normalizeHtmlFileName,
  normalizeStaticText,
  sanitizeHtmlRoute,
  tokenizeHtmlKnowledge,
} from './normalization.ts';
import {
  HTML_KNOWLEDGE_INDEX_VERSION,
  MAX_HTML_CHUNKS,
  MAX_HTML_DOM_DEPTH,
  MAX_HTML_DOM_NODES,
  MAX_HTML_ELEMENTS,
  MAX_HTML_INDEX_BYTES,
  MAX_HTML_PAGE_BYTES,
  MAX_HTML_SELECT_OPTIONS,
  MAX_HTML_TEXT_CHARS,
  MAX_HTML_TITLE_CHARS,
  MAX_HTML_WARNING_CHARS,
  MAX_HTML_WARNINGS,
  type HtmlKnowledgeChunk,
  type HtmlKnowledgeElement,
  type HtmlKnowledgePageIndex,
  type HtmlKnowledgeSectionType,
  type HtmlKnowledgeSourceLocation,
  type HtmlKnowledgeSelectOption,
  type HtmlPageRelationCandidate,
  type IndexedHtmlKnowledgePage,
  type NormalizedHtmlSource,
  type SanitizedHtmlRoute,
} from './types.ts';

export { HtmlKnowledgeLimitError, HtmlKnowledgeValidationError } from './normalization.ts';

export function decodeAndNormalizeHtml(rawBytes: Uint8Array): NormalizedHtmlSource {
  if (rawBytes.byteLength > MAX_HTML_PAGE_BYTES) {
    throw new HtmlKnowledgeLimitError('HTML page exceeds 512 KiB');
  }
  if (rawBytes.includes(0)) {
    throw new HtmlKnowledgeValidationError('HTML page contains NUL bytes');
  }

  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
  } catch {
    throw new HtmlKnowledgeValidationError('HTML page is not valid UTF-8');
  }

  const normalizedHtml = decoded.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
  if (normalizedHtml.includes('\0')) {
    throw new HtmlKnowledgeValidationError('HTML page contains NUL characters');
  }

  return {
    byteSize: rawBytes.byteLength,
    sha256: createHash('sha256').update(rawBytes).digest('hex'),
    normalizedHtml,
  };
}

export function parseAndIndexHtml(input: {
  readonly pageId: string;
  readonly fileName: string;
  readonly source: NormalizedHtmlSource;
}): IndexedHtmlKnowledgePage {
  const { pageId, source } = input;
  const { displayName: fileName, key: fileNameKey } = normalizeHtmlFileName(input.fileName);
  const warnings = new WarningCollector();
  const document = parse(source.normalizedHtml, {
    scriptingEnabled: false,
    sourceCodeLocationInfo: true,
  });

  const elements: ElementRecord[] = [];
  const textRecords: TextRecord[] = [];
  const eventHandlerNames = new Set<string>();
  const staticSiblingEvidenceByParent = new Map<number, StaticSiblingEvidence[]>();
  const stack: WalkFrame[] = [{
    kind: 'enter',
    node: document,
    depth: 0,
    siblingIndex: -1,
    parentElementIndex: null,
    parentPath: '',
    unsafeText: false,
    evidenceExcluded: false,
    inTemplateContent: false,
    templateRootIndex: null,
  }];
  let nodeCount = 0;

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.kind === 'exit') {
      elements[frame.elementIndex].subtreeEnd = elements.length - 1;
      elements[frame.elementIndex].textEnd = textRecords.length - 1;
      elements[frame.elementIndex].endOrder = nodeCount - 1;
      continue;
    }

    nodeCount += 1;
    if (nodeCount > MAX_HTML_DOM_NODES) {
      throw new HtmlKnowledgeLimitError('HTML DOM node limit of 50,000 exceeded');
    }
    if (frame.depth > MAX_HTML_DOM_DEPTH) {
      throw new HtmlKnowledgeLimitError('HTML DOM depth limit of 128 exceeded');
    }
    const nodeOrder = nodeCount - 1;

    if (isTextNode(frame.node)) {
      if (!frame.unsafeText && frame.parentElementIndex !== null && frame.node.value.trim()) {
        const textRecord: TextRecord = {
          order: nodeOrder,
          siblingIndex: frame.siblingIndex,
          parentElementIndex: frame.parentElementIndex,
          templateRootIndex: frame.templateRootIndex,
          value: frame.node.value,
        };
        textRecords.push(textRecord);
        if (normalizeStaticText(textRecord.value, 1)) {
          const evidence = staticSiblingEvidenceByParent.get(frame.parentElementIndex) ?? [];
          evidence.push({
            siblingIndex: textRecord.siblingIndex,
            textRecord,
          });
          staticSiblingEvidenceByParent.set(frame.parentElementIndex, evidence);
        }
      }
      continue;
    }

    let parentElementIndex = frame.parentElementIndex;
    let parentPath = frame.parentPath;
    let unsafeText = frame.unsafeText;
    let evidenceExcluded = frame.evidenceExcluded;
    let inTemplateContent = frame.inTemplateContent;
    let templateRootIndex = frame.templateRootIndex;
    let currentElement: ElementRecord | undefined;

    if (isElementNode(frame.node)) {
      const tagName = frame.node.tagName.toLocaleLowerCase('en-US');
      const domPath = frame.domPath ?? `${frame.parentPath}/${tagName}:nth-of-type(1)`;
      const excludesEvidence = frame.evidenceExcluded || EVIDENCE_EXCLUDED_TAGS.has(tagName);
      const suppressesText = frame.unsafeText || excludesEvidence || TEXT_ONLY_EXCLUDED_TAGS.has(tagName);
      currentElement = {
        index: elements.length,
        node: frame.node,
        tagName,
        domPath,
        depth: frame.depth,
        siblingIndex: frame.siblingIndex,
        startOrder: nodeOrder,
        endOrder: nodeOrder,
        parentIndex: frame.parentElementIndex,
        children: [],
        subtreeEnd: elements.length,
        textStart: textRecords.length,
        textEnd: textRecords.length - 1,
        excluded: excludesEvidence,
        inTemplateContent: frame.inTemplateContent,
        templateRootIndex: frame.templateRootIndex,
      };
      elements.push(currentElement);
      if (frame.parentElementIndex !== null) {
        elements[frame.parentElementIndex].children.push(currentElement.index);
        if (!currentElement.excluded) {
          const evidence = staticSiblingEvidenceByParent.get(frame.parentElementIndex) ?? [];
          evidence.push({
            siblingIndex: currentElement.siblingIndex,
            elementRecord: currentElement,
          });
          staticSiblingEvidenceByParent.set(frame.parentElementIndex, evidence);
        }
      }

      for (const attribute of frame.node.attrs) {
        if (!excludesEvidence && /^on/i.test(attribute.name)) {
          eventHandlerNames.add(attribute.name.toLocaleLowerCase('en-US'));
        }
      }

      parentElementIndex = currentElement.index;
      parentPath = domPath;
      unsafeText = suppressesText;
      evidenceExcluded = excludesEvidence;
      stack.push({ kind: 'exit', elementIndex: currentElement.index });
    }

    const childNodes = getChildNodes(frame.node);
    if (childNodes.length === 0) continue;
    if (frame.node.nodeName === 'template' && 'content' in frame.node) {
      inTemplateContent = true;
      templateRootIndex = currentElement!.index;
    }

    const childFrames = makeChildFrames(
      childNodes,
      frame.depth + 1,
      parentElementIndex,
      parentPath,
      unsafeText,
      evidenceExcluded,
      inTemplateContent,
      templateRootIndex,
    );
    for (let index = childFrames.length - 1; index >= 0; index -= 1) {
      stack.push(childFrames[index]);
    }
  }

  if (eventHandlerNames.size > 0) {
    warnings.add(`Ignored inline event handlers: ${[...eventHandlerNames].sort().join(', ')}`);
  }

  const idRecordsByScope = new Map<number, Map<string, ElementRecord>>();
  for (const element of elements) {
    if (element.excluded) continue;
    const id = getAttribute(element, 'id');
    if (!id) continue;
    const scope = element.templateRootIndex ?? ACTIVE_DOCUMENT_SCOPE;
    const scopedIds = idRecordsByScope.get(scope) ?? new Map<string, ElementRecord>();
    if (!scopedIds.has(id)) scopedIds.set(id, element);
    idRecordsByScope.set(scope, scopedIds);
  }

  const subtreeTextCache = new Map<string, { value: string; truncated: boolean }>();
  const cachedSubtreeText = (
    element: ElementRecord,
    maxChars = MAX_HTML_TEXT_CHARS,
  ): { value: string; truncated: boolean } => {
    const cacheKey = `${element.index}:${maxChars}`;
    const cached = subtreeTextCache.get(cacheKey);
    if (cached) return cached;

    let value = '';
    let usedChars = 0;
    let truncated = false;
    for (let index = element.textStart; index <= element.textEnd; index += 1) {
      const textRecord = textRecords[index];
      if (textRecord.templateRootIndex !== element.templateRootIndex) continue;
      const normalized = normalizeStaticText(textRecord.value, maxChars + 1);
      if (!normalized) continue;
      const separatorChars = value ? 1 : 0;
      const remainingChars = maxChars - usedChars - separatorChars;
      if (remainingChars <= 0) {
        truncated = true;
        break;
      }
      if (separatorChars) {
        value += ' ';
        usedChars += 1;
      }
      const codePoints = Array.from(normalized);
      if (codePoints.length > remainingChars) {
        value += codePoints.slice(0, remainingChars).join('');
        truncated = true;
        break;
      }
      value += normalized;
      usedChars += codePoints.length;
    }
    const result = { value, truncated };
    subtreeTextCache.set(cacheKey, result);
    return result;
  };
  const boundedSubtreeText = (
    element: ElementRecord,
    context: string,
    maxChars = MAX_HTML_TEXT_CHARS,
  ): string => {
    const result = cachedSubtreeText(element, maxChars);
    if (result.truncated) warnings.addRequired(`${context} was truncated to ${maxChars} characters`);
    return result.value;
  };
  const hasSubtreeText = (element: ElementRecord): boolean => Boolean(cachedSubtreeText(element, 1).value);
  const boundedText = (value: string, context: string, maxChars = MAX_HTML_TEXT_CHARS): string => {
    const normalized = normalizeStaticText(value, Number.MAX_SAFE_INTEGER);
    if (Array.from(normalized).length > maxChars) {
      warnings.addRequired(`${context} was truncated to ${maxChars} characters`);
    }
    return normalizeStaticText(normalized, maxChars);
  };
  const resolveId = (requester: ElementRecord, id: string): ElementRecord | undefined =>
    idRecordsByScope.get(requester.templateRootIndex ?? ACTIVE_DOCUMENT_SCOPE)?.get(id);
  const referencedText = (
    requester: ElementRecord,
    rawIds: string | undefined,
    context: string,
  ): string | undefined => {
    if (!rawIds) return undefined;
    let value = '';
    let usedChars = 0;
    let truncated = false;
    const seen = new Set<string>();
    for (const id of rawIds.trim().split(/\s+/u)) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const referenced = resolveId(requester, id);
      if (!referenced) continue;
      const referencedValue = cachedSubtreeText(referenced);
      if (!referencedValue.value) continue;
      const separatorChars = value ? 1 : 0;
      const remainingChars = MAX_HTML_TEXT_CHARS - usedChars - separatorChars;
      if (remainingChars <= 0) {
        truncated = true;
        break;
      }
      if (separatorChars) {
        value += ' ';
        usedChars += 1;
      }
      const codePoints = Array.from(referencedValue.value);
      if (codePoints.length > remainingChars) {
        value += codePoints.slice(0, remainingChars).join('');
        truncated = true;
        break;
      }
      value += referencedValue.value;
      usedChars += codePoints.length;
      if (referencedValue.truncated) {
        truncated = true;
        break;
      }
    }
    if (truncated) warnings.addRequired(`${context} was truncated to ${MAX_HTML_TEXT_CHARS} characters`);
    return value || undefined;
  };

  const validationSiblingEvidenceByParent = new Map<number, ValidationSiblingEvidence[]>();
  for (const element of elements) {
    if (element.parentIndex === null
      || explicitSectionType(element) !== 'validation'
      || !hasSubtreeText(element)) continue;
    const evidence = validationSiblingEvidenceByParent.get(element.parentIndex) ?? [];
    evidence.push({ siblingIndex: element.siblingIndex, elementRecord: element });
    validationSiblingEvidenceByParent.set(element.parentIndex, evidence);
  }

  const titleRecord = elements.find((element) =>
    isHtmlElement(element)
    && !element.excluded
    && !element.inTemplateContent
    && element.tagName === 'title'
    && hasSubtreeText(element)
  );
  const headingRecord = elements.find((element) =>
    isHtmlElement(element)
    && !element.excluded
    && !element.inTemplateContent
    && element.tagName === 'h1'
    && hasSubtreeText(element)
  );
  const fallbackTitle = fileName.replace(/\.html?$/iu, '');
  const pageTitleRecord = titleRecord ?? headingRecord;
  const pageTitle = pageTitleRecord
    ? boundedSubtreeText(pageTitleRecord, 'Page title', MAX_HTML_TITLE_CHARS)
    : boundedText(fallbackTitle, 'Page title', MAX_HTML_TITLE_CHARS);

  const baseElement = elements.find((element) =>
    isHtmlElement(element)
    && !element.excluded
    && !element.inTemplateContent
    && element.tagName === 'base'
    && getAttribute(element, 'href')
  );
  const sanitizedBaseRoute = baseElement
    ? sanitizeHtmlRoute(getAttribute(baseElement, 'href')!)
    : undefined;
  const baseRoute = baseElement
    ? boundRoute(sanitizedBaseRoute, `Base route at ${baseElement.domPath}`)
    : undefined;
  const routeBase = sanitizedBaseRoute?.normalizedTarget;
  const canonicalElement = elements.find((element) =>
    isHtmlElement(element)
    && !element.excluded
    && !element.inTemplateContent
    && element.tagName === 'link'
    && getAttribute(element, 'rel')?.toLocaleLowerCase('en-US').split(/\s+/u).includes('canonical')
    && getAttribute(element, 'href')
  );
  const canonicalRoute = canonicalElement
    ? boundRoute(
      sanitizeHtmlRoute(getAttribute(canonicalElement, 'href')!, routeBase),
      `Canonical route at ${canonicalElement.domPath}`,
    )
    : undefined;
  const encodedFileNamePath = encodeBoundedFileNamePath(fileName, MAX_HTML_TEXT_CHARS);
  const fullEncodedFileNamePath = `/${encodeURIComponent(fileName)}`;
  if (encodedFileNamePath.truncated) {
    warnings.addRequired(`File-name route was truncated to ${MAX_HTML_TEXT_CHARS} characters`);
  }
  const fileRoute = boundRoute(
    sanitizeHtmlRoute(fullEncodedFileNamePath),
    'File-name route',
    encodedFileNamePath.path,
  );
  const routeAliases = fileRoute ? [fileRoute] : [];

  const routeByElement = new Map<number, SanitizedHtmlRoute>();
  for (const element of elements) {
    if (!isHtmlElement(element) || element.excluded) continue;
    const route = LINK_TAGS.has(element.tagName)
      ? boundRoute(sanitizeHtmlRoute(getAttribute(element, 'href') ?? '', routeBase), `Link at ${element.domPath}`)
      : element.tagName === 'form'
        ? boundRoute(sanitizeHtmlRoute(getAttribute(element, 'action') ?? '', routeBase), `Form action at ${element.domPath}`)
        : undefined;
    if (route) routeByElement.set(element.index, route);
  }

  const firstLabelableDescendant = new Array<number | undefined>(elements.length);
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    let first = isHtmlElement(element) && !element.excluded && LABELABLE_TAGS.has(element.tagName)
      ? index
      : undefined;
    for (const childIndex of element.children) {
      const descendant = firstLabelableDescendant[childIndex];
      if (descendant !== undefined
        && elements[descendant].templateRootIndex === element.templateRootIndex
        && (first === undefined || descendant < first)) first = descendant;
    }
    firstLabelableDescendant[index] = first;
  }

  const optionsBySelect = new Map<number, ElementRecord[]>();
  const nearestSelect = new Array<number | undefined>(elements.length);
  for (const element of elements) {
    const parent = element.parentIndex === null ? undefined : elements[element.parentIndex];
    nearestSelect[element.index] = parent?.tagName === 'select'
      ? parent.index
      : parent ? nearestSelect[parent.index] : undefined;
    const selectIndex = nearestSelect[element.index];
    if (isHtmlElement(element)
      && !element.excluded
      && element.tagName === 'option'
      && selectIndex !== undefined) {
      const options = optionsBySelect.get(selectIndex) ?? [];
      options.push(element);
      optionsBySelect.set(selectIndex, options);
    }
  }

  const labelByElement = new Map<number, string>();
  for (const labelRecord of elements.filter((element) =>
    isHtmlElement(element) && !element.excluded && element.tagName === 'label'
  )) {
    const label = boundedSubtreeText(labelRecord, `Label at ${labelRecord.domPath}`);
    if (!label) continue;

    const targetId = getAttribute(labelRecord, 'for');
    const target = targetId
      ? resolveId(labelRecord, targetId)
      : firstLabelableDescendant[labelRecord.index] === undefined
        ? undefined
        : elements[firstLabelableDescendant[labelRecord.index]!];
    if (!target) continue;

    const combined = [labelByElement.get(target.index), label].filter(Boolean).join(' ');
    labelByElement.set(
      target.index,
      boundedText(combined, `Labels for ${target.domPath}`),
    );
  }

  const candidates: ChunkCandidate[] = [];
  const addCandidate = (candidate: ChunkCandidate): void => {
    if (candidates.length >= MAX_HTML_CHUNKS) {
      throw new HtmlKnowledgeLimitError('HTML semantic chunk limit of 500 exceeded');
    }
    candidates.push(candidate);
  };
  for (const element of elements) {
    const sectionType = explicitSectionType(element);
    if (sectionType) addCandidate(makeSubtreeCandidate(element, sectionType));
  }

  const navigationRoots = new Set(
    candidates.filter((candidate) => candidate.sectionType === 'navigation')
      .map((candidate) => candidate.rootIndex),
  );
  const safeLinkPrefix = new Uint32Array(elements.length + 1);
  for (const element of elements) {
    const isSafeLink = isHtmlElement(element)
      && !element.excluded
      && element.tagName === 'a'
      && routeByElement.has(element.index);
    safeLinkPrefix[element.index + 1] = safeLinkPrefix[element.index] + Number(isSafeLink);
  }
  for (const element of elements) {
    if (!isHtmlElement(element)
      || element.excluded
      || (element.tagName !== 'ul' && element.tagName !== 'ol')) continue;
    const linkCount = safeLinkPrefix[element.subtreeEnd + 1] - safeLinkPrefix[element.index];
    if (linkCount < 2 || hasAncestorInSet(element, navigationRoots, elements)) continue;
    addCandidate(makeSubtreeCandidate(element, 'navigation'));
    navigationRoots.add(element.index);
  }

  const ownedSemanticByOrder = buildCandidateOwnership(candidates, nodeCount);
  const headingElements = elements.filter((element) =>
    isHtmlElement(element) && !element.excluded && HEADING_TAG.test(element.tagName)
  );
  const contentHeadingElements = headingElements.filter((element) =>
    !ownedSemanticByOrder[element.startOrder] && hasSubtreeText(element)
  );
  const captionElements = elements.filter((element) =>
    isHtmlElement(element) && !element.excluded && element.tagName === 'caption'
  );
  const nextHeadingAtOrAbove = new Map<number, ElementRecord | undefined>();
  const nextHeadingByDomain = new Map<number, Array<ElementRecord | undefined>>();
  for (let index = contentHeadingElements.length - 1; index >= 0; index -= 1) {
    const heading = contentHeadingElements[index];
    const domain = heading.templateRootIndex ?? ACTIVE_DOCUMENT_SCOPE;
    const nextHeadingByLevel = nextHeadingByDomain.get(domain)
      ?? new Array<ElementRecord | undefined>(7);
    const level = Number(heading.tagName[1]);
    let next: ElementRecord | undefined;
    for (let candidateLevel = 1; candidateLevel <= level; candidateLevel += 1) {
      const candidate = nextHeadingByLevel[candidateLevel];
      if (candidate && (!next || candidate.startOrder < next.startOrder)) next = candidate;
    }
    nextHeadingAtOrAbove.set(heading.index, next);
    nextHeadingByLevel[level] = heading;
    nextHeadingByDomain.set(domain, nextHeadingByLevel);
  }
  const lineStartOffsets = buildLineStartOffsets(source.normalizedHtml);

  for (const element of contentHeadingElements) {
    const parent = element.parentIndex === null ? undefined : elements[element.parentIndex];
    const nextHeading = nextHeadingAtOrAbove.get(element.index);
    const boundary = nextHeading && nextHeading.startOrder <= (parent?.endOrder ?? element.endOrder)
      ? nextHeading
      : undefined;
    addCandidate({
      rootIndex: element.index,
      kind: 'range',
      sectionType: 'content',
      domPath: element.domPath,
      depth: element.depth,
      headingDomain: element.templateRootIndex ?? ACTIVE_DOCUMENT_SCOPE,
      startOrder: element.startOrder,
      endOrder: boundary?.startOrder !== undefined
        ? boundary.startOrder - 1
        : (parent?.endOrder ?? element.endOrder),
      heading: boundedSubtreeText(element, `Heading at ${element.domPath}`),
      sourceLocation: headingRangeSourceLocation(
        element,
        boundary,
        parent,
        lineStartOffsets,
        source.normalizedHtml.length,
      ),
    });
  }

  const usefulRecords = elements.filter(isUsefulElement);
  if (usefulRecords.length > MAX_HTML_ELEMENTS) {
    throw new HtmlKnowledgeLimitError('HTML indexed element limit of 2,000 exceeded');
  }

  const interactiveRecords = usefulRecords.filter(isInteractiveElement);
  const bodyRecord = elements.find((element) => isHtmlElement(element) && element.tagName === 'body');
  const bodyStaticText = bodyRecord ? boundedSubtreeText(bodyRecord, `Static text at ${bodyRecord.domPath}`) : '';
  if (candidates.length === 0 && interactiveRecords.length === 0 && bodyRecord && bodyStaticText) {
    addCandidate({
      ...makeSubtreeCandidate(bodyRecord, 'content'),
      heading: pageTitle,
    });
  }

  const semanticOwnerByOrder = buildCandidateOwnership(candidates, nodeCount);
  const interactiveRoots = new Set<number>();
  for (const element of interactiveRecords) {
    if (semanticOwnerByOrder[element.startOrder] || hasAncestorInSet(element, interactiveRoots, elements)) continue;

    let root = element;
    let parent = element.parentIndex === null ? undefined : elements[element.parentIndex];
    while (parent && parent.tagName !== 'body' && parent.tagName !== 'html') {
      if (INTERACTIVE_REGION_TAGS.has(parent.tagName)) {
        root = parent;
        break;
      }
      parent = parent.parentIndex === null ? undefined : elements[parent.parentIndex];
    }

    if (!interactiveRoots.has(root.index)) {
      interactiveRoots.add(root.index);
      addCandidate(makeSubtreeCandidate(root, 'interactive'));
    }
  }

  const ownerBeforeFallback = buildCandidateOwnership(candidates, nodeCount);
  const fallbackScopes = new Set<number>();
  for (const element of usefulRecords) {
    if (ownerBeforeFallback[element.startOrder] || !hasMeaningfulUnownedEvidence(element)) continue;
    const scope = element.templateRootIndex ?? ACTIVE_DOCUMENT_SCOPE;
    if (fallbackScopes.has(scope)) continue;
    const root = element.templateRootIndex === null
      ? bodyRecord ?? element
      : elements[element.templateRootIndex];
    fallbackScopes.add(scope);
    addCandidate({
      ...makeSubtreeCandidate(root, 'content'),
      kind: 'range',
      headingDomain: scope,
    });
  }

  candidates.sort((left, right) =>
    left.rootIndex - right.rootIndex
    || SECTION_ORDER[left.sectionType] - SECTION_ORDER[right.sectionType]
    || left.domPath.localeCompare(right.domPath, 'en-US')
  );
  if (candidates.length > MAX_HTML_CHUNKS) {
    throw new HtmlKnowledgeLimitError('HTML semantic chunk limit of 500 exceeded');
  }
  const ownerByOrder = buildCandidateOwnership(candidates, nodeCount);

  const indexedElements = new Map<number, HtmlKnowledgeElement>();
  for (const element of usefulRecords) {
    const indexed = indexElement(element);
    indexedElements.set(element.index, indexed);
  }

  const elementAssignments = new Map<ChunkCandidate, HtmlKnowledgeElement[]>();
  for (const [elementIndex, indexed] of indexedElements) {
    const candidate = ownerByOrder[elements[elementIndex].startOrder];
    if (!candidate) continue;
    const assigned = elementAssignments.get(candidate) ?? [];
    assigned.push(indexed);
    elementAssignments.set(candidate, assigned);
  }

  const textAssignments = new Map<ChunkCandidate, string[]>();
  for (const textRecord of textRecords) {
    const candidate = ownerByOrder[textRecord.order];
    if (!candidate || candidate.kind === 'range') continue;
    const assigned = textAssignments.get(candidate) ?? [];
    assigned.push(textRecord.value);
    textAssignments.set(candidate, assigned);
  }

  const chunks: HtmlKnowledgeChunk[] = candidates.map((candidate) => {
    const chunkElements = elementAssignments.get(candidate) ?? [];
    const textValues = candidate.kind === 'range'
      ? textValuesInOrderRange(
        textRecords,
        candidate.startOrder,
        candidate.endOrder,
        candidate.headingDomain,
      )
      : (textAssignments.get(candidate) ?? []);
    const staticText = boundedText(
      textValues.join(' '),
      `Static text at ${candidate.domPath}`,
    );
    const heading = candidate.heading || candidateHeading(candidate, chunkElements, staticText);
    const searchTerms = tokenizeHtmlKnowledge([
      pageTitle,
      fileName,
      canonicalRoute?.normalizedTarget,
      heading,
      staticText,
      ...chunkElements.flatMap(elementSearchValues),
    ].filter(Boolean).join(' '));

    return {
      id: chunkId(source.sha256, candidate.sectionType, candidate.domPath),
      pageId,
      sectionType: candidate.sectionType,
      ...(heading ? { heading } : {}),
      domPath: candidate.domPath,
      staticText,
      elements: chunkElements,
      searchTerms,
      ...(candidate.sourceLocation ? { sourceLocation: candidate.sourceLocation } : {}),
    };
  });

  const relationCandidates: HtmlPageRelationCandidate[] = [];
  for (const element of usefulRecords) {
    const target = routeByElement.get(element.index);
    if (!target) continue;
    const indexed = indexedElements.get(element.index)!;
    if (LINK_TAGS.has(element.tagName)) {
      relationCandidates.push({
        type: 'link',
        ...(indexed.accessibleNameCandidate ? { label: indexed.accessibleNameCandidate } : {}),
        sourceDomPath: element.domPath,
        sourceTarget: target.normalizedTarget,
        target,
      });
    } else if (element.tagName === 'form') {
      relationCandidates.push({
        type: 'form-action',
        ...(indexed.accessibleNameCandidate ? { label: indexed.accessibleNameCandidate } : {}),
        sourceDomPath: element.domPath,
        sourceTarget: target.normalizedTarget,
        target,
      });
    }
  }

  const informationLevel = chunks.some((chunk) =>
    Boolean(chunk.heading)
    || Boolean(chunk.staticText)
    || chunk.elements.some(hasMeaningfulElementEvidence)
  ) ? 'NORMAL' : 'LOW_INFORMATION';
  if (informationLevel === 'LOW_INFORMATION') {
    warnings.addRequired('Page contains little static HTML; a rendered DOM snapshot may provide better knowledge');
  }

  const finalWarnings = warnings.values();
  const index: HtmlKnowledgePageIndex = {
    version: HTML_KNOWLEDGE_INDEX_VERSION,
    pageId,
    fileName,
    fileNameKey,
    pageTitle,
    contentSha256: source.sha256,
    informationLevel,
    ...(canonicalRoute ? { canonicalRoute } : {}),
    ...(baseRoute ? { baseRoute } : {}),
    routeAliases,
    chunks,
    relationCandidates,
    warnings: finalWarnings,
  };
  const serializedIndex = JSON.stringify(index);
  if (Buffer.byteLength(serializedIndex, 'utf8') > MAX_HTML_INDEX_BYTES) {
    throw new HtmlKnowledgeLimitError('HTML serialized knowledge index exceeds 1 MiB');
  }

  return {
    pageTitle,
    informationLevel,
    warnings: finalWarnings,
    index,
    serializedIndex,
  };

  function boundRoute(
    route: SanitizedHtmlRoute | null | undefined,
    context: string,
    boundedPath?: string,
  ): SanitizedHtmlRoute | undefined {
    if (!route) return undefined;

    const origin = route.origin;
    const availablePathChars = Math.max(1, MAX_HTML_TEXT_CHARS - Array.from(origin ?? '').length);
    const path = truncatePercentEncodedPath(boundedPath ?? route.path, availablePathChars);
    const queryParameterNames: string[] = [];
    const seenNames = new Set<string>();
    let targetChars = Array.from(origin ?? '').length + Array.from(path).length;
    let droppedNames = 0;
    let truncatedName = false;

    for (const rawName of route.queryParameterNames) {
      const name = truncateCodePoints(rawName, MAX_HTML_TEXT_CHARS);
      truncatedName ||= name !== rawName;
      if (!name || seenNames.has(name)) {
        droppedNames += 1;
        continue;
      }
      seenNames.add(name);
      const encodedName = encodeURIComponent(name);
      const addedChars = 1 + encodedName.length;
      if (targetChars + addedChars > MAX_HTML_TEXT_CHARS) {
        droppedNames += 1;
        continue;
      }
      queryParameterNames.push(name);
      targetChars += addedChars;
    }

    const pathTruncated = path !== route.path;
    if (path !== route.path || truncatedName) {
      warnings.addRequired(`${context} was truncated to ${MAX_HTML_TEXT_CHARS} characters`);
    }
    if (droppedNames > 0) {
      warnings.addRequired(`${context} dropped ${droppedNames} query parameter names to fit ${MAX_HTML_TEXT_CHARS} characters`);
    }

    const normalizedTarget = buildRouteTarget(origin, path, queryParameterNames);
    return {
      normalizedTarget,
      origin,
      path,
      queryParameterNames,
      ...(pathTruncated ? { pathTruncated: true } : {}),
      fullPathSha256: route.fullPathSha256,
    };
  }

  function indexElement(record: ElementRecord): HtmlKnowledgeElement {
    const indexed: Mutable<HtmlKnowledgeElement> = {
      tagName: record.tagName,
      domPath: record.domPath,
    };
    const readTextAttribute = (name: string): string | undefined => {
      const raw = getAttribute(record, name);
      if (raw === undefined) return undefined;
      const value = boundedText(raw, `Attribute "${name}" at ${record.domPath}`);
      return value || undefined;
    };

    if (record.tagName === 'input') {
      indexed.inputType = (readTextAttribute('type') ?? 'text').toLocaleLowerCase('en-US');
    }

    const label = labelByElement.get(record.index);
    if (label) indexed.label = label;

    const ariaLabel = readTextAttribute('aria-label');
    const labelledBy = referencedText(
      record,
      getAttribute(record, 'aria-labelledby'),
      `ARIA label at ${record.domPath}`,
    );
    const nearby = nearbyStaticText(record);
    const accessibleNameCandidate = label
      || ariaLabel
      || labelledBy
      || readTextAttribute('alt')
      || readTextAttribute('title')
      || nearby;
    if (accessibleNameCandidate) indexed.accessibleNameCandidate = accessibleNameCandidate;

    assignText('id', readTextAttribute('id'));
    assignText('name', readTextAttribute('name'));
    assignText('role', readTextAttribute('role'));
    assignText('dataTestId', readTextAttribute('data-testid'));

    const ariaAttributes: Record<string, string> = {};
    for (const attribute of [...record.node.attrs]
      .filter((attribute) => attribute.name.toLocaleLowerCase('en-US').startsWith('aria-'))
      .sort((left, right) => left.name.localeCompare(right.name, 'en-US'))) {
      ariaAttributes[attribute.name.toLocaleLowerCase('en-US')] = boundedText(
        attribute.value,
        `ARIA attribute "${attribute.name}" at ${record.domPath}`,
      );
    }
    if (Object.keys(ariaAttributes).length > 0) indexed.ariaAttributes = ariaAttributes;

    const route = routeByElement.get(record.index);
    if (LINK_TAGS.has(record.tagName) && route) indexed.href = route.normalizedTarget;
    if (record.tagName === 'form' && route) indexed.action = route.normalizedTarget;
    if (record.tagName === 'form') {
      const method = readTextAttribute('method');
      if (method) indexed.method = method.toLocaleLowerCase('en-US');
    }

    if (hasAttribute(record, 'required')) indexed.required = true;
    if (hasAttribute(record, 'disabled')) indexed.disabled = true;
    if (hasAttribute(record, 'readonly')) indexed.readOnly = true;
    if (hasAttribute(record, 'multiple')) indexed.multiple = true;
    assignText('min', readTextAttribute('min'));
    assignText('max', readTextAttribute('max'));
    assignText('step', readTextAttribute('step'));
    assignText('pattern', readTextAttribute('pattern'));

    const minLength = parseNonNegativeInteger(getAttribute(record, 'minlength'));
    const maxLength = parseNonNegativeInteger(getAttribute(record, 'maxlength'));
    if (minLength !== undefined) indexed.minLength = minLength;
    if (maxLength !== undefined) indexed.maxLength = maxLength;

    if (record.tagName === 'select') {
      const optionRecords = optionsBySelect.get(record.index) ?? [];
      if (optionRecords.length > MAX_HTML_SELECT_OPTIONS) {
        warnings.addRequired(`Select at ${record.domPath} has ${optionRecords.length} options; retained first ${MAX_HTML_SELECT_OPTIONS}`);
      }
      indexed.options = optionRecords.slice(0, MAX_HTML_SELECT_OPTIONS).map((option): HtmlKnowledgeSelectOption => {
        const value = getAttribute(option, 'value');
        return {
          label: boundedText(
            getAttribute(option, 'label')
              ?? boundedSubtreeText(option, `Option label at ${option.domPath}`),
            `Option label at ${option.domPath}`,
          ),
          ...(value !== undefined
            ? { value: boundedText(value, `Option value at ${option.domPath}`) }
            : {}),
        };
      });
    }

    const validationIds = [
      getAttribute(record, 'aria-describedby'),
      getAttribute(record, 'aria-errormessage'),
    ].filter(Boolean).join(' ');
    const validationText = referencedText(record, validationIds, `Validation text at ${record.domPath}`)
      || nearbyValidationText(record);
    if (validationText) indexed.validationText = validationText;

    const location = sourceLocation(record);
    if (location) indexed.sourceLocation = location;
    return indexed;

    function assignText(
      property: 'id' | 'name' | 'role' | 'dataTestId' | 'min' | 'max' | 'step' | 'pattern',
      value: string | undefined,
    ): void {
      if (value) indexed[property] = value;
    }
  }

  function nearbyStaticText(record: ElementRecord): string | undefined {
    const ownText = boundedSubtreeText(record, `Nearby text at ${record.domPath}`);
    if (ownText) return ownText;

    if (record.parentIndex === null) return undefined;
    const evidence = staticSiblingEvidenceByParent.get(record.parentIndex) ?? [];
    const { previous, next } = siblingNeighbors(evidence, record.siblingIndex);
    return siblingStaticText(previous) || siblingStaticText(next);

    function siblingStaticText(sibling: StaticSiblingEvidence | undefined): string | undefined {
      if (!sibling) return undefined;
      return sibling.textRecord
        ? boundedText(sibling.textRecord.value, `Nearby text at ${record.domPath}`) || undefined
        : boundedSubtreeText(sibling.elementRecord!, `Nearby text at ${record.domPath}`) || undefined;
    }
  }

  function nearbyValidationText(record: ElementRecord): string | undefined {
    if (!VALIDATABLE_TAGS.has(record.tagName) || record.parentIndex === null) return undefined;

    const evidence = validationSiblingEvidenceByParent.get(record.parentIndex) ?? [];
    const { previous, next } = siblingNeighbors(evidence, record.siblingIndex);
    const nearest = next && (
      !previous
      || next.siblingIndex - record.siblingIndex <= record.siblingIndex - previous.siblingIndex
    ) ? next : previous;
    return nearest
      ? boundedSubtreeText(nearest.elementRecord, `Validation text at ${record.domPath}`) || undefined
      : undefined;
  }

  function hasMeaningfulUnownedEvidence(record: ElementRecord): boolean {
    if ([
      labelByElement.get(record.index),
      getAttribute(record, 'aria-label'),
      getAttribute(record, 'alt'),
      getAttribute(record, 'title'),
    ].some((value) => Boolean(value && normalizeStaticText(value, 1)))) {
      return true;
    }

    const labelledBy = getAttribute(record, 'aria-labelledby');
    if (!labelledBy) return false;
    return labelledBy.trim().split(/\s+/u).some((id) => {
      const referenced = resolveId(record, id);
      return referenced ? hasSubtreeText(referenced) : false;
    });
  }

  function candidateHeading(
    candidate: ChunkCandidate,
    chunkElements: readonly HtmlKnowledgeElement[],
    staticText: string,
  ): string | undefined {
    const root = elements[candidate.rootIndex];
    const ariaLabel = getAttribute(root, 'aria-label');
    if (ariaLabel) return boundedText(ariaLabel, `Chunk heading at ${candidate.domPath}`);
    const labelledBy = referencedText(
      root,
      getAttribute(root, 'aria-labelledby'),
      `Chunk heading at ${candidate.domPath}`,
    );
    if (labelledBy) return labelledBy;

    const descendant = firstRecordInOrderRange(
      candidate.sectionType === 'table' ? captionElements : headingElements,
      candidate.startOrder,
      candidate.endOrder,
    );
    if (descendant) {
      const text = boundedSubtreeText(descendant, `Chunk heading at ${candidate.domPath}`);
      if (text) return text;
    }
    return chunkElements.find((element) => element.accessibleNameCandidate)?.accessibleNameCandidate
      || (candidate.sectionType === 'validation'
        ? normalizeStaticText(staticText, MAX_HTML_TEXT_CHARS) || undefined
        : undefined);
  }
}

type ParseNode = DefaultTreeAdapterTypes.Node;
type ParseElement = DefaultTreeAdapterTypes.Element;

interface ElementRecord {
  readonly index: number;
  readonly node: ParseElement;
  readonly tagName: string;
  readonly domPath: string;
  readonly depth: number;
  readonly siblingIndex: number;
  readonly startOrder: number;
  endOrder: number;
  readonly parentIndex: number | null;
  readonly children: number[];
  subtreeEnd: number;
  readonly textStart: number;
  textEnd: number;
  readonly excluded: boolean;
  readonly inTemplateContent: boolean;
  readonly templateRootIndex: number | null;
}

interface TextRecord {
  readonly order: number;
  readonly siblingIndex: number;
  readonly parentElementIndex: number;
  readonly templateRootIndex: number | null;
  readonly value: string;
}

type WalkFrame = {
  readonly kind: 'enter';
  readonly node: ParseNode;
  readonly depth: number;
  readonly siblingIndex: number;
  readonly parentElementIndex: number | null;
  readonly parentPath: string;
  readonly unsafeText: boolean;
  readonly evidenceExcluded: boolean;
  readonly inTemplateContent: boolean;
  readonly templateRootIndex: number | null;
  readonly domPath?: string;
} | {
  readonly kind: 'exit';
  readonly elementIndex: number;
};

interface ChunkCandidate {
  readonly rootIndex: number;
  readonly kind: 'subtree' | 'range';
  readonly sectionType: HtmlKnowledgeSectionType;
  readonly domPath: string;
  readonly depth: number;
  readonly headingDomain?: number;
  readonly startOrder: number;
  readonly endOrder: number;
  readonly heading?: string;
  readonly sourceLocation?: HtmlKnowledgeSourceLocation;
}

interface SiblingEvidencePosition {
  readonly siblingIndex: number;
}

interface StaticSiblingEvidence extends SiblingEvidencePosition {
  readonly textRecord?: TextRecord;
  readonly elementRecord?: ElementRecord;
}

interface ValidationSiblingEvidence extends SiblingEvidencePosition {
  readonly elementRecord: ElementRecord;
}

type Mutable<T> = { -readonly [Property in keyof T]: T[Property] };

const EVIDENCE_EXCLUDED_TAGS = new Set(['script', 'style', 'svg']);
const ACTIVE_DOCUMENT_SCOPE = -1;
const TEXT_ONLY_EXCLUDED_TAGS = new Set(['textarea']);
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const LABELABLE_TAGS = new Set(['button', 'input', 'output', 'select', 'textarea']);
const VALIDATABLE_TAGS = new Set(['input', 'select', 'textarea']);
const LINK_TAGS = new Set(['a', 'area']);
const CONTROL_TAGS = new Set(['button', 'details', 'form', 'input', 'output', 'select', 'summary', 'textarea']);
const USEFUL_TAGS = new Set([
  'a',
  'area',
  'button',
  'details',
  'dialog',
  'form',
  'img',
  'input',
  'nav',
  'output',
  'select',
  'summary',
  'textarea',
]);
const INTERACTIVE_TAGS = new Set([
  'a',
  'area',
  'button',
  'details',
  'form',
  'input',
  'select',
  'summary',
  'textarea',
]);
const INTERACTIVE_ROLES = new Set([
  'button',
  'checkbox',
  'combobox',
  'link',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
  'treeitem',
]);
const USEFUL_ROLES = new Set([
  ...INTERACTIVE_ROLES,
  'alert',
  'alertdialog',
  'dialog',
  'form',
  'navigation',
  'search',
  'status',
]);
const INTERACTIVE_REGION_TAGS = new Set(['article', 'aside', 'div', 'fieldset', 'li', 'main', 'section']);
const HEADING_TAG = /^h[1-6]$/u;
const SECTION_ORDER: Record<HtmlKnowledgeSectionType, number> = {
  navigation: 0,
  form: 1,
  content: 2,
  dialog: 3,
  table: 4,
  validation: 5,
  interactive: 6,
};

class WarningCollector {
  private readonly warnings: string[] = [];
  private readonly seen = new Set<string>();

  add(message: string): void {
    this.append(message, false);
  }

  addRequired(message: string): void {
    this.append(message, true);
  }

  private append(message: string, required: boolean): void {
    const normalized = normalizeStaticText(message, MAX_HTML_WARNING_CHARS);
    if (!normalized || this.seen.has(normalized)) return;
    if (this.warnings.length >= MAX_HTML_WARNINGS) {
      if (!required) return;
      const removed = this.warnings.pop();
      if (removed) this.seen.delete(removed);
    }
    this.seen.add(normalized);
    this.warnings.push(normalized);
  }

  values(): readonly string[] {
    return [...this.warnings];
  }
}

function isElementNode(node: ParseNode): node is ParseElement {
  return 'tagName' in node;
}

function isTextNode(node: ParseNode): node is DefaultTreeAdapterTypes.TextNode {
  return node.nodeName === '#text';
}

function getChildNodes(node: ParseNode): ParseNode[] {
  if (node.nodeName === 'template' && 'content' in node) {
    return [node.content];
  }
  return 'childNodes' in node ? node.childNodes : [];
}

function makeChildFrames(
  childNodes: readonly ParseNode[],
  depth: number,
  parentElementIndex: number | null,
  parentPath: string,
  unsafeText: boolean,
  evidenceExcluded: boolean,
  inTemplateContent: boolean,
  templateRootIndex: number | null,
): WalkFrame[] {
  const tagCounts = new Map<string, number>();
  return childNodes.map((node, siblingIndex): WalkFrame => {
    let domPath: string | undefined;
    if (isElementNode(node)) {
      const tagName = node.tagName.toLocaleLowerCase('en-US');
      const position = (tagCounts.get(tagName) ?? 0) + 1;
      tagCounts.set(tagName, position);
      domPath = `${parentPath}/${tagName}:nth-of-type(${position})`;
    }
    return {
      kind: 'enter',
      node,
      depth,
      siblingIndex,
      parentElementIndex,
      parentPath,
      unsafeText,
      evidenceExcluded,
      inTemplateContent,
      templateRootIndex,
      ...(domPath ? { domPath } : {}),
    };
  });
}

function siblingNeighbors<T extends SiblingEvidencePosition>(
  evidence: readonly T[],
  siblingIndex: number,
): { readonly previous?: T; readonly next?: T } {
  let low = 0;
  let high = evidence.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (evidence[middle].siblingIndex < siblingIndex) low = middle + 1;
    else high = middle;
  }

  const hasCurrent = evidence[low]?.siblingIndex === siblingIndex;
  return {
    ...(low > 0 ? { previous: evidence[low - 1] } : {}),
    ...((hasCurrent ? low + 1 : low) < evidence.length
      ? { next: evidence[hasCurrent ? low + 1 : low] }
      : {}),
  };
}

function getAttribute(element: ElementRecord, name: string): string | undefined {
  return element.node.attrs.find((attribute) =>
    attribute.name.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US')
  )?.value;
}

function hasAttribute(element: ElementRecord, name: string): boolean {
  return getAttribute(element, name) !== undefined;
}

function explicitSectionType(element: ElementRecord): HtmlKnowledgeSectionType | undefined {
  if (!isHtmlElement(element) || element.excluded) return undefined;
  const role = getAttribute(element, 'role')?.trim().toLocaleLowerCase('en-US');
  if (element.tagName === 'form') return 'form';
  if (element.tagName === 'nav' || role === 'navigation') return 'navigation';
  if (element.tagName === 'dialog' || role === 'dialog' || role === 'alertdialog' || getAttribute(element, 'aria-modal') === 'true') {
    return 'dialog';
  }
  if (element.tagName === 'table') return 'table';
  if (role === 'alert' || role === 'status' || (hasAttribute(element, 'aria-live') && getAttribute(element, 'aria-live') !== 'off')) {
    return 'validation';
  }
  return undefined;
}

function makeSubtreeCandidate(
  element: ElementRecord,
  sectionType: HtmlKnowledgeSectionType,
): ChunkCandidate {
  return {
    rootIndex: element.index,
    kind: 'subtree',
    sectionType,
    domPath: element.domPath,
    depth: element.depth,
    startOrder: element.startOrder,
    endOrder: element.endOrder,
    sourceLocation: sourceLocation(element),
  };
}

// Sweep DOM order with a lazy max-heap instead of scanning every candidate per node.
function buildCandidateOwnership(
  candidates: readonly ChunkCandidate[],
  nodeCount: number,
): Array<ChunkCandidate | undefined> {
  const starts = new Map<number, ChunkCandidate[]>();
  const ends = new Map<number, ChunkCandidate[]>();
  for (const candidate of candidates) {
    const starting = starts.get(candidate.startOrder) ?? [];
    starting.push(candidate);
    starts.set(candidate.startOrder, starting);
    const ending = ends.get(candidate.endOrder + 1) ?? [];
    ending.push(candidate);
    ends.set(candidate.endOrder + 1, ending);
  }

  const owners = new Array<ChunkCandidate | undefined>(nodeCount);
  const active = new Set<ChunkCandidate>();
  const heap: ChunkCandidate[] = [];
  for (let order = 0; order < nodeCount; order += 1) {
    for (const candidate of ends.get(order) ?? []) active.delete(candidate);
    for (const candidate of starts.get(order) ?? []) {
      active.add(candidate);
      pushCandidateHeap(heap, candidate);
    }
    while (heap[0] && !active.has(heap[0])) popCandidateHeap(heap);
    owners[order] = heap[0];
  }
  return owners;
}

function pushCandidateHeap(heap: ChunkCandidate[], candidate: ChunkCandidate): void {
  heap.push(candidate);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (!hasHigherCandidatePriority(heap[index], heap[parent])) break;
    [heap[index], heap[parent]] = [heap[parent], heap[index]];
    index = parent;
  }
}

function popCandidateHeap(heap: ChunkCandidate[]): void {
  const tail = heap.pop();
  if (!tail || heap.length === 0) return;
  heap[0] = tail;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let best = index;
    if (left < heap.length && hasHigherCandidatePriority(heap[left], heap[best])) best = left;
    if (right < heap.length && hasHigherCandidatePriority(heap[right], heap[best])) best = right;
    if (best === index) return;
    [heap[index], heap[best]] = [heap[best], heap[index]];
    index = best;
  }
}

function hasHigherCandidatePriority(left: ChunkCandidate, right: ChunkCandidate): boolean {
  if (left.kind !== right.kind) return left.kind === 'subtree';
  if (left.depth !== right.depth) return left.depth > right.depth;
  if (left.rootIndex !== right.rootIndex) return left.rootIndex > right.rootIndex;
  return SECTION_ORDER[left.sectionType] < SECTION_ORDER[right.sectionType];
}

function isUsefulElement(element: ElementRecord): boolean {
  if (!isHtmlElement(element) || element.excluded) return false;
  const role = getAttribute(element, 'role')?.trim().toLocaleLowerCase('en-US');
  return USEFUL_TAGS.has(element.tagName)
    || Boolean(role && USEFUL_ROLES.has(role))
    || hasAttribute(element, 'data-testid');
}

function isInteractiveElement(element: ElementRecord): boolean {
  if (element.excluded) return false;
  const role = getAttribute(element, 'role')?.trim().toLocaleLowerCase('en-US');
  return INTERACTIVE_TAGS.has(element.tagName) || Boolean(role && INTERACTIVE_ROLES.has(role));
}

function isHtmlElement(element: ElementRecord): boolean {
  return element.node.namespaceURI === HTML_NAMESPACE;
}

function sourceLocation(element: ElementRecord): HtmlKnowledgeSourceLocation | undefined {
  const location = element.node.sourceCodeLocation;
  if (!location || !location.startLine || !location.endLine) return undefined;
  return { startLine: location.startLine, endLine: location.endLine };
}

function headingRangeSourceLocation(
  heading: ElementRecord,
  boundary: ElementRecord | undefined,
  parent: ElementRecord | undefined,
  lineStartOffsets: readonly number[],
  sourceLength: number,
): HtmlKnowledgeSourceLocation | undefined {
  const location = heading.node.sourceCodeLocation;
  if (!location) return undefined;

  const boundaryOffset = boundary?.node.sourceCodeLocation?.startOffset;
  const parentLocation = parent?.node.sourceCodeLocation;
  const endOffset = boundaryOffset
    ?? parentLocation?.endTag?.startOffset
    ?? parentLocation?.endOffset
    ?? sourceLength;
  const finalOffset = Math.max(location.startOffset, Math.min(sourceLength, endOffset) - 1);
  return {
    startLine: location.startLine,
    endLine: Math.max(location.startLine, lineNumberAtOffset(lineStartOffsets, finalOffset)),
  };
}

function buildLineStartOffsets(source: string): number[] {
  const offsets = [0];
  for (let index = source.indexOf('\n'); index >= 0; index = source.indexOf('\n', index + 1)) {
    offsets.push(index + 1);
  }
  return offsets;
}

function lineNumberAtOffset(lineStartOffsets: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStartOffsets.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStartOffsets[middle] <= offset) low = middle + 1;
    else high = middle;
  }
  return Math.max(1, low);
}

function hasAncestorInSet(
  element: ElementRecord,
  roots: ReadonlySet<number>,
  elements: readonly ElementRecord[],
): boolean {
  let current: ElementRecord | undefined = element;
  while (current) {
    if (roots.has(current.index)) return true;
    current = current.parentIndex === null ? undefined : elements[current.parentIndex];
  }
  return false;
}

function textValuesInOrderRange(
  textRecords: readonly TextRecord[],
  startOrder: number,
  endOrder: number,
  headingDomain: number | undefined,
): string[] {
  let low = 0;
  let high = textRecords.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (textRecords[middle].order < startOrder) low = middle + 1;
    else high = middle;
  }

  const values: string[] = [];
  for (let index = low; index < textRecords.length && textRecords[index].order <= endOrder; index += 1) {
    const record = textRecords[index];
    const recordDomain = record.templateRootIndex ?? ACTIVE_DOCUMENT_SCOPE;
    if (headingDomain === undefined || recordDomain === headingDomain) values.push(record.value);
  }
  return values;
}

function firstRecordInOrderRange(
  records: readonly ElementRecord[],
  startOrder: number,
  endOrder: number,
): ElementRecord | undefined {
  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (records[middle].startOrder < startOrder) low = middle + 1;
    else high = middle;
  }
  const record = records[low];
  return record && record.startOrder <= endOrder ? record : undefined;
}

function parseNonNegativeInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function chunkId(contentSha256: string, sectionType: string, domPath: string): string {
  return `hkc-${createHash('sha256')
    .update(`${contentSha256}\0${sectionType}\0${domPath}`)
    .digest('hex')
    .slice(0, 24)}`;
}

function truncateCodePoints(value: string, maxChars: number): string {
  const codePoints = Array.from(value);
  return codePoints.length <= maxChars ? value : codePoints.slice(0, maxChars).join('');
}

function truncatePercentEncodedPath(path: string, maxChars: number): string {
  if (Array.from(path).length <= maxChars) return path;

  let candidate = truncateCodePoints(path, maxChars).replace(/%(?:[\dA-Fa-f])?$/u, '');
  while (candidate) {
    try {
      decodeURI(candidate);
      return candidate;
    } catch {
      candidate = /%[\dA-Fa-f]{2}$/u.test(candidate)
        ? candidate.slice(0, -3)
        : candidate.slice(0, -1).replace(/%(?:[\dA-Fa-f])?$/u, '');
    }
  }
  return '/';
}

function encodeBoundedFileNamePath(
  fileName: string,
  maxPathChars: number,
): { path: string; truncated: boolean } {
  const extension = fileName.match(/\.html?$/iu)?.[0] ?? '';
  const stem = fileName.slice(0, fileName.length - extension.length);
  const encodedExtension = encodeURIComponent(extension);
  const availableStemChars = Math.max(0, maxPathChars - 1 - encodedExtension.length);
  let encodedStem = '';
  let truncated = false;

  for (const codePoint of stem) {
    const encodedCodePoint = encodeURIComponent(codePoint);
    if (encodedStem.length + encodedCodePoint.length > availableStemChars) {
      truncated = true;
      break;
    }
    encodedStem += encodedCodePoint;
  }

  return {
    path: `/${encodedStem}${encodedExtension}`,
    truncated,
  };
}

function buildRouteTarget(
  origin: string | null,
  path: string,
  queryParameterNames: readonly string[],
): string {
  const query = queryParameterNames.length > 0
    ? `?${queryParameterNames.map((name) => encodeURIComponent(name)).join('&')}`
    : '';
  return `${origin ?? ''}${path}${query}`;
}

function elementSearchValues(element: HtmlKnowledgeElement): string[] {
  return [
    element.tagName,
    element.inputType,
    element.label,
    element.accessibleNameCandidate,
    element.id,
    element.name,
    element.role,
    element.dataTestId,
    element.href,
    element.action,
    element.method,
    element.min,
    element.max,
    element.step,
    element.pattern,
    element.validationText,
    ...Object.values(element.ariaAttributes ?? {}),
    ...(element.options ?? []).flatMap((option) => [option.label, option.value]),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function hasMeaningfulElementEvidence(element: HtmlKnowledgeElement): boolean {
  return CONTROL_TAGS.has(element.tagName)
    || Boolean(element.href)
    || Boolean(element.action)
    || Boolean(element.label)
    || Boolean(element.accessibleNameCandidate)
    || Boolean(element.validationText)
    || Boolean(element.role && INTERACTIVE_ROLES.has(element.role.toLocaleLowerCase('en-US')));
}

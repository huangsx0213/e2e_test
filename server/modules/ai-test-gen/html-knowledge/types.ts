export const HTML_KNOWLEDGE_INDEX_VERSION = 1 as const;

export const MIN_HTML_PAGES = 1;
export const MAX_HTML_PAGES = 20;
export const MAX_HTML_PAGE_BYTES = 512 * 1024;
export const MAX_HTML_SET_BYTES = 5 * 1024 * 1024;
export const MAX_HTML_INDEX_BYTES = 1024 * 1024;
export const MAX_HTML_SET_INDEX_BYTES = 10 * 1024 * 1024;
export const MAX_HTML_TOOL_CHARS = 6000;
export const MAX_HTML_QUERY_IDS = 20;
export const MAX_HTML_REQUIREMENT_ID_CODE_POINTS = 128;
export const MAX_HTML_QUERY_TEXT_CHARS = 20_000;
export const MAX_HTML_QUERY_TERMS = 256;
export const DEFAULT_HTML_QUERY_RESULTS = 5;
export const MAX_HTML_QUERY_RESULTS = 10;
export const MAX_HTML_CACHE_ENTRIES = 100;

export const HTML_RETRIEVAL_WEIGHTS = Object.freeze({
  identity: 12,
  context: 8,
  label: 6,
  text: 3,
  relation: 2,
} as const);

export const MAX_HTML_UNBOUND_SETS_PER_PROJECT = 5;
export const MAX_HTML_UNBOUND_BYTES_PER_PROJECT = 25 * 1024 * 1024;
export const MAX_HTML_BOUND_BYTES_PER_PROJECT = 250 * 1024 * 1024;
export const MAX_HTML_PARSE_CONCURRENCY = 2;
export const MAX_HTML_UPLOADS_PER_MINUTE = 60;
export const HTML_UPLOAD_BODY_TIMEOUT_MS = 30 * 1000;
export const MAX_HTML_FILE_NAME_CODE_POINTS = 255;
export const MAX_HTML_WARNINGS = 20;
export const MAX_HTML_WARNING_CHARS = 200;
export const MAX_HTML_ERROR_CHARS = 500;

export const MAX_HTML_DOM_NODES = 50_000;
export const MAX_HTML_DOM_DEPTH = 128;
export const MAX_HTML_CHUNKS = 500;
export const MAX_HTML_ELEMENTS = 2_000;
export const MAX_HTML_SELECT_OPTIONS = 200;
export const MAX_HTML_TEXT_CHARS = 2_000;
export const MAX_HTML_PAGE_RELATIONS = 2_000;
export const MAX_HTML_TITLE_CHARS = 200;

export const HTML_KNOWLEDGE_UNBOUND_TTL_MS = 24 * 60 * 60 * 1000;
export const HTML_KNOWLEDGE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export type HtmlKnowledgeSetStatus = 'UPLOADING' | 'READY' | 'BOUND';
export type HtmlKnowledgePageStatus = 'PENDING' | 'READY' | 'FAILED';
export type HtmlInformationLevel = 'NORMAL' | 'LOW_INFORMATION';

export interface HtmlKnowledgeSetRow {
  id: string;
  project_id: string;
  run_id: string | null;
  status: HtmlKnowledgeSetStatus;
  page_count: number;
  total_bytes: number;
  page_graph: string;
  index_version: number;
  requirement_snapshot: string | null;
  requirement_snapshot_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface HtmlKnowledgePageRow {
  id: string;
  knowledge_set_id: string;
  file_name: string;
  file_name_key: string;
  expected_byte_size: number;
  status: HtmlKnowledgePageStatus;
  error_message: string | null;
  page_title: string | null;
  sha256: string | null;
  byte_size: number | null;
  normalized_html: string | null;
  knowledge_index: string | null;
  information_level: HtmlInformationLevel | null;
  warnings: string;
  created_at: string;
  updated_at: string;
}

export interface HtmlKnowledgeManifestPage {
  readonly fileName: string;
  readonly byteSize: number;
}

export interface HtmlKnowledgeManifest {
  readonly pages: readonly HtmlKnowledgeManifestPage[];
}

export interface HtmlKnowledgePageDto {
  readonly pageId: string;
  readonly fileName: string;
  readonly expectedByteSize: number;
  readonly status: HtmlKnowledgePageStatus;
  readonly errorMessage: string | null;
  readonly pageTitle: string | null;
  readonly byteSize: number | null;
  readonly informationLevel: HtmlInformationLevel | null;
  readonly warnings: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface HtmlKnowledgeSetDto {
  readonly knowledgeSetId: string;
  readonly status: HtmlKnowledgeSetStatus;
  readonly pageCount: number;
  readonly totalBytes: number;
  readonly indexVersion: number;
  readonly pages: readonly HtmlKnowledgePageDto[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface HtmlKnowledgeRunBindingResult {
  readonly runId: string;
  readonly created: boolean;
}

export interface NormalizedHtmlSource {
  readonly byteSize: number;
  readonly sha256: string;
  readonly normalizedHtml: string;
}

export interface SanitizedHtmlRoute {
  readonly normalizedTarget: string;
  readonly origin: string | null;
  readonly path: string;
  readonly queryParameterNames: readonly string[];
  readonly pathTruncated?: true;
  readonly fullPathSha256: string;
}

export interface HtmlKnowledgeSourceLocation {
  readonly startLine: number;
  readonly endLine: number;
}

export interface HtmlKnowledgeSelectOption {
  readonly label: string;
  readonly value?: string;
}

export interface HtmlKnowledgeElement {
  readonly tagName: string;
  readonly domPath: string;
  readonly inputType?: string;
  readonly label?: string;
  readonly accessibleNameCandidate?: string;
  readonly id?: string;
  readonly name?: string;
  readonly role?: string;
  readonly ariaAttributes?: Readonly<Record<string, string>>;
  readonly dataTestId?: string;
  readonly href?: string;
  readonly action?: string;
  readonly method?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly multiple?: boolean;
  readonly min?: string;
  readonly max?: string;
  readonly step?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly options?: readonly HtmlKnowledgeSelectOption[];
  readonly validationText?: string;
  readonly sourceLocation?: HtmlKnowledgeSourceLocation;
}

export type HtmlKnowledgeSectionType =
  | 'navigation'
  | 'form'
  | 'content'
  | 'dialog'
  | 'table'
  | 'validation'
  | 'interactive';

export interface HtmlKnowledgeChunk {
  readonly id: string;
  readonly pageId: string;
  readonly sectionType: HtmlKnowledgeSectionType;
  readonly heading?: string;
  readonly domPath: string;
  readonly staticText: string;
  readonly elements: readonly HtmlKnowledgeElement[];
  readonly searchTerms: readonly string[];
  readonly sourceLocation?: HtmlKnowledgeSourceLocation;
}

export type HtmlPageRelationType = 'link' | 'form-action';
export type HtmlPageRelationMatchRule = 'canonical-path' | 'file-path' | 'unique-path-suffix';
export type HtmlPageRelationConfidence = 'high' | 'medium';

export interface HtmlPageRelationCandidate {
  readonly type: HtmlPageRelationType;
  readonly label?: string;
  readonly sourceDomPath: string;
  readonly sourceTarget: string;
  readonly target: SanitizedHtmlRoute;
}

export interface HtmlPageRelation {
  readonly fromPageId: string;
  readonly toPageId: string;
  readonly type: HtmlPageRelationType;
  readonly label?: string;
  readonly sourceDomPath: string;
  readonly sourceTarget: string;
  readonly matchRule: HtmlPageRelationMatchRule;
  readonly confidence: HtmlPageRelationConfidence;
}

export interface HtmlKnowledgePageIndex {
  readonly version: typeof HTML_KNOWLEDGE_INDEX_VERSION;
  readonly pageId: string;
  readonly fileName: string;
  readonly fileNameKey: string;
  readonly pageTitle: string;
  readonly contentSha256: string;
  readonly informationLevel: HtmlInformationLevel;
  readonly canonicalRoute?: SanitizedHtmlRoute;
  readonly baseRoute?: SanitizedHtmlRoute;
  readonly routeAliases: readonly SanitizedHtmlRoute[];
  readonly chunks: readonly HtmlKnowledgeChunk[];
  readonly relationCandidates: readonly HtmlPageRelationCandidate[];
  readonly warnings: readonly string[];
  readonly stats?: Readonly<Record<string, number>>;
}

export interface IndexedHtmlKnowledgePage {
  readonly pageTitle: string;
  readonly informationLevel: HtmlInformationLevel;
  readonly warnings: readonly string[];
  readonly index: HtmlKnowledgePageIndex;
  readonly serializedIndex: string;
}

export interface HtmlPageRelationBuildResult {
  readonly relations: readonly HtmlPageRelation[];
  readonly warningsByPageId: Readonly<Record<string, readonly string[]>>;
}

export interface HtmlRequirementSnapshotRecord {
  readonly id: string;
  readonly projectId: string;
  readonly level: 'epic' | 'story' | 'ac';
  readonly parentId?: string;
  readonly title: string;
  readonly description: string;
  readonly position: number;
  readonly status: 'DRAFT' | 'APPROVED' | 'DEPRECATED';
  readonly flowType: 'atomic' | 'flow' | null;
  readonly isFlow: boolean;
  readonly relatedRequirementIds: readonly string[];
}

export interface HtmlRequirementSnapshot {
  readonly version: 1;
  readonly projectId: string;
  readonly selectedRequirementIds: readonly string[];
  readonly selectedFlowIds: readonly string[];
  readonly records: readonly HtmlRequirementSnapshotRecord[];
}

export type HtmlKnowledgeQueryFocus =
  | 'all'
  | 'interaction'
  | 'validation'
  | 'navigation'
  | 'content';

export interface HtmlKnowledgeQueryInput {
  readonly requirementIds: string | readonly string[];
  readonly focus?: HtmlKnowledgeQueryFocus;
  readonly maxResults?: number;
}

export interface HtmlKnowledgeQueryContext {
  readonly projectId: string;
  readonly knowledgeSetId: string;
  readonly indexVersion: number;
  readonly requirementSnapshot: HtmlRequirementSnapshot;
  readonly currentBatchRequirementIds: readonly string[];
  readonly pages: readonly HtmlKnowledgePageIndex[];
  readonly relations: readonly HtmlPageRelation[];
}

export type HtmlKnowledgeMatchConfidence = 'high' | 'medium' | 'low' | 'none';

export interface HtmlKnowledgeQueryMatch {
  readonly requestedRequirementId: string;
  readonly canonicalRequirementId: string;
  readonly confidence: HtmlKnowledgeMatchConfidence;
  readonly chunkIds: readonly string[];
}

export interface HtmlKnowledgeQueryChunk {
  readonly chunkId: string;
  readonly pageId: string;
  readonly fileName: string;
  readonly pageTitle: string;
  readonly sectionType: HtmlKnowledgeSectionType;
  readonly domPath: string;
  readonly sourceLocation?: HtmlKnowledgeSourceLocation;
  readonly matchedTerms: readonly string[];
  readonly staticText?: string;
  readonly elements: readonly HtmlKnowledgeElement[];
  readonly relations: readonly HtmlPageRelation[];
}

export interface HtmlKnowledgeQueryResult {
  readonly source: {
    readonly knowledgeSetId: string;
    readonly pageCount: number;
    readonly indexVersion: number;
  };
  readonly matches: readonly HtmlKnowledgeQueryMatch[];
  readonly chunks: readonly HtmlKnowledgeQueryChunk[];
  readonly omittedRequirementIds: readonly string[];
  readonly truncated: boolean;
  readonly warnings: readonly string[];
}

export interface HtmlKnowledgeReference {
  readonly knowledgeSetId: string;
  readonly pageCount: number;
  readonly totalBytes: number;
  readonly pageTitles: readonly string[];
  readonly hasLowInformationPages: boolean;
  readonly requirementSnapshotHash: string;
}

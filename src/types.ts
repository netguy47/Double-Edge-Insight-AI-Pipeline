export type VerdictType = 'True' | 'Mostly True' | 'Misleading' | 'False' | 'Unsubstantiated' | 'Context-Dependent';

export interface ProcessingInfo {
  model: string;
  modelVersion: string;
  processingTimeMs: number;
  attempt: number;
  healed: boolean;
  validatorVersion: string;
}

export interface Metadata {
  verdictTimestamp: string;
  analysisId: string;
  requestId: string;
  processing: ProcessingInfo;
}

export interface LiteralParsing {
  assertion: string;
  implication: string;
  scope: string;
  limitations: string;
}

export interface ClaimData {
  originalClaim: string;
  claimSummary: string;
  claimType: 'Historical' | 'Scientific' | 'Political' | 'Financial' | 'Legal' | 'Medical' | 'Opinion' | 'Prediction' | 'Other';
  literalParsing: LiteralParsing;
}

export interface EvidenceItem {
  id: string;
  type: 'primary' | 'official' | 'independent' | 'secondary';
  title: string;
  url: string;
  publisher: string;
  author: string;
  publicationDate: string;
  accessDate: string;
  role: 'supports' | 'contradicts' | 'context';
  quality: 'high' | 'medium' | 'low';
  credibility: number; // 0.0 - 1.0
  relevance: number; // 0.0 - 1.0
  weight: number; // 0.0 - 1.0
  accessStatus: 'available' | 'redacted' | 'sealed' | 'paywalled';
  notes: string;
}

export interface EvidenceSet {
  supportingEvidence: EvidenceItem[];
  contradictoryEvidence: EvidenceItem[];
  contextEvidence: EvidenceItem[];
}

export interface SIFInputs {
  P: number; // Primary Sources Count
  I: number; // Independent Sources Count
  O: number; // Official Documents Count
  U: number; // Unknowns Count
  G: number; // Gaps Count
  A: number; // Ambiguities Count
}

export interface SIFBreakdown {
  primaryContribution: number;
  independentContribution: number;
  officialContribution: number;
  uncorroboratedPenalty: number;
  gapPenalty: number;
  ambiguityPenalty: number;
}

export interface SIFData {
  inputs: SIFInputs;
  breakdown: SIFBreakdown;
  score: number; // 0 - 100
}

export interface ConfidenceData {
  score: number; // 0 - 100
  level: 'Low' | 'Medium' | 'High';
  reason: string;
}

export interface ValidationIssue {
  category: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  corrected: boolean;
}

export interface ValidationData {
  overallScore: number; // 0 - 100
  schemaValid: boolean;
  SIFMathValid: boolean;
  citationsValid: boolean;
  styleValid: boolean;
  jsonValid: boolean;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  issues: ValidationIssue[];
}

export interface CitationCoverage {
  claimsDetected: number;
  claimsSupported: number;
  claimsUnsupported: number;
  coveragePercent: number; // 0 - 100
}

export interface VerdictData {
  classification: VerdictType;
  justification: string;
  decisionTrace: string[];
}

export interface PrimaryCitation {
  title: string;
  url: string;
  reasonUnavailable: string | null;
}

export interface SourceSnapshot {
  title: string;
  url: string;
  snapshotId: string;
  accessDate: string;
}

export interface BayesianData {
  enabled: boolean;
  priorReliability: number | null; // 0.0 - 1.0
  posteriorReliability: number | null; // 0.0 - 1.0
  modelReliability: number | null; // 0.0 - 1.0
  updateReason: string | null;
}

// Complete Claim Analysis JUSBT Schema 2.0 object
export interface ClaimAnalysis {
  schemaVersion: string;
  metadata: Metadata;
  claim: ClaimData;
  evidence: EvidenceSet;
  SIF: SIFData;
  confidence: ConfidenceData;
  validation: ValidationData;
  citationCoverage: CitationCoverage;
  verdict: VerdictData;
  primaryCitation: PrimaryCitation;
  sourcesSnapshot: SourceSnapshot[];
  bayesian: BayesianData;

  // Additional backwards-compatibility or UI-specific extensions
  editorialPersona?: 'Hard-Boiled Reporter' | 'Structural Analyst' | 'Fact-Checker';

  // Backwards compatibility properties (deprecated in favor of nested properties)
  id?: string;
  date?: string;
  summary?: string;
  claimText?: string;
  sifScore?: number;
  additionalContext?: string;
  semanticParsing?: {
    literalSays: string;
    implies: string;
  };
  baselineFacts?: {
    primarySources: string[];
    keyEvidence: string[];
    conflictingInfo: string | null;
  };
  truthVerdict?: {
    verdict: VerdictType;
    justification: string;
    primaryCitationSource: string;
    primaryCitationUrl: string;
  };
  groundingSources?: Array<{ title: string; uri: string }>;
}

export interface JUSBTConfig {
  systemPrompt: string;
  modelName: string;
}

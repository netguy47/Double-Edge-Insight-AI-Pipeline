export type VerdictType = 'True' | 'Mostly True' | 'Misleading' | 'False' | 'Unsubstantiated' | 'Context-Dependent';

export interface SemanticParsing {
  literalSays: string;
  implies: string;
}

export interface BaselineFacts {
  primarySources: string[];
  keyEvidence: string[];
  conflictingInfo: string | null;
}

export interface TruthVerdict {
  verdict: VerdictType;
  justification: string;
  primaryCitationSource?: string;
  primaryCitationUrl?: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ClaimAnalysis {
  id: string;
  date: string;
  summary: string;
  claimText: string;
  semanticParsing: SemanticParsing;
  baselineFacts: BaselineFacts;
  truthVerdict: TruthVerdict;
  additionalContext: string;
  groundingSources?: GroundingSource[];
  sifScore?: number;
  editorialPersona?: 'Hard-Boiled Reporter' | 'Structural Analyst' | 'Fact-Checker';
}

export interface JUSBTConfig {
  systemPrompt: string;
  modelName: string;
}

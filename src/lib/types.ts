export interface Character {
  id: string;
  name: string;
  role: 'brand_ambassador' | 'discoverer' | 'other';
  roleDescription: string;
}

export interface ScriptLine {
  id: string;
  type: 'dialogue' | 'direction' | 'parenthetical' | 'scene_heading';
  characterId?: string;
  content: string;
}

export interface ReferenceVideo {
  url: string;
  type: 'reference' | 'replication';
  notes: string;
}

export interface Script {
  id: string;
  brandName: string;
  title: string;
  characters: Character[];
  lines: ScriptLine[];
  referenceVideos: ReferenceVideo[];
  location: string;
  props: string[];
  wardrobe: { [characterId: string]: string };
  pronunciations: { word: string; pronunciation: string }[];
}

export interface ClaimIssue {
  lineId: string;
  issue: string;
  suggestion: string;
  severity: 'warning' | 'error';
}

export const DEFAULT_CHARACTERS: Character[] = [
  {
    id: 'host1',
    name: 'HOST 1',
    role: 'brand_ambassador',
    roleDescription: 'Brand Ambassador / Expert - Knows the product, advocates for the brand, typically has the most lines'
  },
  {
    id: 'host2',
    name: 'HOST 2',
    role: 'discoverer',
    roleDescription: 'Discoverer / Skeptic - Learning about the brand, may be a detractor initially'
  }
];

export const PROBLEMATIC_CLAIMS = [
  { pattern: /\bpatient(s)?\b/gi, suggestion: 'Use "clients" instead of "patients"' },
  { pattern: /\blost \d+ (pounds?|lbs?|kg|kilos?)\b/gi, suggestion: 'Use "hit my target weight" instead of specific weight loss claims' },
  { pattern: /\blicensed physician\b/gi, suggestion: 'Use "wellness expert" instead of "licensed physician"' },
  { pattern: /\bdoctor\b/gi, suggestion: 'Consider using "wellness expert" or "health advocate" if not actually a doctor' },
  { pattern: /\bcure(s|d)?\b/gi, suggestion: 'Avoid "cure" - use "may help with" or "supports"' },
  { pattern: /\bguarantee(s|d)?\b/gi, suggestion: 'Avoid "guarantee" - use "may" or "could"' },
  { pattern: /\b100%\b/gi, suggestion: 'Avoid absolute percentages - use qualifiers like "many" or "often"' },
  { pattern: /\balways work(s)?\b/gi, suggestion: 'Avoid "always works" - use "often helps" or "may work"' },
  { pattern: /\bnever fail(s)?\b/gi, suggestion: 'Avoid absolute claims - use qualifiers' },
  { pattern: /\bproven to\b/gi, suggestion: 'Use "shown to potentially" or "may help"' },
  { pattern: /\bclinically proven\b/gi, suggestion: 'Ensure clinical proof exists or use "clinically studied"' },
  { pattern: /\bFDA approved\b/gi, suggestion: 'Verify FDA approval status - if supplement, use "FDA registered facility"' },
];

export const QUALIFIERS = ['may', 'might', 'sometimes', 'often', 'could', 'can help', 'potentially', 'shown to'];

export type LearningLevel = 'beginner' | 'intermediate' | 'advanced';
export type CategoryColor = 'teal' | 'blue' | 'purple' | 'amber' | 'pink';

export interface DictionaryCategory {
  id: string;
  name: string;
  shortName: string;
  description: string;
  color: CategoryColor;
}

export interface DictionarySource {
  title: string;
  url: string;
}

export interface DictionaryTerm {
  id: string;
  term: string;
  aliases: string[];
  category: string;
  level: LearningLevel;
  tags: string[];
  definition: string;
  analogy: string;
  example: string;
  caveat: string;
  related: string[];
  sources: DictionarySource[];
}

export interface DictionaryDataset {
  schemaVersion: string;
  language: string;
  attribution: string;
  license: { spdx: string; url: string };
  categories: DictionaryCategory[];
  terms: DictionaryTerm[];
}

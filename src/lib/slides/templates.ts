import type { Slide, SlideSpacerBlock, SlideTextBlock } from '$lib/types';
import { createBlock, createSlide } from './deck';

export interface SlideTemplate {
  id: string;
  name: string;
  description: string;
  group: string;
  build(): Slide;
}

function block<T>(kind: T): Extract<ReturnType<typeof createBlock>, { kind: T }> {
  return createBlock(kind as Parameters<typeof createBlock>[0]) as Extract<
    ReturnType<typeof createBlock>,
    { kind: T }
  >;
}

function titleSlide(): Slide {
  return { ...createSlide('title', 'Heading'), subtitle: 'Add a subtitle' };
}

function agenda(): Slide {
  const list = block<'list'>('list');
  list.marker = 'none';
  list.items = [
    { text: 'Topic one', level: 0 },
    { text: 'Topic two', level: 0 },
    { text: 'Topic three', level: 0 },
  ];
  return { ...createSlide('content', 'Topics'), blocks: [list] };
}

function sectionDivider(): Slide {
  return { ...createSlide('title', 'Section heading'), subtitle: 'Add a short introduction' };
}

function definitions(): Slide {
  const definitionsBlock = block<'definitions'>('definitions');
  definitionsBlock.items = [
    { term: 'Key term', text: 'Add a description' },
    { term: 'Key term', text: 'Add a description' },
  ];
  return { ...createSlide('content', 'Definitions'), blocks: [definitionsBlock] };
}

function bulletedConcept(): Slide {
  const list = block<'list'>('list');
  list.marker = 'bullet';
  list.items = [
    { text: 'Main idea', level: 0 },
    { text: 'Supporting detail', level: 1 },
    { text: 'Another main idea', level: 0 },
  ];
  return { ...createSlide('content', 'Concept heading'), blocks: [list] };
}

function numberedSteps(): Slide {
  const list = block<'list'>('list');
  list.marker = 'decimal';
  list.items = [
    { text: 'First step', level: 0 },
    { text: 'Second step', level: 0 },
    { text: 'Third step', level: 0 },
  ];
  return { ...createSlide('content', 'Steps'), blocks: [list] };
}

function tableSlide(): Slide {
  const table = block<'table'>('table');
  table.header = ['Heading', 'Heading'];
  table.rows = [
    ['Value', 'Value'],
    ['Value', 'Value'],
  ];
  return { ...createSlide('content', 'Table heading'), blocks: [table] };
}

function twoTables(): Slide {
  const left = block<'table'>('table');
  left.caption = 'First table';
  left.header = ['Heading', 'Heading'];
  left.rows = [['Value', 'Value']];
  const right = block<'table'>('table');
  right.caption = 'Second table';
  right.header = ['Heading', 'Heading'];
  right.rows = [['Value', 'Value']];
  return {
    ...createSlide('columns', 'Compare'),
    columnCount: 2,
    blocks: [left, right],
  };
}

function equationAndGraph(): Slide {
  const equation = block<'math'>('math');
  equation.latex = 'y = f(x)';
  const graph = block<'graph'>('graph');
  graph.caption = 'Graph';
  graph.graph.functions[0].expr = 'x';
  return {
    ...createSlide('columns', 'Equation and graph'),
    columnCount: 2,
    blocks: [equation, graph],
  };
}

function graphTrio(): Slide {
  const graphs = ['x', 'x^2', 'x^3'].map((expression) => {
    const graph = block<'graph'>('graph');
    graph.graph.functions[0].expr = expression;
    graph.height = 210;
    return graph;
  });
  return {
    ...createSlide('columns', 'Graphs'),
    columnCount: 3,
    blocks: graphs,
  };
}

function workedExample(): Slide {
  const equation = block<'math'>('math');
  equation.latex = 'Add an equation';
  const space = block<'spacer'>('spacer');
  space.height = 280;
  return { ...createSlide('content', 'Worked example'), blocks: [equation, space] };
}

function mappingDiagram(): Slide {
  const mapping = block<'mapping'>('mapping');
  mapping.left = ['Input', 'Input'];
  mapping.right = ['Output', 'Output'];
  const prompt = block<'text'>('text');
  prompt.text = 'Add a short prompt';
  return { ...createSlide('content', 'Mapping diagram'), blocks: [mapping, prompt] };
}

function relationPractice(): Slide {
  const mapping = block<'mapping'>('mapping');
  const questions = block<'list'>('list');
  questions.marker = 'decimal';
  questions.items = [
    { text: 'Find the domain.', level: 0 },
    { text: 'Find the range.', level: 0 },
    { text: 'Is it a function?', level: 0 },
  ];
  return {
    ...createSlide('columns', 'Relation practice'),
    columnCount: 2,
    blocks: [mapping, questions],
  };
}

function practiceGrid(): Slide {
  const blocks: (SlideTextBlock | SlideSpacerBlock)[] = [];
  for (let index = 1; index <= 4; index += 1) {
    const prompt = block<'text'>('text');
    prompt.text = `${index}. Add a problem`;
    prompt.bold = true;
    const space = block<'spacer'>('spacer');
    space.height = 150;
    blocks.push(prompt, space);
  }
  return {
    ...createSlide('grid', 'Practice'),
    columnCount: 2,
    blocks,
  };
}

function conceptAndTip(): Slide {
  const list = block<'list'>('list');
  list.items = [
    { text: 'Main idea', level: 0 },
    { text: 'Supporting detail', level: 1 },
  ];
  const tip = block<'callout'>('callout');
  tip.tone = 'tip';
  tip.text = 'Add a helpful tip';
  return { ...createSlide('content', 'Concept heading'), blocks: [list], aside: [tip] };
}

function blankWorkspace(): Slide {
  const space = block<'spacer'>('spacer');
  space.height = 420;
  return { ...createSlide('blank'), blocks: [space] };
}

export const slideTemplates: SlideTemplate[] = [
  {
    id: 'title',
    name: 'Title slide',
    description: 'Hero title and subtitle',
    group: 'Structure',
    build: titleSlide,
  },
  {
    id: 'agenda',
    name: 'Agenda / topics',
    description: 'A simple topic list without markers',
    group: 'Structure',
    build: agenda,
  },
  {
    id: 'section-divider',
    name: 'Section divider',
    description: 'A chapter break between lesson sections',
    group: 'Structure',
    build: sectionDivider,
  },
  {
    id: 'definitions',
    name: 'Definitions',
    description: 'Key terms paired with descriptions',
    group: 'Concepts',
    build: definitions,
  },
  {
    id: 'bulleted-concept',
    name: 'Bulleted concept',
    description: 'Nested bullets for an idea and supporting details',
    group: 'Concepts',
    build: bulletedConcept,
  },
  {
    id: 'numbered-steps',
    name: 'Numbered steps',
    description: 'An ordered sequence of steps',
    group: 'Concepts',
    build: numberedSteps,
  },
  {
    id: 'table',
    name: 'Table',
    description: 'A single table with a header row',
    group: 'Data',
    build: tableSlide,
  },
  {
    id: 'two-tables',
    name: 'Two tables',
    description: 'Side-by-side tables for comparison',
    group: 'Data',
    build: twoTables,
  },
  {
    id: 'equation-graph',
    name: 'Equation + graph',
    description: 'An equation beside its graph',
    group: 'Math',
    build: equationAndGraph,
  },
  {
    id: 'graph-trio',
    name: 'Graph trio',
    description: 'Three graphs displayed in columns',
    group: 'Math',
    build: graphTrio,
  },
  {
    id: 'worked-example',
    name: 'Worked example',
    description: 'An equation with room for live working',
    group: 'Practice',
    build: workedExample,
  },
  {
    id: 'mapping-diagram',
    name: 'Mapping diagram',
    description: 'A domain-to-range mapping with a short prompt',
    group: 'Math',
    build: mappingDiagram,
  },
  {
    id: 'relation-practice',
    name: 'Relation practice',
    description: 'A mapping beside domain and range questions',
    group: 'Practice',
    build: relationPractice,
  },
  {
    id: 'practice-grid',
    name: 'Practice grid',
    description: 'Four problems with generous writing space',
    group: 'Practice',
    build: practiceGrid,
  },
  {
    id: 'concept-tip',
    name: 'Concept + tip callout',
    description: 'A concept list with a corner tip',
    group: 'Concepts',
    build: conceptAndTip,
  },
  {
    id: 'blank-workspace',
    name: 'Blank workspace',
    description: 'An open slide reserved for live writing',
    group: 'Practice',
    build: blankWorkspace,
  },
];

export function applyTemplate(templateId: string): Slide | null {
  return slideTemplates.find((template) => template.id === templateId)?.build() ?? null;
}

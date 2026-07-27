<script lang="ts">
  import type {
    GraphFunction,
    NumberLineMarkKind,
    Slide,
    SlideAlign,
    SlideBlock,
    SlideCalloutBlock,
    SlideCalloutTone,
    SlideDiagramBlock,
    SlideGraphBlock,
    SlideLayoutKind,
    SlideListMarker,
    SlideMappingBlock,
    SlideNumberLineBlock,
    SlideTableBlock,
  } from '$lib/types';
  import {
    addBlock,
    createBlock,
    moveBlock,
    removeBlock,
    setLayout,
    updateBlock,
  } from '$lib/slides/deck';

  interface Props {
    slide: Slide;
    onchange: (next: Slide) => void;
    onclose: () => void;
  }

  let { slide, onchange, onclose }: Props = $props();
  let addKind = $state<SlideBlock['kind']>('text');
  let imageError = $state('');
  let mappingSelections = $state<Record<string, { from: number; to: number }>>({});
  let diagramSelections = $state<Record<string, { from: string; to: string }>>({});

  const layouts: { value: SlideLayoutKind; label: string }[] = [
    { value: 'title', label: 'Title' },
    { value: 'content', label: 'Content' },
    { value: 'columns', label: 'Columns' },
    { value: 'grid', label: 'Grid' },
    { value: 'blank', label: 'Blank' },
  ];

  const blockKinds: { value: SlideBlock['kind']; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'list', label: 'List' },
    { value: 'definitions', label: 'Definitions' },
    { value: 'table', label: 'Table' },
    { value: 'math', label: 'Math' },
    { value: 'graph', label: 'Graph' },
    { value: 'callout', label: 'Callout' },
    { value: 'image', label: 'Image' },
    { value: 'mapping', label: 'Mapping diagram' },
    { value: 'diagram', label: 'Node diagram' },
    { value: 'numberline', label: 'Number line' },
    { value: 'spacer', label: 'Writing space' },
  ];

  const listMarkerOptions: { value: SlideListMarker; label: string }[] = [
    { value: 'bullet', label: 'Bullet' },
    { value: 'decimal', label: 'Decimal' },
    { value: 'alpha', label: 'Alphabetic' },
    { value: 'roman', label: 'Roman numeral' },
    { value: 'none', label: 'None' },
  ];

  function cloneSlide(): Slide {
    return structuredClone(slide);
  }

  function updateSlide(patch: Partial<Slide>): void {
    onchange({ ...cloneSlide(), ...structuredClone(patch) });
  }

  function numberValue(event: Event, fallback: number): number {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    return Number.isFinite(value) ? value : fallback;
  }

  function addSelectedBlock(): void {
    onchange(addBlock(slide, createBlock(addKind)));
  }

  function duplicateBlock(block: SlideBlock, index: number): void {
    const copy = structuredClone(block);
    copy.id = crypto.randomUUID();
    if (copy.kind === 'graph') {
      copy.graph.functions = copy.graph.functions.map((fn) => ({
        ...fn,
        id: crypto.randomUUID(),
      }));
    }
    onchange(addBlock(slide, copy, index + 1));
  }

  function focusBlock(index: number): void {
    requestAnimationFrame(() => {
      const buttons = document.querySelectorAll<HTMLButtonElement>('[data-slide-block-focus]');
      buttons[index]?.focus();
    });
  }

  function handleBlockKey(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const destination = event.key === 'ArrowUp' ? index - 1 : index + 1;
    if (destination < 0 || destination >= slide.blocks.length) return;
    if (event.altKey) onchange(moveBlock(slide, index, destination));
    focusBlock(destination);
  }

  function setListItem(
    block: Extract<SlideBlock, { kind: 'list' }>,
    index: number,
    patch: Partial<(typeof block.items)[number]>,
  ): void {
    const items = block.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item,
    );
    onchange(updateBlock(slide, block.id, { items }));
  }

  function removeListItem(block: Extract<SlideBlock, { kind: 'list' }>, index: number): void {
    onchange(
      updateBlock(slide, block.id, {
        items: block.items.filter((_, itemIndex) => itemIndex !== index),
      }),
    );
  }

  function setDefinition(
    block: Extract<SlideBlock, { kind: 'definitions' }>,
    index: number,
    patch: Partial<(typeof block.items)[number]>,
  ): void {
    onchange(
      updateBlock(slide, block.id, {
        items: block.items.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...patch } : item,
        ),
      }),
    );
  }

  function setTableCell(
    block: SlideTableBlock,
    rowIndex: number,
    columnIndex: number,
    value: string,
  ): void {
    const rows = block.rows.map((row, index) =>
      index === rowIndex ? row.map((cell, col) => (col === columnIndex ? value : cell)) : row,
    );
    onchange(updateBlock(slide, block.id, { rows }));
  }

  function addTableColumn(block: SlideTableBlock): void {
    onchange(
      updateBlock(slide, block.id, {
        header: [...block.header, 'Heading'],
        rows: block.rows.map((row) => [...row, '']),
      }),
    );
  }

  function removeTableColumn(block: SlideTableBlock): void {
    if (block.header.length <= 1) return;
    onchange(
      updateBlock(slide, block.id, {
        header: block.header.slice(0, -1),
        rows: block.rows.map((row) => row.slice(0, -1)),
      }),
    );
  }

  function addTableRow(block: SlideTableBlock): void {
    onchange(
      updateBlock(slide, block.id, {
        rows: [...block.rows, Array.from({ length: block.header.length }, () => '')],
      }),
    );
  }

  function removeTableRow(block: SlideTableBlock, index: number): void {
    onchange(
      updateBlock(slide, block.id, {
        rows: block.rows.filter((_, rowIndex) => rowIndex !== index),
      }),
    );
  }

  function updateGraph(block: SlideGraphBlock, patch: Partial<SlideGraphBlock['graph']>): void {
    onchange(updateBlock(slide, block.id, { graph: { ...block.graph, ...patch } }));
  }

  function updateGraphFunction(
    block: SlideGraphBlock,
    id: string,
    patch: Partial<GraphFunction>,
  ): void {
    updateGraph(block, {
      functions: block.graph.functions.map((fn) => (fn.id === id ? { ...fn, ...patch } : fn)),
    });
  }

  function addGraphFunction(block: SlideGraphBlock): void {
    updateGraph(block, {
      functions: [
        ...block.graph.functions,
        {
          id: crypto.randomUUID(),
          expr: 'x',
          kind: 'explicit',
          color: '#2563eb',
          width: 2,
          dash: 'solid',
          domain: null,
        },
      ],
    });
  }

  function removeGraphFunction(block: SlideGraphBlock, id: string): void {
    updateGraph(block, {
      functions: block.graph.functions.filter((candidate) => candidate.id !== id),
    });
  }

  function setGraphRange(
    block: SlideGraphBlock,
    axis: 'xRange' | 'yRange',
    index: 0 | 1,
    value: number,
  ): void {
    const range = [...block.graph[axis]] as [number, number];
    range[index] = value;
    if (range[0] >= range[1]) return;
    updateGraph(block, { [axis]: range });
  }

  function updateMapping(block: SlideMappingBlock, patch: Partial<SlideMappingBlock>): void {
    onchange(updateBlock(slide, block.id, patch));
  }

  function setMappingElement(
    block: SlideMappingBlock,
    side: 'left' | 'right',
    index: number,
    value: string,
  ): void {
    updateMapping(block, {
      [side]: block[side].map((item, itemIndex) => (itemIndex === index ? value : item)),
    });
  }

  function addMappingElement(block: SlideMappingBlock, side: 'left' | 'right'): void {
    updateMapping(block, { [side]: [...block[side], 'Value'] });
  }

  function removeMappingElement(
    block: SlideMappingBlock,
    side: 'left' | 'right',
    index: number,
  ): void {
    const pairKey = side === 'left' ? 'from' : 'to';
    updateMapping(block, {
      [side]: block[side].filter((_, itemIndex) => itemIndex !== index),
      pairs: block.pairs
        .filter((pair) => pair[pairKey] !== index)
        .map((pair) => ({
          ...pair,
          [pairKey]: pair[pairKey] > index ? pair[pairKey] - 1 : pair[pairKey],
        })),
    });
  }

  function moveMappingElement(
    block: SlideMappingBlock,
    side: 'left' | 'right',
    index: number,
    direction: -1 | 1,
  ): void {
    const destination = index + direction;
    if (destination < 0 || destination >= block[side].length) return;
    const values = [...block[side]];
    [values[index], values[destination]] = [values[destination], values[index]];
    const pairKey = side === 'left' ? 'from' : 'to';
    updateMapping(block, {
      [side]: values,
      pairs: block.pairs.map((pair) => ({
        ...pair,
        [pairKey]:
          pair[pairKey] === index
            ? destination
            : pair[pairKey] === destination
              ? index
              : pair[pairKey],
      })),
    });
  }

  function setMappingPair(
    block: SlideMappingBlock,
    pairIndex: number,
    patch: Partial<SlideMappingBlock['pairs'][number]>,
  ): void {
    updateMapping(block, {
      pairs: block.pairs.map((pair, index) => (index === pairIndex ? { ...pair, ...patch } : pair)),
    });
  }

  function setMappingSelection(blockId: string, side: 'from' | 'to', value: number): void {
    const current = mappingSelections[blockId] ?? { from: 0, to: 0 };
    mappingSelections[blockId] = { ...current, [side]: value };
  }

  function addMappingPair(block: SlideMappingBlock): void {
    if (block.left.length === 0 || block.right.length === 0) return;
    const selection = mappingSelections[block.id] ?? { from: 0, to: 0 };
    const from = Math.min(block.left.length - 1, Math.max(0, selection.from));
    const to = Math.min(block.right.length - 1, Math.max(0, selection.to));
    updateMapping(block, { pairs: [...block.pairs, { from, to }] });
  }

  function removeMappingPair(block: SlideMappingBlock, index: number): void {
    updateMapping(block, {
      pairs: block.pairs.filter((_, pairIndex) => pairIndex !== index),
    });
  }

  function setListMarkerLevel(
    block: Extract<SlideBlock, { kind: 'list' }>,
    index: number,
    marker: SlideListMarker,
  ): void {
    const markerByLevel = [...(block.markerByLevel ?? [])];
    markerByLevel[index] = marker;
    onchange(updateBlock(slide, block.id, { markerByLevel }));
  }

  function removeListMarkerLevel(
    block: Extract<SlideBlock, { kind: 'list' }>,
    index: number,
  ): void {
    onchange(
      updateBlock(slide, block.id, {
        markerByLevel: (block.markerByLevel ?? []).filter(
          (_, markerIndex) => markerIndex !== index,
        ),
      }),
    );
  }

  function updateDiagram(block: SlideDiagramBlock, patch: Partial<SlideDiagramBlock>): void {
    onchange(updateBlock(slide, block.id, patch));
  }

  function updateDiagramNode(
    block: SlideDiagramBlock,
    index: number,
    patch: Partial<SlideDiagramBlock['nodes'][number]>,
  ): void {
    updateDiagram(block, {
      nodes: block.nodes.map((node, nodeIndex) =>
        nodeIndex === index ? { ...node, ...patch, id: node.id } : node,
      ),
    });
  }

  function renameDiagramNode(block: SlideDiagramBlock, index: number, value: string): void {
    const id = value.trim();
    const current = block.nodes[index];
    if (
      !current ||
      id.length === 0 ||
      block.nodes.some((node, i) => i !== index && node.id === id)
    ) {
      return;
    }
    updateDiagram(block, {
      nodes: block.nodes.map((node, nodeIndex) => (nodeIndex === index ? { ...node, id } : node)),
      edges: block.edges.map((edge) => ({
        ...edge,
        from: edge.from === current.id ? id : edge.from,
        to: edge.to === current.id ? id : edge.to,
      })),
    });
  }

  function addDiagramNode(block: SlideDiagramBlock): void {
    updateDiagram(block, {
      nodes: [
        ...block.nodes,
        {
          id: crypto.randomUUID(),
          text: 'Node',
          x: 0.5,
          y: 0.5,
          shape: 'box',
        },
      ],
    });
  }

  function removeDiagramNode(block: SlideDiagramBlock, id: string): void {
    updateDiagram(block, {
      nodes: block.nodes.filter((node) => node.id !== id),
      edges: block.edges.filter((edge) => edge.from !== id && edge.to !== id),
    });
  }

  function setDiagramSelection(
    block: SlideDiagramBlock,
    endpoint: 'from' | 'to',
    value: string,
  ): void {
    const current = diagramSelections[block.id] ?? {
      from: block.nodes[0]?.id ?? '',
      to: block.nodes[1]?.id ?? '',
    };
    diagramSelections[block.id] = { ...current, [endpoint]: value };
  }

  function addDiagramEdge(block: SlideDiagramBlock): void {
    const defaults = { from: block.nodes[0]?.id ?? '', to: block.nodes[1]?.id ?? '' };
    const selection = diagramSelections[block.id] ?? defaults;
    if (
      selection.from === selection.to ||
      !block.nodes.some((node) => node.id === selection.from) ||
      !block.nodes.some((node) => node.id === selection.to)
    ) {
      return;
    }
    updateDiagram(block, { edges: [...block.edges, { ...selection }] });
  }

  function removeDiagramEdge(block: SlideDiagramBlock, index: number): void {
    updateDiagram(block, {
      edges: block.edges.filter((_, edgeIndex) => edgeIndex !== index),
    });
  }

  function updateNumberLine(
    block: SlideNumberLineBlock,
    patch: Partial<SlideNumberLineBlock>,
  ): void {
    onchange(updateBlock(slide, block.id, patch));
  }

  function setNumberLineBound(
    block: SlideNumberLineBlock,
    bound: 'min' | 'max',
    value: number,
  ): void {
    if ((bound === 'min' && value >= block.max) || (bound === 'max' && value <= block.min)) return;
    updateNumberLine(block, { [bound]: value });
  }

  function setNumberLineStep(
    block: SlideNumberLineBlock,
    step: 'tickStep' | 'labelStep',
    value: number,
  ): void {
    const range = block.max - block.min;
    updateNumberLine(block, {
      [step]: Math.min(range, Math.max(range / 1_000, value)),
    });
  }

  function updateNumberLineMark(
    block: SlideNumberLineBlock,
    index: number,
    patch: Partial<SlideNumberLineBlock['marks'][number]>,
  ): void {
    updateNumberLine(block, {
      marks: block.marks.map((mark, markIndex) =>
        markIndex === index ? { ...mark, ...patch } : mark,
      ),
    });
  }

  function removeNumberLineMark(block: SlideNumberLineBlock, index: number): void {
    updateNumberLine(block, {
      marks: block.marks.filter((_, markIndex) => markIndex !== index),
    });
  }

  function addNumberLineMark(block: SlideNumberLineBlock): void {
    const value = block.min <= 0 && block.max >= 0 ? 0 : block.min;
    updateNumberLine(block, { marks: [...block.marks, { value, kind: 'closed' }] });
  }

  async function loadImage(
    block: Extract<SlideBlock, { kind: 'image' }>,
    file?: File,
  ): Promise<void> {
    if (!file) return;
    imageError = '';
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      imageError = 'Choose a PNG, JPEG, GIF, or WebP image.';
      return;
    }
    try {
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('Image reader returned non-text data'));
        reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
        reader.readAsDataURL(file);
      });
      onchange(updateBlock(slide, block.id, { src, alt: block.alt || file.name }));
    } catch (error) {
      imageError = error instanceof Error ? error.message : 'Could not read image.';
    }
  }

  function updateAside(index: number, patch: Partial<SlideCalloutBlock>): void {
    const next = cloneSlide();
    next.aside = (next.aside ?? []).map((callout, calloutIndex) =>
      calloutIndex === index ? { ...callout, ...patch, id: callout.id } : callout,
    );
    onchange(next);
  }

  function removeAside(index: number): void {
    const next = cloneSlide();
    next.aside = (next.aside ?? []).filter((_, calloutIndex) => calloutIndex !== index);
    onchange(next);
  }

  function addAside(): void {
    const next = cloneSlide();
    next.aside = [...(next.aside ?? []), createBlock('callout')];
    onchange(next);
  }
</script>

<aside class="editor" aria-label="Slide editor">
  <header class="head">
    <span class="editor-title">Slide editor</span>
    <button type="button" class="close" aria-label="Close slide editor" onclick={onclose}>×</button>
  </header>

  <section class="slide-fields" aria-label="Slide settings">
    <label>
      Layout
      <select
        value={slide.layout}
        onchange={(event) =>
          onchange(
            setLayout(slide, (event.currentTarget as HTMLSelectElement).value as SlideLayoutKind),
          )}
      >
        {#each layouts as layout (layout.value)}
          <option value={layout.value}>{layout.label}</option>
        {/each}
      </select>
    </label>
    {#if slide.layout === 'columns' || slide.layout === 'grid'}
      <label>
        Columns
        <input
          type="number"
          min="1"
          max="6"
          value={slide.columnCount ?? 2}
          onchange={(event) =>
            updateSlide({
              columnCount: Math.max(1, Math.min(6, numberValue(event, slide.columnCount ?? 2))),
            })}
        />
      </label>
    {/if}
    <label class="wide">
      Title
      <input
        type="text"
        value={slide.title}
        oninput={(event) => updateSlide({ title: (event.currentTarget as HTMLInputElement).value })}
      />
    </label>
    <label class="wide">
      Subtitle
      <input
        type="text"
        value={slide.subtitle ?? ''}
        oninput={(event) =>
          updateSlide({ subtitle: (event.currentTarget as HTMLInputElement).value })}
      />
    </label>
  </section>

  <section class="blocks-section" aria-labelledby="blocks-heading">
    <h2 id="blocks-heading">Blocks</h2>
    <ol class="blocks">
      {#each slide.blocks as block, index (block.id)}
        <li class="block">
          <div class="block-head">
            <button
              type="button"
              class="block-focus"
              data-slide-block-focus
              aria-label={`${block.kind} block ${index + 1}. Use arrow keys to navigate or Alt plus arrow keys to move.`}
              onkeydown={(event) => handleBlockKey(event, index)}
            >
              <span class="drag">↕</span>
              <strong>{block.kind}</strong>
            </button>
            <div class="block-actions">
              <button
                type="button"
                aria-label={`Move ${block.kind} block up`}
                disabled={index === 0}
                onclick={() => {
                  onchange(moveBlock(slide, index, index - 1));
                  focusBlock(index - 1);
                }}>↑</button
              >
              <button
                type="button"
                aria-label={`Move ${block.kind} block down`}
                disabled={index === slide.blocks.length - 1}
                onclick={() => {
                  onchange(moveBlock(slide, index, index + 1));
                  focusBlock(index + 1);
                }}>↓</button
              >
              <button
                type="button"
                aria-label={`Duplicate ${block.kind} block`}
                onclick={() => duplicateBlock(block, index)}>⧉</button
              >
              <button
                type="button"
                class="danger"
                aria-label={`Delete ${block.kind} block`}
                onclick={() => onchange(removeBlock(slide, block.id))}>×</button
              >
            </div>
          </div>

          <div class="block-form">
            {#if block.kind === 'text'}
              <label class="wide">
                Content
                <textarea
                  rows="3"
                  value={block.text}
                  oninput={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        text: (event.currentTarget as HTMLTextAreaElement).value,
                      }),
                    )}
                ></textarea>
              </label>
              <label>
                Alignment
                <select
                  value={block.align ?? 'left'}
                  onchange={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        align: (event.currentTarget as HTMLSelectElement).value as SlideAlign,
                      }),
                    )}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label>
                Size
                <input
                  type="number"
                  min="6"
                  max="240"
                  value={block.fontSize ?? 24}
                  onchange={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        fontSize: numberValue(event, block.fontSize ?? 24),
                      }),
                    )}
                />
              </label>
              <label class="check">
                <input
                  type="checkbox"
                  checked={block.bold ?? false}
                  onchange={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        bold: (event.currentTarget as HTMLInputElement).checked,
                      }),
                    )}
                />
                Bold
              </label>
            {:else if block.kind === 'list'}
              <label>
                Marker
                <select
                  value={block.marker}
                  onchange={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        marker: (event.currentTarget as HTMLSelectElement).value as SlideListMarker,
                      }),
                    )}
                >
                  {#each listMarkerOptions as marker (marker.value)}
                    <option value={marker.value}>{marker.label}</option>
                  {/each}
                </select>
              </label>
              <div class="wide marker-levels">
                <span class="field-label">Markers by indent level</span>
                {#each block.markerByLevel ?? [] as marker, markerIndex}
                  <div class="marker-level">
                    <label>
                      Level {markerIndex + 1}
                      <select
                        value={marker}
                        onchange={(event) =>
                          setListMarkerLevel(
                            block,
                            markerIndex,
                            (event.currentTarget as HTMLSelectElement).value as SlideListMarker,
                          )}
                      >
                        {#each listMarkerOptions as option (option.value)}
                          <option value={option.value}>{option.label}</option>
                        {/each}
                      </select>
                    </label>
                    <button
                      type="button"
                      class="danger"
                      aria-label={`Remove marker override for level ${markerIndex + 1}`}
                      onclick={() => removeListMarkerLevel(block, markerIndex)}>×</button
                    >
                  </div>
                {/each}
                <button
                  type="button"
                  class="add-small"
                  disabled={(block.markerByLevel?.length ?? 0) >= 4}
                  onclick={() =>
                    setListMarkerLevel(block, block.markerByLevel?.length ?? 0, block.marker)}
                  >+ level</button
                >
              </div>
              <div class="wide repeated">
                {#each block.items as item, itemIndex}
                  <div class="item-row">
                    <input
                      type="text"
                      value={item.text}
                      aria-label={`List item ${itemIndex + 1}`}
                      oninput={(event) =>
                        setListItem(block, itemIndex, {
                          text: (event.currentTarget as HTMLInputElement).value,
                        })}
                    />
                    <button
                      type="button"
                      aria-label={`Outdent list item ${itemIndex + 1}`}
                      disabled={item.level <= 0}
                      onclick={() =>
                        setListItem(block, itemIndex, { level: Math.max(0, item.level - 1) })}
                      >←</button
                    >
                    <button
                      type="button"
                      aria-label={`Indent list item ${itemIndex + 1}`}
                      disabled={item.level >= 3}
                      onclick={() =>
                        setListItem(block, itemIndex, { level: Math.min(3, item.level + 1) })}
                      >→</button
                    >
                    <button
                      type="button"
                      class="danger"
                      aria-label={`Delete list item ${itemIndex + 1}`}
                      onclick={() => removeListItem(block, itemIndex)}>×</button
                    >
                  </div>
                {/each}
                <button
                  type="button"
                  class="add-small"
                  onclick={() =>
                    onchange(
                      updateBlock(slide, block.id, {
                        items: [...block.items, { text: 'List item', level: 0 }],
                      }),
                    )}>+ item</button
                >
              </div>
            {:else if block.kind === 'definitions'}
              <div class="wide repeated">
                {#each block.items as item, itemIndex}
                  <div class="definition-row">
                    <input
                      type="text"
                      value={item.term}
                      aria-label={`Definition ${itemIndex + 1} term`}
                      placeholder="Term"
                      oninput={(event) =>
                        setDefinition(block, itemIndex, {
                          term: (event.currentTarget as HTMLInputElement).value,
                        })}
                    />
                    <input
                      type="text"
                      value={item.text}
                      aria-label={`Definition ${itemIndex + 1} description`}
                      placeholder="Description"
                      oninput={(event) =>
                        setDefinition(block, itemIndex, {
                          text: (event.currentTarget as HTMLInputElement).value,
                        })}
                    />
                    <button
                      type="button"
                      class="danger"
                      aria-label={`Delete definition ${itemIndex + 1}`}
                      onclick={() =>
                        onchange(
                          updateBlock(slide, block.id, {
                            items: block.items.filter((_, i) => i !== itemIndex),
                          }),
                        )}>×</button
                    >
                  </div>
                {/each}
                <button
                  type="button"
                  class="add-small"
                  onclick={() =>
                    onchange(
                      updateBlock(slide, block.id, {
                        items: [...block.items, { term: 'Key term', text: 'Add a description' }],
                      }),
                    )}>+ definition</button
                >
              </div>
            {:else if block.kind === 'table'}
              <label>
                Header orientation
                <select
                  value={block.headerOrientation ?? 'row'}
                  onchange={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        headerOrientation: (event.currentTarget as HTMLSelectElement).value as
                          | 'row'
                          | 'column',
                      }),
                    )}
                >
                  <option value="row">Top row</option>
                  <option value="column">First column</option>
                </select>
              </label>
              <label class="wide">
                Caption
                <input
                  type="text"
                  value={block.caption ?? ''}
                  oninput={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        caption: (event.currentTarget as HTMLInputElement).value,
                      }),
                    )}
                />
              </label>
              <div class="wide table-wrap">
                <div class="table-grid" style={`--columns: ${Math.max(1, block.header.length)}`}>
                  {#each block.header as cell, columnIndex}
                    <input
                      class="header-cell"
                      type="text"
                      value={cell}
                      aria-label={`Table header column ${columnIndex + 1}`}
                      oninput={(event) =>
                        onchange(
                          updateBlock(slide, block.id, {
                            header: block.header.map((header, index) =>
                              index === columnIndex
                                ? (event.currentTarget as HTMLInputElement).value
                                : header,
                            ),
                          }),
                        )}
                    />
                  {/each}
                  {#each block.rows as row, rowIndex}
                    {#each row as cell, columnIndex}
                      <input
                        type="text"
                        value={cell}
                        aria-label={`Table row ${rowIndex + 1}, column ${columnIndex + 1}`}
                        oninput={(event) =>
                          setTableCell(
                            block,
                            rowIndex,
                            columnIndex,
                            (event.currentTarget as HTMLInputElement).value,
                          )}
                      />
                    {/each}
                  {/each}
                </div>
                <div class="table-actions">
                  <button type="button" onclick={() => addTableRow(block)}>+ row</button>
                  <button
                    type="button"
                    disabled={block.rows.length === 0}
                    onclick={() => removeTableRow(block, block.rows.length - 1)}>- row</button
                  >
                  <button type="button" onclick={() => addTableColumn(block)}>+ column</button>
                  <button
                    type="button"
                    disabled={block.header.length <= 1}
                    onclick={() => removeTableColumn(block)}>- column</button
                  >
                </div>
              </div>
            {:else if block.kind === 'math'}
              <label class="wide">
                LaTeX
                <textarea
                  rows="3"
                  spellcheck="false"
                  value={block.latex}
                  oninput={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        latex: (event.currentTarget as HTMLTextAreaElement).value,
                      }),
                    )}
                ></textarea>
              </label>
              <label>
                Alignment
                <select
                  value={block.align ?? 'center'}
                  onchange={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        align: (event.currentTarget as HTMLSelectElement).value as SlideAlign,
                      }),
                    )}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label>
                Size
                <input
                  type="number"
                  min="6"
                  max="240"
                  value={block.fontSize ?? 36}
                  onchange={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        fontSize: numberValue(event, block.fontSize ?? 36),
                      }),
                    )}
                />
              </label>
            {:else if block.kind === 'callout'}
              <label class="wide">
                Text
                <textarea
                  rows="2"
                  value={block.text}
                  oninput={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        text: (event.currentTarget as HTMLTextAreaElement).value,
                      }),
                    )}
                ></textarea>
              </label>
              <label>
                Tone
                <select
                  value={block.tone}
                  onchange={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        tone: (event.currentTarget as HTMLSelectElement).value as SlideCalloutTone,
                      }),
                    )}
                >
                  <option value="tip">Tip</option>
                  <option value="note">Note</option>
                  <option value="warn">Warning</option>
                </select>
              </label>
            {:else if block.kind === 'graph'}
              <label>
                Height
                <input
                  type="number"
                  min="1"
                  max="2000"
                  value={block.height}
                  onchange={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        height: numberValue(event, block.height),
                      }),
                    )}
                />
              </label>
              <label class="wide">
                Caption
                <input
                  type="text"
                  value={block.caption ?? ''}
                  oninput={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        caption: (event.currentTarget as HTMLInputElement).value,
                      }),
                    )}
                />
              </label>
              <div class="wide range-row">
                <label>
                  x min
                  <input
                    type="number"
                    step="any"
                    value={block.graph.xRange[0]}
                    onchange={(event) =>
                      setGraphRange(block, 'xRange', 0, numberValue(event, block.graph.xRange[0]))}
                  />
                </label>
                <label>
                  x max
                  <input
                    type="number"
                    step="any"
                    value={block.graph.xRange[1]}
                    onchange={(event) =>
                      setGraphRange(block, 'xRange', 1, numberValue(event, block.graph.xRange[1]))}
                  />
                </label>
                <label>
                  y min
                  <input
                    type="number"
                    step="any"
                    value={block.graph.yRange[0]}
                    onchange={(event) =>
                      setGraphRange(block, 'yRange', 0, numberValue(event, block.graph.yRange[0]))}
                  />
                </label>
                <label>
                  y max
                  <input
                    type="number"
                    step="any"
                    value={block.graph.yRange[1]}
                    onchange={(event) =>
                      setGraphRange(block, 'yRange', 1, numberValue(event, block.graph.yRange[1]))}
                  />
                </label>
              </div>
              <label class="check">
                <input
                  type="checkbox"
                  checked={block.graph.showGrid}
                  onchange={(event) =>
                    updateGraph(block, {
                      showGrid: (event.currentTarget as HTMLInputElement).checked,
                    })}
                />
                Grid
              </label>
              <label class="check">
                <input
                  type="checkbox"
                  checked={block.graph.showAxes}
                  onchange={(event) =>
                    updateGraph(block, {
                      showAxes: (event.currentTarget as HTMLInputElement).checked,
                    })}
                />
                Axes
              </label>
              <div class="wide repeated">
                {#each block.graph.functions as fn, functionIndex (fn.id)}
                  <div class="graph-function">
                    <input
                      type="color"
                      value={fn.color}
                      aria-label={`Expression ${functionIndex + 1} color`}
                      onchange={(event) =>
                        updateGraphFunction(block, fn.id, {
                          color: (event.currentTarget as HTMLInputElement).value,
                        })}
                    />
                    <select
                      value={fn.kind}
                      aria-label={`Expression ${functionIndex + 1} kind`}
                      onchange={(event) =>
                        updateGraphFunction(block, fn.id, {
                          kind: (event.currentTarget as HTMLSelectElement).value as
                            | 'explicit'
                            | 'implicit',
                        })}
                    >
                      <option value="explicit">y=</option>
                      <option value="implicit">f(x,y)=0</option>
                    </select>
                    <input
                      type="text"
                      spellcheck="false"
                      value={fn.expr}
                      aria-label={`Expression ${functionIndex + 1}`}
                      oninput={(event) =>
                        updateGraphFunction(block, fn.id, {
                          expr: (event.currentTarget as HTMLInputElement).value,
                        })}
                    />
                    <button
                      type="button"
                      class="danger"
                      aria-label={`Delete expression ${functionIndex + 1}`}
                      onclick={() => removeGraphFunction(block, fn.id)}>×</button
                    >
                  </div>
                {/each}
                <button type="button" class="add-small" onclick={() => addGraphFunction(block)}
                  >+ expression</button
                >
              </div>
            {:else if block.kind === 'image'}
              <label class="wide">
                Image file
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onchange={(event) =>
                    void loadImage(block, (event.currentTarget as HTMLInputElement).files?.[0])}
                />
              </label>
              <label class="wide">
                Alternative text
                <input
                  type="text"
                  value={block.alt}
                  oninput={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        alt: (event.currentTarget as HTMLInputElement).value,
                      }),
                    )}
                />
              </label>
              <label>
                Height
                <input
                  type="number"
                  min="1"
                  max="2000"
                  value={block.height}
                  onchange={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        height: numberValue(event, block.height),
                      }),
                    )}
                />
              </label>
              {#if imageError}
                <p class="error" role="alert">{imageError}</p>
              {/if}
            {:else if block.kind === 'mapping'}
              <label>
                Left label
                <input
                  type="text"
                  value={block.leftLabel}
                  oninput={(event) =>
                    updateMapping(block, {
                      leftLabel: (event.currentTarget as HTMLInputElement).value,
                    })}
                />
              </label>
              <label>
                Right label
                <input
                  type="text"
                  value={block.rightLabel}
                  oninput={(event) =>
                    updateMapping(block, {
                      rightLabel: (event.currentTarget as HTMLInputElement).value,
                    })}
                />
              </label>
              <label class="wide">
                Caption
                <input
                  type="text"
                  value={block.caption ?? ''}
                  oninput={(event) =>
                    updateMapping(block, {
                      caption: (event.currentTarget as HTMLInputElement).value,
                    })}
                />
              </label>
              <div class="wide mapping-columns">
                <section class="mapping-side" aria-label="Left mapping elements">
                  <strong>{block.leftLabel || 'Left elements'}</strong>
                  {#each block.left as item, itemIndex}
                    <div class="mapping-item">
                      <input
                        type="text"
                        value={item}
                        aria-label={`Left element ${itemIndex + 1}`}
                        oninput={(event) =>
                          setMappingElement(
                            block,
                            'left',
                            itemIndex,
                            (event.currentTarget as HTMLInputElement).value,
                          )}
                      />
                      <button
                        type="button"
                        aria-label={`Move left element ${itemIndex + 1} up`}
                        disabled={itemIndex === 0}
                        onclick={() => moveMappingElement(block, 'left', itemIndex, -1)}>↑</button
                      >
                      <button
                        type="button"
                        aria-label={`Move left element ${itemIndex + 1} down`}
                        disabled={itemIndex === block.left.length - 1}
                        onclick={() => moveMappingElement(block, 'left', itemIndex, 1)}>↓</button
                      >
                      <button
                        type="button"
                        class="danger"
                        aria-label={`Delete left element ${itemIndex + 1}`}
                        onclick={() => removeMappingElement(block, 'left', itemIndex)}>×</button
                      >
                    </div>
                  {/each}
                  <button
                    type="button"
                    class="add-small"
                    onclick={() => addMappingElement(block, 'left')}>+ left value</button
                  >
                </section>
                <section class="mapping-side" aria-label="Right mapping elements">
                  <strong>{block.rightLabel || 'Right elements'}</strong>
                  {#each block.right as item, itemIndex}
                    <div class="mapping-item">
                      <input
                        type="text"
                        value={item}
                        aria-label={`Right element ${itemIndex + 1}`}
                        oninput={(event) =>
                          setMappingElement(
                            block,
                            'right',
                            itemIndex,
                            (event.currentTarget as HTMLInputElement).value,
                          )}
                      />
                      <button
                        type="button"
                        aria-label={`Move right element ${itemIndex + 1} up`}
                        disabled={itemIndex === 0}
                        onclick={() => moveMappingElement(block, 'right', itemIndex, -1)}>↑</button
                      >
                      <button
                        type="button"
                        aria-label={`Move right element ${itemIndex + 1} down`}
                        disabled={itemIndex === block.right.length - 1}
                        onclick={() => moveMappingElement(block, 'right', itemIndex, 1)}>↓</button
                      >
                      <button
                        type="button"
                        class="danger"
                        aria-label={`Delete right element ${itemIndex + 1}`}
                        onclick={() => removeMappingElement(block, 'right', itemIndex)}>×</button
                      >
                    </div>
                  {/each}
                  <button
                    type="button"
                    class="add-small"
                    onclick={() => addMappingElement(block, 'right')}>+ right value</button
                  >
                </section>
              </div>
              <div class="wide mapping-pairs">
                <strong>Arrows</strong>
                {#each block.pairs as pair, pairIndex}
                  <div class="mapping-pair">
                    <select
                      value={pair.from}
                      aria-label={`Arrow ${pairIndex + 1} left element`}
                      onchange={(event) =>
                        setMappingPair(block, pairIndex, {
                          from: Number((event.currentTarget as HTMLSelectElement).value),
                        })}
                    >
                      {#each block.left as item, itemIndex}
                        <option value={itemIndex}>{item || `Left ${itemIndex + 1}`}</option>
                      {/each}
                    </select>
                    <span aria-hidden="true">→</span>
                    <select
                      value={pair.to}
                      aria-label={`Arrow ${pairIndex + 1} right element`}
                      onchange={(event) =>
                        setMappingPair(block, pairIndex, {
                          to: Number((event.currentTarget as HTMLSelectElement).value),
                        })}
                    >
                      {#each block.right as item, itemIndex}
                        <option value={itemIndex}>{item || `Right ${itemIndex + 1}`}</option>
                      {/each}
                    </select>
                    <button
                      type="button"
                      class="danger"
                      aria-label={`Delete arrow ${pairIndex + 1}`}
                      onclick={() => removeMappingPair(block, pairIndex)}>×</button
                    >
                  </div>
                {/each}
                <div class="new-mapping-pair">
                  <label>
                    From
                    <select
                      value={mappingSelections[block.id]?.from ?? 0}
                      disabled={block.left.length === 0}
                      onchange={(event) =>
                        setMappingSelection(
                          block.id,
                          'from',
                          Number((event.currentTarget as HTMLSelectElement).value),
                        )}
                    >
                      {#each block.left as item, itemIndex}
                        <option value={itemIndex}>{item || `Left ${itemIndex + 1}`}</option>
                      {/each}
                    </select>
                  </label>
                  <label>
                    To
                    <select
                      value={mappingSelections[block.id]?.to ?? 0}
                      disabled={block.right.length === 0}
                      onchange={(event) =>
                        setMappingSelection(
                          block.id,
                          'to',
                          Number((event.currentTarget as HTMLSelectElement).value),
                        )}
                    >
                      {#each block.right as item, itemIndex}
                        <option value={itemIndex}>{item || `Right ${itemIndex + 1}`}</option>
                      {/each}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={block.left.length === 0 || block.right.length === 0}
                    onclick={() => addMappingPair(block)}>+ arrow</button
                  >
                </div>
              </div>
              <label>
                Height
                <input
                  type="number"
                  min="1"
                  max="2000"
                  value={block.height}
                  onchange={(event) =>
                    updateMapping(block, { height: numberValue(event, block.height) })}
                />
              </label>
            {:else if block.kind === 'diagram'}
              <label class="wide">
                Caption
                <input
                  type="text"
                  value={block.caption ?? ''}
                  oninput={(event) =>
                    updateDiagram(block, {
                      caption: (event.currentTarget as HTMLInputElement).value,
                    })}
                />
              </label>
              <div class="wide diagram-nodes">
                <strong>Nodes</strong>
                {#each block.nodes as node, nodeIndex (node.id)}
                  <div class="diagram-node">
                    <label>
                      ID
                      <input
                        type="text"
                        value={node.id}
                        onchange={(event) =>
                          renameDiagramNode(
                            block,
                            nodeIndex,
                            (event.currentTarget as HTMLInputElement).value,
                          )}
                      />
                    </label>
                    <label>
                      Text
                      <input
                        type="text"
                        value={node.text}
                        oninput={(event) =>
                          updateDiagramNode(block, nodeIndex, {
                            text: (event.currentTarget as HTMLInputElement).value,
                          })}
                      />
                    </label>
                    <label>
                      Shape
                      <select
                        value={node.shape ?? 'box'}
                        onchange={(event) =>
                          updateDiagramNode(block, nodeIndex, {
                            shape: (event.currentTarget as HTMLSelectElement).value as
                              | 'box'
                              | 'plain',
                          })}
                      >
                        <option value="box">Box</option>
                        <option value="plain">Plain</option>
                      </select>
                    </label>
                    <label>
                      x
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={node.x}
                        onchange={(event) =>
                          updateDiagramNode(block, nodeIndex, {
                            x: Math.min(1, Math.max(0, numberValue(event, node.x))),
                          })}
                      />
                    </label>
                    <label>
                      y
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={node.y}
                        onchange={(event) =>
                          updateDiagramNode(block, nodeIndex, {
                            y: Math.min(1, Math.max(0, numberValue(event, node.y))),
                          })}
                      />
                    </label>
                    <button
                      type="button"
                      class="danger diagram-node-delete"
                      aria-label={`Delete diagram node ${nodeIndex + 1}`}
                      onclick={() => removeDiagramNode(block, node.id)}>Delete</button
                    >
                  </div>
                {/each}
                <button type="button" class="add-small" onclick={() => addDiagramNode(block)}
                  >+ node</button
                >
              </div>
              <div class="wide diagram-edges">
                <strong>Edges</strong>
                {#each block.edges as edge, edgeIndex}
                  <div class="diagram-edge">
                    <span>{edge.from} → {edge.to}</span>
                    <input
                      type="text"
                      value={edge.label ?? ''}
                      aria-label={`Edge ${edgeIndex + 1} label`}
                      placeholder="Optional label"
                      oninput={(event) =>
                        updateDiagram(block, {
                          edges: block.edges.map((candidate, index) =>
                            index === edgeIndex
                              ? {
                                  ...candidate,
                                  label: (event.currentTarget as HTMLInputElement).value,
                                }
                              : candidate,
                          ),
                        })}
                    />
                    <button
                      type="button"
                      class="danger"
                      aria-label={`Delete edge ${edgeIndex + 1}`}
                      onclick={() => removeDiagramEdge(block, edgeIndex)}>×</button
                    >
                  </div>
                {/each}
                <div class="new-diagram-edge">
                  <label>
                    From
                    <select
                      value={diagramSelections[block.id]?.from ?? block.nodes[0]?.id ?? ''}
                      disabled={block.nodes.length < 2}
                      onchange={(event) =>
                        setDiagramSelection(
                          block,
                          'from',
                          (event.currentTarget as HTMLSelectElement).value,
                        )}
                    >
                      {#each block.nodes as node}
                        <option value={node.id}>{node.text || node.id}</option>
                      {/each}
                    </select>
                  </label>
                  <label>
                    To
                    <select
                      value={diagramSelections[block.id]?.to ?? block.nodes[1]?.id ?? ''}
                      disabled={block.nodes.length < 2}
                      onchange={(event) =>
                        setDiagramSelection(
                          block,
                          'to',
                          (event.currentTarget as HTMLSelectElement).value,
                        )}
                    >
                      {#each block.nodes as node}
                        <option value={node.id}>{node.text || node.id}</option>
                      {/each}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={block.nodes.length < 2 ||
                      (diagramSelections[block.id]?.from ?? block.nodes[0]?.id) ===
                        (diagramSelections[block.id]?.to ?? block.nodes[1]?.id)}
                    onclick={() => addDiagramEdge(block)}>+ edge</button
                  >
                </div>
              </div>
              <label>
                Height
                <input
                  type="number"
                  min="1"
                  max="2000"
                  value={block.height}
                  onchange={(event) =>
                    updateDiagram(block, { height: numberValue(event, block.height) })}
                />
              </label>
            {:else if block.kind === 'numberline'}
              <label class="wide">
                Caption
                <input
                  type="text"
                  value={block.caption ?? ''}
                  oninput={(event) =>
                    updateNumberLine(block, {
                      caption: (event.currentTarget as HTMLInputElement).value,
                    })}
                />
              </label>
              <div class="wide numberline-settings">
                <label>
                  Minimum
                  <input
                    type="number"
                    step="any"
                    value={block.min}
                    onchange={(event) =>
                      setNumberLineBound(block, 'min', numberValue(event, block.min))}
                  />
                </label>
                <label>
                  Maximum
                  <input
                    type="number"
                    step="any"
                    value={block.max}
                    onchange={(event) =>
                      setNumberLineBound(block, 'max', numberValue(event, block.max))}
                  />
                </label>
                <label>
                  Tick step
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    value={block.tickStep}
                    onchange={(event) =>
                      setNumberLineStep(block, 'tickStep', numberValue(event, block.tickStep))}
                  />
                </label>
                <label>
                  Label step
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    value={block.labelStep}
                    onchange={(event) =>
                      setNumberLineStep(block, 'labelStep', numberValue(event, block.labelStep))}
                  />
                </label>
                <label>
                  Height
                  <input
                    type="number"
                    min="1"
                    max="2000"
                    value={block.height}
                    onchange={(event) =>
                      updateNumberLine(block, {
                        height: Math.max(1, numberValue(event, block.height)),
                      })}
                  />
                </label>
              </div>
              <div class="wide numberline-marks">
                <strong>Marks</strong>
                {#each block.marks as mark, markIndex}
                  <div class="numberline-mark">
                    <label>
                      Value
                      <input
                        type="number"
                        step="any"
                        value={mark.value}
                        onchange={(event) =>
                          updateNumberLineMark(block, markIndex, {
                            value: Math.min(
                              block.max,
                              Math.max(block.min, numberValue(event, mark.value)),
                            ),
                          })}
                      />
                    </label>
                    <label>
                      Kind
                      <select
                        value={mark.kind}
                        onchange={(event) =>
                          updateNumberLineMark(block, markIndex, {
                            kind: (event.currentTarget as HTMLSelectElement)
                              .value as NumberLineMarkKind,
                          })}
                      >
                        <option value="open">Open circle</option>
                        <option value="closed">Closed circle</option>
                        <option value="arrow-left">Left arrow</option>
                        <option value="arrow-right">Right arrow</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      class="danger"
                      aria-label={`Delete number-line mark ${markIndex + 1}`}
                      onclick={() => removeNumberLineMark(block, markIndex)}>×</button
                    >
                  </div>
                {/each}
                <button type="button" class="add-small" onclick={() => addNumberLineMark(block)}
                  >+ mark</button
                >
              </div>
            {:else if block.kind === 'spacer'}
              <label>
                Writing-space height
                <input
                  type="number"
                  min="1"
                  max="2000"
                  value={block.height}
                  onchange={(event) =>
                    onchange(
                      updateBlock(slide, block.id, {
                        height: numberValue(event, block.height),
                      }),
                    )}
                />
              </label>
            {/if}
          </div>
        </li>
      {:else}
        <li class="empty">This slide has no blocks.</li>
      {/each}
    </ol>

    <div class="add-block">
      <label>
        Block type
        <select bind:value={addKind}>
          {#each blockKinds as kind (kind.value)}
            <option value={kind.value}>{kind.label}</option>
          {/each}
        </select>
      </label>
      <button type="button" class="primary" onclick={addSelectedBlock}>Add block</button>
    </div>
  </section>

  <section class="aside-section" aria-labelledby="aside-heading">
    <div class="section-head">
      <h2 id="aside-heading">Corner callouts</h2>
      <button type="button" class="add-small" onclick={addAside}>+ callout</button>
    </div>
    {#each slide.aside ?? [] as callout, index (callout.id)}
      <div class="aside-row">
        <input
          type="text"
          value={callout.text}
          aria-label={`Corner callout ${index + 1} text`}
          oninput={(event) =>
            updateAside(index, { text: (event.currentTarget as HTMLInputElement).value })}
        />
        <select
          value={callout.tone}
          aria-label={`Corner callout ${index + 1} tone`}
          onchange={(event) =>
            updateAside(index, {
              tone: (event.currentTarget as HTMLSelectElement).value as SlideCalloutTone,
            })}
        >
          <option value="tip">Tip</option>
          <option value="note">Note</option>
          <option value="warn">Warning</option>
        </select>
        <button
          type="button"
          class="danger"
          aria-label={`Delete corner callout ${index + 1}`}
          onclick={() => removeAside(index)}>×</button
        >
      </div>
    {/each}
  </section>
</aside>

<style>
  .editor {
    width: min(440px, calc(100vw - 24px));
    max-height: calc(100vh - 24px);
    overflow: auto;
    box-sizing: border-box;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: #252525;
    color: #e8e8e8;
    border: 1px solid #1a1a1a;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
    font-size: 12px;
    pointer-events: auto;
  }
  .head,
  .section-head,
  .block-head,
  .block-actions,
  .add-block,
  .table-actions {
    display: flex;
    align-items: center;
  }
  .head,
  .section-head,
  .block-head {
    justify-content: space-between;
  }
  .editor-title,
  h2 {
    margin: 0;
    color: #aaa;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  button,
  input,
  select,
  textarea {
    font: inherit;
  }
  button {
    min-height: 24px;
    padding: 3px 7px;
    background: #2a2a2a;
    color: #ddd;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover,
  button:focus-visible {
    border-color: #777;
  }
  button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .close {
    width: 24px;
    padding: 0;
    background: transparent;
  }
  .slide-fields,
  .block-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }
  label {
    min-width: 0;
    display: grid;
    gap: 3px;
    color: #bbb;
  }
  input,
  select,
  textarea {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    padding: 4px 6px;
    background: #1b1b1b;
    color: #eee;
    border: 1px solid #3a3a3a;
    border-radius: 3px;
  }
  input[type='color'] {
    width: 28px;
    height: 26px;
    padding: 0;
  }
  input[type='file'] {
    padding: 3px;
  }
  textarea {
    resize: vertical;
  }
  .wide,
  .repeated,
  .table-wrap,
  .range-row,
  .error {
    grid-column: 1 / -1;
  }
  .check {
    display: flex;
    align-items: center;
    align-self: end;
    gap: 5px;
    min-height: 27px;
  }
  .check input {
    width: auto;
  }
  .blocks-section,
  .aside-section {
    display: grid;
    gap: 7px;
  }
  .blocks {
    margin: 0;
    padding: 0;
    display: grid;
    gap: 7px;
    list-style: none;
  }
  .block {
    padding: 7px;
    display: grid;
    gap: 7px;
    background: #222;
    border: 1px solid #363636;
    border-radius: 5px;
  }
  .block-focus {
    display: flex;
    gap: 5px;
    align-items: center;
    background: transparent;
    border-color: transparent;
    color: #ccc;
    text-transform: capitalize;
  }
  .drag {
    color: #777;
  }
  .block-actions,
  .table-actions {
    gap: 3px;
  }
  .block-actions button {
    width: 25px;
    padding: 0;
  }
  .danger {
    color: #f0bcbc;
    border-color: #593333;
  }
  .danger:hover {
    background: #3a1f1f;
  }
  .primary {
    background: #2a4a78;
    border-color: #3a6aa0;
    color: #fff;
  }
  .add-block {
    justify-content: flex-end;
    gap: 7px;
  }
  .add-block label {
    grid-template-columns: auto 150px;
    align-items: center;
    gap: 6px;
  }
  .repeated,
  .table-wrap {
    display: grid;
    gap: 5px;
  }
  .item-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(3, 25px);
    gap: 3px;
  }
  .definition-row,
  .aside-row {
    display: grid;
    grid-template-columns: minmax(80px, 0.7fr) minmax(120px, 1.3fr) 25px;
    gap: 4px;
  }
  .aside-row {
    grid-template-columns: minmax(0, 1fr) 82px 25px;
  }
  .add-small {
    justify-self: start;
    color: #ddd;
  }
  .table-grid {
    display: grid;
    grid-template-columns: repeat(var(--columns), minmax(70px, 1fr));
    gap: 3px;
    overflow-x: auto;
  }
  .header-cell {
    font-weight: 700;
  }
  .range-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
  }
  .graph-function {
    display: grid;
    grid-template-columns: 28px 78px minmax(0, 1fr) 25px;
    gap: 4px;
  }
  .marker-levels,
  .diagram-nodes,
  .diagram-edges,
  .numberline-marks {
    display: grid;
    gap: 5px;
  }
  .field-label,
  .diagram-nodes > strong,
  .diagram-edges > strong,
  .numberline-marks > strong {
    color: #bbb;
    font-size: 11px;
  }
  .marker-level {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 25px;
    gap: 4px;
    align-items: end;
  }
  .diagram-node {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
    padding: 6px;
    border: 1px solid #363636;
    border-radius: 4px;
  }
  .diagram-node-delete {
    align-self: end;
  }
  .diagram-edge {
    display: grid;
    grid-template-columns: minmax(90px, auto) minmax(0, 1fr) 25px;
    gap: 5px;
    align-items: center;
  }
  .diagram-edge span {
    overflow: hidden;
    color: #aaa;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .new-diagram-edge {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 5px;
    align-items: end;
  }
  .numberline-settings {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
  }
  .numberline-mark {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr) 25px;
    gap: 5px;
    align-items: end;
  }
  .mapping-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .mapping-side,
  .mapping-pairs {
    display: grid;
    gap: 5px;
  }
  .mapping-side strong,
  .mapping-pairs strong {
    color: #bbb;
    font-size: 11px;
  }
  .mapping-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(3, 25px);
    gap: 3px;
  }
  .mapping-pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) 25px;
    gap: 5px;
    align-items: center;
  }
  .new-mapping-pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 5px;
    align-items: end;
  }
  .empty {
    padding: 10px;
    color: #999;
    text-align: center;
    border: 1px dashed #444;
    border-radius: 4px;
  }
  .error {
    margin: 0;
    color: #ef9a9a;
  }
  @media (max-width: 420px) {
    .slide-fields,
    .block-form {
      grid-template-columns: 1fr;
    }
    .wide,
    .repeated,
    .table-wrap,
    .range-row,
    .error {
      grid-column: 1;
    }
    .range-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .mapping-columns {
      grid-template-columns: 1fr;
    }
  }
</style>

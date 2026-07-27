export { defaultSlideTheme, isSafeSlideTheme, resolveTheme } from './theme';
export { layoutSlide, measureBlock } from './layout';
export type { LayoutBox, PlacedBlock, SlideLayout } from './layout';
export { formatAlpha, formatRoman, presentList } from './listMarkers';
export type { PresentedListItem } from './listMarkers';
export { default as SlideLayer } from './render/SlideLayer.svelte';
export { diagramGeometry } from './render/diagramGeometry';
export type {
  DiagramEdgeGeometry,
  DiagramGeometry,
  DiagramNodeGeometry,
  DiagramPoint,
} from './render/diagramGeometry';
export { renderSlideBackground } from './render/renderSlideToCanvas';
export { graphObjectForSlide, graphThemeForSlide } from './render/graphAdapter';
export { mappingGeometry, MAX_MAPPING_ITEMS } from './render/mappingGeometry';
export type {
  MappingArrow,
  MappingGeometry,
  MappingItemPosition,
  MappingOval,
  MappingPoint,
} from './render/mappingGeometry';
export {
  MAX_NUMBER_LINE_LABELS,
  MAX_NUMBER_LINE_TICKS,
  slideNumberLineGeometry,
} from './render/numberLineGeometry';
export type {
  NumberLineMarkGeometry,
  NumberLineTick,
  SlideNumberLineGeometry,
} from './render/numberLineGeometry';

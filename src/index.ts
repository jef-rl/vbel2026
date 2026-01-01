/**
 * Library entry point.
 *
 * Rationale:
 * - Export component classes + contexts + types so higher-level apps can compose them.
 * - DO NOT auto-register custom elements here to keep the package tree-shakeable.
 *   Consumers can call `registerVisualBlockEditor()` when they want side effects.
 */

export * from './register.js';
export * from './contexts.js';
export * from './defaults.js';
export * from './services/ai.js';
export * from './utils/grid.js';

export * from './components/visual-block-data.js';
export * from './components/visual-block-editor.js';
export * from './components/visual-block-toolbar.js';
export * from './components/visual-block-ai-modal.js';
export * from './components/visual-block-render.js';
export * from './components/visual-block-grid.js';
export * from './components/visual-block-preview.js';
export * from './components/visual-block-projection.js';

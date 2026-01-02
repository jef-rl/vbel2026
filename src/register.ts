/**
 * Explicit registration surface.
 *
 * Rationale:
 * - Some apps want *just* classes and will register elements themselves.
 * - Others want a single import that registers everything (demo / script-tag usage).
 */

export function registerVisualBlockEditor() {
  // Order doesn't matter much, but registering provider/editor early avoids "unknown element" flashes.
  import('./components/visual-block-data.js');
  import('./components/visual-block-editor.js');
  import('./components/visual-block-toolbar.js');
  import('./components/visual-block-ai-modal.js');
  import('./components/visual-block-render.js');
  import('./components/visual-block-grid.js');
  import('./components/visual-block-preview.js');
  import('./components/visual-block-projection.js');
  import('./components/visual-block-inspector.js');
}

// Auto-register when someone imports the IIFE bundle (src/register.ts is its entry)
registerVisualBlockEditor();

import { createContext } from '@lit/context';

/**
 * Contexts are the backbone of the one-way data flow.
 *
 * - `blockDataContext`: raw fetched JSON payload (your layout + blocks).
 * - `uiStateContext`: UI state controlled by the provider (zoom, mode, selection, etc.)
 * - `editorContext`: derived/calculated state produced by the editor (rects + grid metrics).
 *
 * Rationale:
 * - Splitting concerns makes each component reusable in isolation.
 * - Higher-level components can swap in alternative providers/editors if needed.
 */

export const blockDataContext = createContext<any>('visual-block-data');
export const uiStateContext = createContext<any>('visual-block-ui-state');
export const editorContext = createContext<any>('visual-block-editor-state');

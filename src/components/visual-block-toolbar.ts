import { LitElement, html, css } from 'lit';
import { ContextConsumer } from '@lit/context';
import { uiStateContext } from '../contexts.js';
import { Icons } from '../icons.js';

/**
 * <visual-block-toolbar>
 *
 * Responsibility:
 * - Stateless UI controls: zoom and mode changes + "AI" buttons.
 * - Emits generic `ui-event` actions.
 *
 * Rationale as a building block:
 * - Toolbars often get replaced (different product skins).
 * - Keeping it separate means the core editor can be reused with alternate toolbars.
 */
export class VisualBlockToolbar extends LitElement {
  private uiState: any = { zoom: 1, mode: 'design' };
  private _consumer = new ContextConsumer(this, {
    context: uiStateContext,
    subscribe: true,
    callback: (value) => {
      this.uiState = value ?? this.uiState;
      this.requestUpdate();
    },
  });

  static styles = css`
    :host { display: block; width: 100%; background: white; padding: 10px 20px; border-bottom: 1px solid #e5e7eb; box-sizing: border-box; z-index: 100; }
    .toolbar-inner { display: flex; justify-content: space-between; align-items: center; max-width: 100%; }
    .brand { display: flex; align-items: center; gap: 8px; font-size: 16px; color: #111; font-weight: 600; }
    .icon { color: #4f46e5; display: flex; }
    .controls { display: flex; gap: 12px; }
    .group { display: flex; align-items: center; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 2px; }
    button { background: none; border: none; padding: 6px 10px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 13px; color: #6b7280; border-radius: 4px; transition: all 0.1s; }
    button:hover { background: #fff; color: #111; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    button.active { background: white; color: #4f46e5; box-shadow: 0 1px 2px rgba(0,0,0,0.1); font-weight: 600; }
    button.ai-btn { color: #4f46e5; font-weight: 500; }
    button.ai-btn:hover { background: #eef2ff; }
    .label { font-size: 12px; min-width: 40px; text-align: center; color: #666; font-variant-numeric: tabular-nums; }
  `;

  private dispatchUiEvent(type: string, payload: any = null) {
    this.dispatchEvent(new CustomEvent('ui-event', { detail: { type, payload }, bubbles: true, composed: true }));
  }

  render() {
    const { zoom, mode } = this.uiState ?? { zoom: 1, mode: 'design' };

    return html`
      <div class="toolbar-inner">
        <div class="brand"><span class="icon">${Icons.Layers}</span>Visual Block Editor</div>
        <div class="controls">
          <div class="group">
            <button class="ai-btn" @click=${() => this.dispatchUiEvent('ai-summary')}>${Icons.Robot} Summarize</button>
            <button class="ai-btn" @click=${() => this.dispatchUiEvent('ai-architect')}>${Icons.Sparkles} AI Architect</button>
          </div>
          <div class="group">
            <button @click=${() => this.dispatchUiEvent('zoom-out')}>${Icons.ZoomOut}</button>
            <span class="label">${Math.round(zoom * 100)}%</span>
            <button @click=${() => this.dispatchUiEvent('zoom-in')}>${Icons.ZoomIn}</button>
          </div>
          <div class="group">
            <button class=${mode === 'design' ? 'active' : ''} @click=${() => this.dispatchUiEvent('mode-change', 'design')}>${Icons.Design} Design</button>
            <button class=${mode === 'render' ? 'active' : ''} @click=${() => this.dispatchUiEvent('mode-change', 'render')}>${Icons.Render} Render</button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('visual-block-toolbar', VisualBlockToolbar);

import { LitElement, html, css } from 'lit';
import { ContextProvider } from '@lit/context';
import { blockDataContext, uiStateContext } from '../contexts.js';
import type { UiEventDetail } from '../defaults.js';
import { noopAiClient, type AiClient } from '../services/ai.js';
import { Icons } from '../icons.js';

/**
 * <visual-block-data>
 *
 * Responsibility:
 * - Fetch layout JSON from `src` (or compose it from `base-url` + id).
 * - Own all UI state (zoom/mode/selection/rotation/modal).
 * - Provide contexts:
 *   - raw block data (blockDataContext)
 *   - ui state (uiStateContext)
 *
 * Rationale as a building block:
 * - This makes the editor "headless" with respect to where data comes from.
 * - You can reuse <visual-block-editor> in different apps by swapping providers.
 */
export class VisualBlockData extends LitElement {
  static properties = {
    src: { type: String },
    baseUrl: { type: String, attribute: 'base-url' },
    auto: { type: Boolean },
    loading: { type: Boolean, state: true },
    error: { type: String, state: true },
    data: { type: Object, state: true },
    isPrompting: { type: Boolean, state: true },

    // Optional AI client injection (safer than hardcoding API keys in the browser)
    aiClient: { attribute: false },

    // UI state
    zoom: { type: Number, state: true },
    mode: { type: String, state: true },
    selectedIds: { type: Array, state: true },
    blockId: { type: String, state: true },
    rotationY: { type: Number, state: true },
    modalState: { type: Object, state: true },
  };

  static styles = css`
    :host { display: contents; }

    .fab {
      position: fixed; bottom: 32px; right: 32px; width: 56px; height: 56px;
      border-radius: 28px; background-color: #4f46e5; color: white; border: none;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); cursor: pointer;
      display: flex; align-items: center; justify-content: center; z-index: 9999;
      transition: transform 0.2s, background-color 0.2s; outline: none;
    }
    .fab:hover { transform: scale(1.1); background-color: #4338ca; }
    .fab:active { transform: scale(0.95); }
    .fab:disabled { background-color: #6366f1; cursor: wait; transform: scale(1); }

    .icon { width: 24px; height: 24px; stroke-width: 2.5; }
    .spinner {
      width: 20px; height: 20px; border: 3px solid rgba(255,255,255,0.3);
      border-radius: 50%; border-top-color: white; animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .modal-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.5); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(2px);
    }
    .modal {
      background: white; padding: 24px; border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
      width: 320px; display: flex; flex-direction: column; gap: 16px;
      font-family: system-ui, sans-serif; animation: popIn 0.2s ease-out;
    }
    @keyframes popIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    .modal h3 { margin: 0; font-size: 18px; color: #1f2937; }
    .modal input {
      padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px;
      font-size: 14px; outline: none; transition: border-color 0.15s;
    }
    .modal input:focus { border-color: #4f46e5; box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2); }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .btn { padding: 8px 16px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; }
    .btn-cancel { background: #f3f4f6; color: #4b5563; }
    .btn-confirm { background: #4f46e5; color: white; }
  `;

  src = '';
  baseUrl = '';
  auto = false;
  loading = false;
  error: string | null = null;
  data: any = null;
  isPrompting = false;

  // safer injection point for AI calls
  aiClient: AiClient = noopAiClient;

  // UI state
  zoom = 1;
  mode = 'design';
  selectedIds: string[] = [];
  blockId = '';
  rotationY = 25;
  modalState: any = { open: false, mode: 'architect', title: '', content: '' };

  private dataProvider = new ContextProvider(this, { context: blockDataContext });
  private uiProvider = new ContextProvider(this, { context: uiStateContext });

  constructor() {
    super();
    this.handleUIEvent = this.handleUIEvent.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.auto && this.src) this.fetchData();
    this.addEventListener('ui-event', this.handleUIEvent as any);
    this._updateUiContext();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('ui-event', this.handleUIEvent as any);
  }

  willUpdate(changed: Map<string, any>) {
    if (changed.has('src') && this.src && !this.loading) this.fetchData();
    if (changed.has('data')) this.dataProvider.setValue(this.data);

    if (['zoom', 'mode', 'selectedIds', 'blockId', 'rotationY', 'modalState'].some((k) => changed.has(k))) {
      this._updateUiContext();
    }
  }

  private _updateUiContext() {
    this.uiProvider.setValue({
      zoom: this.zoom,
      mode: this.mode,
      selectedIds: this.selectedIds,
      blockId: this.blockId,
      rotationY: this.rotationY,
      modalState: this.modalState,
    });
  }

  private dispatchUiEvent(type: string, payload?: any) {
    this.dispatchEvent(new CustomEvent('ui-event', { detail: { type, payload }, bubbles: true, composed: true }));
  }

  private handleUIEvent(e: CustomEvent<UiEventDetail>) {
    const { type, payload } = e.detail;

    switch (type) {
      case 'zoom-in': this.zoom = Math.min(2.0, this.zoom + 0.1); break;
      case 'zoom-out': this.zoom = Math.max(0.2, this.zoom - 0.1); break;
      case 'mode-change': this.mode = payload; break;
      case 'selection-change': this.selectedIds = payload; break;
      case 'block-id-change': this.blockId = payload; break;
      case 'rect-update': this.handleRectUpdate(payload); break;
      case 'projection-rotate': this.rotationY = payload; break;

      // AI / modal surface (kept compatible with the original prototype's event types)
      case 'ai-architect': this.modalState = { open: true, mode: 'architect', title: 'AI Architect', content: '' }; break;
      case 'ai-polish': this.modalState = { open: true, mode: 'polish', title: 'Magic Polish', content: '', contextId: payload }; break;
      case 'ai-summary': this.generateSummary(); break;
      case 'modal-close': this.modalState = { ...this.modalState, open: false }; break;
      case 'modal-submit': this.handleAiSubmit(payload); break;
    }
  }

  private async generateSummary() {
    if (!this.data) return;

    // Example prompt. Swap this out or enrich with real data as needed.
    const blockCount = this.data.layout_lg?.positions?.length || 0;
    const prompt = `Analyze this layout structure with ${blockCount} blocks. Provide a concise 2-sentence summary of its likely purpose and composition style.`;

    this.loading = true;
    try {
      const summary = await this.aiClient(prompt);
      this.modalState = { open: true, mode: 'result', title: '✨ Layout Summary', content: summary };
    } catch (e: any) {
      alert('AI Error: ' + e?.message);
    } finally {
      this.loading = false;
    }
  }

  private async handleAiSubmit(payload: any) {
    const { mode, input, contextId } = payload ?? {};
    this.modalState = { ...this.modalState, open: false };

    // This repo keeps "AI actions" as hooks rather than opinionated mutations.
    // Your app can listen for these and implement actual changes.
    this.dispatchUiEvent('ai-action', { mode, input, contextId, data: this.data });
  }

  private handleRectUpdate(updates: Array<{ id: string; rect: any }>) {
    if (!this.data) return;

    // Immutable update: clone and patch only positions
    const newData = structuredClone(this.data);
    const layoutKey = 'layout_lg';
    const positions = newData[layoutKey]?.positions || [];

    updates.forEach((update) => {
      const posIndex = positions.findIndex((p: any) => p._positionID === update.id);
      if (posIndex > -1) {
        positions[posIndex].x = update.rect.x;
        positions[posIndex].y = update.rect.y;
        positions[posIndex].w = update.rect.w;
        positions[posIndex].h = update.rect.h;
        positions[posIndex].z = update.rect.z;
      }
    });

    this.data = newData;
  }

  private async fetchData() {
    if (!this.src) return;

    this.loading = true;
    this.error = null;

    try {
      const response = await fetch(this.src);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      const json = await response.json();
      this.data = json;
      this.dispatchEvent(new CustomEvent('data-success', { detail: this.data, bubbles: true, composed: true }));
    } catch (err: any) {
      this.error = err?.message ?? String(err);
      console.error('VisualBlockData Error:', err);
      this.dispatchEvent(new CustomEvent('data-error', { detail: this.error, bubbles: true, composed: true }));
      alert(`Error: ${this.error}`);
    } finally {
      this.loading = false;
    }
  }

  private promptForId() { if (!this.loading) this.isPrompting = true; }
  private closePrompt() { this.isPrompting = false; }

  private submitId() {
    const input = this.shadowRoot?.querySelector<HTMLInputElement>('#block-id-input');
    const val = (input?.value ?? '7OWV6rmsjBcjce5DNVyA').trim();

    if (val.length > 0) {
      if (this.baseUrl && !val.startsWith('http') && !val.startsWith('/')) {
        const cleanBase = this.baseUrl.replace(/\/$/, '');
        this.src = `${cleanBase}/${val}`;
      } else {
        this.src = val;
      }
    }
    this.isPrompting = false;
  }

  render() {
    return html`
      <slot></slot>

      <button class="fab" @click=${() => this.promptForId()} ?disabled=${this.loading} title="Load">
        ${this.loading
          ? html`<div class="spinner"></div>`
          : html`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>`}
      </button>

      ${this.isPrompting
        ? html`
            <div class="modal-overlay" @click=${(e: MouseEvent) => { if (e.target === e.currentTarget) this.closePrompt(); }}>
              <div class="modal">
                <h3>Load Visual Block</h3>
                <input
                  id="block-id-input"
                  type="text"
                  placeholder="Enter Block ID"
                  value="7OWV6rmsjBcjce5DNVyA"
                  @keyup=${(e: KeyboardEvent) => (e.key === 'Enter' ? this.submitId() : null)}
                />
                <div class="modal-actions">
                  <button class="btn btn-cancel" @click=${() => this.closePrompt()}>Cancel</button>
                  <button class="btn btn-confirm" @click=${() => this.submitId()}>Load</button>
                </div>
              </div>
            </div>
          `
        : null}
    `;
  }
}

customElements.define('visual-block-data', VisualBlockData);

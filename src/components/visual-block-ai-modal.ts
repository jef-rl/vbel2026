import { LitElement, html, css } from 'lit';
import { ContextConsumer } from '@lit/context';
import { uiStateContext } from '../contexts.js';
import { Icons } from '../icons.js';

/**
 * <visual-block-ai-modal>
 *
 * Responsibility:
 * - Pure modal UI bound to provider-owned `modalState` (via uiStateContext).
 * - Emits `modal-close` and `modal-submit`.
 *
 * Rationale as a building block:
 * - The editor doesn't need to know *how* modals work.
 * - Apps can replace this with their own modal system without touching the editor.
 */
export class VisualBlockAiModal extends LitElement {
  static properties = { loading: { type: Boolean, state: true } };

  private uiState: any = { modalState: { open: false } };
  private _consumer = new ContextConsumer(this, {
    context: uiStateContext,
    subscribe: true,
    callback: (value) => {
      this.uiState = value ?? this.uiState;
      this.requestUpdate();
    },
  });

  loading = false;

  static styles = css`
    :host {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.5); z-index: 20000;
      display: flex; align-items: center; justify-content: center;
      backdrop-filter: blur(2px);
      opacity: 0; pointer-events: none; transition: opacity 0.2s;
    }
    :host(.open) { opacity: 1; pointer-events: auto; }
    .dialog {
      background: white; width: 400px; padding: 20px; border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
      display: flex; flex-direction: column; gap: 16px;
      transform: scale(0.95); transition: transform 0.2s;
    }
    :host(.open) .dialog { transform: scale(1); }
    h3 { margin: 0; font-size: 18px; display: flex; align-items: center; gap: 8px; color: #1e293b; }
    textarea {
      width: 100%; height: 100px; padding: 10px; border: 1px solid #e2e8f0;
      border-radius: 8px; font-family: inherit; font-size: 14px; resize: none; box-sizing: border-box;
    }
    textarea:focus { outline: 2px solid #4f46e5; border-color: transparent; }
    .result-box {
      padding: 15px; background: #f8fafc; border-radius: 8px;
      font-size: 14px; line-height: 1.5; color: #334155;
      max-height: 240px; overflow-y: auto;
    }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    button { padding: 8px 16px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; transition: background 0.1s; }
    .cancel { background: #f1f5f9; color: #64748b; }
    .cancel:hover { background: #e2e8f0; }
    .generate { background: #4f46e5; color: white; display: flex; align-items: center; gap: 6px; }
    .generate:hover { background: #4338ca; }
    .generate:disabled { opacity: 0.7; cursor: wait; }
    .spinner {
      width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%; border-top-color: white; animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;

  private dispatchUiEvent(type: string, payload: any = null) {
    this.dispatchEvent(new CustomEvent('ui-event', { detail: { type, payload }, bubbles: true, composed: true }));
  }

  private handleSubmit() {
    const modalState = this.uiState?.modalState ?? { open: false };
    const isResult = modalState.mode === 'result';
    const input = this.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea')?.value ?? '';

    if (!isResult && !input.trim()) return;

    this.loading = true;
    const payload = { mode: modalState.mode, input: input.trim(), contextId: modalState.contextId };
    this.dispatchUiEvent('modal-submit', payload);

    // UI nicety: reset local loading quickly; provider owns the real async work
    setTimeout(() => (this.loading = false), 400);
  }

  private close() {
    this.dispatchUiEvent('modal-close');
  }

  render() {
    const modalState = this.uiState?.modalState ?? { open: false };
    const open = !!modalState.open;

    if (open) this.classList.add('open');
    else this.classList.remove('open');

    const isResult = modalState.mode === 'result';
    const placeholder =
      modalState.mode === 'architect'
        ? 'e.g., Add a row of 3 feature cards with icons...'
        : 'e.g., Make it punchier, fix grammar...';

    return html`
      <div class="dialog">
        <h3>${Icons.Sparkles} ${modalState.title || 'AI Assistant'}</h3>

        ${isResult
          ? html`<div class="result-box">${modalState.content}</div>`
          : html`<textarea placeholder=${placeholder} ?disabled=${this.loading}></textarea>`}

        <div class="actions">
          <button class="cancel" @click=${() => this.close()}>Close</button>
          ${!isResult
            ? html`
                <button class="generate" @click=${() => this.handleSubmit()} ?disabled=${this.loading}>
                  ${this.loading ? html`<div class="spinner"></div>` : html`${Icons.Magic} Generate`}
                </button>
              `
            : null}
        </div>
      </div>
    `;
  }
}

customElements.define('visual-block-ai-modal', VisualBlockAiModal);

import { LitElement, html, css } from 'lit';
import { ContextConsumer } from '@lit/context';
import { styleMap } from 'lit/directives/style-map.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { editorContext } from '../contexts.js';
import { DEFAULT_CONTEXT } from '../defaults.js';

/**
 * <visual-block-projection>
 *
 * Responsibility:
 * - A lightweight 3D-ish "Y rotation" projection.
 * - Emits `projection-rotate` for drag gestures + a "reset view" action.
 *
 * Rationale as a building block:
 * - Projection is optional eye-candy. Keep it separate so core editor isn't coupled to it.
 * - Apps can reuse it as a read-only visualization elsewhere.
 */
export class VisualBlockProjection extends LitElement {
  private contextState: any = DEFAULT_CONTEXT;
  private _consumer = new ContextConsumer(this, {
    context: editorContext,
    subscribe: true,
    callback: (value) => {
      this.contextState = value ?? DEFAULT_CONTEXT;
      this.requestUpdate();
    },
  });

  private _dragStart: { x: number; initialRotation: number } | null = null;

  private _handleMouseMove = (e: MouseEvent) => this._onMouseMove(e);
  private _handleMouseUp = () => this._onMouseUp();

  static styles = css`
    :host { display: flex; flex-direction: column; gap: 20px; perspective: 1500px; margin-left: 0; align-items: center; cursor: grab; padding-bottom: 50px; position: relative; }
    :host(:active) { cursor: grabbing; }
    .overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2000; background: transparent; pointer-events: auto; }
    .controls {
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      padding: 8px 16px;
      border-radius: 20px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      display: flex; align-items: center; justify-content: center;
      gap: 8px;
      width: auto;
      z-index: 2001;
      user-select: none;
      pointer-events: auto;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }
    .controls:hover { background: white; transform: translateY(-1px); box-shadow: 0 6px 12px -2px rgba(0,0,0,0.15); }
    .controls span { font-size: 12px; font-weight: 600; color: #64748b; }
    .scene { position: relative; transform-style: preserve-3d; transition: transform 0.05s linear; pointer-events: none; background-color: #00000001; }
    .block {
      position: absolute; transform-style: preserve-3d; box-sizing: border-box; background: white;
      border: 1px solid rgba(0,0,0,0.1);
      transition: border 0.3s ease, box-shadow 0.3s ease;
      display: flex; align-items: center; justify-content: center; font-family: inherit;
      overflow: hidden; backface-visibility: hidden; pointer-events: none;
    }
    .block.selected { border: 1px solid #4f46e5; box-shadow: none; z-index: 1000 !important; }
  `;

  private dispatchUiEvent(type: string, payload: any = null) {
    this.dispatchEvent(new CustomEvent('ui-event', { detail: { type, payload }, bubbles: true, composed: true }));
  }

  private _onMouseDown(e: MouseEvent) {
    e.preventDefault();
    const startRot = this.contextState.rotationY ?? 0;
    this._dragStart = { x: e.clientX, initialRotation: startRot };
    window.addEventListener('mousemove', this._handleMouseMove);
    window.addEventListener('mouseup', this._handleMouseUp);
  }

  private _onMouseMove(e: MouseEvent) {
    if (!this._dragStart) return;
    const deltaX = e.clientX - this._dragStart.x;
    const newRot = Math.max(-70, Math.min(70, this._dragStart.initialRotation + deltaX * 0.2));
    this.dispatchUiEvent('projection-rotate', newRot);
  }

  private _onMouseUp() {
    this._dragStart = null;
    window.removeEventListener('mousemove', this._handleMouseMove);
    window.removeEventListener('mouseup', this._handleMouseUp);
  }

  render() {
    const { rects, blockData, containerSize, gridConfig, selectedIds, rotationY } = this.contextState;
    if (!containerSize || !gridConfig || !rects || Object.keys(rects).length === 0) return null;

    const { width, height } = containerSize;
    const { stepX, stepY } = gridConfig;
    const currentRotation = rotationY ?? 0;

    return html`
      <div class="controls" @click=${(e: MouseEvent) => { e.stopPropagation(); this.dispatchUiEvent('projection-rotate', 0); }} title="Click to Reset View">
        <span>Reset View</span>
      </div>

      <div class="overlay" @mousedown=${(e: MouseEvent) => this._onMouseDown(e)}></div>

      <div class="scene" style="width: ${width}px; height: ${height}px; transform: rotateY(${currentRotation}deg)">
        ${Object.values(rects).map((rect: any) => {
          const isSelected = (selectedIds ?? []).includes(rect.id);
          const data = blockData[rect.contentID];
          if (!data) return null;

          const zOffset = (rect.z || 0) * 4;
          const existingTransform = data.styler?.transform || '';
          const transform = `translateZ(${zOffset}px) ${existingTransform}`;

          const style: any = {
            ...(data.styler ?? {}),
            left: `${rect.x * stepX}px`,
            top: `${rect.y * stepY}px`,
            width: `${rect.w * stepX}px`,
            height: `${rect.h * stepY}px`,
            transform,
            zIndex: rect.z,
            position: 'absolute',
            boxSizing: 'border-box',
          };

          let inner = html``;
          let imgUrl: string | null = null;

          if (data.styler?.backgroundImage) {
            const bg = String(data.styler.backgroundImage);
            if (bg.includes('url(')) imgUrl = bg.slice(4, -1).replace(/["']/g, '');
            else if (bg !== 'none' && bg !== '') imgUrl = bg;
          }

          if (!imgUrl && data.ui?.content && (data.ui.content.startsWith('http') || data.ui.content.startsWith('data:image'))) {
            imgUrl = data.ui.content;
          }

          if (data.type === 'image' && imgUrl && !style.backgroundImage) {
            inner = html`<img src=${imgUrl} style="width:100%; height:100%; object-fit:cover;" draggable="false" />`;
          } else if (data.ui?.content && !data.ui.content.startsWith('http')) {
            inner = html`${unsafeHTML(String(data.ui.content).replace(/\n/g, '<br/>'))}`;
          }

          return html`<div class="block ${isSelected ? 'selected' : ''}" style=${styleMap(style)} draggable="false">${inner}</div>`;
        })}
      </div>
    `;
  }
}

customElements.define('visual-block-projection', VisualBlockProjection);

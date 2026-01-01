import { LitElement, html, css } from 'lit';
import { ContextConsumer } from '@lit/context';
import { styleMap } from 'lit/directives/style-map.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { editorContext } from '../contexts.js';
import { DEFAULT_CONTEXT } from '../defaults.js';

/**
 * <visual-block-preview>
 *
 * Responsibility:
 * - Small, simplified 2D projection (face-on) preview.
 *
 * Rationale as a building block:
 * - Preview is useful in inspectors, side panels, export pipelines.
 * - Keeping it separate lets apps include it only where needed.
 */
export class VisualBlockPreview extends LitElement {
  private contextState: any = DEFAULT_CONTEXT;

  private _consumer = new ContextConsumer(this, {
    context: editorContext,
    subscribe: true,
    callback: (value) => {
      this.contextState = value ?? DEFAULT_CONTEXT;
      this.requestUpdate();
    },
  });

  static styles = css`
    :host { display: block; margin-left: 60px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
    h4 { margin: 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
    .preview-frame { background: white; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); position: relative; overflow: hidden; transform-origin: top left; transition: width 0.2s, height 0.2s; }
    .preview-content { display: grid; }
    .block { box-sizing: border-box; display: flex; align-items: center; justify-content: center; overflow: hidden; min-width: 0; min-height: 0; }
    .block img { width: 100%; height: 100%; object-fit: cover; }
  `;

  render() {
    const { rects, blockData, containerSize, gridConfig } = this.contextState;
    if (!containerSize || !gridConfig || !rects || Object.keys(rects).length === 0) return null;

    const scale = 0.6;
    const { width, height } = containerSize;
    const { columns, rowHeight, padding } = gridConfig;

    let maxRowIndex = 0;
    Object.values(rects).forEach((r: any) => {
      if (r.y + r.h > maxRowIndex) maxRowIndex = r.y + r.h;
    });
    const rowCount = maxRowIndex > 0 ? maxRowIndex : 1;

    const containerStyle: any = {
      width: `${width}px`,
      height: `${height}px`,
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gridTemplateRows: `repeat(${rowCount}, ${rowHeight}px)`,
      padding: `${padding}px`,
      boxSizing: 'border-box',
    };

    return html`
      <h4>2D Projection (Face On)</h4>
      <div class="preview-frame" style="width: ${width * scale}px; height: ${height * scale}px;">
        <div class="preview-content" style=${styleMap(containerStyle)}>
          ${Object.values(rects).map((rect: any) => {
            const data = blockData[rect.contentID];
            if (!data) return null;

            const style: any = {
              ...(data.styler ?? {}),
              gridColumnStart: `${rect.x + 1}`,
              gridColumnEnd: `span ${rect.w}`,
              gridRowStart: `${rect.y + 1}`,
              gridRowEnd: `span ${rect.h}`,
              width: '100%',
              height: '100%',
              zIndex: rect.z,
              boxSizing: 'border-box',
              margin: 0,
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
              inner = html`<img src=${imgUrl} style="width:100%; height:100%; object-fit:cover;" />`;
            } else if (data.ui?.content && !data.ui.content.startsWith('http')) {
              inner = html`${unsafeHTML(String(data.ui.content).replace(/\n/g, '<br/>'))}`;
            }

            return html`<div class="block" style=${styleMap(style)}>${inner}</div>`;
          })}
        </div>
      </div>
    `;
  }
}

customElements.define('visual-block-preview', VisualBlockPreview);

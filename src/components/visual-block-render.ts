import { LitElement, html, css } from 'lit';
import { ContextConsumer } from '@lit/context';
import { styleMap } from 'lit/directives/style-map.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { editorContext } from '../contexts.js';
import { DEFAULT_CONTEXT } from '../defaults.js';

/**
 * <visual-block-render>
 *
 * Responsibility:
 * - The "real" content render: translates rects + blockData into a CSS grid.
 * - No editing behaviour; purely a renderer.
 *
 * Rationale as a building block:
 * - Reuse this as a standalone renderer in view-only surfaces (previews, emails, export).
 */
export class VisualBlockRender extends LitElement {
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
    :host { display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
    .render-container { width: 100%; height: 100%; display: grid; }
    .content-item { display: grid; font-family: inherit; min-width: 0; min-height: 0; }
  `;

  render() {
    const { rects, blockData, gridConfig } = this.contextState;
    if (!rects || Object.keys(rects).length === 0) return html``;

    const { columns, rowHeight, padding } = gridConfig;

    let maxRowIndex = 0;
    Object.values(rects).forEach((r: any) => {
      const rowEnd = r.y + r.h;
      if (rowEnd > maxRowIndex) maxRowIndex = rowEnd;
    });
    const rowCount = maxRowIndex > 0 ? maxRowIndex : 1;

    // Retrieve styles from various hierarchy levels
    // Level 1: Block Level (The root "block")
    const blockStyler = blockData.styler ?? {};

    // Level 2: Container Level (The "container" object)
    const containerStyler = blockData.container?.styler ?? {};

    // Level 3: Layout/Grid Level (The specific layout configuration, e.g., layout_lg)
    // Note: gridConfig already encapsulates some layout metrics, but there might be a styler on the layout object itself.
    // Assuming 'layout_lg' is the primary one used by the editor.
    const layoutStyler = blockData.layout_lg?.styler ?? {};

    const containerStyle: any = {
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gridTemplateRows: `repeat(${rowCount}, ${rowHeight}px)`,
      padding: `${padding}px`,
      boxSizing: 'border-box',
      // Merge styles for the main container wrapper if needed, but primarily we want inheritance
      ...blockStyler, // Apply block level styles to the grid container so they inherit down
      ...containerStyler, // Apply container level styles
      ...layoutStyler, // Apply layout level styles
    };

    return html`
      <div class="render-container" style=${styleMap(containerStyle)}>
        ${Object.values(rects).map((rect: any) => {
          const data = blockData[rect.contentID];
          if (!data) return null;

          // Level 4: Element/Rectangle Level
          const elementStyler = data.styler ?? {};

          const style: any = {
            ...elementStyler,
            gridColumnStart: `${rect.x + 1}`,
            gridColumnEnd: `span ${rect.w}`,
            gridRowStart: `${rect.y + 1}`,
            gridRowEnd: `span ${rect.h}`,
            width: '100%',
            height: '100%',
            position: 'relative',
            zIndex: rect.z,
            overflow: 'hidden',
            boxSizing: 'border-box',
            margin: 0,
          };

          let contentHtml = html``;
          let imgUrl: string | null = null;

          if (elementStyler.backgroundImage) {
            const bg = String(elementStyler.backgroundImage);
            if (bg.includes('url(')) imgUrl = bg.slice(4, -1).replace(/["']/g, '');
            else if (bg !== 'none' && bg !== '') imgUrl = bg;
          }

          if (!imgUrl && data.ui?.content && (data.ui.content.startsWith('http') || data.ui.content.startsWith('data:image'))) {
            imgUrl = data.ui.content;
          }

          if (data.type === 'image' && imgUrl && !style.backgroundImage) {
            contentHtml = html`<img src=${imgUrl} style="width:100%; height:100%; object-fit:cover;" />`;
          } else if (data.ui?.content && !data.ui.content.startsWith('http') && !data.ui.content.startsWith('data:image')) {
            contentHtml = html`${unsafeHTML(String(data.ui.content).replace(/\n/g, '<br/>'))}`;
          }

          return html`<div class="content-item" style=${styleMap(style)}>${contentHtml}</div>`;
        })}
      </div>
    `;
  }
}

customElements.define('visual-block-render', VisualBlockRender);

import { LitElement, html, css } from 'lit';
import { ContextConsumer } from '@lit/context';
import { editorContext } from '../contexts.js';
import { DEFAULT_CONTEXT } from '../defaults.js';

export class VisualBlockInspector extends LitElement {
  private contextState: any = DEFAULT_CONTEXT;

  private _consumer = new ContextConsumer(this, {
    context: editorContext,
    subscribe: true,
    callback: (value) => {
      console.log('[Inspector] Context updated:', value);
      this.contextState = value ?? DEFAULT_CONTEXT;
      this.requestUpdate();
    },
  });

  static styles = css`
    :host {
      display: block;
      width: 320px;
      background: white;
      border-left: 1px solid #e5e7eb;
      overflow-y: auto;
      padding: 20px;
      box-shadow: -4px 0 15px rgba(0,0,0,0.05);
      position: fixed;
      right: 0;
      top: 60px;
      bottom: 0;
      z-index: 2000;
      font-family: system-ui, -apple-system, sans-serif;
      transition: transform 0.2s ease-in-out;
    }
    
    :host([hidden]) {
      display: none;
    }

    h3 { margin-top: 0; font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 20px; border-bottom: 1px solid #f3f4f6; padding-bottom: 10px; }
    
    pre { 
      background: #f3f4f6; 
      padding: 12px; 
      border-radius: 6px; 
      overflow-x: auto; 
      font-size: 11px; 
      color: #374151;
      font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
      border: 1px solid #e5e7eb;
    }

    .prop-group { margin-bottom: 16px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; color: #6b7280; margin-bottom: 6px; }
    .value { font-size: 14px; color: #1f2937; word-break: break-word; }
    
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 50%;
        color: #9ca3af;
        font-size: 14px;
        text-align: center;
    }
  `;

  render() {
    console.log('[Inspector] Rendering. State:', this.contextState);
    const { selectedIds, blockData, rects } = this.contextState;

    if (!selectedIds || selectedIds.length === 0) {
      return html`<div class="empty-state">Select a block to inspect details</div>`;
    }

    if (selectedIds.length > 1) {
        return html`
            <h3>Selection</h3>
            <div class="prop-group">
                <div class="label">Count</div>
                <div class="value">${selectedIds.length} items selected</div>
            </div>
            <div class="prop-group">
                <div class="label">Selected IDs</div>
                <pre>${JSON.stringify(selectedIds, null, 2)}</pre>
            </div>
        `;
    }

    const id = selectedIds[0];
    const rect = rects ? rects[id] : null;
    
    if (!rect) {
        return html`
            <div class="empty-state">
                Selected item ID <b>${id}</b> not found in rects.<br>
                Rects count: ${rects ? Object.keys(rects).length : 0}
            </div>`;
    }

    const contentID = rect.contentID;
    
    let originalData = blockData ? blockData[contentID] : undefined;
    if (!originalData && blockData && blockData[id]) originalData = blockData[id];

    const stylerData = originalData?.styler;

    // Diagnostic information
    const dataKeys = blockData ? Object.keys(blockData).length : 0;
    const firstKey = blockData ? Object.keys(blockData)[0] : 'N/A';

    return html`
      <h3>Inspector</h3>
      
      <div class="prop-group">
        <div class="label">Position ID</div>
        <div class="value" style="font-family: monospace;">${id}</div>
      </div>

      <div class="prop-group">
        <div class="label">Content ID</div>
        <div class="value" style="font-family: monospace;">${contentID || 'undefined'}</div>
      </div>

      <div class="prop-group">
        <div class="label">Layout Geometry</div>
        <div class="value">
            X: ${rect.x} &nbsp; Y: ${rect.y}<br>
            W: ${rect.w} &nbsp; H: ${rect.h}<br>
            Z: ${rect.z}
        </div>
      </div>

      ${stylerData ? html`
        <div class="prop-group">
            <div class="label">Styler Properties</div>
            <pre>${JSON.stringify(stylerData, null, 2)}</pre>
        </div>
      ` : html`
        <div class="prop-group">
            <div class="label">Styler Data</div>
            <div class="value" style="color: #9ca3af;">
                ${originalData ? 'Object found but has no "styler" property.' : 'Data object not found.'}
            </div>
        </div>
        <div class="prop-group" style="margin-top: 20px; padding-top: 20px; border-top: 1px dashed #e5e7eb;">
            <div class="label">Debug Context</div>
            <div class="value" style="font-size: 11px; color: #6b7280;">
                BlockData Count: ${dataKeys}<br>
                First Key: ${firstKey}<br>
                Looking for: ${contentID || id}
            </div>
        </div>
      `}
    `;
  }
}

customElements.define('visual-block-inspector', VisualBlockInspector);

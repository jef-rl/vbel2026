import { LitElement, html, css } from 'lit';
import { ContextConsumer, ContextProvider } from '@lit/context';
import { styleMap } from 'lit/directives/style-map.js';
import { blockDataContext, uiStateContext, editorContext } from '../contexts.js';
import { DEFAULT_CONTEXT } from '../defaults.js';

/**
 * <visual-block-editor>
 *
 * Responsibility:
 * - Consume raw block data + ui state.
 * - Compute derived editor state: rects, grid metrics, container size.
 * - Provide the aggregated editorContext for render/overlay/preview/projection children.
 *
 * Rationale as a building block:
 * - This is the "orchestrator" between raw data and specialized subcomponents.
 * - It doesn't fetch data and it doesn't own UI state — which keeps it reusable.
 */
export class VisualBlockEditor extends LitElement {
  static properties = {
    rects: { type: Object, state: true },
    blockData: { type: Object, state: true },
    zoom: { type: Number, state: true },
    mode: { type: String, state: true },
    selectedIds: { type: Array, state: true },
    rotationY: { type: Number, state: true },
    layoutWidth: { type: Number, state: true },
    layoutCols: { type: Number, state: true },
    layoutRowHeight: { type: Number, state: true },
    containerStyles: { type: Object, state: true },
    padding: { type: Number, state: true },
  };

  rects: Record<string, any> = {};
  blockData: any = {};
  zoom = 1;
  mode = 'design';
  selectedIds: string[] = [];
  rotationY = 25;

  layoutWidth = 800;
  layoutCols = 36;
  layoutRowHeight = 15;
  padding = 50;
  containerStyles: Record<string, any> = {};

  private _provider = new ContextProvider(this, { context: editorContext, initialValue: DEFAULT_CONTEXT });

  private _dataConsumer = new ContextConsumer(this, {
    context: blockDataContext,
    subscribe: true,
    callback: (value) => {
      if (value) this._processLayoutData(value);
    },
  });

  private _uiConsumer = new ContextConsumer(this, {
    context: uiStateContext,
    subscribe: true,
    callback: (value) => {
      if (!value) return;
      this.zoom = value.zoom ?? this.zoom;
      this.mode = value.mode ?? this.mode;
      this.selectedIds = value.selectedIds ?? this.selectedIds;
      this.rotationY = value.rotationY ?? this.rotationY;
      this.requestUpdate();
    },
  });

  protected updated(changed: Map<string, any>) {
    const keys = [
      'rects', 'blockData', 'zoom', 'mode', 'selectedIds',
      'layoutWidth', 'layoutCols', 'layoutRowHeight', 'rotationY',
      'containerStyles', 'padding'
    ];
    if (keys.some((k) => changed.has(k))) this._updateContext();
  }

  private _updateContext() {
    this._provider.setValue({
      rects: this.rects,
      blockData: this.blockData,
      mode: this.mode,
      zoom: this.zoom,
      selectedIds: this.selectedIds,
      gridConfig: this.gridConfig,
      containerSize: this.containerSize,
      rotationY: this.rotationY,
    });
  }

  private _processLayoutData(data: any) {
    this.blockData = data;

    const layoutKey = 'layout_lg';
    const layoutData = data[layoutKey] || {};

    this.layoutWidth = parseInt(layoutData.maxWidth) || 800;
    this.layoutCols = parseInt(layoutData.columns) || 36;
    this.layoutRowHeight = parseInt(layoutData.styler?.gridAutoRows) || 15;

    this.containerStyles = data.container?.styler || {};

    // Build rect lookup
    const loaded: Record<string, any> = {};
    if (layoutData.positions) {
      layoutData.positions.forEach((posRef: any) => {
        let pos = posRef;
        if (pos.x === undefined && pos._positionID && data[pos._positionID]) pos = data[pos._positionID];
        if (pos && typeof pos.x !== 'undefined') {
          loaded[pos._positionID] = {
            id: pos._positionID,
            contentID: pos._contentID,
            x: pos.x,
            y: pos.y,
            w: pos.w,
            h: pos.h,
            z: pos.z || 0,
          };
        }
      });
    }

    this.rects = loaded;
    this.requestUpdate();
  }

  get gridConfig() {
    const currentWidth = this.layoutWidth || 800;
    const currentCols = this.layoutCols || 36;
    const currentRowHeight = this.layoutRowHeight || 15;

    const colWidth = currentWidth / currentCols;

    return {
      mode: this.mode,
      stepX: colWidth,
      stepY: currentRowHeight,
      columns: currentCols,
      gutter: 0,
      rowHeight: currentRowHeight,
      padding: this.padding,
      minWidth: colWidth,
      minHeight: currentRowHeight,
    };
  }

  get containerSize() {
    let maxRowIndex = 0;
    Object.values(this.rects).forEach((r: any) => {
      if (r.y + r.h > maxRowIndex) maxRowIndex = r.y + r.h;
    });

    const contentH = maxRowIndex * (this.layoutRowHeight || 15) + this.padding * 2;

    return {
      width: (this.layoutWidth || 800) + this.padding * 2,
      height: contentH,
    };
  }

  private dispatchUiEvent(type: string, payload: any = null) {
    this.dispatchEvent(new CustomEvent('ui-event', { detail: { type, payload }, bubbles: true, composed: true }));
  }

  private handleBackgroundClick() {
    if (this.mode === 'design') this.dispatchUiEvent('selection-change', []);
  }

  render() {
    const { width, height } = this.containerSize;
    const containerStyle: any = {
      ...this.containerStyles,
      width: `${width}px`,
      height: `${height}px`,
      transform: `scale(${this.zoom})`,
      transformOrigin: 'top left',
      position: 'relative',
      boxSizing: 'border-box',
    };

    const hasContent = this.rects && Object.keys(this.rects).length > 0;
    if (this.mode === 'design') containerStyle.minHeight = `${height}px`;

    return html`
      <div class="app">
        <visual-block-toolbar></visual-block-toolbar>

        <div class="viewport" @mousedown=${() => this.handleBackgroundClick()}>
          <div class="canvas" style=${styleMap(containerStyle)}>
            <visual-block-render></visual-block-render>
            <visual-block-grid></visual-block-grid>
          </div>

          <visual-block-preview></visual-block-preview>

          ${hasContent ? html`<visual-block-projection></visual-block-projection>` : null}
        </div>

        <visual-block-ai-modal></visual-block-ai-modal>
      </div>
    `;
  }

  static styles = css`
    :host { display: block; width: 100%; height: 100%; background: #f3f4f6; color: #333; }
    .app { display: flex; flex-direction: column; height: 100%; }
    .viewport {
      flex: 1;
      overflow: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px;
      position: relative;
      gap: 40px;
    }
    .canvas {
      background: white;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      transform-origin: top center;
      transition: height 0.2s, transform 0.1s;
      position: relative;
    }
  `;
}

customElements.define('visual-block-editor', VisualBlockEditor);

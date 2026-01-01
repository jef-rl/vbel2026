import { LitElement, html, css } from 'lit';
import { ContextConsumer } from '@lit/context';
import { styleMap } from 'lit/directives/style-map.js';
import { editorContext } from '../contexts.js';
import { DEFAULT_CONTEXT } from '../defaults.js';
import { clampGrid } from '../utils/grid.js';

/**
 * <visual-block-grid>
 *
 * Responsibility:
 * - The edit overlay: selection, drag-move, resize, z-index wheel.
 * - Never mutates layout directly. Emits `rect-update` with patches.
 *
 * Rationale as a building block:
 * - All "interaction surface" logic lives here, separate from rendering and data fetching.
 * - Apps can replace the interaction layer (e.g. different UX) without touching the renderer/editor.
 */
export class VisualBlockGrid extends LitElement {
  static properties = {
    hoveredId: { type: String, state: true },
    ghost: { attribute: false, state: true },
  };

  private contextState: any = DEFAULT_CONTEXT;
  private _consumer = new ContextConsumer(this, {
    context: editorContext,
    subscribe: true,
    callback: (value) => {
      this.contextState = value ?? DEFAULT_CONTEXT;
      this.requestUpdate();
    },
  });

  hoveredId: string | null = null;
  ghost: any = null;

  private handleWindowMouseMove = (e: MouseEvent) => this._handleWindowMouseMove(e);
  private handleWindowMouseUp = () => this._handleWindowMouseUp();
  private handleHostMouseDown = (e: MouseEvent) => this._handleHostMouseDown(e);
  private handleWheel = (e: WheelEvent) => this._handleWheel(e);

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('mousemove', this.handleWindowMouseMove);
    window.addEventListener('mouseup', this.handleWindowMouseUp);
    this.addEventListener('mousedown', this.handleHostMouseDown);
    this.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousemove', this.handleWindowMouseMove);
    window.removeEventListener('mouseup', this.handleWindowMouseUp);
    this.removeEventListener('mousedown', this.handleHostMouseDown);
    this.removeEventListener('wheel', this.handleWheel);
  }

  private dispatchUiEvent(type: string, payload: any = null) {
    this.dispatchEvent(new CustomEvent('ui-event', { detail: { type, payload }, bubbles: true, composed: true }));
  }

  private getMouseCoords(e: MouseEvent) {
    const rect = this.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / this.contextState.zoom, y: (e.clientY - rect.top) / this.contextState.zoom };
  }

  private getGridCoords(x: number, y: number) {
    const { padding, stepX, stepY } = this.contextState.gridConfig;
    return { gridX: Math.floor((x - padding) / stepX), gridY: Math.floor((y - padding) / stepY) };
  }

  private _handleWheel(e: WheelEvent) {
    const { mode, selectedIds, rects } = this.contextState;
    if (mode !== 'design' || !selectedIds?.length) return;

    e.preventDefault();
    e.stopPropagation();

    const direction = e.deltaY > 0 ? 'up' : 'down';
    const updates: any[] = [];

    selectedIds.forEach((id: string) => {
      const rect = rects[id];
      if (!rect) return;
      const z = direction === 'up' ? (rect.z || 0) + 1 : Math.max(0, (rect.z || 0) - 1);
      updates.push({ id, rect: { ...rect, z } });
    });

    if (updates.length) this.dispatchUiEvent('rect-update', updates);
  }

  private _handleHostMouseDown(_e: MouseEvent) {
    const { mode } = this.contextState;
    if (mode !== 'design') return;
    this.dispatchUiEvent('selection-change', []);
    this.ghost = null;
  }

  private handleMouseDownItem(e: MouseEvent, clickedId: string, type: 'MOVE' | 'RESIZE', direction = 'se') {
    const { mode, selectedIds, rects } = this.contextState;
    if (mode !== 'design') return;

    e.stopPropagation();
    e.preventDefault();

    const { x, y } = this.getMouseCoords(e);

    let newSelection: string[] = [...(selectedIds ?? [])];
    if (e.ctrlKey || e.metaKey) {
      if (newSelection.includes(clickedId)) newSelection = newSelection.filter((id) => id !== clickedId);
      else newSelection.push(clickedId);
    } else if (!newSelection.includes(clickedId)) {
      newSelection = [clickedId];
    }

    this.dispatchUiEvent('selection-change', newSelection);

    const ghostItems: any = {};
    newSelection.forEach((id) => {
      if (rects[id]) ghostItems[id] = { originalRect: { ...rects[id] }, currentRect: { ...rects[id] } };
    });

    this.ghost = {
      primaryId: clickedId,
      type,
      resizeDir: direction,
      startMouse: { x, y },
      items: ghostItems,
      wasDragged: false,
    };
  }

  private _handleWindowMouseMove(e: MouseEvent) {
    if (!this.ghost) return;

    const { gridConfig } = this.contextState;
    const { x, y } = this.getMouseCoords(e);

    const deltaX = x - this.ghost.startMouse.x;
    const deltaY = y - this.ghost.startMouse.y;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) this.ghost.wasDragged = true;

    const gridDeltaX = Math.round(deltaX / gridConfig.stepX);
    const gridDeltaY = Math.round(deltaY / gridConfig.stepY);

    if (this.ghost.type === 'MOVE') {
      Object.keys(this.ghost.items).forEach((id) => {
        const item = this.ghost.items[id];
        const orig = item.originalRect;
        const constrained = clampGrid({ ...orig, x: orig.x + gridDeltaX, y: orig.y + gridDeltaY }, gridConfig.columns);
        this.ghost.items[id].currentRect = { ...orig, ...constrained };
      });
      this.requestUpdate();
      return;
    }

    if (this.ghost.type === 'RESIZE') {
      const dir = this.ghost.resizeDir || 'se';
      const orig = this.ghost.items[this.ghost.primaryId].originalRect;

      let newW = orig.w, newH = orig.h, newX = orig.x, newY = orig.y;

      if (dir.includes('e')) newW = Math.max(1, orig.w + gridDeltaX);
      else if (dir.includes('w')) {
        const diff = Math.min(orig.w - 1, gridDeltaX);
        newW = orig.w - diff;
        newX = orig.x + diff;
      }

      if (dir.includes('s')) newH = Math.max(1, orig.h + gridDeltaY);
      else if (dir.includes('n')) {
        const diff = Math.min(orig.h - 1, gridDeltaY);
        newH = orig.h - diff;
        newY = orig.y + diff;
      }

      const constrained = clampGrid({ x: newX, y: newY, w: newW, h: newH }, gridConfig.columns);
      this.ghost.items[this.ghost.primaryId].currentRect = { ...orig, ...constrained };
      this.requestUpdate();
    }
  }

  private _handleWindowMouseUp() {
    if (!this.ghost) return;

    const { rects, selectedIds } = this.contextState;

    if (this.ghost.type === 'MOVE') {
      if (!this.ghost.wasDragged && (selectedIds?.length ?? 0) <= 1) {
        const { x, y } = this.ghost.startMouse;
        const { gridX, gridY } = this.getGridCoords(x, y);

        const hitRects = Object.values(rects)
          .filter((r: any) => gridX >= r.x && gridX < r.x + r.w && gridY >= r.y && gridY < r.y + r.h)
          .sort((a: any, b: any) => (b.z || 0) - (a.z || 0)) as any[];

        if (hitRects.length > 1) {
          const currentIndex = hitRects.findIndex((r: any) => r.id === this.ghost.primaryId);
          const nextIndex = (currentIndex + 1) % hitRects.length;
          this.dispatchUiEvent('selection-change', [hitRects[nextIndex].id]);
        }
      } else {
        const updates = Object.keys(this.ghost.items).map((id) => ({ id, rect: this.ghost.items[id].currentRect }));
        this.dispatchUiEvent('rect-update', updates);
      }
    }

    if (this.ghost.type === 'RESIZE') {
      const updates = Object.keys(this.ghost.items).map((id) => ({ id, rect: this.ghost.items[id].currentRect }));
      this.dispatchUiEvent('rect-update', updates);
    }

    this.ghost = null;
  }

  render() {
    const { rects, selectedIds, mode, gridConfig } = this.contextState;
    if (!rects || Object.keys(rects).length === 0) return html``;
    if (mode !== 'design') return html``;

    const { columns, rowHeight, padding } = gridConfig;

    // Determine max row count by checking rects AND active ghost rects
    let maxRowIndex = 0;
    Object.values(rects).forEach((r: any) => (maxRowIndex = Math.max(maxRowIndex, r.y + r.h)));
    if (this.ghost?.items) {
      Object.values(this.ghost.items).forEach((item: any) => (maxRowIndex = Math.max(maxRowIndex, item.currentRect.y + item.currentRect.h)));
    }
    const rowCount = maxRowIndex > 0 ? maxRowIndex : 52;

    const gridOverlayStyle: any = {
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gridTemplateRows: `repeat(${rowCount}, ${rowHeight}px)`,
      padding: `${padding}px`,
      boxSizing: 'border-box',
      width: '100%',
      height: '100%',
    };

    const gridLines: any[] = [];
    for (let c = 1; c <= columns; c++) gridLines.push(html`<div class="line-v" style="grid-column: ${c}; justify-self: start;"></div>`);
    gridLines.push(html`<div class="line-v" style="grid-column: ${columns}; justify-self: end;"></div>`);

    for (let r = 1; r <= rowCount; r++) gridLines.push(html`<div class="line-h" style="grid-row: ${r}; align-self: start;"></div>`);
    gridLines.push(html`<div class="line-h" style="grid-row: ${rowCount}; align-self: end;"></div>`);

    return html`
      <div class="grid-overlay" style=${styleMap(gridOverlayStyle)}>
        ${gridLines}

        ${Object.values(rects).map((rect: any) => {
          const isSelected = (selectedIds ?? []).includes(rect.id);
          const isHovered = this.hoveredId === rect.id;

          // Hide originals when moving (the ghost is shown instead)
          if (this.ghost?.type === 'MOVE' && this.ghost.items?.[rect.id]) return null;

          let borderColor = 'transparent';
          let zIndex = (rect.z || 0) + 50;
          let bgColor = 'transparent';

          if (isSelected) { borderColor = 'rgba(79, 70, 229, 0.8)'; zIndex = 1000; }
          else if (isHovered) { bgColor = 'rgba(79, 70, 229, 0.1)'; borderColor = 'rgba(79, 70, 229, 0.5)'; zIndex = 900; }

          const rectStyle: any = {
            gridColumnStart: `${rect.x + 1}`,
            gridColumnEnd: `span ${rect.w}`,
            gridRowStart: `${rect.y + 1}`,
            gridRowEnd: `span ${rect.h}`,
            width: '100%',
            height: '100%',
            backgroundColor: bgColor,
            borderColor,
            zIndex,
          };

          return html`
            <div
              class="wireframe ${isSelected ? 'selected' : ''}"
              style=${styleMap(rectStyle)}
              @mousedown=${(e: MouseEvent) => this.handleMouseDownItem(e, rect.id, 'MOVE')}
              @mouseenter=${() => (this.hoveredId = rect.id)}
              @mouseleave=${() => (this.hoveredId = null)}
            >
              ${isSelected
                ? html`
                    <div class="badge">Block</div>
                    ${(selectedIds?.length ?? 0) === 1
                      ? html`
                          <div class="handle nw" @mousedown=${(e: MouseEvent) => this.handleMouseDownItem(e, rect.id, 'RESIZE', 'nw')}></div>
                          <div class="handle ne" @mousedown=${(e: MouseEvent) => this.handleMouseDownItem(e, rect.id, 'RESIZE', 'ne')}></div>
                          <div class="handle sw" @mousedown=${(e: MouseEvent) => this.handleMouseDownItem(e, rect.id, 'RESIZE', 'sw')}></div>
                          <div class="handle se" @mousedown=${(e: MouseEvent) => this.handleMouseDownItem(e, rect.id, 'RESIZE', 'se')}></div>
                        `
                      : null}
                  `
                : null}
            </div>
          `;
        })}

        ${this.ghost
          ? Object.values(this.ghost.items).map((item: any) => {
              const rect = item.currentRect;
              const ghostStyle: any = {
                gridColumnStart: `${rect.x + 1}`,
                gridColumnEnd: `span ${rect.w}`,
                gridRowStart: `${rect.y + 1}`,
                gridRowEnd: `span ${rect.h}`,
                width: '100%',
                height: '100%',
                zIndex: 1001,
                backgroundColor: 'rgba(79, 70, 229, 0.2)',
                border: '1px dashed #4f46e5',
                position: 'relative',
              };
              return html`<div class="ghost" style=${styleMap(ghostStyle)}></div>`;
            })
          : null}
      </div>
    `;
  }

  static styles = css`
    :host { position: absolute; inset: 0; pointer-events: none; }
    .wireframe, .handle { pointer-events: auto; }
    .grid-overlay { display: grid; width: 100%; height: 100%; pointer-events: auto; }

    .wireframe {
      position: relative;
      border: 1px solid transparent;
      cursor: grab;
      box-sizing: border-box;
      transition: background-color 0.1s, border-color 0.1s;
    }
    .wireframe:active { cursor: grabbing; }
    .wireframe.selected { border: 1px solid #4f46e5; }

    .line-v { grid-row: 1 / -1; width: 1px; background-color: rgba(0, 0, 0, 0.1); pointer-events: none; }
    .line-h { grid-column: 1 / -1; height: 1px; background-color: rgba(0, 0, 0, 0.1); pointer-events: none; }

    .badge {
      position: absolute;
      top: -14px;
      left: 50%;
      transform: translateX(-50%);
      background: rgb(79, 70, 229);
      color: white;
      font-size: 10px;
      padding: 0px 6px;
      border-radius: 4px 4px 0 0;
      font-weight: bold;
      text-transform: uppercase;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0.9;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .handle {
      position: absolute;
      width: 8px;
      height: 8px;
      background: #4f46e5;
      border: 1px solid white;
      box-shadow: 0 1px 2px rgba(0,0,0,0.2);
      z-index: 70;
      pointer-events: auto;
    }
    .handle.nw { top: -5px; left: -5px; cursor: nw-resize; }
    .handle.ne { top: -5px; right: -5px; cursor: ne-resize; }
    .handle.sw { bottom: -5px; left: -5px; cursor: sw-resize; }
    .handle.se { bottom: -5px; right: -5px; cursor: se-resize; }

    .ghost { pointer-events: none; }
  `;
}

customElements.define('visual-block-grid', VisualBlockGrid);

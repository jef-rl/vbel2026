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
 * - Marquee selection (click-drag on background).
 * - Never mutates layout directly. Emits `rect-update` with patches.
 */
export class VisualBlockGrid extends LitElement {
  static properties = {
    hoveredId: { type: String, state: true },
    ghost: { attribute: false, state: true },
    marquee: { attribute: false, state: true },
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
  marquee: { x1: number; y1: number; x2: number; y2: number } | null = null;

  private handleWindowMouseMove = (e: MouseEvent) => this._handleWindowMouseMove(e);
  private handleWindowMouseUp = (e: MouseEvent) => this._handleWindowMouseUp(e);
  private handleGridMouseDown = (e: MouseEvent) => this._handleGridMouseDown(e); 
  private handleWheel = (e: WheelEvent) => this._handleWheel(e);

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('mousemove', this.handleWindowMouseMove, { passive: false });
    window.addEventListener('mouseup', this.handleWindowMouseUp, { passive: false });
    this.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousemove', this.handleWindowMouseMove);
    window.removeEventListener('mouseup', this.handleWindowMouseUp);
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

    const isIncreasing = e.deltaY > 0; // Wheel down = increase Z, Wheel up = decrease Z
    
    // 1. Find all rectangles that are actually overlapping the CURRENT selection
    // For simplicity, we'll check overlap with the first selected item, or all selected items as a group.
    // Let's use the first selected item's geometry as the anchor for the "stack".
    const anchorId = selectedIds[0];
    const anchorRect = rects[anchorId];
    if (!anchorRect) return;

    const allRects = Object.values(rects) as any[];
    
    // Filter to ONLY those rectangles that intersect with our anchor
    const stackRects = allRects.filter(r => {
        return r.x < anchorRect.x + anchorRect.w &&
               r.x + r.w > anchorRect.x &&
               r.y < anchorRect.y + anchorRect.h &&
               r.y + r.h > anchorRect.y;
    }).sort((a, b) => (a.z || 0) - (b.z || 0));

    // Now perform the swap logic ONLY within this stack
    const selectedInStack = stackRects.filter(r => selectedIds.includes(r.id));
    if (selectedInStack.length === 0) return;

    const updates: any[] = [];

    if (isIncreasing) {
      const highestSelected = selectedInStack[selectedInStack.length - 1];
      const highestIdx = stackRects.findIndex(r => r.id === highestSelected.id);
      
      if (highestIdx < stackRects.length - 1) {
        const targetRect = stackRects[highestIdx + 1];
        const lowestSelectedZ = selectedInStack[0].z || 0;
        const targetZ = targetRect.z || 0;
        const shift = Math.max(1, (targetZ - lowestSelectedZ) + 1);

        selectedInStack.forEach(r => {
          updates.push({ id: r.id, rect: { ...r, z: (r.z || 0) + shift } });
        });
        updates.push({ id: targetRect.id, rect: { ...targetRect, z: lowestSelectedZ } });
      }
    } else {
      const lowestSelected = selectedInStack[0];
      const lowestIdx = stackRects.findIndex(r => r.id === lowestSelected.id);
      
      if (lowestIdx > 0) {
        const targetRect = stackRects[lowestIdx - 1];
        const highestSelectedZ = selectedInStack[selectedInStack.length - 1].z || 0;
        const targetZ = targetRect.z || 0;
        const shift = Math.max(1, (highestSelectedZ - targetZ) + 1);

        selectedInStack.forEach(r => {
          updates.push({ id: r.id, rect: { ...r, z: Math.max(0, (r.z || 0) - shift) } });
        });
        updates.push({ id: targetRect.id, rect: { ...targetRect, z: highestSelectedZ } });
      }
    }

    if (updates.length) {
      this.dispatchUiEvent('rect-update', updates);
    }
  }

  private _handleGridMouseDown(e: MouseEvent) {
    const { mode, selectedIds, rects } = this.contextState;
    if (mode !== 'design') return;

    e.stopPropagation();
    e.preventDefault();

    const { x, y } = this.getMouseCoords(e);
    const { gridX, gridY } = this.getGridCoords(x, y);

    const path = e.composedPath();
    let primaryIdToSelect: string | null = null;
    let interactionType: 'MOVE' | 'RESIZE' | 'MARQUEE' = 'MARQUEE';
    let resizeDirection: string | undefined;

    // 1. Check if a resize handle was clicked
    const clickedHandle = path.find((el: EventTarget) => (el instanceof Element) && el.classList.contains('handle')) as (Element | undefined);
    if (clickedHandle) {
        const wireframeElement = path.find((el: EventTarget) => (el instanceof Element) && el.classList.contains('wireframe')) as (HTMLElement | undefined);
        if (wireframeElement && wireframeElement.dataset.id) {
            primaryIdToSelect = wireframeElement.dataset.id;
            interactionType = 'RESIZE';
            resizeDirection = Array.from(clickedHandle.classList).find(cls => cls !== 'handle');
        }
    }

    // 2. If no handle, check if a wireframe was clicked (Z-index aware)
    if (!primaryIdToSelect) {
        const hitRects = Object.values(rects)
          .filter((r: any) => gridX >= r.x && gridX < r.x + r.w && gridY >= r.y && gridY < r.y + r.h)
          .sort((a: any, b: any) => (b.z || 0) - (a.z || 0)) as any[];
        
        if (hitRects.length > 0) {
            primaryIdToSelect = hitRects[0].id; // Topmost rect by Z-index
            interactionType = 'MOVE';
        }
    }

    const originalSelectedIds = [...(selectedIds ?? [])];

    // Update selection based on interaction type and modifier keys
    let newSelection: string[] = [...originalSelectedIds];
    if (interactionType === 'MOVE' && primaryIdToSelect) {
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            if (newSelection.includes(primaryIdToSelect)) newSelection = newSelection.filter((id) => id !== primaryIdToSelect);
            else newSelection.push(primaryIdToSelect);
        } else if (!newSelection.includes(primaryIdToSelect)) {
            newSelection = [primaryIdToSelect];
        }
    } else if (interactionType === 'RESIZE' && primaryIdToSelect) {
        newSelection = [primaryIdToSelect];
    } else if (interactionType === 'MARQUEE') {
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
            newSelection = []; 
        }
    }

    this.dispatchUiEvent('selection-change', newSelection);

    if (interactionType === 'MARQUEE') {
        this.ghost = null;
        this.marquee = { x1: x, y1: y, x2: x, y2: y };
    } else if (primaryIdToSelect) {
        const ghostItems: any = {};
        newSelection.forEach((id) => {
            if (rects[id]) ghostItems[id] = { originalRect: { ...rects[id] }, currentRect: { ...rects[id] } };
        });

        this.ghost = {
            primaryId: primaryIdToSelect,
            originalSelectedIds, 
            type: interactionType,
            resizeDir: resizeDirection,
            startMouse: { x, y },
            items: ghostItems,
            wasDragged: false,
        };
        this.marquee = null;
    } else {
        this.ghost = null;
        this.marquee = null;
    }
  }

  private _handleWindowMouseMove(e: MouseEvent) {
    if (this.marquee) {
        const { x, y } = this.getMouseCoords(e);
        this.marquee = { ...this.marquee, x2: x, y2: y };
        this.requestUpdate();
        return;
    }

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

  private _handleWindowMouseUp(e: MouseEvent) {
    const { rects, selectedIds, gridConfig } = this.contextState;

    if (this.marquee) {
        const { x1, y1, x2, y2 } = this.marquee;
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x1 - x2);
        const height = Math.abs(y1 - y2);
        const { padding, stepX, stepY } = gridConfig;
        const newlySelected: string[] = e.ctrlKey || e.metaKey || e.shiftKey ? [...selectedIds] : [];
        
        if (width > 2 || height > 2) {
            Object.values(rects).forEach((r: any) => {
                const rLeft = padding + r.x * stepX;
                const rTop = padding + r.y * stepY;
                const rRight = rLeft + r.w * stepX;
                const rBottom = rTop + r.h * stepY;
                if (rLeft < (left + width) && rRight > left && rTop < (top + height) && rBottom > top) {
                    if (!newlySelected.includes(r.id)) newlySelected.push(r.id);
                }
            });
            this.dispatchUiEvent('selection-change', newlySelected);
        }
        this.marquee = null;
        this.ghost = null;
        return;
    }

    if (!this.ghost) return;

    if (this.ghost.type === 'MOVE') {
      if (!this.ghost.wasDragged) { 
        const { x, y } = this.ghost.startMouse;
        const { gridX, gridY } = this.getGridCoords(x, y);
        const hitRects = Object.values(rects)
          .filter((r: any) => gridX >= r.x && gridX < r.x + r.w && gridY >= r.y && gridY < r.y + r.h)
          .sort((a: any, b: any) => (b.z || 0) - (a.z || 0)) as any[];

        if (hitRects.length > 0) {
          let newSelection: string[] = [...(selectedIds ?? [])];
          const currentPrimarySelectedId = this.ghost.primaryId; 
          if (!(e.ctrlKey || e.metaKey || e.shiftKey)) { 
            const wasAlreadySelected = this.ghost.originalSelectedIds.includes(currentPrimarySelectedId);
            if (wasAlreadySelected) {
                const currentIndexInHitRects = hitRects.findIndex((r: any) => r.id === currentPrimarySelectedId);
                const nextIndex = (currentIndexInHitRects + 1) % hitRects.length;
                newSelection = [hitRects[nextIndex].id];
                this.dispatchUiEvent('selection-change', newSelection);
            }
          }
        } else if (!(e.ctrlKey || e.metaKey || e.shiftKey)) {
          this.dispatchUiEvent('selection-change', []);
        }
      } else { 
        const updates = Object.keys(this.ghost.items).map((id) => ({ id, rect: this.ghost.items[id].currentRect }));
        this.dispatchUiEvent('rect-update', updates);
      }
    }

    if (this.ghost.type === 'RESIZE' && this.ghost.wasDragged) {
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

    let marqueeStyle = {};
    if (this.marquee) {
        const left = Math.min(this.marquee.x1, this.marquee.x2);
        const top = Math.min(this.marquee.y1, this.marquee.y2);
        const width = Math.abs(this.marquee.x1 - this.marquee.x2);
        const height = Math.abs(this.marquee.y1 - this.marquee.y2);
        marqueeStyle = { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` };
    }

    return html`
      <div class="grid-overlay" style=${styleMap(gridOverlayStyle)} @mousedown=${this.handleGridMouseDown}>
        ${gridLines}

        ${Object.values(rects).map((rect: any) => {
          const isSelected = (selectedIds ?? []).includes(rect.id);
          const isHovered = this.hoveredId === rect.id;
          if (this.ghost?.type === 'MOVE' && this.ghost.items?.[rect.id]) return null;

          let borderColor = 'transparent';
          let zIndex = (rect.z || 0) + 1000; 
          let bgColor = 'transparent';

          if (isSelected) { borderColor = 'rgba(79, 70, 229, 0.8)'; zIndex += 500; }
          else if (isHovered) { bgColor = 'rgba(79, 70, 229, 0.1)'; borderColor = 'rgba(79, 70, 229, 0.5)'; }

          const rectStyle: any = {
            gridColumnStart: `${rect.x + 1}`,
            gridColumnEnd: `span ${rect.w}`,
            gridRowStart: `${rect.y + 1}`,
            gridRowEnd: `span ${rect.h}`,
            width: '100%', height: '100%', backgroundColor: bgColor, borderColor, zIndex,
          };

          return html`
            <div class="wireframe ${isSelected ? 'selected' : ''}" style=${styleMap(rectStyle)} data-id=${rect.id} 
              @mouseenter=${() => (this.hoveredId = rect.id)} @mouseleave=${() => (this.hoveredId = null)}>
              ${isSelected
                ? html`<div class="badge">Block</div>
                    ${(selectedIds?.length ?? 0) === 1
                      ? html`<div class="handle nw" data-direction="nw"></div><div class="handle ne" data-direction="ne"></div>
                          <div class="handle sw" data-direction="sw"></div><div class="handle se" data-direction="se"></div>`
                      : null}`
                : null}
            </div>`;
        })}

        ${this.ghost
          ? Object.values(this.ghost.items).map((item: any) => {
              const rect = item.currentRect;
              const ghostStyle: any = {
                gridColumnStart: `${rect.x + 1}`, gridColumnEnd: `span ${rect.w}`,
                gridRowStart: `${rect.y + 1}`, gridRowEnd: `span ${rect.h}`,
                width: '100%', height: '100%', zIndex: 3000, backgroundColor: 'rgba(79, 70, 229, 0.2)',
                border: '1px dashed #4f46e5', position: 'relative',
              };
              return html`<div class="ghost" style=${styleMap(ghostStyle)}></div>`;
            })
          : null}

          ${this.marquee ? html`<div class="marquee" style=${styleMap(marqueeStyle)}></div>` : null}
      </div>`;
  }

  static styles = css`
    :host { position: absolute; inset: 0; pointer-events: none; }
    .wireframe, .handle { pointer-events: auto; }
    .grid-overlay { display: grid; width: 100%; height: 100%; pointer-events: auto; position: relative; }
    .wireframe { position: relative; border: 1px solid transparent; cursor: grab; box-sizing: border-box; transition: background-color 0.1s, border-color 0.1s; }
    .wireframe:active { cursor: grabbing; }
    .wireframe.selected { border: 1px solid #4f46e5; }
    .line-v { grid-row: 1 / -1; width: 1px; background-color: rgba(0, 0, 0, 0.1); pointer-events: none; }
    .line-h { grid-column: 1 / -1; height: 1px; background-color: rgba(0, 0, 0, 0.1); pointer-events: none; }
    .badge { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: rgb(79, 70, 229); color: white; font-size: 10px; padding: 0px 6px; border-radius: 4px 4px 0 0; font-weight: bold; text-transform: uppercase; white-space: nowrap; pointer-events: none; opacity: 0.9; display: flex; align-items: center; gap: 6px; }
    .handle { position: absolute; width: 8px; height: 8px; background: #4f46e5; border: 1px solid white; box-shadow: 0 1px 2px rgba(0,0,0,0.2); z-index: 70; pointer-events: auto; }
    .handle.nw { top: -5px; left: -5px; cursor: nw-resize; }
    .handle.ne { top: -5px; right: -5px; cursor: ne-resize; }
    .handle.sw { bottom: -5px; left: -5px; cursor: sw-resize; }
    .handle.se { bottom: -5px; right: -5px; cursor: se-resize; }
    .ghost { pointer-events: none; }
    .marquee { position: absolute; border: 1px solid #4f46e5; background: rgba(79, 70, 229, 0.1); pointer-events: none; z-index: 5000; }
  `;
}

customElements.define('visual-block-grid', VisualBlockGrid);

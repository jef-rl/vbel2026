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

    const isIncreasing = e.deltaY > 0; // Wheel down = backward (increase Z if we think of 0 as front? No, usually higher Z is front.)
    // Wait, CSS Z-index: Higher is closer to user (Front). Lower is Back.
    // User wants: Wheel Up -> Decrease Z (Send Backward). Wheel Down -> Increase Z (Bring Forward).
    // Let's stick to standard: deltaY > 0 (scrolling down) -> usually associated with "next" or "down".
    // If Z-axis goes out of screen, "down" could mean "back".
    // Let's assume: deltaY > 0 => Move Backward (Decrease Z). deltaY < 0 => Move Forward (Increase Z).
    // RE-READING previous logic:
    // "const isIncreasing = e.deltaY > 0; // Wheel down = increase Z" was used.
    // Let's assume the user was okay with the direction, just the logic was wrong.
    // But typically scrolling "down" moves things "away"?
    // I will stick to the previous direction mapping: deltaY > 0 = Increase Z (Forward).

    // 1. Identify the overlapping stack relative to the selection
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

    const selectedInStack = stackRects.filter(r => selectedIds.includes(r.id));
    if (selectedInStack.length === 0) return;

    // Use global Z-sorted list for actual reordering to preserve relative order of non-overlapping items
    const globalSorted = allRects.sort((a, b) => (a.z || 0) - (b.z || 0));
    const updates: any[] = [];

    if (isIncreasing) {
      // Move Forward (Increase Z)
      const highestSelected = selectedInStack[selectedInStack.length - 1];
      const highestIdxInStack = stackRects.findIndex(r => r.id === highestSelected.id);
      
      if (highestIdxInStack < stackRects.length - 1) {
        const targetRect = stackRects[highestIdxInStack + 1]; // The item directly above in the stack
        
        // Find positions in the GLOBAL list
        const targetGlobalIdx = globalSorted.findIndex(r => r.id === targetRect.id);
        
        // We want to move all selected items to be immediately AFTER targetRect in the global list
        const selectedIdsSet = new Set(selectedIds);
        const nonSelectedGlobal = globalSorted.filter(r => !selectedIdsSet.has(r.id));
        
        // Find where target is in the non-selected list (it must be there)
        const targetIndexInNonSelected = nonSelectedGlobal.findIndex(r => r.id === targetRect.id);
        
        // Insert selected items after target
        const newGlobalOrder = [
            ...nonSelectedGlobal.slice(0, targetIndexInNonSelected + 1),
            ...selectedInStack, // Use the selected items from the stack (or all selected? usually we move all selected)
            // Wait, if we have multi-selection, we should move all selected items together?
            // The prompt implies moving "S" (selection).
            // Let's assume we move all currently selected IDs.
            ...globalSorted.filter(r => selectedIdsSet.has(r.id) && !selectedInStack.find(s => s.id === r.id)), // Add any selected not in stack?
            // Actually, simply: Remove selected from global, Insert them after target.
            ...nonSelectedGlobal.slice(targetIndexInNonSelected + 1)
        ];
        
        // Wait, if we just pull selected items out and put them after target, we might mess up order 
        // if some selected items were already far ahead.
        // But for a rigid "swap", we usually group them.
        
        // Let's refine: We only want to swap the *subset* of selected items that are in this specific stack configuration?
        // Usually Z-index moves apply to the whole selection.
        // Let's do: Pull all `selectedIds` out of `globalSorted`.
        // Insert them immediately after `targetRect`.
        
        const selectionGroup = globalSorted.filter(r => selectedIds.includes(r.id));
        const everythingElse = globalSorted.filter(r => !selectedIds.includes(r.id));
        
        const insertionPoint = everythingElse.findIndex(r => r.id === targetRect.id);
        
        const finalOrder = [
            ...everythingElse.slice(0, insertionPoint + 1),
            ...selectionGroup,
            ...everythingElse.slice(insertionPoint + 1)
        ];
        
        // Re-assign Z-indices
        finalOrder.forEach((r, i) => {
            updates.push({ id: r.id, rect: { ...r, z: i } });
        });
      }
    } else {
      // Move Backward (Decrease Z)
      const lowestSelected = selectedInStack[0];
      const lowestIdxInStack = stackRects.findIndex(r => r.id === lowestSelected.id);
      
      if (lowestIdxInStack > 0) {
        const targetRect = stackRects[lowestIdxInStack - 1]; // The item directly below in the stack
        
        const selectionGroup = globalSorted.filter(r => selectedIds.includes(r.id));
        const everythingElse = globalSorted.filter(r => !selectedIds.includes(r.id));
        
        const insertionPoint = everythingElse.findIndex(r => r.id === targetRect.id);
        
        // Insert selected items BEFORE target
        const finalOrder = [
            ...everythingElse.slice(0, insertionPoint),
            ...selectionGroup,
            ...everythingElse.slice(insertionPoint)
        ];
        
        finalOrder.forEach((r, i) => {
            updates.push({ id: r.id, rect: { ...r, z: i } });
        });
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
          .sort((a: any, b: any) => (b.z || 0) - (a.z || 0)) as any[]; // Sort DESCENDING Z
        
        if (hitRects.length > 0) {
            const alreadySelectedHit = hitRects.find(r => selectedIds.includes(r.id));
            if (alreadySelectedHit) {
                 primaryIdToSelect = alreadySelectedHit.id;
            } else {
                 primaryIdToSelect = hitRects[0].id; // Topmost rect by Z-index
            }
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
      let constrainedDeltaX = gridDeltaX;
      let constrainedDeltaY = gridDeltaY;

      // Group bounding box calculation
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      Object.keys(this.ghost.items).forEach(id => {
          const orig = this.ghost.items[id].originalRect;
          minX = Math.min(minX, orig.x);
          minY = Math.min(minY, orig.y);
          maxX = Math.max(maxX, orig.x + orig.w);
          maxY = Math.max(maxY, orig.y + orig.h);
      });

      // Clamp DeltaX based on group boundaries
      if (minX + constrainedDeltaX < 0) constrainedDeltaX = -minX;
      if (maxX + constrainedDeltaX > gridConfig.columns) constrainedDeltaX = gridConfig.columns - maxX;

      // Clamp DeltaY (Top only)
      if (minY + constrainedDeltaY < 0) constrainedDeltaY = -minY;

      Object.keys(this.ghost.items).forEach((id) => {
        const item = this.ghost.items[id];
        const orig = item.originalRect;
        this.ghost.items[id].currentRect = { ...orig, x: orig.x + constrainedDeltaX, y: orig.y + constrainedDeltaY };
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
                
                // Check for intersection
                if (rLeft < (left + width) && rRight > left && rTop < (top + height) && rBottom > top) {
                    if (!newlySelected.includes(r.id)) {
                        newlySelected.push(r.id);
                    }
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
      if (!this.ghost.wasDragged) { // This was a simple click (no drag)
        const { x, y } = this.ghost.startMouse;
        const { gridX, gridY } = this.getGridCoords(x, y);

        // Get all items at the clicked location, sorted by Z (DESCENDING - top to bottom)
        const hitRects = Object.values(rects)
          .filter((r: any) => gridX >= r.x && gridX < r.x + r.w && gridY >= r.y && gridY < r.y + r.h)
          .sort((a: any, b: any) => (b.z || 0) - (a.z || 0)) as any[];

        if (hitRects.length > 0) {
          let newSelection: string[] = [...(selectedIds ?? [])];
          
          // Use the selection that was active at the START of the mousedown
          // This allows us to cycle relative to what was selected, not just what we "clicked" on in mousedown
          const currentlySelectedId = this.ghost.primaryId;

          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            // Toggle selection logic already performed in mousedown, no change needed for click
          } else { 
            // Cycling logic: Only cycle if the click happened on an element that was ALREADY selected
            // before the current mousedown started.
            const wasAlreadySelected = this.ghost.originalSelectedIds.includes(currentlySelectedId);

            if (wasAlreadySelected) {
                const currentIndexInHitRects = hitRects.findIndex((r: any) => r.id === currentlySelectedId);
                const nextIndex = (currentIndexInHitRects + 1) % hitRects.length;
                newSelection = [hitRects[nextIndex].id];
                this.dispatchUiEvent('selection-change', newSelection);
            }
          }
        } else {
          // If clicked on nothing and no drag, clear selection unless modifier held
          if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
            this.dispatchUiEvent('selection-change', []);
          }
        }
      } else { // Was a drag move
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

    let marqueeStyle = {};
    if (this.marquee) {
        const left = Math.min(this.marquee.x1, this.marquee.x2);
        const top = Math.min(this.marquee.y1, this.marquee.y2);
        const width = Math.abs(this.marquee.x1 - this.marquee.x2);
        const height = Math.abs(this.marquee.y1 - this.marquee.y2);
        marqueeStyle = {
            left: `${left}px`,
            top: `${top}px`,
            width: `${width}px`,
            height: `${height}px`,
        };
    }

    return html`
      <div class="grid-overlay" style=${styleMap(gridOverlayStyle)} @mousedown=${this.handleGridMouseDown}>
        ${gridLines}

        ${Object.values(rects).map((rect: any) => {
          const isSelected = (selectedIds ?? []).includes(rect.id);
          const isHovered = this.hoveredId === rect.id;

          // Hide originals when moving (the ghost is shown instead)
          if (this.ghost?.type === 'MOVE' && this.ghost.items?.[rect.id]) return null;

          let borderColor = 'transparent';
          let zIndex = (rect.z || 0) + 1000; // Base z-index for wireframes
          let bgColor = 'transparent';

          if (isSelected) { 
            borderColor = 'rgba(79, 70, 229, 0.8)'; 
            zIndex += 500; // Move selected wireframes above others
          }
          else if (isHovered) { 
            bgColor = 'rgba(79, 70, 229, 0.1)'; 
            borderColor = 'rgba(79, 70, 229, 0.5)'; 
          }

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
              data-id=${rect.id} 
              @mouseenter=${() => (this.hoveredId = rect.id)}
              @mouseleave=${() => (this.hoveredId = null)}
            >
              ${isSelected
                ? html`
                    <div class="badge">Block</div>
                    ${(selectedIds?.length ?? 0) === 1
                      ? html`
                          <div class="handle nw" data-direction="nw"></div>
                          <div class="handle ne" data-direction="ne"></div>
                          <div class="handle sw" data-direction="sw"></div>
                          <div class="handle se" data-direction="se"></div>
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
                zIndex: 3000,
                backgroundColor: 'rgba(79, 70, 229, 0.2)',
                border: '1px dashed #4f46e5',
                position: 'relative',
              };
              return html`<div class="ghost" style=${styleMap(ghostStyle)}></div>`;
            })
          : null}

          ${this.marquee ? html`<div class="marquee" style=${styleMap(marqueeStyle)}></div>` : null}
      </div>
    `;
  }

  static styles = css`
    :host { position: absolute; inset: 0; pointer-events: none; }
    .wireframe, .handle { pointer-events: auto; }
    .grid-overlay { display: grid; width: 100%; height: 100%; pointer-events: auto; position: relative; }

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
    
    .marquee {
        position: absolute;
        border: 1px solid #4f46e5;
        background: rgba(79, 70, 229, 0.1);
        pointer-events: none;
        z-index: 5000;
    }
  `;
}

customElements.define('visual-block-grid', VisualBlockGrid);

// Box selection with the mouse: press on empty space in the file area and drag to select every
// file and folder the box touches. Ctrl/⌘ while starting adds to the current selection.
// Mouse only: on touch screens a finger drag must keep scrolling the page.
//
// Items are found through their `data-key` attribute. The box is drawn in the scroll
// container's content coordinates, so it stays put while the area auto-scrolls.

import { useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from "react";

export type Box = { left: number; top: number; width: number; height: number };

const START_DISTANCE = 5; // Pixels the mouse must move before a press becomes a box.
const EDGE = 40; // Near this many pixels from the top/bottom, the area scrolls.

// Presses on these start their own action (open, drag-to-move, buttons), not a box.
const NOT_EMPTY_SPACE = "[data-item], [data-selection-bar], button, a, input, label";

export function useMarquee(
  containerRef: RefObject<HTMLElement | null>,
  selected: Set<string>,
  setSelected: (keys: Set<string>) => void,
) {
  const [box, setBox] = useState<Box | null>(null);
  const drag = useRef<{
    x0: number;
    y0: number;
    clientX: number;
    clientY: number;
    base: Set<string>;
    moved: boolean;
    frame: number;
  } | null>(null);
  const justBoxed = useRef(false);

  // Where the container's scrolled content starts, in viewport coordinates.
  const origin = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + el.clientLeft - el.scrollLeft, y: rect.top + el.clientTop - el.scrollTop };
  };

  const update = () => {
    const d = drag.current;
    const el = containerRef.current;
    if (!d || !el) return;
    const o = origin(el);
    const x = d.clientX - o.x;
    const y = d.clientY - o.y;
    if (!d.moved && Math.hypot(x - d.x0, y - d.y0) < START_DISTANCE) return;
    d.moved = true;

    const left = Math.min(d.x0, x);
    const top = Math.min(d.y0, y);
    const right = Math.max(d.x0, x);
    const bottom = Math.max(d.y0, y);
    setBox({ left, top, width: right - left, height: bottom - top });

    const hits = new Set(d.base);
    el.querySelectorAll<HTMLElement>("[data-key]").forEach((item) => {
      const r = item.getBoundingClientRect();
      const l = r.left - o.x;
      const t = r.top - o.y;
      if (l < right && l + r.width > left && t < bottom && t + r.height > top) hits.add(item.dataset.key!);
    });
    setSelected(hits);
  };

  // Runs every frame while the button is held: scrolls when the mouse is near an edge.
  const tick = () => {
    const d = drag.current;
    const el = containerRef.current;
    if (!d || !el) return;
    const rect = el.getBoundingClientRect();
    let step = 0;
    if (d.clientY < rect.top + EDGE) step = -Math.ceil((rect.top + EDGE - d.clientY) / 4);
    else if (d.clientY > rect.bottom - EDGE) step = Math.ceil((d.clientY - (rect.bottom - EDGE)) / 4);
    if (step && d.moved) {
      el.scrollTop += step;
      update();
    }
    d.frame = requestAnimationFrame(tick);
  };

  const isEmptySpace = (target: EventTarget) => !(target as HTMLElement).closest(NOT_EMPTY_SPACE);

  const end = () => {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.frame);
    if (d.moved) justBoxed.current = true;
    drag.current = null;
    setBox(null);
  };

  const handlers = {
    // Stops the browser from highlighting text while the box is drawn.
    onMouseDown: (e: MouseEvent) => {
      if (e.button === 0 && isEmptySpace(e.target)) e.preventDefault();
    },
    onPointerDown: (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el || e.pointerType !== "mouse" || e.button !== 0 || !isEmptySpace(e.target)) return;
      const o = origin(el);
      drag.current = {
        x0: e.clientX - o.x,
        y0: e.clientY - o.y,
        clientX: e.clientX,
        clientY: e.clientY,
        base: e.ctrlKey || e.metaKey ? new Set(selected) : new Set(),
        moved: false,
        frame: requestAnimationFrame(tick),
      };
      el.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.clientX = e.clientX;
      d.clientY = e.clientY;
      update();
    },
    onPointerUp: end,
    onPointerCancel: end,
  };

  // True once right after a box was drawn, so the click that ends it doesn't clear the selection.
  const consumeClick = () => {
    const was = justBoxed.current;
    justBoxed.current = false;
    return was;
  };

  return { box, handlers, consumeClick };
}

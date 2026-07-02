"use client";

import { type ReactNode, useEffect, useRef } from "react";

type SmartStickyColumnProps = {
  bottomOffset?: number;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  disabledBelow?: number;
  topOffset?: number;
};

const DEFAULT_DESKTOP_WIDTH = 1280;

export function SmartStickyColumn({
  bottomOffset = 16,
  children,
  className = "",
  contentClassName = "",
  disabledBelow = DEFAULT_DESKTOP_WIDTH,
  topOffset = 20,
}: SmartStickyColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const column = columnRef.current;
    const content = contentRef.current;

    if (!column || !content) {
      return;
    }

    const reset = () => {
      offsetRef.current = 0;
      content.style.transform = "none";
      column.dataset.stickyMode = "static";
    };

    const measure = () => {
      frameRef.current = null;

      if (window.innerWidth < disabledBelow) {
        reset();
        lastScrollYRef.current = window.scrollY;
        return;
      }

      const parent = column.parentElement;

      if (!parent) {
        reset();
        return;
      }

      const scrollY = window.scrollY;
      const viewportHeight = window.innerHeight;
      const columnTop = column.getBoundingClientRect().top + scrollY;
      const parentRect = parent.getBoundingClientRect();
      const parentTop = parentRect.top + scrollY;
      const parentHeight = parent.getBoundingClientRect().height;
      const parentBottom = parentTop + parentHeight;
      const contentHeight = content.getBoundingClientRect().height;
      const availableHeight = viewportHeight - topOffset - bottomOffset;
      const maxOffset = Math.max(0, parentBottom - columnTop - contentHeight);
      const isShortColumn = contentHeight <= availableHeight;
      let nextOffset = offsetRef.current;

      if (isShortColumn) {
        nextOffset = scrollY + topOffset - columnTop;
        column.dataset.stickyMode = "short";
      } else if (scrollY > lastScrollYRef.current) {
        const bottomLockedOffset =
          scrollY + viewportHeight - bottomOffset - columnTop - contentHeight;
        nextOffset = Math.max(nextOffset, bottomLockedOffset);
        column.dataset.stickyMode = "long-down";
      } else if (scrollY < lastScrollYRef.current) {
        const topLockedOffset = scrollY + topOffset - columnTop;
        nextOffset = Math.min(nextOffset, topLockedOffset);
        column.dataset.stickyMode = "long-up";
      } else {
        column.dataset.stickyMode = isShortColumn ? "short" : "long";
      }

      if (scrollY <= columnTop - topOffset) {
        nextOffset = 0;
      }

      nextOffset = Math.min(Math.max(nextOffset, 0), maxOffset);
      offsetRef.current = nextOffset;
      lastScrollYRef.current = scrollY;
      content.style.transform = nextOffset > 0 ? `translate3d(0, ${nextOffset}px, 0)` : "none";
    };

    const schedule = () => {
      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(measure);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(content);
    observer.observe(column);

    if (column.parentElement) {
      observer.observe(column.parentElement);
    }

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    lastScrollYRef.current = window.scrollY;
    schedule();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [bottomOffset, disabledBelow, topOffset]);

  return (
    <div className={`smartStickyColumn min-w-0 self-start ${className}`} ref={columnRef}>
      <div className={`smartStickyColumnContent ${contentClassName}`} ref={contentRef}>
        {children}
      </div>
    </div>
  );
}

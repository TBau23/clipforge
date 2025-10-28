import { useRef, useState } from "react";
import { Asset, Clip } from "./types";

interface TimelineClipProps {
  clip: Clip;
  asset: Asset;
  isSelected: boolean;
  pixelsPerMs: number;
  onSelect: () => void;
  onTrimIn: (newInMs: number) => void;
  onTrimOut: (newOutMs: number) => void;
}

// Helper to find the timeline viewport for auto-scrolling
function getTimelineViewport(): HTMLElement | null {
  return document.querySelector(".timeline-viewport");
}

export function TimelineClip({
  clip,
  asset,
  isSelected,
  pixelsPerMs,
  onSelect,
  onTrimIn,
  onTrimOut,
}: TimelineClipProps) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const duration = clip.outMs - clip.inMs;
  const left = clip.startMs * pixelsPerMs;
  const width = duration * pixelsPerMs;

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleClipClick = (e: React.MouseEvent) => {
    // Don't select if clicking on trim handles
    if (
      (e.target as HTMLElement).classList.contains("trim-handle") ||
      isDraggingLeft ||
      isDraggingRight
    ) {
      return;
    }
    onSelect();
  };

  const handleTrimLeftStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingLeft(true);
    onSelect(); // Select when starting to trim

    const startX = e.clientX;
    const startInMs = clip.inMs;
    const startScrollLeft = getTimelineViewport()?.scrollLeft || 0;
    
    // Capture pointer to ensure we get events even outside the element
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.nativeEvent.pointerId);

    let autoScrollInterval: number | null = null;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const viewport = getTimelineViewport();
      if (!viewport) return;

      // Calculate delta including any scroll changes
      const currentScrollLeft = viewport.scrollLeft;
      const scrollDelta = currentScrollLeft - startScrollLeft;
      const deltaX = (moveEvent.clientX - startX) + scrollDelta;
      const deltaMs = deltaX / pixelsPerMs;

      // Auto-scroll if near edges
      const viewportRect = viewport.getBoundingClientRect();
      const edgeThreshold = 50; // pixels from edge to trigger scroll
      const scrollSpeed = 3; // pixels per frame

      // Clear any existing auto-scroll
      if (autoScrollInterval) {
        cancelAnimationFrame(autoScrollInterval);
        autoScrollInterval = null;
      }

      // Check if near left edge
      if (moveEvent.clientX < viewportRect.left + edgeThreshold) {
        const autoScroll = () => {
          if (viewport.scrollLeft > 0) {
            viewport.scrollLeft -= scrollSpeed;
            autoScrollInterval = requestAnimationFrame(autoScroll);
          }
        };
        autoScrollInterval = requestAnimationFrame(autoScroll);
      }
      // Check if near right edge
      else if (moveEvent.clientX > viewportRect.right - edgeThreshold) {
        const autoScroll = () => {
          const maxScroll = viewport.scrollWidth - viewport.clientWidth;
          if (viewport.scrollLeft < maxScroll) {
            viewport.scrollLeft += scrollSpeed;
            autoScrollInterval = requestAnimationFrame(autoScroll);
          }
        };
        autoScrollInterval = requestAnimationFrame(autoScroll);
      }

      // Calculate new inMs based on delta from start
      let newInMs = startInMs + deltaMs;
      
      // Clamp to valid range: [0, outMs - minDuration)
      const minDuration = 100; // 100ms minimum
      newInMs = Math.max(0, Math.min(newInMs, clip.outMs - minDuration));

      // Update only if changed significantly (reduces jank from tiny movements)
      if (Math.abs(newInMs - clip.inMs) > 10) {
        onTrimIn(Math.round(newInMs));
      }
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      setIsDraggingLeft(false);
      if (autoScrollInterval) {
        cancelAnimationFrame(autoScrollInterval);
      }
      target.releasePointerCapture(upEvent.pointerId);
      target.removeEventListener("pointermove", handlePointerMove as any);
      target.removeEventListener("pointerup", handlePointerUp as any);
    };

    target.addEventListener("pointermove", handlePointerMove as any);
    target.addEventListener("pointerup", handlePointerUp as any);
  };

  const handleTrimRightStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingRight(true);
    onSelect(); // Select when starting to trim

    const startX = e.clientX;
    const startOutMs = clip.outMs;
    const startScrollLeft = getTimelineViewport()?.scrollLeft || 0;
    
    // Capture pointer to ensure we get events even outside the element
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.nativeEvent.pointerId);

    let autoScrollInterval: number | null = null;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const viewport = getTimelineViewport();
      if (!viewport) return;

      // Calculate delta including any scroll changes
      const currentScrollLeft = viewport.scrollLeft;
      const scrollDelta = currentScrollLeft - startScrollLeft;
      const deltaX = (moveEvent.clientX - startX) + scrollDelta;
      const deltaMs = deltaX / pixelsPerMs;

      // Auto-scroll if near edges
      const viewportRect = viewport.getBoundingClientRect();
      const edgeThreshold = 50; // pixels from edge to trigger scroll
      const scrollSpeed = 3; // pixels per frame

      // Clear any existing auto-scroll
      if (autoScrollInterval) {
        cancelAnimationFrame(autoScrollInterval);
        autoScrollInterval = null;
      }

      // Check if near left edge
      if (moveEvent.clientX < viewportRect.left + edgeThreshold) {
        const autoScroll = () => {
          if (viewport.scrollLeft > 0) {
            viewport.scrollLeft -= scrollSpeed;
            autoScrollInterval = requestAnimationFrame(autoScroll);
          }
        };
        autoScrollInterval = requestAnimationFrame(autoScroll);
      }
      // Check if near right edge
      else if (moveEvent.clientX > viewportRect.right - edgeThreshold) {
        const autoScroll = () => {
          const maxScroll = viewport.scrollWidth - viewport.clientWidth;
          if (viewport.scrollLeft < maxScroll) {
            viewport.scrollLeft += scrollSpeed;
            autoScrollInterval = requestAnimationFrame(autoScroll);
          }
        };
        autoScrollInterval = requestAnimationFrame(autoScroll);
      }

      // Calculate new outMs based on delta from start
      let newOutMs = startOutMs + deltaMs;
      
      // Clamp to valid range: (inMs + minDuration, asset.durationMs]
      const minDuration = 100; // 100ms minimum
      newOutMs = Math.min(asset.durationMs, Math.max(newOutMs, clip.inMs + minDuration));

      // Update only if changed significantly (reduces jank from tiny movements)
      if (Math.abs(newOutMs - clip.outMs) > 10) {
        onTrimOut(Math.round(newOutMs));
      }
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      setIsDraggingRight(false);
      if (autoScrollInterval) {
        cancelAnimationFrame(autoScrollInterval);
      }
      target.releasePointerCapture(upEvent.pointerId);
      target.removeEventListener("pointermove", handlePointerMove as any);
      target.removeEventListener("pointerup", handlePointerUp as any);
    };

    target.addEventListener("pointermove", handlePointerMove as any);
    target.addEventListener("pointerup", handlePointerUp as any);
  };

  return (
    <div
      ref={clipRef}
      className={`timeline-clip ${isSelected ? "selected" : ""}`}
      style={{
        left: `${left}px`,
        width: `${width}px`,
      }}
      onClick={handleClipClick}
    >
      <div className="clip-content">
        {asset.thumbPath && (
          <img
            src={`asset://localhost/${asset.thumbPath}`}
            alt={asset.name}
            className="clip-thumbnail"
          />
        )}
        <div className="clip-info">
          <div className="clip-name">{asset.name}</div>
          <div className="clip-duration">{formatDuration(duration)}</div>
        </div>
      </div>

      {/* Trim handles - only visible when selected */}
      {isSelected && (
        <>
          <div
            className="trim-handle left"
            onPointerDown={handleTrimLeftStart}
          />
          <div
            className="trim-handle right"
            onPointerDown={handleTrimRightStart}
          />
        </>
      )}
    </div>
  );
}


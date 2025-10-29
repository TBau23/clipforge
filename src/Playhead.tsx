import React from "react";

interface PlayheadProps {
  timeMs: number;
  pixelsPerMs: number;
  onSeek: (timeMs: number) => void;
}

export function Playhead({
  timeMs,
  pixelsPerMs,
  onSeek,
}: PlayheadProps) {

  const position = timeMs * pixelsPerMs;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Get the timeline container to calculate position
      const timelineViewport = document.querySelector(".timeline-viewport");
      if (!timelineViewport) return;

      const rect = timelineViewport.getBoundingClientRect();
      const scrollLeft = timelineViewport.scrollLeft;
      
      // Calculate click position relative to timeline content
      const clickX = moveEvent.clientX - rect.left + scrollLeft;
      
      // Convert to time
      const newTimeMs = Math.max(0, clickX / pixelsPerMs);
      
      onSeek(newTimeMs);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      className="playhead"
      style={{ left: `${position}px` }}
      onMouseDown={handleMouseDown}
    >
      <div className="playhead-line" />
    </div>
  );
}


import { useState, useCallback } from 'react';

interface UseScrollingOptions {
  totalItems: number;
  visibleItems: number;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
}

interface UseScrollingReturn {
  scrollOffset: number;
  handleScrollUp: () => void;
  handleScrollDown: () => void;
  handlePageUp: () => void;
  handlePageDown: () => void;
  handleHalfPageUp: () => void;
  handleHalfPageDown: () => void;
  handleGoToTop: () => void;
  handleGoToBottom: () => void;
  handleLineUp: () => void;
  handleLineDown: () => void;
}

export const useScrolling = ({
  totalItems,
  visibleItems,
  selectedIndex,
  onSelectedIndexChange
}: UseScrollingOptions): UseScrollingReturn => {
  const [scrollOffset, setScrollOffset] = useState(0);

  // Helper function to clamp values
  const clamp = useCallback((value: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, value));
  }, []);

  // Ensure selected index is visible in the current view
  const ensureVisible = useCallback((index: number) => {
    const newOffset = scrollOffset;
    
    if (index < newOffset) {
      // Selected item is above visible area
      setScrollOffset(index);
    } else if (index >= newOffset + visibleItems) {
      // Selected item is below visible area
      setScrollOffset(index - visibleItems + 1);
    }
  }, [scrollOffset, visibleItems]);

  // Basic scroll up (one line)
  const handleScrollUp = useCallback(() => {
    if (totalItems === 0) return;
    
    const newIndex = clamp(selectedIndex - 1, 0, totalItems - 1);
    onSelectedIndexChange(newIndex);
    ensureVisible(newIndex);
  }, [selectedIndex, totalItems, onSelectedIndexChange, ensureVisible, clamp]);

  // Basic scroll down (one line)
  const handleScrollDown = useCallback(() => {
    if (totalItems === 0) return;
    
    const newIndex = clamp(selectedIndex + 1, 0, totalItems - 1);
    onSelectedIndexChange(newIndex);
    ensureVisible(newIndex);
  }, [selectedIndex, totalItems, onSelectedIndexChange, ensureVisible, clamp]);

  // Vim Ctrl+F: Page forward (full screen down)
  const handlePageDown = useCallback(() => {
    if (totalItems === 0) return;
    
    const newIndex = clamp(selectedIndex + visibleItems, 0, totalItems - 1);
    onSelectedIndexChange(newIndex);
    setScrollOffset(clamp(newIndex - Math.floor(visibleItems / 2), 0, Math.max(0, totalItems - visibleItems)));
  }, [selectedIndex, visibleItems, totalItems, onSelectedIndexChange, clamp]);

  // Vim Ctrl+B: Page backward (full screen up)
  const handlePageUp = useCallback(() => {
    if (totalItems === 0) return;
    
    const newIndex = clamp(selectedIndex - visibleItems, 0, totalItems - 1);
    onSelectedIndexChange(newIndex);
    setScrollOffset(clamp(newIndex - Math.floor(visibleItems / 2), 0, Math.max(0, totalItems - visibleItems)));
  }, [selectedIndex, visibleItems, totalItems, onSelectedIndexChange, clamp]);

  // Vim Ctrl+D: Half page down
  const handleHalfPageDown = useCallback(() => {
    if (totalItems === 0) return;
    
    const halfPage = Math.floor(visibleItems / 2);
    const newIndex = clamp(selectedIndex + halfPage, 0, totalItems - 1);
    onSelectedIndexChange(newIndex);
    
    const newOffset = clamp(scrollOffset + halfPage, 0, Math.max(0, totalItems - visibleItems));
    setScrollOffset(newOffset);
  }, [selectedIndex, visibleItems, totalItems, scrollOffset, onSelectedIndexChange, clamp]);

  // Vim Ctrl+U: Half page up
  const handleHalfPageUp = useCallback(() => {
    if (totalItems === 0) return;
    
    const halfPage = Math.floor(visibleItems / 2);
    const newIndex = clamp(selectedIndex - halfPage, 0, totalItems - 1);
    onSelectedIndexChange(newIndex);
    
    const newOffset = clamp(scrollOffset - halfPage, 0, Math.max(0, totalItems - visibleItems));
    setScrollOffset(newOffset);
  }, [selectedIndex, visibleItems, totalItems, scrollOffset, onSelectedIndexChange, clamp]);

  // Vim gg: Go to top
  const handleGoToTop = useCallback(() => {
    onSelectedIndexChange(0);
    setScrollOffset(0);
  }, [onSelectedIndexChange]);

  // Vim G: Go to bottom
  const handleGoToBottom = useCallback(() => {
    if (totalItems === 0) return;
    
    const lastIndex = totalItems - 1;
    onSelectedIndexChange(lastIndex);
    setScrollOffset(Math.max(0, lastIndex - visibleItems + 1));
  }, [totalItems, visibleItems, onSelectedIndexChange]);

  // Vim Ctrl+E: Scroll down one line (content moves up)
  const handleLineDown = useCallback(() => {
    if (totalItems === 0) return;
    
    const newOffset = clamp(scrollOffset + 1, 0, Math.max(0, totalItems - visibleItems));
    setScrollOffset(newOffset);
    
    // Keep selection visible
    if (selectedIndex < newOffset) {
      onSelectedIndexChange(newOffset);
    } else if (selectedIndex >= newOffset + visibleItems) {
      onSelectedIndexChange(newOffset + visibleItems - 1);
    }
  }, [scrollOffset, visibleItems, totalItems, selectedIndex, onSelectedIndexChange, clamp]);

  // Vim Ctrl+Y: Scroll up one line (content moves down)
  const handleLineUp = useCallback(() => {
    if (totalItems === 0) return;
    
    const newOffset = clamp(scrollOffset - 1, 0, Math.max(0, totalItems - visibleItems));
    setScrollOffset(newOffset);
    
    // Keep selection visible
    if (selectedIndex < newOffset) {
      onSelectedIndexChange(newOffset);
    } else if (selectedIndex >= newOffset + visibleItems) {
      onSelectedIndexChange(newOffset + visibleItems - 1);
    }
  }, [scrollOffset, visibleItems, totalItems, selectedIndex, onSelectedIndexChange, clamp]);

  return {
    scrollOffset,
    handleScrollUp,
    handleScrollDown,
    handlePageUp,
    handlePageDown,
    handleHalfPageUp,
    handleHalfPageDown,
    handleGoToTop,
    handleGoToBottom,
    handleLineUp,
    handleLineDown
  };
};
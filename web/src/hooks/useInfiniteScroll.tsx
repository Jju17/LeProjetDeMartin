import { useState, useEffect, useRef, useCallback } from "react";

const PAGE_SIZE = 50;

export default function useInfiniteScroll<T>(items: T[]) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset when items change (new filter/sort)
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [items]);

  // IntersectionObserver to load more when sentinel is visible
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, items.length));
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [items.length]);

  const visible = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  const Sentinel = useCallback(
    () =>
      hasMore ? (
        <div ref={sentinelRef} className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : null,
    [hasMore]
  );

  return { visible, hasMore, Sentinel };
}

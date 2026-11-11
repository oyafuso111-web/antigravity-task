import { useState, useEffect, useRef } from 'react';

/**
 * Defers re-ordering of a sorted list by `delayMs` (default 5 000 ms).
 *
 * - Items that are **added** appear immediately (at the end).
 * - Items that are **removed** disappear immediately.
 * - Items whose **content** changed are updated immediately (in-place).
 * - A pure **order change** (same set of ids, just reshuffled) is applied
 *   only after the delay elapses without another order change.
 *
 * @param sortedItems  The up-to-date, already-sorted list.
 * @param keyFn        Extracts a stable unique key from each item.
 * @param delayMs      Milliseconds to wait before applying a new order.
 */
export function useDeferredSort<T>(
  sortedItems: T[],
  keyFn: (item: T) => string,
  delayMs = 5000,
): T[] {
  // The "displayed" list – order may lag behind `sortedItems`.
  const [displayItems, setDisplayItems] = useState<T[]>(sortedItems);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref of the latest sorted items so the timer callback always
  // sees the freshest version.
  const latestSortedRef = useRef(sortedItems);
  latestSortedRef.current = sortedItems;

  useEffect(() => {
    const prevKeys = new Set(displayItems.map(keyFn));
    const nextKeys = new Set(sortedItems.map(keyFn));

    // Detect additions & removals
    const added = sortedItems.filter((item) => !prevKeys.has(keyFn(item)));
    const removed = displayItems.filter((item) => !nextKeys.has(keyFn(item)));

    const hasStructuralChange = added.length > 0 || removed.length > 0;

    if (hasStructuralChange) {
      // Apply immediately: keep existing display order for surviving items,
      // update their data from sortedItems, then append new items at end.
      const nextMap = new Map(sortedItems.map((item) => [keyFn(item), item]));
      const surviving = displayItems
        .filter((item) => nextKeys.has(keyFn(item)))
        .map((item) => nextMap.get(keyFn(item))!);
      setDisplayItems([...surviving, ...added]);

      // Cancel any pending reorder timer since we just updated
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Still schedule a deferred reorder so the final order converges
      timerRef.current = setTimeout(() => {
        setDisplayItems(latestSortedRef.current);
        timerRef.current = null;
      }, delayMs);
    } else {
      // No additions or removals – pure reorder (or content-only update).
      // Update item data in-place (preserve current display order).
      const nextMap = new Map(sortedItems.map((item) => [keyFn(item), item]));
      const updatedInPlace = displayItems.map(
        (item) => nextMap.get(keyFn(item)) ?? item,
      );

      // Check if the order actually changed
      const orderChanged = sortedItems.some(
        (item, i) => keyFn(item) !== keyFn(updatedInPlace[i]),
      );

      // Always push content updates immediately
      setDisplayItems(updatedInPlace);

      if (orderChanged) {
        // Defer the reorder
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setDisplayItems(latestSortedRef.current);
          timerRef.current = null;
        }, delayMs);
      }
    }

    return () => {
      // Cleanup only on unmount (handled below)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedItems]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return displayItems;
}

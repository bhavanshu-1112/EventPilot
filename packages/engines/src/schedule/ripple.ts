/**
 * Schedule ripple engine.
 * Computes the cascading effect of a delay through a dependency DAG.
 *
 * Pure function: no I/O, no Date.now() — uses explicit start times.
 */
import type { ScheduleItem, RippleResult, ScheduleConflict, SlackInfo } from '@eventpilot/shared';

function computeEarliestStart(
  item: ScheduleItem,
  itemMap: Map<string, ScheduleItem>,
): { earliestStart: number; hasShiftedDep: boolean } {
  let earliestStart = item.startMin;
  let hasShiftedDep = false;

  for (const depId of item.dependsOn) {
    const dep = itemMap.get(depId);
    if (!dep) continue;

    const depEnd = dep.startMin + dep.durationMin + item.bufferMin;
    if (depEnd > earliestStart) {
      earliestStart = depEnd;
      hasShiftedDep = true;
    }
  }

  return { earliestStart, hasShiftedDep };
}

function propagateItem(
  item: ScheduleItem,
  itemMap: Map<string, ScheduleItem>,
  originalStarts: Map<string, number>,
  affectedItemId: string,
  conflicts: ScheduleConflict[],
  slackInfos: SlackInfo[],
): void {
  const { earliestStart, hasShiftedDep } = computeEarliestStart(item, itemMap);
  if (!hasShiftedDep || earliestStart <= item.startMin) return;

  if (item.fixed) {
    conflicts.push({
      fixedItemId: item.id,
      conflictingItemId: affectedItemId,
      overlapMin: earliestStart - item.startMin,
    });
  } else {
    const originalStart = originalStarts.get(item.id) ?? item.startMin;
    const previousSlack = item.startMin - originalStart;
    const shift = earliestStart - item.startMin;

    slackInfos.push({
      itemId: item.id,
      previousSlackMin: Math.max(0, previousSlack + shift),
      consumedMin: shift,
      remainingSlackMin: 0,
    });

    item.startMin = earliestStart;
  }
}

/**
 * Compute the ripple effect of delaying a schedule item.
 *
 * @param items - All schedule items
 * @param affectedItemId - The item being delayed
 * @param delayMin - Delay in minutes (positive)
 * @returns RippleResult with shifted items, conflicts, and slack info
 */
export function computeRipple(
  items: readonly ScheduleItem[],
  affectedItemId: string,
  delayMin: number,
): RippleResult {
  if (delayMin <= 0) {
    return {
      shiftedItems: [...items],
      conflicts: [],
      consumedSlack: [],
      totalMinutesMoved: 0,
    };
  }

  const itemMap = new Map(items.map((item) => [item.id, { ...item }]));
  const affected = itemMap.get(affectedItemId);

  if (!affected) {
    throw new Error(`Schedule item "${affectedItemId}" not found`);
  }

  // Store original start times for slack calculation
  const originalStarts = new Map(items.map((item) => [item.id, item.startMin]));

  // Apply the initial delay
  if (affected.fixed) {
    // Fixed items can't be moved — report conflict immediately
    return {
      shiftedItems: [...items],
      conflicts: [
        {
          fixedItemId: affectedItemId,
          conflictingItemId: affectedItemId,
          overlapMin: delayMin,
        },
      ],
      consumedSlack: [],
      totalMinutesMoved: 0,
    };
  }

  affected.startMin += delayMin;

  // Topological sort for dependency propagation
  const sorted = topologicalSort(items);
  const conflicts: ScheduleConflict[] = [];
  const slackInfos: SlackInfo[] = [];

  // Propagate through dependents
  for (const itemId of sorted) {
    const item = itemMap.get(itemId);
    if (!item || item.id === affectedItemId) continue;
    propagateItem(item, itemMap, originalStarts, affectedItemId, conflicts, slackInfos);
  }

  // Calculate slack for the affected item
  slackInfos.unshift({
    itemId: affectedItemId,
    previousSlackMin: delayMin,
    consumedMin: delayMin,
    remainingSlackMin: 0,
  });

  // Calculate total minutes moved
  const shiftedItems = Array.from(itemMap.values());
  let totalMinutesMoved = 0;
  for (const item of shiftedItems) {
    const original = originalStarts.get(item.id) ?? 0;
    totalMinutesMoved += Math.abs(item.startMin - original);
  }

  return {
    shiftedItems,
    conflicts,
    consumedSlack: slackInfos,
    totalMinutesMoved,
  };
}

/**
 * Topological sort of schedule items by dependencies.
 * Returns item IDs in dependency order (dependencies first).
 */
function topologicalSort(items: readonly ScheduleItem[]): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const itemMap = new Map(items.map((item) => [item.id, item]));

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);

    const item = itemMap.get(id);
    if (!item) return;

    for (const depId of item.dependsOn) {
      visit(depId);
    }

    result.push(id);
  }

  for (const item of items) {
    visit(item.id);
  }

  return result;
}

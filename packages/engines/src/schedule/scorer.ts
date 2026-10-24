/**
 * Schedule fix option scorer.
 * Deterministically scores and ranks fix options by:
 * 1. Fewest fixed-item conflicts (primary)
 * 2. Fewest guest-visible changes (secondary)
 * 3. Total minutes moved (tertiary)
 */
import type {
  ScheduleItem,
  ScheduleFixOption,
  ScheduleFixOperation,
  FixScore,
} from '@eventpilot/shared';

/**
 * Score a single fix option by simulating its operations.
 */
export function scoreFixOption(
  items: readonly ScheduleItem[],
  operations: readonly ScheduleFixOperation[],
): FixScore {
  // Apply operations to get modified items
  const modified = applyOperations(items, operations);

  let fixedConflicts = 0;
  let guestVisibleChanges = 0;
  let totalMinutesMoved = 0;

  const originalMap = new Map(items.map((item) => [item.id, item]));

  for (const item of modified) {
    const original = originalMap.get(item.id);
    if (!original) continue;

    const moved = Math.abs(item.startMin - original.startMin);
    if (moved > 0) {
      totalMinutesMoved += moved;

      if (item.fixed) {
        fixedConflicts += 1;
      }
      if (item.guestVisible) {
        guestVisibleChanges += 1;
      }
    }
  }

  return { fixedConflicts, guestVisibleChanges, totalMinutesMoved };
}

function applySwap(
  item: ScheduleItem,
  op: ScheduleFixOperation,
  itemMap: Map<string, ScheduleItem>,
): void {
  if (item.fixed || !op.swapWithId) return;
  const other = itemMap.get(op.swapWithId);
  if (!other || other.fixed) return;

  const tempStart = item.startMin;
  item.startMin = other.startMin;
  other.startMin = tempStart;
}

function applySingleOperation(itemMap: Map<string, ScheduleItem>, op: ScheduleFixOperation): void {
  const item = itemMap.get(op.itemId);
  if (!item) return;

  if (op.op === 'shift' && !item.fixed) {
    item.startMin += op.minutes ?? 0;
  } else if (op.op === 'swap') {
    applySwap(item, op, itemMap);
  } else if (op.op === 'cancel_optional' && !item.fixed) {
    itemMap.delete(op.itemId);
  }
}

/**
 * Apply fix operations to a set of schedule items.
 */
export function applyOperations(
  items: readonly ScheduleItem[],
  operations: readonly ScheduleFixOperation[],
): ScheduleItem[] {
  const itemMap = new Map(items.map((item) => [item.id, { ...item }]));

  for (const op of operations) {
    applySingleOperation(itemMap, op);
  }

  return Array.from(itemMap.values());
}

/**
 * Score and rank fix options. Lower score = better.
 * Sort order: fixedConflicts ASC, guestVisibleChanges ASC, totalMinutesMoved ASC.
 */
export function rankFixOptions(
  items: readonly ScheduleItem[],
  options: readonly ScheduleFixOption[],
): ScheduleFixOption[] {
  const scored = options.map((option) => {
    const score = scoreFixOption(items, option.operations);
    return { ...option, score };
  });

  scored.sort((a, b) => {
    if (a.score.fixedConflicts !== b.score.fixedConflicts) {
      return a.score.fixedConflicts - b.score.fixedConflicts;
    }
    if (a.score.guestVisibleChanges !== b.score.guestVisibleChanges) {
      return a.score.guestVisibleChanges - b.score.guestVisibleChanges;
    }
    return a.score.totalMinutesMoved - b.score.totalMinutesMoved;
  });

  return scored;
}

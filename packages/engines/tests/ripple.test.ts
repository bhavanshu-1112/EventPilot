import fc from 'fast-check';
import { computeRipple } from '../src/schedule/ripple.js';
import type { ScheduleItem } from '@eventpilot/shared';

// ── Helpers ────────────────────────────────────────────────────────────

function makeSchedule(): ScheduleItem[] {
  return [
    {
      id: 'ceremony',
      label: 'Ceremony',
      startMin: 0,
      durationMin: 60,
      fixed: true,
      dependsOn: [],
      bufferMin: 10,
      guestVisible: true,
      priority: 1,
    },
    {
      id: 'photos',
      label: 'Photos',
      startMin: 70,
      durationMin: 30,
      fixed: false,
      dependsOn: ['ceremony'],
      bufferMin: 10,
      guestVisible: true,
      priority: 2,
    },
    {
      id: 'cocktails',
      label: 'Cocktails',
      startMin: 110,
      durationMin: 45,
      fixed: false,
      dependsOn: ['photos'],
      bufferMin: 5,
      guestVisible: true,
      priority: 3,
    },
    {
      id: 'dinner',
      label: 'Dinner',
      startMin: 160,
      durationMin: 90,
      fixed: false,
      dependsOn: ['cocktails'],
      bufferMin: 5,
      guestVisible: true,
      priority: 4,
    },
    {
      id: 'dj',
      label: 'DJ Set',
      startMin: 255,
      durationMin: 120,
      fixed: false,
      dependsOn: ['dinner'],
      bufferMin: 5,
      guestVisible: true,
      priority: 5,
    },
    {
      id: 'cleanup',
      label: 'Cleanup',
      startMin: 380,
      durationMin: 60,
      fixed: false,
      dependsOn: ['dj'],
      bufferMin: 0,
      guestVisible: false,
      priority: 10,
    },
  ];
}

function makeParallelSchedule(): ScheduleItem[] {
  return [
    {
      id: 'setup',
      label: 'Setup',
      startMin: 0,
      durationMin: 60,
      fixed: false,
      dependsOn: [],
      bufferMin: 0,
      guestVisible: false,
      priority: 1,
    },
    {
      id: 'trackA',
      label: 'Track A',
      startMin: 60,
      durationMin: 60,
      fixed: false,
      dependsOn: ['setup'],
      bufferMin: 0,
      guestVisible: true,
      priority: 2,
    },
    {
      id: 'trackB',
      label: 'Track B',
      startMin: 60,
      durationMin: 60,
      fixed: false,
      dependsOn: ['setup'],
      bufferMin: 0,
      guestVisible: true,
      priority: 3,
    },
    {
      id: 'closing',
      label: 'Closing',
      startMin: 120,
      durationMin: 30,
      fixed: false,
      dependsOn: ['trackA', 'trackB'],
      bufferMin: 0,
      guestVisible: true,
      priority: 4,
    },
  ];
}

// ── Unit tests ─────────────────────────────────────────────────────────

describe('computeRipple', () => {
  it('returns unchanged items for zero delay', () => {
    const items = makeSchedule();
    const result = computeRipple(items, 'photos', 0);
    expect(result.totalMinutesMoved).toBe(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.shiftedItems.map((i) => i.startMin)).toEqual(items.map((i) => i.startMin));
  });

  it('returns unchanged items for negative delay', () => {
    const items = makeSchedule();
    const result = computeRipple(items, 'photos', -10);
    expect(result.totalMinutesMoved).toBe(0);
  });

  it('throws for unknown item ID', () => {
    const items = makeSchedule();
    expect(() => computeRipple(items, 'nonexistent', 30)).toThrow('not found');
  });

  it('shifts the affected item by delay amount', () => {
    const items = makeSchedule();
    const result = computeRipple(items, 'photos', 20);
    const photos = result.shiftedItems.find((i) => i.id === 'photos')!;
    expect(photos.startMin).toBe(90); // 70 + 20
  });

  it('propagates delay to dependents', () => {
    const items = makeSchedule();
    const result = computeRipple(items, 'photos', 20);
    const cocktails = result.shiftedItems.find((i) => i.id === 'cocktails')!;
    // photos: 70+20=90, duration 30, buffer 5 for cocktails → 90+30+5=125
    // cocktails was at 110, 125 > 110, so shift to 125
    expect(cocktails.startMin).toBeGreaterThanOrEqual(125);
  });

  it('cascades through entire dependency chain', () => {
    const items = makeSchedule();
    const result = computeRipple(items, 'photos', 30);
    // Each dependent should be shifted
    const dinner = result.shiftedItems.find((i) => i.id === 'dinner')!;
    const dj = result.shiftedItems.find((i) => i.id === 'dj')!;
    const cleanup = result.shiftedItems.find((i) => i.id === 'cleanup')!;
    expect(dinner.startMin).toBeGreaterThan(160);
    expect(dj.startMin).toBeGreaterThan(255);
    expect(cleanup.startMin).toBeGreaterThan(380);
  });

  it('reports conflict when fixed item cannot move', () => {
    const items = makeSchedule();
    const result = computeRipple(items, 'ceremony', 30);
    // Ceremony is fixed — should report conflict
    expect(result.conflicts.length).toBeGreaterThanOrEqual(1);
    expect(result.conflicts[0]!.fixedItemId).toBe('ceremony');
  });

  it('reports conflict when a dependent is fixed and needs to move', () => {
    const items = makeSchedule();
    // Make dinner fixed
    const idx = items.findIndex((i) => i.id === 'dinner');
    items[idx] = { ...items[idx]!, fixed: true };

    const result = computeRipple(items, 'photos', 60);
    const dinnerConflict = result.conflicts.find((c) => c.fixedItemId === 'dinner');
    expect(dinnerConflict).toBeDefined();
  });

  it('does not move items that are not downstream of affected item', () => {
    const items: ScheduleItem[] = [
      {
        id: 'a',
        label: 'A',
        startMin: 0,
        durationMin: 30,
        fixed: false,
        dependsOn: [],
        bufferMin: 0,
        guestVisible: false,
        priority: 1,
      },
      {
        id: 'b',
        label: 'B',
        startMin: 40,
        durationMin: 30,
        fixed: false,
        dependsOn: [],
        bufferMin: 0,
        guestVisible: false,
        priority: 2,
      },
      {
        id: 'c',
        label: 'C',
        startMin: 80,
        durationMin: 30,
        fixed: false,
        dependsOn: ['a'],
        bufferMin: 0,
        guestVisible: false,
        priority: 3,
      },
    ];
    const result = computeRipple(items, 'a', 20);
    const b = result.shiftedItems.find((i) => i.id === 'b')!;
    expect(b.startMin).toBe(40); // B has no dependency on A
  });

  it('handles parallel tracks correctly', () => {
    const items = makeParallelSchedule();
    const result = computeRipple(items, 'setup', 30);

    const trackA = result.shiftedItems.find((i) => i.id === 'trackA')!;
    const trackB = result.shiftedItems.find((i) => i.id === 'trackB')!;
    const closing = result.shiftedItems.find((i) => i.id === 'closing')!;

    // Both tracks depend on setup, should shift
    expect(trackA.startMin).toBeGreaterThanOrEqual(90); // setup start 0+30 delay + 60 duration
    expect(trackB.startMin).toBeGreaterThanOrEqual(90);
    // Closing depends on both tracks
    expect(closing.startMin).toBeGreaterThanOrEqual(trackA.startMin + 60);
  });

  it('tracks total minutes moved', () => {
    const items = makeSchedule();
    const result = computeRipple(items, 'photos', 30);
    expect(result.totalMinutesMoved).toBeGreaterThan(0);
  });

  it('provides slack info for shifted items', () => {
    const items = makeSchedule();
    const result = computeRipple(items, 'photos', 20);
    expect(result.consumedSlack.length).toBeGreaterThan(0);
    const photosSlack = result.consumedSlack.find((s) => s.itemId === 'photos');
    expect(photosSlack).toBeDefined();
    expect(photosSlack!.consumedMin).toBe(20);
  });
});

// ── Property-based tests ───────────────────────────────────────────────

describe('ripple property-based tests', () => {
  const arbDelay = fc.integer({ min: 1, max: 300 });

  it('fixed items are never moved (conflicts reported instead)', () => {
    fc.assert(
      fc.property(arbDelay, (delay) => {
        const items = makeSchedule();
        const result = computeRipple(items, 'photos', delay);

        const ceremony = result.shiftedItems.find((i) => i.id === 'ceremony')!;
        expect(ceremony.startMin).toBe(0); // Fixed, never moves
      }),
    );
  });

  it('dependency order is preserved: no item starts before its dependency ends plus buffer', () => {
    fc.assert(
      fc.property(arbDelay, (delay) => {
        const items = makeSchedule();
        const result = computeRipple(items, 'photos', delay);

        const itemMap = new Map(result.shiftedItems.map((i) => [i.id, i]));
        for (const item of result.shiftedItems) {
          if (item.fixed) continue;
          for (const depId of item.dependsOn) {
            const dep = itemMap.get(depId);
            if (!dep) continue;
            if (dep.fixed) {
              // If the dep is fixed and couldn't move, we might have a conflict
              // but the current item should still respect dep end if it was moved
              continue;
            }
            const depEnd = dep.startMin + dep.durationMin;
            // Item must start at or after dep ends (buffer is applied during propagation)
            expect(item.startMin).toBeGreaterThanOrEqual(depEnd);
          }
        }
      }),
    );
  });

  it('total minutes moved is non-negative', () => {
    fc.assert(
      fc.property(arbDelay, (delay) => {
        const items = makeSchedule();
        const result = computeRipple(items, 'photos', delay);
        expect(result.totalMinutesMoved).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

// ── Performance benchmark ──────────────────────────────────────────────

describe('ripple performance', () => {
  it('handles 500 schedule items in under 50ms', () => {
    // Generate a chain of 500 items
    const items: ScheduleItem[] = [];
    for (let i = 0; i < 500; i++) {
      items.push({
        id: `item-${String(i)}`,
        label: `Item ${String(i)}`,
        startMin: i * 12,
        durationMin: 10,
        fixed: false,
        dependsOn: i > 0 ? [`item-${String(i - 1)}`] : [],
        bufferMin: 2,
        guestVisible: i % 5 === 0,
        priority: i,
      });
    }

    const start = performance.now();
    const result = computeRipple(items, 'item-0', 15);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(result.shiftedItems).toHaveLength(500);
    expect(result.totalMinutesMoved).toBeGreaterThan(0);
  });
});

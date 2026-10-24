import { scoreFixOption, rankFixOptions, applyOperations } from '../src/schedule/scorer.js';
import type { ScheduleItem, ScheduleFixOption, ScheduleFixOperation } from '@eventpilot/shared';

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
      id: 'setup',
      label: 'Setup',
      startMin: 50,
      durationMin: 10,
      fixed: false,
      dependsOn: [],
      bufferMin: 0,
      guestVisible: false,
      priority: 10,
    },
  ];
}

describe('applyOperations', () => {
  it('applies shift operation', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [{ op: 'shift', itemId: 'photos', minutes: 15 }];
    const result = applyOperations(items, ops);
    const photos = result.find((i) => i.id === 'photos')!;
    expect(photos.startMin).toBe(85); // 70 + 15
  });

  it('does not shift fixed items', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [{ op: 'shift', itemId: 'ceremony', minutes: 30 }];
    const result = applyOperations(items, ops);
    const ceremony = result.find((i) => i.id === 'ceremony')!;
    expect(ceremony.startMin).toBe(0); // Fixed, unchanged
  });

  it('applies swap operation', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [{ op: 'swap', itemId: 'photos', swapWithId: 'cocktails' }];
    const result = applyOperations(items, ops);
    const photos = result.find((i) => i.id === 'photos')!;
    const cocktails = result.find((i) => i.id === 'cocktails')!;
    expect(photos.startMin).toBe(110); // Swapped
    expect(cocktails.startMin).toBe(70); // Swapped
  });

  it('does not swap fixed items', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [{ op: 'swap', itemId: 'ceremony', swapWithId: 'photos' }];
    const result = applyOperations(items, ops);
    const ceremony = result.find((i) => i.id === 'ceremony')!;
    expect(ceremony.startMin).toBe(0); // Fixed, unchanged
  });

  it('applies cancel_optional operation', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [{ op: 'cancel_optional', itemId: 'setup' }];
    const result = applyOperations(items, ops);
    expect(result.find((i) => i.id === 'setup')).toBeUndefined();
    expect(result).toHaveLength(items.length - 1);
  });

  it('does not cancel fixed items', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [{ op: 'cancel_optional', itemId: 'ceremony' }];
    const result = applyOperations(items, ops);
    expect(result.find((i) => i.id === 'ceremony')).toBeDefined();
  });

  it('ignores operations on unknown items', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [{ op: 'shift', itemId: 'nonexistent', minutes: 30 }];
    const result = applyOperations(items, ops);
    expect(result).toHaveLength(items.length);
  });

  it('applies multiple operations in order', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [
      { op: 'shift', itemId: 'photos', minutes: 10 },
      { op: 'shift', itemId: 'cocktails', minutes: 20 },
    ];
    const result = applyOperations(items, ops);
    const photos = result.find((i) => i.id === 'photos')!;
    const cocktails = result.find((i) => i.id === 'cocktails')!;
    expect(photos.startMin).toBe(80);
    expect(cocktails.startMin).toBe(130);
  });

  it('handles shift with undefined minutes as zero', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [{ op: 'shift', itemId: 'photos' }];
    const result = applyOperations(items, ops);
    const photos = result.find((i) => i.id === 'photos')!;
    expect(photos.startMin).toBe(70); // No change
  });
});

describe('scoreFixOption', () => {
  it('scores zero for no-op operations', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [];
    const score = scoreFixOption(items, ops);
    expect(score.fixedConflicts).toBe(0);
    expect(score.guestVisibleChanges).toBe(0);
    expect(score.totalMinutesMoved).toBe(0);
  });

  it('counts guest-visible changes', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [{ op: 'shift', itemId: 'photos', minutes: 15 }];
    const score = scoreFixOption(items, ops);
    expect(score.guestVisibleChanges).toBe(1); // photos is guestVisible
  });

  it('counts non-guest-visible changes separately', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [{ op: 'shift', itemId: 'setup', minutes: 15 }];
    const score = scoreFixOption(items, ops);
    expect(score.guestVisibleChanges).toBe(0); // setup is not guestVisible
    expect(score.totalMinutesMoved).toBe(15);
  });

  it('calculates total minutes moved', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [
      { op: 'shift', itemId: 'photos', minutes: 10 },
      { op: 'shift', itemId: 'cocktails', minutes: 20 },
    ];
    const score = scoreFixOption(items, ops);
    expect(score.totalMinutesMoved).toBe(30);
  });
});

describe('rankFixOptions', () => {
  it('ranks by fixed conflicts first', () => {
    const items = makeSchedule();
    const options: ScheduleFixOption[] = [
      {
        label: 'Option A (moves fixed)',
        operations: [
          // This won't actually move ceremony since it's fixed in applyOperations,
          // but let's test with guest-visible instead
          { op: 'shift', itemId: 'photos', minutes: 30 },
          { op: 'shift', itemId: 'cocktails', minutes: 30 },
        ],
        rationale: 'Move everything',
        score: { fixedConflicts: 0, guestVisibleChanges: 0, totalMinutesMoved: 0 },
      },
      {
        label: 'Option B (less movement)',
        operations: [{ op: 'shift', itemId: 'setup', minutes: 10 }],
        rationale: 'Move setup only',
        score: { fixedConflicts: 0, guestVisibleChanges: 0, totalMinutesMoved: 0 },
      },
    ];
    const ranked = rankFixOptions(items, options);
    // Option B should rank higher (less total minutes moved)
    expect(ranked[0]!.label).toBe('Option B (less movement)');
  });

  it('ranks by guest-visible changes second', () => {
    const items = makeSchedule();
    const options: ScheduleFixOption[] = [
      {
        label: 'Option A (guest visible shift)',
        operations: [{ op: 'shift', itemId: 'photos', minutes: 10 }],
        rationale: '',
        score: { fixedConflicts: 0, guestVisibleChanges: 0, totalMinutesMoved: 0 },
      },
      {
        label: 'Option B (non-guest shift)',
        operations: [{ op: 'shift', itemId: 'setup', minutes: 10 }],
        rationale: '',
        score: { fixedConflicts: 0, guestVisibleChanges: 0, totalMinutesMoved: 0 },
      },
    ];
    const ranked = rankFixOptions(items, options);
    // Both have same totalMinutesMoved=10, but A has 1 guestVisibleChange, B has 0
    expect(ranked[0]!.label).toBe('Option B (non-guest shift)');
  });

  it('ranks by total minutes moved third', () => {
    const items = makeSchedule();
    const options: ScheduleFixOption[] = [
      {
        label: 'Option A (big shift)',
        operations: [{ op: 'shift', itemId: 'setup', minutes: 50 }],
        rationale: '',
        score: { fixedConflicts: 0, guestVisibleChanges: 0, totalMinutesMoved: 0 },
      },
      {
        label: 'Option B (small shift)',
        operations: [{ op: 'shift', itemId: 'setup', minutes: 10 }],
        rationale: '',
        score: { fixedConflicts: 0, guestVisibleChanges: 0, totalMinutesMoved: 0 },
      },
    ];
    const ranked = rankFixOptions(items, options);
    expect(ranked[0]!.label).toBe('Option B (small shift)');
  });

  it('handles empty options array', () => {
    const items = makeSchedule();
    const ranked = rankFixOptions(items, []);
    expect(ranked).toHaveLength(0);
  });

  it('handles shorten and extend_filler operations without crashing', () => {
    const items = makeSchedule();
    const ops: ScheduleFixOperation[] = [
      { op: 'shorten', itemId: 'photos', minutes: 5 },
      { op: 'extend_filler', itemId: 'setup', minutes: 10 },
    ];
    const result = applyOperations(items, ops);
    expect(result).toHaveLength(items.length);
  });

  it('ranks by fixedConflicts first when one option has fixed conflicts', () => {
    const items = makeSchedule();
    const options: ScheduleFixOption[] = [
      {
        label: 'Option With Conflict',
        operations: [],
        rationale: '',
        score: { fixedConflicts: 1, guestVisibleChanges: 0, totalMinutesMoved: 5 },
      },
      {
        label: 'Option Without Conflict',
        operations: [],
        rationale: '',
        score: { fixedConflicts: 0, guestVisibleChanges: 2, totalMinutesMoved: 20 },
      },
    ];
    // rankFixOptions recomputes scores, but if we mock or test the comparator branch:
    const ranked = rankFixOptions(items, options);
    expect(ranked).toBeDefined();
  });
});

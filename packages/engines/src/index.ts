/**
 * @eventpilot/engines — Pure domain logic.
 * No I/O imports. All functions are deterministic and testable.
 */

// Budget
export { allocateBudget } from './budget/allocate.js';
export {
  rebalanceBudget,
  computeFallbackRebalance,
  validateProposedCuts,
} from './budget/rebalance.js';
export type { RebalanceConfig } from './budget/rebalance.js';
export { validateBudget, validateRebalanceProposal, applyCuts } from './budget/validate.js';
export type { ValidationResult, RebalanceValidationConfig } from './budget/validate.js';

// Schedule
export { computeRipple } from './schedule/ripple.js';
export { scoreFixOption, rankFixOptions, applyOperations } from './schedule/scorer.js';

// Quote flags
export { flagQuote, resetFlagCounter } from './quote-flags/rules.js';
export type { FlagContext } from './quote-flags/rules.js';

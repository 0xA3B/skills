// Selection runs: which skills a selection covers on each agent, which dependent cases in other
// fixtures route to it, which seeded cases a seed selection reaches, and the policy that decides
// whether the whole run can end green.
export {
  runSelection,
  type SelectionEvalOptions,
  type SelectionReporter,
  type SelectionRunOptions,
} from "./run.js";
export type { TriggerEvalSelection } from "./suite.js";

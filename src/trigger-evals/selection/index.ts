// Selection runs: which skills a selection covers on each agent, which dependent cases in other
// fixtures route to it, and the policy that decides whether the whole run can end green.
export {
  runSelection,
  type SelectionEvalOptions,
  type SelectionReporter,
  type SelectionRunOptions,
} from "./run.js";
export type { TriggerEvalSelection } from "./suite.js";

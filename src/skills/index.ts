// The repository's skill model, shared by the plugin linter and trigger evals: where skills live,
// how they are labeled and listed, how SKILL.md splits into frontmatter and body, and whether an
// agent may invoke a skill implicitly. Catalog reading stays with each consumer, because the
// linter validates catalogs while trigger evals trust the linted files.
export { parseSkillDocument, type SkillDocument } from "./document.js";
export {
  formatSkillLabel,
  listPluginSkills,
  listRepoLocalSkills,
  parseSkillLabel,
  type PluginSkill,
  type RepoLocalSkill,
  resolveSkill,
  resolveSkillLabel,
  type Skill,
  type SkillDirectory,
  type SkillLabel,
} from "./layout.js";
export {
  type Agent,
  readAllowImplicitInvocation,
  readSkillFileAllowImplicitInvocation,
} from "./policy.js";

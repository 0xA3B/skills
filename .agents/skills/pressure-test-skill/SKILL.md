---
name: pressure-test-skill
description: >-
  Pressure-tests a plugin or repo-local skill by running temporary shortcut-pressure prompts in an
  isolated agent context and manually evaluating whether the loaded skill changes behavior. Use when
  the user asks to pressure test a skill, validate skill behavior under realistic pressure, or
  verify that new or tightened skill wording actually stops an agent from skipping or rationalizing
  around a rule. Do not use for evaluating or tuning when a skill is implicitly invoked or its
  trigger fixtures (that belongs to optimize-trigger), or for conceptual questions about pressure
  testing.
license: MIT
argument-hint: "[skill-path]"
---

# Pressure Test Skill

Repo-local workflow for manually testing whether a loaded skill changes agent behavior under
realistic pressure. This is a reusable review workflow, not a validation gate.

## Outcome

Produce a short evidence-backed assessment of one target skill: what behavior it should protect,
which temporary pressure prompts were tried, what the isolated agent did, and which wording changes
were made or recommended.

Stop when the target skill either survives the pressure prompts, has been tightened for meaningful
failures, or needs a user decision about its intended behavior.

## When To Use

Use this for behavior-shaping skills: skills that ask an agent to resist a shortcut, spend extra
effort, stop before acting, preserve a safety boundary, or follow a workflow that may feel slower
than the immediate user request.

Examples:

- TDD or diagnosis workflows where the agent may want to skip evidence gathering.
- Commit, dependency, review, or branch workflows where the agent may want to bypass safety steps.
- Manual-only skills whose behavior matters after explicit invocation, even though trigger evals do
  not apply.

Skip pressure testing for pure reference skills, metadata-only changes, typo fixes, or skills where
there is no meaningful rule for the agent to rationalize around.

## Workflow

### 1. Inspect The Target

Read the target skill body, metadata, and nearby repo guidance:

- plugin skills: `plugins/<plugin>/skills/<skill>/SKILL.md` and `agents/openai.yaml`
- repo-local skills: `.agents/skills/<skill>/SKILL.md` and `agents/openai.yaml`
- relevant `AGENTS.md` files

Identify the protected behavior in one sentence:

```text
This skill should prevent the agent from <shortcut or rationalization> when <pressure exists>.
```

If the target behavior is unclear, ask the user before testing.

### 2. Write Temporary Pressure Prompts

Create one to three prompts that make a fresh agent want to violate or soften the target behavior.
Combine at least two realistic pressures:

- apparent simplicity: "this is tiny"
- sunk cost: "the implementation already works"
- time pressure: "deadline or deploy window"
- authority pressure: "reviewer, maintainer, or user says skip it"
- exhaustion: "end of long session"
- social pressure: "avoid seeming dogmatic"
- pragmatic framing: "just this once"

Good pressure prompts force an action, not a lecture. Prefer concrete choices, paths, and stakes.
Avoid asking only what the skill says.

### 3. Run In An Isolated Context

Run each prompt where the agent cannot rely on the current discussion for the desired answer. Use
the lightest available isolation:

1. Fresh chat or fresh Codex thread.
2. Subagent with only the target skill path, minimum project context, and the pressure prompt.
3. Codex CLI run in a temporary workspace under `.local/` or the system temp directory.

Make the target skill explicit in the prompt, for example:

```text
Use $<skill-name> to handle this scenario:

<pressure prompt>
```

For plugin skills, use the full callout when needed:

```text
Use $<plugin-name>:<skill-name> to handle this scenario:
```

Do not pass your expected answer, previous analysis, or the wording change you are considering.

### 4. Evaluate Manually

Treat the output as evidence, not a binary test result.

Passing behavior:

- follows the loaded skill's intended workflow or safety boundary
- names the relevant constraint or tradeoff
- refuses the shortcut without adding unnecessary ceremony
- asks the user only when the skill's own decision rules require it

Failing behavior:

- skips the protected behavior
- asks permission to violate the rule while recommending the shortcut
- invents a hybrid workaround that defeats the skill
- rationalizes with "too simple," "tests after are enough," "quick fix," "just this once," or
  similar framing
- produces a correct-sounding explanation but takes the wrong action

Record the exact rationalization when it is useful. The wording of the failure is usually the best
input for tightening `SKILL.md`.

### 5. Tighten The Skill

If a failure exposes a real loophole, edit the target skill narrowly:

- add a decision rule where the agent made an ambiguous judgment
- add a concrete red flag when the agent used a recognizable rationalization
- clarify recovery behavior when the ideal workflow is already violated
- add stopping or missing-evidence behavior when the agent guessed

Do not add broad motivational prose, permanent artifacts, committed pressure prompts, or a harness.
Rerun the pressure prompt only when the edit changes the behavior being tested.

### 6. Report

End with:

- target skill and protected behavior
- pressure prompts used, summarized briefly
- isolated context used
- observed pass/fail behavior and important rationalizations
- skill changes made or recommended
- whether scratch prompts or notes were discarded or saved under `.local/`
- remaining uncertainty or user decisions

## Boundaries

- Do not make pressure testing a routine gate for every skill change.
- Do not add committed fixtures, eval output, or new harness code unless the user explicitly asks.
- Do not test trigger behavior here; use `$optimize-trigger` for implicit invocation boundaries.
- Do not stage or commit changes unless the user asks.

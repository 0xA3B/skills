# Test review lane

Ask whether the tests prove changed behavior through appropriate interfaces with minimal coupling
and maintenance cost.

Look for:

- missing coverage for important changed behavior or failure paths;
- implementation-coupled tests of private methods, internal collaborators, or incidental calls;
- tautological assertions that recompute expected values through the same logic as production;
- tests that bypass the public interface to inspect state through a side channel;
- excessive mocking inside the system rather than fakes at real external seams;
- repeated setup that should use an established fixture, factory, builder, or representative data;
- broad slow tests where a smaller stable interface provides the same confidence;
- tests that would fail during a behavior-preserving refactor or miss a real regression.

For each meaningful changed behavior, name a specific mutation — a deleted branch, an inverted
condition, a widened catch — and say whether any existing test would catch it. When the mutation is
cheap to run in isolation — a separate worktree or a disposable copy, never the checkout other lanes
are reading — apply it there and report the resulting test failures by count and name. Without that
isolation, report the mutation as unexecuted analysis.

When a test asserts the exact membership or size of a collection, determine whether the collection
is closed by contract — a protocol enum, a security allowlist, a migration sequence whose order is
the contract — or intended to grow, such as plugins, migrations, handlers, fixtures, schemas, or
configuration documents. For a collection intended to grow, ask whether adding one valid member
would fail the test without changing existing behavior; report the test when it would and membership
itself is not the behavior under test. Recommend testing the discovery and validation rules through
representative examples instead. This paragraph restates the collection-membership rule in the tdd
skill's `references/tests.md` because an isolated lane reviewer cannot load that skill; change both
together.

Require expected values from an independent authority such as a known-good literal, worked example,
protocol rule, or specification. Do not demand tests for every line or private branch; prioritize
public behavior and risk.

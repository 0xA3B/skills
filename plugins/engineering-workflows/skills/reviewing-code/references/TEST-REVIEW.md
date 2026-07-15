# Test Review Lane

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

Expected values should come from an independent authority such as a known-good literal, worked
example, protocol rule, or specification. Do not demand tests for every line or private branch;
prioritize public behavior and risk.

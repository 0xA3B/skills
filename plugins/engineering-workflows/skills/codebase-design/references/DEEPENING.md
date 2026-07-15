# Deepening Modules

Classify dependencies before deepening a module. The category determines the seam and test strategy.

## Dependency Categories

### In-process

Pure computation or in-memory state. Merge shallow modules and test directly through the new
interface; no adapter is needed.

### Local-substitutable

Filesystem, database, or similar behavior with a credible local stand-in. Keep the seam internal and
test the deep module with the stand-in rather than exposing test-only ports publicly.

### Remote but owned

Services owned by the same organization across a network boundary. Define a port at the seam, keep
domain behavior in the deep module, and supply production transport and in-memory test adapters.

### Truly external

Third-party systems outside project control. Inject a narrow port and test through a fake or mock
adapter that models only the external behavior the module depends on.

## Seam Discipline

- Treat one-adapter seams as suspect indirection. Production plus a real test adapter often
  establishes justified variation.
- Keep internal seams private to the implementation. Do not expand the public interface merely
  because internal tests need control.
- Put transport and protocol details in adapters; keep the interface expressed in caller and domain
  terms.

## Test Migration

Replace tests on shallow internals with behavior tests at the deepened interface once equivalent
coverage exists. Avoid layering both suites indefinitely. The surviving tests should assert
observable results and remain stable across implementation refactors.

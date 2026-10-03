import {
  type FixtureScan,
  listFixtureOwnerPaths,
  type OwnedCases,
  scanFixtures,
} from "./owned-cases.js";

// Scans every catalog plugin fixture and every repo-local fixture for the seed's seeded cases:
// cases whose resolved workspace names the seed.
export async function findSeededFixtures(
  repoRoot: string,
  seedName: string,
): Promise<FixtureScan<OwnedCases>> {
  return scanFixtures(repoRoot, await listFixtureOwnerPaths(repoRoot), (fixture, owner) => {
    const caseIds = fixture.cases
      .filter((testCase) => testCase.workspace?.seed === seedName)
      .map((testCase) => testCase.id);
    return caseIds.length > 0 ? { ...owner, caseIds } : undefined;
  });
}

import path from "node:path";

import { error, type ValidationContext } from "./diagnostics.js";
import { getOptionalObject, getOptionalString, getString, validateStringArray } from "./schema.js";
import type { JsonObject } from "./types.js";
import { validateUrlString } from "./urls.js";

export type ManifestLocation = {
  manifestPath: string;
  pluginPath: string;
};

export type CommonManifestFields = {
  author?: JsonObject;
  name?: string;
};

// The manifest-field contract shared by the portable manifest and the Claude extension. Both
// validators call this so field, alignment, and author rules cannot drift between the two.
export function validateCommonManifestFields(
  context: ValidationContext,
  manifest: JsonObject,
  location: ManifestLocation & { catalogName?: string | undefined },
): CommonManifestFields {
  const { manifestPath } = location;
  const manifestName = getString(context, manifest, "name", manifestPath, "/name");
  // Repository decision: Agent Plugins 1.0.0 leaves version and description optional, but version
  // lockstep and the catalogs depend on both, so this repository requires them in every manifest.
  getString(context, manifest, "version", manifestPath, "/version");
  getString(context, manifest, "description", manifestPath, "/description");

  const repository = getOptionalString(
    context,
    manifest,
    "repository",
    manifestPath,
    "/repository",
  );
  validateUrlString(context, repository, manifestPath, "/repository", "url/http");

  const homepage = getOptionalString(context, manifest, "homepage", manifestPath, "/homepage");
  validateUrlString(context, homepage, manifestPath, "/homepage", "url/http");

  if (
    manifestName !== undefined &&
    location.catalogName !== undefined &&
    manifestName !== location.catalogName
  ) {
    error(
      context,
      "alignment/name",
      manifestPath,
      `Manifest name "${manifestName}" does not match marketplace name "${location.catalogName}".`,
      "/name",
    );
  }

  if (manifestName !== undefined && path.basename(location.pluginPath) !== manifestName) {
    error(
      context,
      "alignment/directory-name",
      manifestPath,
      `Plugin directory "${path.basename(location.pluginPath)}" does not match manifest name "${manifestName}".`,
      "/name",
    );
  }

  const author = getOptionalObject(context, manifest, "author", manifestPath, "/author");
  if (author !== undefined) {
    getString(context, author, "name", manifestPath, "/author/name");
    const authorUrl = getOptionalString(context, author, "url", manifestPath, "/author/url");
    validateUrlString(context, authorUrl, manifestPath, "/author/url", "url/http");
    getOptionalString(context, author, "email", manifestPath, "/author/email");
  }

  getOptionalString(context, manifest, "license", manifestPath, "/license");
  validateStringArray(context, manifest["keywords"], "keywords", manifestPath, "/keywords", {
    required: false,
  });

  return {
    ...(author === undefined ? {} : { author }),
    ...(manifestName === undefined ? {} : { name: manifestName }),
  };
}

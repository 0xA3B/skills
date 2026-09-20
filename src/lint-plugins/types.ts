export type JsonObject = Record<string, unknown>;

export type LocalCatalogEntry = {
  category: string | undefined;
  name: string;
  pluginPath: string;
  pointer: string;
  sourcePath: string;
};

export type Catalog = {
  localEntries: LocalCatalogEntry[];
  marketplacePath: string;
};

export type ClaudeCatalogEntry = {
  name: string;
  pluginPath: string;
  pointer: string;
  sourcePath: string;
};

export type ClaudeCatalog = {
  localEntries: ClaudeCatalogEntry[];
  marketplacePath: string;
  present: boolean;
};

export type PluginTargets = {
  claude: boolean;
  codex: boolean;
};

// An unreadable portable manifest leaves Codex presence unknown, not absent.
export type PluginTargetPresence = {
  claude: boolean;
  codex: boolean | undefined;
};

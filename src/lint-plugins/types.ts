export type JsonObject = Record<string, unknown>;

export type LocalCatalogEntry = {
  category: string | undefined;
  manifestPath: string;
  name: string;
  pluginPath: string;
  pointer: string;
  sourcePath: string;
};

export type RemoteCatalogEntry = {
  name: string;
  pointer: string;
  source: JsonObject;
};

export type Catalog = {
  localEntries: Map<string, LocalCatalogEntry>;
  marketplacePath: string;
  remoteEntries: RemoteCatalogEntry[];
};

export type ClaudeCatalogEntry = {
  manifestPath: string;
  name: string;
  pluginPath: string;
  pointer: string;
  sourcePath: string;
};

export type ClaudeCatalog = {
  localEntries: Map<string, ClaudeCatalogEntry>;
  marketplacePath: string;
  present: boolean;
};

export type PluginTargets = {
  claude: boolean;
  codex: boolean;
};

export type ComponentPathRule = {
  expectedKind: "directory" | "file";
  fieldName: string;
  pointer: string;
  value: unknown;
};

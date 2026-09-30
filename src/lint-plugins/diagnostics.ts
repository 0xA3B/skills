// Every diagnostic fails the lint run: there is no warning severity, so a rule either reports a
// problem to fix or does not exist (#147).
export type Diagnostic = {
  filePath: string;
  message: string;
  ruleId: string;
  pointer?: string;
};

export type ValidationContext = {
  diagnostics: Diagnostic[];
  repoRoot: string;
};

export type ValidationOptions = {
  repoRoot?: string;
};

export function createValidationContext(options: ValidationOptions = {}): ValidationContext {
  return {
    diagnostics: [],
    repoRoot: options.repoRoot ?? process.cwd(),
  };
}

export function error(
  context: ValidationContext,
  ruleId: string,
  filePath: string,
  message: string,
  pointer?: string,
): void {
  context.diagnostics.push({
    filePath,
    message,
    ruleId,
    ...(pointer === undefined ? {} : { pointer }),
  });
}

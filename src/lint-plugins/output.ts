import type { ValidationContext } from "./diagnostics.js";
import { relativeDisplay } from "./paths.js";

type DiagnosticWriter = (message: string) => void;

export function printDiagnostics(
  context: ValidationContext,
  write: DiagnosticWriter = console.error,
): void {
  const sortedDiagnostics = [...context.diagnostics].sort((left, right) =>
    relativeDisplay(context, left.filePath, left.pointer).localeCompare(
      relativeDisplay(context, right.filePath, right.pointer),
    ),
  );

  for (const diagnostic of sortedDiagnostics) {
    write(
      `- ${diagnostic.ruleId} ${relativeDisplay(
        context,
        diagnostic.filePath,
        diagnostic.pointer,
      )}: ${diagnostic.message}`,
    );
  }
}

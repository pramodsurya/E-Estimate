import { hashText64 } from "./compileCache";
import {
  applyDocumentSettingsToTypst,
  parseDocumentSettingsFromTypst,
} from "./documentSettings";

/** Upgrade only the previous unedited built-in layout; preserve custom scripts and page settings. */
export function upgradeBuiltInDataTemplate(
  saved: string,
  currentDefault: string,
): string {
  const shape = saved
    .replace(/\r\n/g, "\n")
    .replace(
      /\/\/ E-Estimate document settings: begin[\s\S]*?\/\/ E-Estimate document settings: end/,
      "",
    )
    .trim();
  const previousDefaults = new Map([
    [17729, "1a5b25985d195e39"],
    [19705, "d6650f9c0fb3c471"],
  ]);
  if (previousDefaults.get(shape.length) !== hashText64(shape)) return saved;
  return applyDocumentSettingsToTypst(
    currentDefault,
    parseDocumentSettingsFromTypst(saved),
  );
}

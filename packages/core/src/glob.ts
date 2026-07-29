const escapeRegex = (value: string): string => value.replace(/[|\\{}()[\]^$+.]/g, "\\$&");

export const matchesGlob = (value: string, pattern: string): boolean => {
  const directoryToken = "__DOUBLE_STAR_DIRECTORY__";
  const starToken = "__DOUBLE_STAR__";
  const questionToken = "__SINGLE_CHARACTER__";
  const source = escapeRegex(pattern)
    .replace(/\?/g, questionToken)
    .replace(/\*\*\//g, directoryToken)
    .replace(/\*\*/g, starToken)
    .replace(/\*/g, "[^/]*")
    .replace(new RegExp(directoryToken, "g"), "(?:.*/)?")
    .replace(new RegExp(starToken, "g"), ".*")
    .replace(new RegExp(questionToken, "g"), "[^/]");
  return new RegExp(`^${source}$`, "u").test(value);
};

export const matchesAny = (value: string, patterns: string[]): boolean =>
  patterns.some((pattern) => matchesGlob(value, pattern));

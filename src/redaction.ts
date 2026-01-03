import { LogRecord, RedactionConfig, RedactionRule } from "./types";

const DEFAULT_REPLACEMENT = "[REDACTED]";

const DEFAULT_RULES: RedactionRule[] = [
  {
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  },
  {
    pattern: /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
  },
  {
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
  },
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
];

export interface RedactionState {
  enabled: boolean;
  replacement: string;
  rules: RedactionRule[];
}

const toGlobal = (pattern: RegExp): RegExp => {
  if (pattern.global) {
    return pattern;
  }
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
};

export const resolveRedaction = (
  config: RedactionConfig | undefined
): RedactionState => {
  const safeByDefault = config?.safeByDefault ?? true;
  const enabled = config?.enabled ?? safeByDefault;
  const rules = [
    ...(safeByDefault ? DEFAULT_RULES : []),
    ...(config?.rules ?? []),
  ];
  return {
    enabled,
    replacement: config?.replacement ?? DEFAULT_REPLACEMENT,
    rules: rules.map((rule) => ({
      ...rule,
      pattern: toGlobal(rule.pattern),
    })),
  };
};

const redactString = (value: string, state: RedactionState): string => {
  return state.rules.reduce((result, rule) => {
    const replacement = rule.replacement ?? state.replacement;
    return result.replace(rule.pattern, replacement);
  }, value);
};

export const redactValue = (
  value: unknown,
  state: RedactionState,
  seen: WeakSet<object>
): unknown => {
  if (!state.enabled) {
    return value;
  }
  if (typeof value === "string") {
    return redactString(value, state);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, state, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    output[key] = redactValue(val, state, seen);
  }
  return output;
};

export const redactRecord = (
  record: LogRecord,
  state: RedactionState
): LogRecord => {
  if (!state.enabled) {
    return record;
  }

  const seen = new WeakSet<object>();
  return {
    ...record,
    message: redactString(record.message, state),
    meta: record.meta
      ? (redactValue(record.meta, state, seen) as Record<string, unknown>)
      : undefined,
  };
};

import type { Channel, ChannelConfig, ChannelField } from "./api.ts";

/** What the backend returns for a stored secret; sent back, it keeps the value. */
export const SECRET_PLACEHOLDER = "********";

export type FormValues = Record<string, string>;

export function initialValues(
  fields: ChannelField[],
  channel?: Pick<Channel, "config">
): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    const stored = channel?.config[field.key];
    const value = stored ?? (channel ? "" : field.default);
    values[field.key] =
      value === null || value === undefined ? "" : String(value);
  }
  return values;
}

/** Number fields are sent as numbers; an empty number field is left out. */
export function buildConfig(
  fields: ChannelField[],
  values: FormValues
): ChannelConfig {
  const config: ChannelConfig = {};
  for (const field of fields) {
    const raw = values[field.key] ?? "";
    if (field.type === "number") {
      const n = raw.trim();
      if (n !== "" && Number.isFinite(Number(n))) config[field.key] = Number(n);
    } else {
      config[field.key] = field.secret ? raw : raw.trim();
    }
  }
  return config;
}

export function missingRequired(
  fields: ChannelField[],
  values: FormValues
): ChannelField[] {
  return fields.filter(
    (f) => f.required && (values[f.key] ?? "").trim() === ""
  );
}

/**
 * The unsaved-test endpoint has no access to stored secrets, so a form that
 * still holds the placeholder can only be tested through the saved channel.
 */
export function hasStoredSecrets(
  fields: ChannelField[],
  values: FormValues
): boolean {
  return fields.some((f) => f.secret && values[f.key] === SECRET_PLACEHOLDER);
}

export function sameValues(a: FormValues, b: FormValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if ((a[key] ?? "") !== (b[key] ?? "")) return false;
  return true;
}

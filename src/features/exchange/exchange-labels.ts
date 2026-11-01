import type { ExchangeFatalCode, ExchangeIssueCode } from "@/lib/exchange";
import type { TranslationKey } from "@/lib/i18n/translations";

/** Sunucunun ve dosya ayrıştırıcının kod → çeviri anahtarı eşlemeleri (kodlar veritabanında/dosyada çevrilmeden kalır). */
export const ISSUE_KEYS: Record<ExchangeIssueCode, TranslationKey> = {
  required: "exchange.issue.required",
  too_long: "exchange.issue.too_long",
  invalid_content_type: "exchange.issue.invalid_content_type",
  invalid_tag: "exchange.issue.invalid_tag",
  too_many_tags: "exchange.issue.too_many_tags",
  invalid_tool: "exchange.issue.invalid_tool",
  too_many_tools: "exchange.issue.too_many_tools",
  invalid_variable: "exchange.issue.invalid_variable",
  too_many_variables: "exchange.issue.too_many_variables",
  invalid_row: "exchange.issue.invalid_row",
  invalid_selection: "exchange.issue.invalid_selection",
  invalid_steps: "exchange.issue.invalid_steps",
  invalid_connection: "exchange.issue.invalid_connection",
  too_many_steps: "exchange.issue.too_many_steps",
  missing_frontmatter: "exchange.issue.missing_frontmatter",
};

export const FATAL_KEYS: Record<ExchangeFatalCode | "fetch_failed" | "bad_url", TranslationKey> = {
  empty: "exchange.fatal.empty",
  too_large: "exchange.fatal.too_large",
  invalid_json: "exchange.fatal.invalid_json",
  invalid_csv: "exchange.fatal.invalid_csv",
  unsupported_version: "exchange.fatal.unsupported_version",
  unknown_format: "exchange.fatal.unknown_format",
  missing_columns: "exchange.fatal.missing_columns",
  too_many_items: "exchange.fatal.too_many_items",
  markdown_separator: "exchange.fatal.markdown_separator",
  fetch_failed: "exchange.fatal.fetch_failed",
  bad_url: "exchange.fatal.bad_url",
};

export const FIELD_KEYS: Record<string, TranslationKey> = {
  title: "exchange.field.title",
  description: "exchange.field.description",
  promptText: "exchange.field.promptText",
  contentType: "exchange.field.contentType",
  tools: "exchange.field.tools",
  tags: "exchange.field.tags",
  variables: "exchange.field.variables",
  creativeDirection: "exchange.field.creativeDirection",
  selection: "exchange.field.selection",
  steps: "exchange.field.steps",
  schemaVersion: "exchange.field.schemaVersion",
};

export const WARNING_KEYS: Record<string, TranslationKey> = {
  category_dropped: "exchange.import.warning.category_dropped",
  subcategory_dropped: "exchange.import.warning.subcategory_dropped",
  prompt_unavailable: "exchange.import.warning.prompt_unavailable",
};

/** `import_prompts`'in bilinçli fırlattığı kısa kodlar (`raise exception 'too_many_items'`). */
export const SERVER_ERROR_KEYS: Record<string, TranslationKey> = {
  not_authenticated: "exchange.import.error.not_authenticated",
  too_many_items: "exchange.import.error.too_many_items",
};

export function issueKey(code: string | undefined): TranslationKey {
  return ISSUE_KEYS[code as ExchangeIssueCode] ?? "exchange.issue.invalid_row";
}

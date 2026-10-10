import { configure, getConsoleSink, jsonLinesFormatter } from "@logtape/logtape";
import { redactByPattern, type RedactionPatterns } from "@logtape/redaction";
import { env } from "cloudflare:workers";

export async function initialize() {
  const patterns: RedactionPatterns = [
    {
      pattern: new RegExp(env.INCOMING_WEBHOOK_URL_01, "g"),
      replacement: "[REDACT INCOMING_WEBHOOK_URL_01]",
    },
    {
      pattern: new RegExp(env.INCOMING_WEBHOOK_URL_02, "g"),
      replacement: "[REDACT INCOMING_WEBHOOK_URL_02]",
    },
    {
      pattern: new RegExp(env.CLOUDFLARE_ACCOUNT_ID, "g"),
      replacement: "[REDACT CLOUDFLARE_ACCOUNT_ID]",
    },
  ];

  await configure({
    sinks: {
      console: getConsoleSink({ formatter: redactByPattern(jsonLinesFormatter, patterns) }),
    },
    loggers: [
      { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "warning" },
      { category: ["app"], sinks: ["console"], lowestLevel: "debug" },
    ],
  });
}

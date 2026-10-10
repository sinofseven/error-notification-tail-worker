import { getLogger } from "@logtape/logtape";
import { env } from "cloudflare:workers";

import { initialize, loggingSyncFunctionWrapper, loggingAsyncFunctionWrapper } from "@/logger";

const ALL_WEBHOOK_URLS = [env.INCOMING_WEBHOOK_URL_01, env.INCOMING_WEBHOOK_URL_02];
const logger = getLogger(["app"]);

await initialize();

type NotificationInfo = {
  workerName: string;
  eventTimestamp: number;
};

type ItemErrorLog = NotificationInfo & {
  type: "error_log";
};

type ItemFailedExecution = NotificationInfo & {
  type: "failed_execution";
};

type ParsedItem = { type: "ok" } | ItemErrorLog | ItemFailedExecution;

const parseTrailItem = loggingSyncFunctionWrapper(
  (item: TraceItem): ParsedItem => {
    const workerName = item.scriptName as string;
    const eventTimestamp = item.eventTimestamp as number;

    for (const log of item.logs) {
      if (log.level.toLowerCase() === "error") {
        return {
          type: "error_log",
          workerName,
          eventTimestamp,
        };
      }
    }

    if (item.outcome !== "ok") {
      return {
        type: "failed_execution",
        workerName,
        eventTimestamp,
      };
    }

    return { type: "ok" };
  },
  { write: false },
);

const generateObservabilityUrl = loggingSyncFunctionWrapper(
  ({ eventTimestamp, workerName }: { eventTimestamp: number; workerName: string }): string => {
    const unixTimeMsStart = eventTimestamp - 1000;

    // WorkersのPaid Planだと最大5分だから。あと開始日時を1秒戻しているから一秒足す
    // 5 (min) * 60 (sec/min) * 1000 (ms/sec) = 300000 (ms)
    const unixTimeMsEnd = unixTimeMsStart + 1000 + 300000;

    const dtStart = new Date(unixTimeMsStart);
    const dtEnd = new Date(unixTimeMsEnd);

    const params = new URLSearchParams();
    params.append("timeframe", `${dtStart.toISOString()}/${dtEnd.toISOString()}`);

    return [
      "https://dash.cloudflare.com/",
      env.CLOUDFLARE_ACCOUNT_ID,
      "/worers/services/view/",
      workerName,
      "/production/observability/events?",
      params.toString(),
    ].join("");
  },
  { write: false },
);

const generateMessage = loggingSyncFunctionWrapper(
  ({ workerName, eventTimestamp, type }: ItemErrorLog | ItemFailedExecution): string => {
    const url = generateObservabilityUrl({ workerName, eventTimestamp });
    const summary: string = type === "error_log" ? "Error Log output" : "Worker Execution failed";
    const blocks = [
      {
        type: "section",
        text: { type: "mrkdwn", text: `<!channel> ${summary} \`${new Date().toISOString()}\`` },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Worker Name:* \`${workerName}\`` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Timestamp:* \`${new Date(eventTimestamp).toISOString()}\``,
        },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*type:* \`${summary}\`` },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "to Log" },
            url,
          },
        ],
      },
    ];

    return JSON.stringify({ blocks });
  },
  { write: false },
);

const sendMessage = loggingAsyncFunctionWrapper(
  async (body: string) => {
    const option: RequestInit<RequestInitCfProperties> = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    };
    const allResults = await Promise.allSettled(ALL_WEBHOOK_URLS.map((url) => fetch(url, option)));
    const errors = [];

    for (const result of allResults) {
      if (result.status === "rejected") {
        errors.push(new Error("failed to post notification", { cause: { reason: result.reason } }));
      } else {
        const resp = result.value;
        if (resp.ok) {
          continue;
        }
        errors.push(
          new Error("failed to post notification", {
            cause: { text: await resp.text(), status: resp.status },
          }),
        );
      }
    }

    if (errors.length > 0) {
      throw new Error("failed to post notification", { cause: { errors } });
    }
  },
  { write: false },
);

export default {
  async tail(allEvents) {
    const allErrors = [];
    for (const event of allEvents) {
      try {
        const item = parseTrailItem(event);
        if (item.type === "ok") {
          continue;
        }
        const body = generateMessage(item);
        await sendMessage(body);
      } catch (e) {
        allErrors.push(
          new Error("failed to send message", {
            cause: {
              error: e,
              tailEvent: event,
            },
          }),
        );
      }
    }

    if (allErrors.length > 0) {
      for (const err of allErrors) {
        logger.warning(err);
      }

      logger.error("has failed slack notification");
    }
  },
} satisfies ExportedHandler;

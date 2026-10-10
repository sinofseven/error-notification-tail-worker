import { getLogger, type Logger } from "@logtape/logtape";

export type PropsLoggingFunctionWrapper = {
  logger?: Logger;
  write?: boolean;
  withArgs?: boolean;
  withReturn?: boolean;
  name?: string;
};

function parseProps(props?: PropsLoggingFunctionWrapper): Required<PropsLoggingFunctionWrapper> {
  return {
    logger: props?.logger ?? getLogger(["app", "decorator"]),
    write: props?.write ?? true,
    withArgs: props?.withArgs ?? true,
    withReturn: props?.withReturn ?? true,
    name: props?.name ?? "",
  };
}

export function loggingSyncFunctionWrapper<Args extends unknown[], R>(
  func: (...args: Args) => R,
  props?: PropsLoggingFunctionWrapper,
): (...args: Args) => R {
  const { logger, write, withArgs, withReturn, name } = parseProps(props);
  const functionName = name || func.name;
  return (...args: Args): R => {
    const callId = crypto.randomUUID();
    if (write) {
      logger.debug(`function '${functionName}' start (${callId})`, {
        functionName,
        callId,
        args: withArgs ? args : undefined,
      });
    }
    try {
      const resp = func(...args);
      if (write) {
        logger.debug(`function '${functionName}' succeeded (${callId})`, {
          functionName,
          callId,
          return: withReturn ? resp : undefined,
        });
      }
      return resp;
    } catch (e) {
      logger.warning(`function '${functionName}' failed (${callId}): ${e}`, {
        functionName,
        callId,
        args,
        error: e,
      });
      throw e;
    }
  };
}

export function loggingAsyncFunctionWrapper<Args extends unknown[], R>(
  func: (...args: Args) => Promise<R>,
  props?: PropsLoggingFunctionWrapper,
): (...args: Args) => Promise<R> {
  const { logger, write, withArgs, withReturn, name } = parseProps(props);
  const functionName = name || func.name;
  return async (...args: Args): Promise<R> => {
    const callId = crypto.randomUUID();
    if (write) {
      logger.debug(`function '${functionName}' start (${callId})`, {
        functionName,
        callId,
        args: withArgs ? args : undefined,
      });
    }
    try {
      const resp = await func(...args);
      if (write) {
        logger.debug(`function '${functionName}' succeeded (${callId})`, {
          functionName,
          callId,
          return: withReturn ? resp : undefined,
        });
      }
      return resp;
    } catch (e) {
      logger.warning(`function '${functionName}' failed (${callId}): ${e}`, {
        functionName,
        callId,
        args,
        error: e,
      });
      throw e;
    }
  };
}

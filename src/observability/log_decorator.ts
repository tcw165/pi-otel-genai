import { log } from "./log.js";

/**
 * Method decorator that logs method entry using the given prefix.
 * If prefix is omitted, the class name is used.
 *
 * Usage:
 *   @logCall("span_manager")
 *   onSessionStart(args: SessionStartArgs) { ... }
 *
 *   @logCall()
 *   onSessionStart(args: SessionStartArgs) { ... }
 *
 * Logs: { event: "<prefix|ClassName>.onSessionStart", ...args }
 */
export function logCall(prefix: string | undefined = undefined) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: any[]) => any;
    descriptor.value = function (this: object, ...args: any[]) {
      const resolvedPrefix =
        prefix ?? this.constructor.name ?? target.constructor.name;
      log(`${resolvedPrefix}.${propertyKey}`, args[0] as Record<string, unknown>);
      return original.apply(this, args);
    };
    return descriptor;
  };
}

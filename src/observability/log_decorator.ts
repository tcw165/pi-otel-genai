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
    // Babel (used by jiti at runtime) passes a synthetic descriptor where `value`
    // may be undefined. Read the method directly from the prototype instead.
    const original = (
      Object.getOwnPropertyDescriptor(target, propertyKey)?.value ??
      descriptor.value
    ) as (...args: any[]) => any;
    descriptor.value = function (this: object, ...args: any[]) {
      const resolvedPrefix =
        prefix ?? this.constructor.name ?? target.constructor.name;
      try {
        log(`${resolvedPrefix}.${propertyKey}`, args[0] as Record<string, unknown>);
      } catch {
        // Logging must never break the decorated method
      }
      if (typeof original === 'function') {
        return original.apply(this, args);
      }
      return undefined;
    };
    return descriptor;
  };
}

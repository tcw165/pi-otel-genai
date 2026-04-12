import { describe, expect, it, vi, beforeEach } from "vitest";
import { logCall } from "@this/observability/log_decorator.js";
import * as logModule from "@this/observability/log.js";

describe("logCall decorator", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the original method and returns its value", () => {
    class Foo {
      @logCall("test")
      greet(args: { name: string }): string {
        return `hello ${args.name}`;
      }
    }

    vi.spyOn(logModule, "log").mockImplementation(() => {});
    const result = new Foo().greet({ name: "world" });
    expect(result).toBe("hello world");
  });

  it("logs with the given prefix and method name", () => {
    const logSpy = vi.spyOn(logModule, "log").mockImplementation(() => {});

    class Bar {
      @logCall("my_module")
      doWork(args: { x: number }): void {}
    }

    new Bar().doWork({ x: 42 });
    expect(logSpy).toHaveBeenCalledWith("my_module.doWork", { x: 42 });
  });

  it("logs each decorated method under its own name", () => {
    const logSpy = vi.spyOn(logModule, "log").mockImplementation(() => {});

    class Svc {
      @logCall("svc")
      start(args: { id: string }): void {}

      @logCall("svc")
      stop(args: { id: string }): void {}
    }

    const svc = new Svc();
    svc.start({ id: "a" });
    svc.stop({ id: "a" });

    expect(logSpy).toHaveBeenCalledWith("svc.start", { id: "a" });
    expect(logSpy).toHaveBeenCalledWith("svc.stop", { id: "a" });
  });

  it("uses the class name as prefix when none is given", () => {
    const logSpy = vi.spyOn(logModule, "log").mockImplementation(() => {});

    class MyService {
      @logCall()
      doThing(args: { x: number }): void {}
    }

    new MyService().doThing({ x: 1 });
    expect(logSpy).toHaveBeenCalledWith("MyService.doThing", { x: 1 });
  });
});

describe("log output format", () => {
  it("writes logcat-style line: MM-DD HH:MM:SS.mmm  D/tag: method key=val", () => {
    const lines: string[] = [];
    vi.spyOn(logModule, "log").mockImplementation(
      (event, data, level = "D") => {
        const dotIdx = event.indexOf(".");
        const tag = dotIdx >= 0 ? event.slice(0, dotIdx) : event;
        const method = dotIdx >= 0 ? event.slice(dotIdx + 1) : "";
        const dataPart = data
          ? " " +
            Object.entries(data)
              .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
              .join(" ")
          : "";
        lines.push(`${level}/${tag}: ${method}${dataPart}`);
      },
    );

    class Svc {
      @logCall("span_manager")
      onSessionStart(args: { sessionId: string }): void {}
    }

    new Svc().onSessionStart({ sessionId: "s-1" });
    expect(lines[0]).toBe("D/span_manager: onSessionStart sessionId=s-1");
  });
});

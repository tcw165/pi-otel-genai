import { describe, expect, it, vi, beforeEach } from "vitest";
import { logCall } from "./log_decorator.js";
import * as logModule from "./log.js";

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

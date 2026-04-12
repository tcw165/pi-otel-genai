import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import type { TelemetryConfig } from "@this/types.js";

export interface TraceRuntime {
  tracer: ReturnType<typeof trace.getTracer>;
  exporter: string;
  endpoint: string;
  forceFlush: () => Promise<void>;
  shutdown: () => Promise<void>;
}

export function createTraceRuntime(config: TelemetryConfig, onError?: (error: unknown) => void): TraceRuntime {
  const spanProcessors = [] as BatchSpanProcessor[];

  if (config.traces.exporter === "otlp") {
    spanProcessors.push(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: config.traces.endpoint,
          headers: config.traces.headers,
        }),
        { scheduledDelayMillis: 1 * 1000 },
      ),
    );
  }

  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      "service.name": config.serviceName,
      "service.version": config.serviceVersion,
    }),
    spanProcessors,
  });

  trace.setGlobalTracerProvider(provider);

  const tracer = provider.getTracer("pi-opentelemetry", config.serviceVersion);

  return {
    tracer,
    exporter: config.traces.exporter,
    endpoint: config.traces.endpoint,
    forceFlush: async () => {
      try {
        await provider.forceFlush();
      } catch (error) {
        onError?.(error);
      }
    },
    shutdown: async () => {
      try {
        await provider.forceFlush();
        await provider.shutdown();
      } catch (error) {
        onError?.(error);
      }
    },
  };
}

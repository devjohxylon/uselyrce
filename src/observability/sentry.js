import * as Sentry from "@sentry/node";

const dsn = String(process.env.SENTRY_DSN || "").trim();
const enabled = Boolean(dsn);

if (enabled) {
  Sentry.init({
    dsn,
    environment:
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      "development",
    release: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.05") || 0.05,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.cookie;
        delete event.request.headers.authorization;
        delete event.request.headers["stripe-signature"];
      }
      return event;
    },
  });
}

export function isSentryEnabled() {
  return enabled;
}

export function captureException(error, hint) {
  if (!enabled) return;
  Sentry.captureException(error, hint);
}

export function captureMessage(message, level = "info") {
  if (!enabled) return;
  Sentry.captureMessage(message, level);
}

/** Call once after all Express routes are registered. */
export function attachSentryExpress(app) {
  if (!enabled) return;
  Sentry.setupExpressErrorHandler(app);
}

export function setupProcessHandlers() {
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason?.message ?? reason);
    captureException(reason instanceof Error ? reason : new Error(String(reason)));
  });
  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    captureException(error);
  });
}

export { Sentry };

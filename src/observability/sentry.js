import * as Sentry from "@sentry/node";

const dsn = String(process.env.SENTRY_DSN || "").trim();
const enabled = Boolean(dsn);

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|rcon|api[_-]?key|private/i;

function scrubValue(key, value) {
  if (SENSITIVE_KEY.test(String(key || ""))) return "[Filtered]";
  if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

function scrubObject(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 4) return obj;
  if (Array.isArray(obj)) return obj.map((v) => scrubObject(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") out[k] = scrubObject(v, depth + 1);
    else out[k] = scrubValue(k, v);
  }
  return out;
}

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
      if (event.request?.data && typeof event.request.data === "object") {
        event.request.data = scrubObject(event.request.data);
      }
      if (event.request?.query_string && typeof event.request.query_string === "object") {
        event.request.query_string = scrubObject(event.request.query_string);
      }
      if (event.extra) event.extra = scrubObject(event.extra);
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

/** Tag the active Sentry scope from an Express request (call after auth/tenancy). */
export function tagSentryRequest(req) {
  if (!enabled) return;
  const scope = Sentry.getCurrentScope();
  const orgId = req.orgFromHost?.id || req.session?.orgId || null;
  const serverId = req.session?.serverId || req.get?.("x-server-id") || null;
  if (orgId) scope.setTag("orgId", orgId);
  if (serverId) scope.setTag("serverId", String(serverId));
  if (req.session?.role) scope.setTag("role", req.session.role);
}

/** Attach org tags early; session tags are refreshed in requireAuth. */
export function sentryRequestContext(req, res, next) {
  tagSentryRequest(req);
  next();
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

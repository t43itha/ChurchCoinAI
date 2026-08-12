import * as Sentry from "@sentry/react";

let initialized = false;

export function initializeMonitoring() {
  if (initialized) return;
  initialized = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() || import.meta.env.MODE,
    enabled: true,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}
export function setMonitoringContext(
  userId: string | null,
  organizationId: string | null
) {
  if (!initialized) return;
  Sentry.setUser(userId ? { id: userId } : null);
  Sentry.setTag("organization_id", organizationId ?? "none");
}

export function captureRenderError(
  error: Error,
  errorInfo: React.ErrorInfo
) {
  Sentry.captureException(error, {
    contexts: {
      react: {
        componentStack: errorInfo.componentStack ?? "unavailable",
      },
    },
  });
}

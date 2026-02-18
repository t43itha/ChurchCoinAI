export type AppNotifyPayload = {
  title: string;
  message: string;
};

const APP_NOTIFY_EVENT = "churchcoin:notify";

export const notify = (title: string, message: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AppNotifyPayload>(APP_NOTIFY_EVENT, {
      detail: { title, message },
    })
  );
};

export const subscribeToNotifications = (
  handler: (payload: AppNotifyPayload) => void
) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<AppNotifyPayload>;
    if (!customEvent.detail) {
      return;
    }
    handler(customEvent.detail);
  };

  window.addEventListener(APP_NOTIFY_EVENT, listener as EventListener);
  return () =>
    window.removeEventListener(APP_NOTIFY_EVENT, listener as EventListener);
};

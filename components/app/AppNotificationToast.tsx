import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, X } from "lucide-react";

export type AppNotification = {
  visible: boolean;
  title: string;
  message: string;
};

interface AppNotificationToastProps {
  notification: AppNotification;
  onClose: () => void;
}

const AppNotificationToast: React.FC<AppNotificationToastProps> = ({
  notification,
  onClose,
}) => {
  // The toast gets its own body child, so a walkthrough dialog can make the app root inert without
  // silencing this live region or its close button. useDialogFocus leaves that child alone.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const element = document.createElement("div");
    element.setAttribute("data-dialog-exempt", "");
    document.body.appendChild(element);
    setHost(element);
    return () => {
      element.remove();
    };
  }, []);

  if (!notification.visible || !host) {
    return null;
  }

  return createPortal(
    <div
      className="fixed top-4 right-4 z-[100] bg-charcoal text-white shadow-soft-lg rounded-xl p-4 flex items-start gap-3 animate-enter max-w-sm border border-ink"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="mt-0.5 w-6 h-6 rounded-full bg-sage flex items-center justify-center text-white shrink-0">
        <CheckCircle2 size={14} strokeWidth={3} />
      </div>
      <div>
        <h4 className="text-sm font-bold">{notification.title}</h4>
        <p className="text-xs text-grey-light mt-0.5 leading-relaxed">
          {notification.message}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-grey-light hover:text-white transition-colors ml-2"
        aria-label="Close notification"
      >
        <X size={14} />
      </button>
    </div>,
    host
  );
};

export default AppNotificationToast;

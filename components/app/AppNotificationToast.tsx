import React from "react";
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
  if (!notification.visible) {
    return null;
  }

  return (
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
    </div>
  );
};

export default AppNotificationToast;

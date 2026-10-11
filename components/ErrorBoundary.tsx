import React from "react";
import { captureRenderError } from "../lib/monitoring";
import { storeSupportDraft } from "../lib/supportDraft";
import { btnMd, btnOutline, btnPrimary } from "./wizard/ui";

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: "",
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || "Unexpected application error",
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Unhandled render error:", error, errorInfo);
    captureRenderError(error, errorInfo);
  }

  private reportProblem = () => {
    const page = window.location.pathname || "/unknown";
    storeSupportDraft({
      type: "bug",
      impact: "blocking",
      title: "Application page stopped unexpectedly",
      description: `ChurchCoin showed an unexpected error while opening ${page}. Please describe what you were doing immediately before this happened.`,
    });
    window.location.assign("/dashboard?support=1");
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-paper text-ink flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-ledger rounded-xl shadow-soft-md p-6">
          <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
          <p className="text-sm text-grey-dark mb-4">
            The app hit an unexpected error and couldn't keep going.
          </p>
          <p className="text-xs font-mono bg-paper border border-ledger rounded-2xl p-3 mb-5 break-words">
            {this.state.errorMessage}
          </p>
          <div className="grid gap-2.5 sm:flex sm:flex-wrap">
            <button type="button" onClick={this.reportProblem} className={`${btnPrimary} ${btnMd} !w-auto px-5`}>
              Report this problem
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={`${btnOutline} ${btnMd} !w-auto px-5`}
            >
              Reload the app
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;

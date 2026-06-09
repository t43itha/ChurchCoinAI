import React from "react";

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
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-paper text-ink flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-ledger rounded-xl shadow-soft-md p-6">
          <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
          <p className="text-sm text-grey-dark mb-4">
            The app hit an unexpected error and could not continue rendering.
          </p>
          <p className="text-xs font-mono bg-paper border border-ledger rounded p-3 mb-5 break-words">
            {this.state.errorMessage}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary px-4 py-2 text-sm font-bold"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;

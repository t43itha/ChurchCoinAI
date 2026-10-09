import React from 'react';

type ReportsErrorBoundaryProps = {
  children: React.ReactNode;
};

type ReportsErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ReportsErrorBoundary extends React.Component<
  ReportsErrorBoundaryProps,
  ReportsErrorBoundaryState
> {
  constructor(props: ReportsErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Reports error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-ledger bg-white p-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error-light">
            <span className="text-xl font-bold text-error">!</span>
          </div>
          <h3 className="mb-2 text-lg font-bold text-ink">Something went wrong</h3>
          <p className="mb-6 max-w-md text-sm text-grey-mid">
            An error occurred while loading the report. This may be due to a data sync issue.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-[10px] bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-charcoal"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

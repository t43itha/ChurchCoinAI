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
        <div className="swiss-card p-12 flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="w-12 h-12 bg-error-light rounded-full flex items-center justify-center mb-4">
            <span className="text-error text-xl font-bold">!</span>
          </div>
          <h3 className="text-lg font-bold text-ink mb-2">Something went wrong</h3>
          <p className="text-sm text-grey-mid mb-6 max-w-md">
            An error occurred while loading the report. This may be due to a data sync issue.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-6 py-2.5 bg-ink text-white rounded-[10px] text-sm font-semibold hover:bg-charcoal transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}


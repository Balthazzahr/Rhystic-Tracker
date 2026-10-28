import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full bg-neutral-950 text-white p-4 flex flex-col items-center justify-center text-center select-none border border-red-500/30">
          <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
          <h2 className="text-xs font-sans font-bold uppercase tracking-wider text-red-400 mb-1">
            {this.props.fallbackTitle || 'Component Error'}
          </h2>
          <p className="text-[11px] font-mono text-neutral-400 mb-3 max-w-[220px] break-words">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={this.handleReload}
            className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 border border-white/20 text-xs font-sans font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 text-amber-400" />
            <span>Retry</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

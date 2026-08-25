import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center flex-col gap-4 px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-white text-2xl font-bold">Something went wrong</h2>
          <p className="text-white/50 max-w-sm">Don't worry, your data is safe. Click below to reload the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-white text-black px-8 py-3 rounded-xl font-semibold hover:bg-white/90 transition-colors"
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

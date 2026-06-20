import { Component, type ErrorInfo, type ReactNode, Suspense } from "react";

type ChunkErrorBoundaryProps = {
  children: ReactNode;
};

type ChunkErrorBoundaryState = {
  hasError: boolean;
};

class ChunkErrorBoundary extends Component<ChunkErrorBoundaryProps, ChunkErrorBoundaryState> {
  state: ChunkErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ChunkErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell flex min-h-screen items-center justify-center px-6">
          <div className="glass-card w-full max-w-md p-8 text-center">
            <div className="text-lg font-semibold text-slate-100">페이지를 다시 불러와 주세요.</div>
            <div className="mt-2 text-sm text-slate-400">청크 로드에 실패했습니다. 새로고침 후 다시 시도해 주세요.</div>
            <button
              className="mt-6 rounded-2xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white"
              type="button"
              onClick={() => window.location.reload()}
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function RouteLoadBoundary({ children }: { children: ReactNode }) {
  return (
    <ChunkErrorBoundary>
      <Suspense
        fallback={
          <div className="app-shell flex min-h-screen items-center justify-center px-6">
            <div className="glass-card w-full max-w-md p-8 text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-pulse rounded-full bg-blue-500/20" />
              <div className="text-lg font-semibold text-slate-100">페이지를 불러오고 있습니다.</div>
              <div className="mt-2 text-sm text-slate-400">잠시만 기다려 주세요.</div>
            </div>
          </div>
        }
      >
        {children}
      </Suspense>
    </ChunkErrorBoundary>
  );
}

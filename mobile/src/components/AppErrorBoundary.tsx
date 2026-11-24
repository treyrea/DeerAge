import React from "react";
import { RecoveryScreen } from "./RecoveryScreen";
import { useDeerScoringStore } from "../state/deerScoringStore";

interface BoundaryState {
  failed: boolean;
}

/**
 * A render throw used to leave a white window, because nothing caught it.
 * This sits above the navigator on iOS and Android. Back to home remounts the tree.
 */
export class AppErrorBoundary extends React.Component<React.PropsWithChildren, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  private goHome = () => {
    try {
      useDeerScoringStore.getState().reset();
    } catch {
      // The store reset is best-effort. Remounting still leaves the crash.
    }
    this.setState({ failed: false });
  };

  render() {
    if (this.state.failed) return <RecoveryScreen onHome={this.goHome} />;
    return this.props.children;
  }
}

// Make the ambient `paper` type namespace (Point, Item, Group, …) available
// everywhere, and declare the global the CDN script installs on `window`.
/// <reference types="paper" />

declare global {
  // `paper-full.min.js` (loaded from the CDN in index.html) assigns the active
  // PaperScope here. We read it once in scope.ts.
  interface Window {
    paper: paper.PaperScope;
  }
}

export {};

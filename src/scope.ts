// The single Paper.js scope, taken from the global the CDN script installs.
//
// Import this as `paper` to use the library at runtime (`new paper.Group()`,
// `paper.view`, …). For *type* annotations use the ambient `paper` namespace
// directly (e.g. `paper.Item`, `paper.Point`) — see globals.d.ts.
const scope: paper.PaperScope = window.paper;
export default scope;

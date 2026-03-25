// Web Worker for high-precision timer ticks
// This helps bypass main thread throttling when the tab is backgrounded.
setInterval(() => {
  self.postMessage('tick');
}, 500);

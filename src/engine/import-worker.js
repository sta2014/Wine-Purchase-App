import { applyAction } from './actions.js';

// Keep large inventory normalization and history generation off the UI thread.
self.onmessage = ({ data }) => {
  try { self.postMessage({ state: applyAction(data.state, data.action) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};

// Single-flight wrapper for an async operation.
//
// Concurrent callers share one in-flight promise, so `run` executes at most
// once at a time. On success the resolved promise is retained so the operation
// runs once for the lifetime of the wrapper. On failure the cached promise is
// dropped so the next call retries instead of hanging onto a rejected promise.
//
// `run` is always invoked asynchronously (via a resolved promise), so a
// synchronous throw is turned into a rejection and still resets the cache.
export const singleFlight = (run) => {
  let inFlight = null;

  return (...args) => {
    if (!inFlight) {
      inFlight = Promise.resolve()
        .then(() => run(...args))
        .catch((error) => {
          inFlight = null;
          throw error;
        });
    }
    return inFlight;
  };
};

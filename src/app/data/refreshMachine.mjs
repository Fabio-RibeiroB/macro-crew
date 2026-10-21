/** Explicit refresh lifecycle. Combinations missing from the table cannot occur. */

export const REFRESH_STATUSES = [
  "idle",
  "loading",
  "success",
  "error",
  "cancelled",
  "disposed",
];

export const REFRESH_EVENTS = [
  "start",
  "resolve",
  "reject",
  "timeout",
  "cancel",
  "dispose",
];

/**
 * One allowed move per cell. Null is ignored in production and thrown in tests.
 * `start` while loading supersedes the previous request and stays loading.
 * `cancel` always leaves `loading`, which clears the derived loading flag.
 */
export const REFRESH_TRANSITIONS = {
  idle: {
    start: "loading",
    resolve: null,
    reject: null,
    timeout: null,
    cancel: null,
    dispose: "disposed",
  },
  loading: {
    start: "loading",
    resolve: "success",
    reject: "error",
    timeout: "error",
    cancel: "cancelled",
    dispose: "disposed",
  },
  success: {
    start: "loading",
    resolve: null,
    reject: null,
    timeout: null,
    cancel: null,
    dispose: "disposed",
  },
  error: {
    start: "loading",
    resolve: null,
    reject: null,
    timeout: null,
    cancel: null,
    dispose: "disposed",
  },
  cancelled: {
    start: "loading",
    resolve: null,
    reject: null,
    timeout: null,
    cancel: null,
    dispose: "disposed",
  },
  disposed: {
    start: null,
    resolve: null,
    reject: null,
    timeout: null,
    cancel: null,
    dispose: "disposed",
  },
};

export function refreshSnapshot(data = null, status = "idle") {
  return { status, data: data ?? null, error: "", generation: 0 };
}

/** Loading, the visitor-facing error, and retained data come only from this snapshot. */
export function refreshView(snapshot) {
  return {
    loading: snapshot.status === "loading",
    error: snapshot.error,
    data: snapshot.data,
  };
}

export function applyRefreshEvent(snapshot, event, options = {}) {
  if (event.generation != null && event.generation !== snapshot.generation) {
    return { accepted: false, reason: "stale", snapshot };
  }
  const nextStatus = REFRESH_TRANSITIONS[snapshot.status]?.[event.type];
  if (nextStatus == null) {
    const strict = options.strict ?? process.env.NODE_ENV !== "production";
    if (strict)
      throw new Error(
        `Invalid refresh transition: ${snapshot.status} + ${event.type}`,
      );
    return { accepted: false, reason: "invalid", snapshot };
  }
  return {
    accepted: true,
    reason: null,
    snapshot: move(snapshot, nextStatus, event),
  };
}

function move(snapshot, status, event) {
  const bump =
    event.type === "start" ||
    event.type === "cancel" ||
    event.type === "dispose";
  if (event.type === "resolve")
    return {
      status,
      data: event.data,
      error: "",
      generation: snapshot.generation,
    };
  if (event.type === "reject" || event.type === "timeout")
    return {
      status,
      data: snapshot.data,
      error: event.errorMessage,
      generation: snapshot.generation,
    };
  return {
    status,
    data: snapshot.data,
    error: snapshot.error,
    generation: snapshot.generation + (bump ? 1 : 0),
  };
}

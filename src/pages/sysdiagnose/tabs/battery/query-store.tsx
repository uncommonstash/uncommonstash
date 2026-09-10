import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { SysdiagnoseQueryClient } from "@/workers/sysdiagnose-query/query.client";
import type { QueryRange, SysdiagnoseQueryPlan, SysdiagnoseQueryResult } from "@/workers/sysdiagnose-query/query.protocol";

type QueryState =
  | { state: "idle" | "loading" }
  | { state: "ready"; result: SysdiagnoseQueryResult }
  | { state: "error"; message: string };

interface StoreState {
  range: QueryRange;
  ready: "loading" | "ready" | "error" | "unavailable";
  queries: Record<string, QueryState>;
}

type Action =
  | { type: "reset"; range: QueryRange; ready: StoreState["ready"] }
  | { type: "range"; range: QueryRange }
  | { type: "ready"; ready: StoreState["ready"] }
  | { type: "query"; key: string; query: QueryState };

function reducer(state: StoreState, action: Action): StoreState {
  if (action.type === "reset") return { range: action.range, ready: action.ready, queries: {} };
  if (action.type === "range") return { ...state, range: action.range };
  if (action.type === "ready") return { ...state, ready: action.ready };
  return { ...state, queries: { ...state.queries, [action.key]: action.query } };
}

interface QueryStore {
  state: StoreState;
  setRange: (range: QueryRange) => void;
  run: (plan: SysdiagnoseQueryPlan) => void;
}

const Context = createContext<QueryStore | null>(null);

export function QueryStoreProvider({ powerlog, initialRange, children }: { powerlog: Uint8Array | null; initialRange: QueryRange; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    range: initialRange,
    ready: powerlog ? "loading" : "unavailable",
    queries: {},
  });
  const client = useRef<SysdiagnoseQueryClient | null>(null);
  const cache = useRef(new Map<string, SysdiagnoseQueryResult>());

  useEffect(() => {
    client.current?.terminate();
    client.current = null;
    cache.current.clear();
    dispatch({ type: "reset", range: initialRange, ready: powerlog ? "loading" : "unavailable" });
    if (!powerlog) {
      dispatch({ type: "ready", ready: "unavailable" });
      return;
    }
    const next = new SysdiagnoseQueryClient();
    client.current = next;
    dispatch({ type: "ready", ready: "loading" });
    void next.init(powerlog.slice().buffer).then(
      () => dispatch({ type: "ready", ready: "ready" }),
      () => dispatch({ type: "ready", ready: "error" }),
    );
    return () => next.terminate();
  }, [powerlog]);

  const run = useCallback((plan: SysdiagnoseQueryPlan) => {
    const key = JSON.stringify(plan);
    const cached = cache.current.get(key);
    if (cached) {
      dispatch({ type: "query", key, query: { state: "ready", result: cached } });
      return;
    }
    if (!client.current || state.ready !== "ready") return;
    dispatch({ type: "query", key, query: { state: "loading" } });
    void client.current.run(plan).then(
      (result) => {
        cache.current.set(key, result);
        dispatch({ type: "query", key, query: { state: "ready", result } });
      },
      (error: Error) => dispatch({ type: "query", key, query: { state: "error", message: error.message } }),
    );
  }, [state.ready]);

  const value = useMemo(() => ({ state, setRange: (range: QueryRange) => dispatch({ type: "range", range }), run }), [run, state]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useQueryStore() {
  const value = useContext(Context);
  if (!value) throw new Error("QueryStoreProvider is required");
  return value;
}

export function usePowerlogQuery(plan: SysdiagnoseQueryPlan): QueryState {
  const { state, run } = useQueryStore();
  const key = JSON.stringify(plan);
  useEffect(() => run(plan), [key, run]);
  if (state.queries[key]) return state.queries[key];
  return state.ready === "error"
    ? { state: "error", message: "Powerlog query worker unavailable" }
    : { state: "idle" };
}

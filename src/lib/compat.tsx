import React from "react";
import { printProlog } from "./prolog";

/** Vite compat: identity wrapper (no server/client split). */
export function csr<P extends object>(
  Page: React.ComponentType<P & { ssr?: boolean }>,
) {
  return function ClientSideRender(props: P & { ssr?: boolean }) {
    React.useEffect(() => {
      if (typeof window !== "undefined") printProlog();
    }, []);
    if (props.ssr === false) return null;
    return <Page {...props} />;
  };
}

export function withProlog(Page: () => React.ReactElement | null) {
  return function WithProlog() {
    React.useEffect(() => {
      if (typeof window !== "undefined") printProlog();
    }, []);
    return <Page />;
  };
}

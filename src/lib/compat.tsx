import React from "react";
import { printProlog } from "./prolog";

/** Vite compat: identity wrapper (no server/client split). */
export function csr(Page: React.ComponentType<any>) {
  return function ClientSideRender(props: any) {
    const { ssr, ...rest } = props ?? {};
    React.useEffect(() => {
      if (typeof window !== "undefined") printProlog();
    }, []);
    if (ssr === false) return null;
    return <Page {...rest} ssr={ssr} />;
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

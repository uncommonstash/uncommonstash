import React from "react";
import { Helmet } from "react-helmet-async";

interface PageMetaProps {
  title?: string;
  description?: string;
  jsonLd?: Record<string, unknown>;
}

export function PageMeta({ title, description, jsonLd }: PageMetaProps) {
  const fullTitle =
    !title || title === "UncommonStash"
      ? "UncommonStash"
      : title.includes("|") || title.includes("—")
        ? title
        : `${title} | UncommonStash`;
  return (
    <>
      <Helmet>
        <title>{fullTitle}</title>
        {description && <meta name="description" content={description} />}
        {title && <meta property="og:title" content={fullTitle} />}
        {description && (
          <meta property="og:description" content={description} />
        )}
      </Helmet>
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd).replace(/</g, "\\u003c")}
        </script>
      )}
    </>
  );
}

export function usePageview() {
  const { default: gtag } = { default: null as unknown };
  void gtag;
  React.useEffect(() => {
    // GA pageview handled via gtag lib on route change
  }, []);
  return null;
}

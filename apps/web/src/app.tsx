import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import Shell from "~/components/Shell";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/atkinson-hyperlegible-next/400.css";
import "@fontsource/atkinson-hyperlegible-next/700.css";
import "./app.css";
import "./dashboard.css";

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>SSB App</Title>
          <Shell>
            <Suspense>{props.children}</Suspense>
          </Shell>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}

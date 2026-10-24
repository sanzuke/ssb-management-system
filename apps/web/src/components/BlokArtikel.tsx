import { For, Match, Switch } from "solid-js";
import type { Block, Inline } from "@ssb/shared";

/** Teks bergaya sebagai elemen; tanpa innerHTML. */
function Sebaris(props: { c: Inline[] }) {
  return (
    <For each={props.c}>
      {(n) => (
        <Switch>
          <Match when={n.t === "text" && n}>{(x) => x().v}</Match>
          <Match when={n.t === "br"}>
            <br />
          </Match>
          <Match when={n.t === "bold" && n}>
            {(x) => (
              <strong>
                <Sebaris c={x().c} />
              </strong>
            )}
          </Match>
          <Match when={n.t === "italic" && n}>
            {(x) => (
              <em>
                <Sebaris c={x().c} />
              </em>
            )}
          </Match>
          <Match when={n.t === "link" && n}>
            {(x) => (
              <a href={x().href} rel="noopener noreferrer" target={/^https?:/i.test(x().href) ? "_blank" : undefined}>
                <Sebaris c={x().c} />
              </a>
            )}
          </Match>
        </Switch>
      )}
    </For>
  );
}

/** Render `Block[]` (hasil `parseMarkdown`) sebagai elemen. Dipakai pratinjau editor artikel. */
export default function BlokArtikel(props: { blocks: Block[] }) {
  return (
    <div class="blok-artikel">
      <For each={props.blocks}>
        {(b) => (
          <Switch>
            <Match when={b.t === "h2" && b}>
              {(x) => (
                <h2>
                  <Sebaris c={x().c} />
                </h2>
              )}
            </Match>
            <Match when={b.t === "h3" && b}>
              {(x) => (
                <h3>
                  <Sebaris c={x().c} />
                </h3>
              )}
            </Match>
            <Match when={b.t === "p" && b}>
              {(x) => (
                <p>
                  <Sebaris c={x().c} />
                </p>
              )}
            </Match>
            <Match when={b.t === "quote" && b}>
              {(x) => (
                <blockquote>
                  <Sebaris c={x().c} />
                </blockquote>
              )}
            </Match>
            <Match when={b.t === "ul" && b}>
              {(x) => (
                <ul>
                  <For each={x().items}>
                    {(it) => (
                      <li>
                        <Sebaris c={it} />
                      </li>
                    )}
                  </For>
                </ul>
              )}
            </Match>
            <Match when={b.t === "ol" && b}>
              {(x) => (
                <ol>
                  <For each={x().items}>
                    {(it) => (
                      <li>
                        <Sebaris c={it} />
                      </li>
                    )}
                  </For>
                </ol>
              )}
            </Match>
            <Match when={b.t === "img" && b}>{(x) => <img src={x().src} alt={x().alt} loading="lazy" />}</Match>
            <Match when={b.t === "hr"}>
              <hr />
            </Match>
          </Switch>
        )}
      </For>
    </div>
  );
}

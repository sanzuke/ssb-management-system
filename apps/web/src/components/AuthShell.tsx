import type { JSX } from "solid-js";
import Pitch from "./Pitch";

export default function AuthShell(props: { children: JSX.Element }) {
  return (
    <div class="lapangan">
      <Pitch />
      <div class="merek">SSB App</div>
      <main class="kotak">{props.children}</main>
    </div>
  );
}

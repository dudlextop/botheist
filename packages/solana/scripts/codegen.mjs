// Generate the Kit-native TypeScript client from the Anchor IDL.
import { cpSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFromRoot } from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";

const here = dirname(fileURLToPath(import.meta.url));
const idlPath = resolve(here, "../../../target/idl/botheist.json");
const tmp = resolve(here, "../.codama");
const out = resolve(here, "../src/generated");
const idl = JSON.parse(readFileSync(idlPath, "utf8"));

rmSync(tmp, { recursive: true, force: true });
await createFromRoot(rootNodeFromAnchor(idl)).accept(renderVisitor(tmp, { formatCode: true }));
rmSync(out, { recursive: true, force: true });
cpSync(resolve(tmp, "src/generated"), out, { recursive: true });
cpSync(idlPath, resolve(here, "../src/idl/botheist.json"));
rmSync(tmp, { recursive: true, force: true });
console.log("Generated client in", out);

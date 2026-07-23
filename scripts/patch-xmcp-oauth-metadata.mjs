import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputPath = resolve("dist/http.js");
const output = await readFile(outputPath, "utf8");

// XMCP 0.6.13 preserves Apps SDK auth metadata only in the legacy `_meta`
// mirror. ChatGPT's current OAuth flow also requires the same declaration on
// the standard top-level `securitySchemes` field returned by tools/list.
const toolListMetadataPattern =
  /execution:([A-Za-z_$][\w$]*)\.execution,_meta:\1\._meta/;
const matches = output.match(
  new RegExp(toolListMetadataPattern.source, "g"),
);

if (matches?.length !== 1) {
  throw new Error(
    `Expected exactly one XMCP tool-list metadata serializer, found ${matches?.length ?? 0}.`,
  );
}

const patchedOutput = output.replace(
  toolListMetadataPattern,
  (_match, toolVariable) =>
    `execution:${toolVariable}.execution,securitySchemes:${toolVariable}._meta?.securitySchemes,_meta:${toolVariable}._meta`,
);

await writeFile(outputPath, patchedOutput);
console.log("Added top-level OAuth securitySchemes to the XMCP tools/list output.");

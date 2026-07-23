import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const targets = [
  {
    path: resolve("node_modules/xmcp/dist/cli.js"),
    expectedSerializers: 6,
  },
  {
    path: resolve("node_modules/xmcp/dist/runtime/http.js"),
    expectedSerializers: 1,
  },
];

// XMCP 0.6.13 preserves Apps SDK auth metadata only in the legacy `_meta`
// mirror. ChatGPT's current OAuth flow also requires the same declaration on
// the standard top-level `securitySchemes` field returned by tools/list.
const toolListMetadataPattern =
  /execution:([A-Za-z_$][\w$]*)\.execution,_meta:\1\._meta/;
const patchedToolListMetadataPattern =
  /execution:([A-Za-z_$][\w$]*)\.execution,securitySchemes:\1\._meta\?\.securitySchemes,_meta:\1\._meta/;
for (const target of targets) {
  const source = await readFile(target.path, "utf8");
  const unpatchedMatches = source.match(
    new RegExp(toolListMetadataPattern.source, "g"),
  );
  const patchedMatches = source.match(
    new RegExp(patchedToolListMetadataPattern.source, "g"),
  );

  if (
    patchedMatches?.length === target.expectedSerializers &&
    !unpatchedMatches?.length
  ) {
    continue;
  }

  if (
    unpatchedMatches?.length !== target.expectedSerializers ||
    patchedMatches?.length
  ) {
    throw new Error(
      `Expected ${target.expectedSerializers} unpatched XMCP tool-list metadata serializers in ${target.path}.`,
    );
  }

  const patchedSource = source.replace(
    new RegExp(toolListMetadataPattern.source, "g"),
    (_match, toolVariable) =>
      `execution:${toolVariable}.execution,securitySchemes:${toolVariable}._meta?.securitySchemes,_meta:${toolVariable}._meta`,
  );

  await writeFile(target.path, patchedSource);
}

console.log("Patched XMCP to generate top-level OAuth securitySchemes.");

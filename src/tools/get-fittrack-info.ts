import { type ToolMetadata } from "xmcp";

import { getNoAuthSecuritySchemes } from "../lib/oauth";

const fitTrackInfo = {
  appName: "FitTrack",
  status: "ready",
  categories: ["activity", "nutrition", "sleep"],
} as const;

export const schema = {};

export const metadata: ToolMetadata = {
  name: "get-fittrack-info",
  description:
    "Return static public information about FitTrack and its supported tracking categories.",
  annotations: {
    title: "Get FitTrack information",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: {
    securitySchemes: getNoAuthSecuritySchemes(),
  },
};

export default function getFitTrackInfo() {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(fitTrackInfo, null, 2),
      },
    ],
    structuredContent: fitTrackInfo,
  };
}

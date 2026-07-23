import { z } from "zod";
import {
  type InferSchema,
  type ToolExtraArguments,
  type ToolMetadata,
} from "xmcp";

import {
  createBearerChallenge,
  getOAuthSecuritySchemes,
} from "../lib/oauth";
import { createSupabaseClient } from "../lib/supabase";

export const schema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(10)
    .describe("Maximum number of recent weight entries to return (1-10)"),
};

export const metadata: ToolMetadata = {
  name: "get-recent-weight-entries",
  description:
    "Return the authenticated user's recent FitTrack weight entries, newest first.",
  annotations: {
    title: "Get recent weight entries",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: {
    securitySchemes: getOAuthSecuritySchemes(),
  },
};

export default async function getRecentWeightEntries({
  limit,
}: InferSchema<typeof schema>, extra: ToolExtraArguments) {
  const accessToken = extra.authInfo?.token;

  if (!accessToken) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "Authentication is required to retrieve weight entries.",
        },
      ],
      _meta: {
        "mcp/www_authenticate": [
          createBearerChallenge(
            "invalid_token",
            "Sign in to FitTrack to retrieve your weight entries.",
          ),
        ],
      },
    };
  }

  const supabase = createSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("fittrack_weight")
    .select("weight,date,notes,created_at")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "The authenticated weight query was rejected.",
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text:
          data.length === 0
            ? "No weight entries were found for the authenticated user."
            : JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: {
      entries: data,
    },
  };
}

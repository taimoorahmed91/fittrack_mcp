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
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
    .optional()
    .describe(
      "Exact weight-entry date in YYYY-MM-DD format. If both date and weight are omitted, the current UTC date is used.",
    ),
  weight: z
    .number()
    .positive()
    .max(500)
    .optional()
    .describe(
      "Exact recorded weight in kilograms. When omitted, weight is not used as a filter.",
    ),
};

export const metadata: ToolMetadata = {
  name: "find-weight-entries",
  description:
    "Find the authenticated user's FitTrack weight entries by exact date, exact weight, or both. Use this instead of relying on a latest-ten-record window.",
  annotations: {
    title: "Find weight entries",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: {
    securitySchemes: getOAuthSecuritySchemes(),
  },
};

export default async function findWeightEntries({
  date,
  weight,
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
  const effectiveDate =
    date ??
    (weight === undefined ? new Date().toISOString().slice(0, 10) : undefined);

  let query = supabase
    .from("fittrack_weight")
    .select("weight,date,notes,created_at")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (effectiveDate) {
    query = query.eq("date", effectiveDate);
  }

  if (weight !== undefined) {
    query = query.eq("weight", weight);
  }

  const { data, error } = await query;

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
            ? `No weight entries matched ${JSON.stringify({
                ...(effectiveDate ? { date: effectiveDate } : {}),
                ...(weight !== undefined ? { weight } : {}),
              })} for the authenticated user.`
            : JSON.stringify(
                {
                  filters: {
                    ...(effectiveDate ? { date: effectiveDate } : {}),
                    ...(weight !== undefined ? { weight } : {}),
                  },
                  entries: data,
                },
                null,
                2,
              ),
      },
    ],
    structuredContent: {
      filters: {
        ...(effectiveDate ? { date: effectiveDate } : {}),
        ...(weight !== undefined ? { weight } : {}),
      },
      entries: data,
    },
  };
}

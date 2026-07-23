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
    .regex(
      /^\d{4}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?$/,
      "Date must use YYYY-MM or YYYY-MM-DD format",
    )
    .optional()
    .describe(
      "Weight-entry month (YYYY-MM) or exact date (YYYY-MM-DD). If both date and weight are omitted, the current UTC month is used.",
    ),
  weight: z
    .number()
    .positive()
    .max(500)
    .optional()
    .describe(
      "Exact recorded weight in kilograms. When omitted, weight is not used as a filter.",
    ),
  sortBy: z
    .enum(["date", "weight"])
    .optional()
    .describe(
      "Column to sort by. When omitted, entries are sorted by created_at descending.",
    ),
  sortOrder: z
    .enum(["ascending", "descending"])
    .optional()
    .describe(
      "Sort direction for sortBy. Defaults to descending when sortBy is provided.",
    ),
};

export const metadata: ToolMetadata = {
  name: "get-recent-weight-entries",
  description:
    "Find the authenticated user's FitTrack weight entries by month, exact date, exact weight, or a combination of date and weight. This is not limited to the latest ten records.",
  annotations: {
    title: "Get weight entries",
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
  sortBy,
  sortOrder,
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
  const effectiveDateFilter =
    date ??
    (weight === undefined ? new Date().toISOString().slice(0, 7) : undefined);

  let query = supabase
    .from("fittrack_weight")
    .select("weight,date,notes,created_at")
    .limit(100);

  const appliedSort = sortBy
    ? {
        column: sortBy,
        order: sortOrder ?? ("descending" as const),
      }
    : {
        column: "created_at" as const,
        order: "descending" as const,
      };

  if (sortBy) {
    query = query
      .order(sortBy, { ascending: appliedSort.order === "ascending" })
      .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  if (effectiveDateFilter?.length === 7) {
    const [year, month] = effectiveDateFilter.split("-").map(Number);
    const nextMonth =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    query = query
      .gte("date", `${effectiveDateFilter}-01`)
      .lt("date", nextMonth);
  } else if (effectiveDateFilter) {
    query = query.eq("date", effectiveDateFilter);
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
                ...(effectiveDateFilter ? { date: effectiveDateFilter } : {}),
                ...(weight !== undefined ? { weight } : {}),
              })} for the authenticated user.`
            : JSON.stringify(
                {
                  filters: {
                    ...(effectiveDateFilter
                      ? { date: effectiveDateFilter }
                      : {}),
                    ...(weight !== undefined ? { weight } : {}),
                  },
                  sort: appliedSort,
                  entries: data,
                },
                null,
                2,
              ),
      },
    ],
    structuredContent: {
      filters: {
        ...(effectiveDateFilter ? { date: effectiveDateFilter } : {}),
        ...(weight !== undefined ? { weight } : {}),
      },
      sort: appliedSort,
      entries: data,
    },
  };
}

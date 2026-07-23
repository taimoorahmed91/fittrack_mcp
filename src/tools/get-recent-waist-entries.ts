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
      "Waist-entry month (YYYY-MM) or exact date (YYYY-MM-DD). If both date and waist are omitted, the current UTC month is used.",
    ),
  waist: z
    .number()
    .positive()
    .max(300)
    .optional()
    .describe(
      "Exact recorded waist measurement in centimeters. When omitted, waist is not used as a filter.",
    ),
  sortBy: z
    .enum(["date", "waist"])
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
  name: "get-recent-waist-entries",
  description:
    "Find the authenticated user's FitTrack waist entries by month, exact date, exact waist measurement, or a combination of date and waist. This is not limited to the latest ten records.",
  annotations: {
    title: "Get waist entries",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: {
    securitySchemes: getOAuthSecuritySchemes(),
  },
};

export default async function getRecentWaistEntries(
  { date, waist, sortBy, sortOrder }: InferSchema<typeof schema>,
  extra: ToolExtraArguments,
) {
  const accessToken = extra.authInfo?.token;

  if (!accessToken) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "Authentication is required to retrieve waist entries.",
        },
      ],
      _meta: {
        "mcp/www_authenticate": [
          createBearerChallenge(
            "invalid_token",
            "Sign in to FitTrack to retrieve your waist entries.",
          ),
        ],
      },
    };
  }

  const supabase = createSupabaseClient(accessToken);
  const effectiveDateFilter =
    date ??
    (waist === undefined ? new Date().toISOString().slice(0, 7) : undefined);

  let query = supabase
    .from("fittrack_waist")
    .select("waist,date,notes,created_at")
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

  if (waist !== undefined) {
    query = query.eq("waist", waist);
  }

  const { data, error } = await query;

  if (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "The authenticated waist query was rejected.",
        },
      ],
    };
  }

  const filters = {
    ...(effectiveDateFilter ? { date: effectiveDateFilter } : {}),
    ...(waist !== undefined ? { waist } : {}),
  };

  return {
    content: [
      {
        type: "text" as const,
        text:
          data.length === 0
            ? `No waist entries matched ${JSON.stringify(filters)} for the authenticated user.`
            : JSON.stringify(
                {
                  filters,
                  sort: appliedSort,
                  entries: data,
                },
                null,
                2,
              ),
      },
    ],
    structuredContent: {
      filters,
      sort: appliedSort,
      entries: data,
    },
  };
}

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
      "Meal month (YYYY-MM) or exact date (YYYY-MM-DD). If date, food, and calories are all omitted, the current UTC month is used.",
    ),
  food: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Case-insensitive food-text fragment. The tool returns meals whose food description contains this text; a complete description is not required.",
    ),
  calories: z
    .number()
    .int()
    .nonnegative()
    .max(20_000)
    .optional()
    .describe(
      "Exact recorded calorie value. When omitted, calories are not used as a filter.",
    ),
  sortBy: z
    .enum(["date", "calories", "time", "food"])
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
  name: "get-recent-meal-entries",
  description:
    "Find the authenticated user's FitTrack meal entries by month, exact date, partial food description, exact calories, or a combination of these filters. Food matching is case-insensitive and does not require the complete stored description.",
  annotations: {
    title: "Get meal entries",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  _meta: {
    securitySchemes: getOAuthSecuritySchemes(),
  },
};

function escapeLikeFragment(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export default async function getRecentMealEntries(
  { date, food, calories, sortBy, sortOrder }: InferSchema<typeof schema>,
  extra: ToolExtraArguments,
) {
  const accessToken = extra.authInfo?.token;

  if (!accessToken) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "Authentication is required to retrieve meal entries.",
        },
      ],
      _meta: {
        "mcp/www_authenticate": [
          createBearerChallenge(
            "invalid_token",
            "Sign in to FitTrack to retrieve your meal entries.",
          ),
        ],
      },
    };
  }

  const supabase = createSupabaseClient(accessToken);
  const effectiveDateFilter =
    date ??
    (food === undefined && calories === undefined
      ? new Date().toISOString().slice(0, 7)
      : undefined);

  let query = supabase
    .from("fittrack_meals")
    .select("food,calories,time,date,created_at")
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

  if (food !== undefined) {
    query = query.ilike("food", `%${escapeLikeFragment(food)}%`);
  }

  if (calories !== undefined) {
    query = query.eq("calories", calories);
  }

  const { data, error } = await query;

  if (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "The authenticated meal query was rejected.",
        },
      ],
    };
  }

  const filters = {
    ...(effectiveDateFilter ? { date: effectiveDateFilter } : {}),
    ...(food !== undefined ? { foodContains: food } : {}),
    ...(calories !== undefined ? { calories } : {}),
  };

  return {
    content: [
      {
        type: "text" as const,
        text:
          data.length === 0
            ? `No meal entries matched ${JSON.stringify(filters)} for the authenticated user.`
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

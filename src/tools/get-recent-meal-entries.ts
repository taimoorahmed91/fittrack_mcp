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
      "Meal month (YYYY-MM) or exact date (YYYY-MM-DD). When omitted, the current UTC month is used.",
    ),
};

export const metadata: ToolMetadata = {
  name: "get-recent-meal-entries",
  description:
    "Get the authenticated user's FitTrack meal entries for a month or exact date.",
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

export default async function getRecentMealEntries(
  { date }: InferSchema<typeof schema>,
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
    date ?? new Date().toISOString().slice(0, 7);

  let query = supabase
    .from("fittrack_meals")
    .select("food,calories,time,date,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (effectiveDateFilter.length === 7) {
    const [year, month] = effectiveDateFilter.split("-").map(Number);
    const nextMonth =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    query = query
      .gte("date", `${effectiveDateFilter}-01`)
      .lt("date", nextMonth);
  } else {
    query = query.eq("date", effectiveDateFilter);
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

  return {
    content: [
      {
        type: "text" as const,
        text:
          data.length === 0
            ? `No meal entries matched ${effectiveDateFilter} for the authenticated user.`
            : JSON.stringify(
                {
                  date: effectiveDateFilter,
                  entries: data,
                },
                null,
                2,
              ),
      },
    ],
    structuredContent: {
      date: effectiveDateFilter,
      entries: data,
    },
  };
}

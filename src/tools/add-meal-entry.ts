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
  mealDescription: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("Description of the meal or food that was eaten."),
  calories: z
    .number()
    .nonnegative()
    .max(10000)
    .describe("Calories in the meal."),
  protein: z
    .number()
    .nonnegative()
    .max(1000)
    .describe("Protein in grams."),
  carbs: z
    .number()
    .nonnegative()
    .max(1000)
    .describe("Carbohydrates in grams."),
  timestamp: z
    .string()
    .datetime({ offset: true })
    .describe(
      "When the meal was eaten as an ISO 8601 timestamp with a timezone, for example 2026-08-28T12:30:00+02:00.",
    ),
};

export const metadata: ToolMetadata = {
  name: "add-meal-entry",
  description:
    "Add one meal entry for the authenticated FitTrack user with its description, calories, protein, carbohydrates, and timestamp.",
  annotations: {
    title: "Add meal entry",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  _meta: {
    securitySchemes: getOAuthSecuritySchemes(),
  },
};

export default async function addMealEntry(
  {
    mealDescription,
    calories,
    protein,
    carbs,
    timestamp,
  }: InferSchema<typeof schema>,
  extra: ToolExtraArguments,
) {
  const accessToken = extra.authInfo?.token;
  const userId = extra.authInfo?.extra?.userId;

  if (!accessToken || typeof userId !== "string") {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "Authentication is required to add a meal entry.",
        },
      ],
      _meta: {
        "mcp/www_authenticate": [
          createBearerChallenge(
            "invalid_token",
            "Sign in to FitTrack to add a meal entry.",
          ),
        ],
      },
    };
  }

  const timestampParts = timestamp.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:Z|[+-]\d{2}:\d{2})$/,
  );

  if (!timestampParts) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "The meal timestamp could not be converted to a date and time.",
        },
      ],
    };
  }

  const [, date, time] = timestampParts;
  const supabase = createSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("fittrack_meals")
    .insert({
      user_id: userId,
      food: mealDescription,
      calories,
      protein,
      carbs,
      date,
      time,
    })
    .select("food,calories,protein,carbs,time,date,created_at")
    .single();

  if (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: "The authenticated meal entry could not be added.",
        },
      ],
    };
  }

  const result = {
    timestamp,
    entry: data,
  };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
  };
}

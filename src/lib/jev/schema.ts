import { z } from "zod";

const probability = z.number().finite().min(0).max(1);
export function choiceAnswerSchema<const T extends readonly [string, ...string[]]>(options: T) {
  return z
    .object({
      type: z.literal("choice"),
      choice: z.enum(options),
      confidence: probability,
      probabilities: z.record(z.enum(options), probability),
    })
    .superRefine((answer, context) => {
      const values = Object.values(answer.probabilities) as number[];
      if (Math.abs(values.reduce((sum, v) => sum + v, 0) - 1) > 0.01)
        context.addIssue({ code: "custom", message: "Probabilities must sum to one." });
      const peak = Math.max(...values);
      if (answer.probabilities[answer.choice] < peak - 0.001)
        context.addIssue({
          code: "custom",
          message: "Selected choice must have the highest probability.",
        });
      const expectedConfidence = (peak - 1 / options.length) / (1 - 1 / options.length);
      if (Math.abs(answer.confidence - expectedConfidence) > 0.025)
        context.addIssue({
          code: "custom",
          message: "Confidence does not match the official Choice formula.",
        });
    });
}
export const recommendationSchema = choiceAnswerSchema(["BUY", "HOLD", "SELL"]);
export const evidenceAnswerSchema = choiceAnswerSchema(["SUPPORTED", "UNSUPPORTED"]);
export const newsAnswerSchema = choiceAnswerSchema(["BULLISH", "BEARISH", "NEUTRAL", "IRRELEVANT"]);
export const envelopeSchema = z.object({
  model: z.string().min(1),
  answers: z.record(z.string(), z.unknown()),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

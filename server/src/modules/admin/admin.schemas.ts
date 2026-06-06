import { z } from "zod";

export const adminLoginSchema = z.object({
  body: z.object({
    password: z.string({
      required_error: "Password is required",
      invalid_type_error: "Password must be a string",
    }),
  }),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>["body"];

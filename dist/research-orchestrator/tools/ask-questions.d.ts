import { z } from "zod";
export declare const questionsInputSchema: z.ZodObject<{
    questions: z.ZodArray<z.ZodObject<{
        question: z.ZodString;
        candidates: z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            value: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const questionsTool: import("ai").Tool<{
    questions: {
        question: string;
        candidates: {
            label: string;
            value: string;
        }[];
    }[];
}, never>;
//# sourceMappingURL=ask-questions.d.ts.map
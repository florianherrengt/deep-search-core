import { z } from "zod";
export declare const disambiguateInputSchema: z.ZodObject<{
    terms: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export declare function createDisambiguateTool(fetchFn: typeof globalThis.fetch): import("ai").Tool<{
    terms: string[];
}, string>;
//# sourceMappingURL=disambiguate.d.ts.map
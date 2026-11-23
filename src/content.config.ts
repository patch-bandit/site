import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// One snack drop = one free code drop = one file in src/content/drops/.
// `custom: true` means a hand-built page already exists at src/pages/lab/<id>.astro.
// With `custom: false` (the default) the file body becomes the page at /lab/<id>/.
const drops = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/drops' }),
  schema: z.object({
    title: z.string(),
    h1: z.string(),
    description: z.string(),
    phrase: z.string(),
    date: z.coerce.date(),
    snack: z.string(),
    summary: z.string(),
    custom: z.boolean().default(false),
  }),
});

export const collections = { drops };

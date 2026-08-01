// Generisches Grundgerüst der Content Collections. Jedes aus dieser
// Vorlage erzeugte Projekt erweitert `pages` um seine tatsächlichen
// Felder und ergänzt eigene Collections (team/gallery/services/jobs/...)
// nach demselben Muster – hier steht nur, was jedes Projekt garantiert
// braucht: globale Einstellungen + eine generische Seiten-Collection.
//
// `theme` ist bewusst ein offenes Schlüssel-Wert-Objekt (nicht fest
// definierte Farbnamen wie "green600"), weil jedes Projekt seine eigene,
// vom jeweiligen Marken-Auftritt hergeleitete Farbpalette bekommt statt
// eines wiederverwendeten Farbschemas – siehe das Anti-KI-Look-Brief.
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const settings = defineCollection({
  loader: glob({ pattern: "*.yaml", base: "src/content/settings" }),
  schema: z.object({
    businessName: z.string(),
    ownerName: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    phone: z.string().optional(),
    phoneHref: z.string().optional(),
    email: z.string().optional(),
    hours: z.string().optional(),
    theme: z.record(z.string(), z.string()),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: "*.yaml", base: "src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
  }).passthrough(),
});

export const collections = { settings, pages };

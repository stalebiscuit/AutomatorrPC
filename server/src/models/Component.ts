import { Schema, model, type InferSchemaType, type Model } from 'mongoose';
import { CATEGORIES } from '@automatorr/shared';

const PriceQuoteSchema = new Schema(
  {
    store: { type: String, required: true },
    price: { type: Number, required: true },
    currency: { type: String, enum: ['AUD'], default: 'AUD', required: true },
    url: { type: String, required: true },
    lastUpdated: { type: Date, required: true },
  },
  { _id: false },
);

const BenchmarkSchema = new Schema(
  {
    ubRaw: { type: Number, required: true },
    ubSource: { type: String, required: true },
  },
  { _id: false },
);

const ProvenanceSchema = new Schema(
  {
    specSourceUrl: { type: String, required: true },
    csvRow: { type: String },
    subtypeSource: { type: String, enum: ['ssd', 'hdd'] },
    seededAt: { type: Date, required: true },
    unknownFields: { type: [String], default: [] },
  },
  { _id: false },
);

const ComponentSchema = new Schema(
  {
    category: { type: String, enum: [...CATEGORIES], required: true, index: true },
    brand: { type: String, required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    imageUrl: { type: String, default: null },
    // Heterogeneous per-category specs (spec §11) — stored as a free-form map.
    specs: { type: Schema.Types.Mixed, required: true, default: {} },
    benchmark: { type: BenchmarkSchema, required: true },
    performanceIndex: { type: Number, required: true },
    prices: { type: [PriceQuoteSchema], default: [] },
    provenance: { type: ProvenanceSchema, required: true },
  },
  { timestamps: true, minimize: false },
);

// Indexes (spec §6).
ComponentSchema.index({ category: 1, slug: 1 }, { unique: true });
ComponentSchema.index({ name: 'text', brand: 'text' });
ComponentSchema.index({ category: 1, performanceIndex: -1 });

export type ComponentDoc = InferSchemaType<typeof ComponentSchema>;

export const ComponentModel: Model<ComponentDoc> =
  model<ComponentDoc>('Component', ComponentSchema);

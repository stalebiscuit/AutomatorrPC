import { Schema, model, type InferSchemaType, type Model } from 'mongoose';
import { BUILDER_CATEGORIES } from '@automatorr/shared';

/** A user's saved/shareable build (spec §7.1). Catalogue is referenced by
 *  {category, slug} — never copied — so prices/specs stay live. */
const BuildItemSchema = new Schema(
  {
    category: { type: String, enum: [...BUILDER_CATEGORIES], required: true },
    slug: { type: String, required: true },
    chosenStore: { type: String },
  },
  { _id: false },
);

const BuildSchema = new Schema(
  {
    shortId: { type: String, required: true },
    name: { type: String },
    budget: { type: Number },
    items: { type: [BuildItemSchema], default: [] },
    /** Private edit token (review fix 1.3): returned once at creation and
     *  required for PATCH, so a shared permalink is read-only for everyone
     *  except the creator. Never serialised into read responses. Legacy
     *  builds without one are locked (share links keep working). */
    editToken: { type: String, default: '' },
  },
  { timestamps: true, minimize: false },
);

BuildSchema.index({ shortId: 1 }, { unique: true });

export type BuildDoc = InferSchemaType<typeof BuildSchema>;
export const BuildModel: Model<BuildDoc> = model<BuildDoc>('Build', BuildSchema);

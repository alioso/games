// 🟦 BLOC SKINS from the bloc shop. Looks only — no special powers.
// Only human players wear them; a stripe in the team colour shows which side you're on.
// Faces are drawn in entities/faces.ts, hair and toppings in entities/hats.ts, body patterns in entities/bodies.ts.

export type SkinId = 'beginner' | 'noob' | 'bronze' | 'copper' | 'sponge' | 'iron' | 'silver' | 'pro' | 'chocolate' | 'gold' | 'fluorite' | 'lava' | 'rainbow';

export interface SkinDef {
  id: SkinId;
  name: string;
  price: number;
  /** Body colour; null = the team colour. */
  color: number | null;
  metal: number; // 0 = plastic, 1 = shiny metal
  rough: number;
  /** A pattern painted all over the body (see entities/bodies.ts). */
  body?: 'sponge' | 'lava' | 'fluorite';
}

export const SKINS: SkinDef[] = [
  { id: 'beginner', name: 'Beginner Bloc', price: 0, color: null, metal: 0, rough: 0.5 },
  { id: 'noob', name: 'Noob Bloc', price: 10, color: 0xb9c7d6, metal: 0, rough: 0.6 },
  { id: 'bronze', name: 'Bronze Bloc', price: 20, color: 0xcd7f32, metal: 0.85, rough: 0.35 },
  { id: 'copper', name: 'Copper Bloc', price: 30, color: 0xc8703f, metal: 0.9, rough: 0.3 },
  { id: 'sponge', name: 'Sponge Bloc', price: 40, color: 0xffffff, metal: 0, rough: 0.9, body: 'sponge' },
  { id: 'iron', name: 'Iron Bloc', price: 40, color: 0x7d858c, metal: 0.8, rough: 0.5 },
  { id: 'silver', name: 'Silver Bloc', price: 50, color: 0xd4d8de, metal: 0.95, rough: 0.22 },
  { id: 'pro', name: 'Pro Bloc', price: 60, color: 0x7b4dff, metal: 0.1, rough: 0.4 },
  { id: 'chocolate', name: 'Chocolate Bloc', price: 80, color: 0x5b3420, metal: 0, rough: 0.45 },
  { id: 'gold', name: 'Gold Bloc', price: 100, color: 0xffc93c, metal: 1, rough: 0.2 },
  { id: 'fluorite', name: 'Fluorite Bloc', price: 120, color: 0xffffff, metal: 0.1, rough: 0.08, body: 'fluorite' },
  { id: 'lava', name: 'Lava Bloc', price: 150, color: 0xffffff, metal: 0, rough: 0.8, body: 'lava' },
  { id: 'rainbow', name: 'Rainbow Bloc', price: 200, color: 0xff0000, metal: 0.2, rough: 0.3 },
];

export const skinById = (id: SkinId) => SKINS.find((s) => s.id === id) ?? SKINS[0];

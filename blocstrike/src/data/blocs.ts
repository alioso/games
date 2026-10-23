// 🟦 BLOC SKINS from the bloc shop. Looks only — no special powers.
// The face drawing for each skin lives in entities/faces.ts.

export type SkinId = 'beginner' | 'noob' | 'bronze' | 'silver' | 'pro' | 'gold' | 'rainbow';

export interface SkinDef {
  id: SkinId;
  name: string;
  price: number;
}

export const SKINS: SkinDef[] = [
  { id: 'beginner', name: 'Beginner Bloc', price: 0 },
  { id: 'noob', name: 'Noob Bloc', price: 10 },
  { id: 'bronze', name: 'Bronze Bloc', price: 20 },
  { id: 'silver', name: 'Silver Bloc', price: 50 },
  { id: 'pro', name: 'Pro Bloc', price: 60 },
  { id: 'gold', name: 'Gold Bloc', price: 100 },
  { id: 'rainbow', name: 'Rainbow Bloc', price: 200 },
];

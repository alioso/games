// 🎩 HATS from the hat shop. Only human players wear them. The 3D models are in entities/hats.ts.

export type HatId =
  | 'cap' | 'wizard' | 'tophat' | 'sombrero' | 'cowboy'
  | 'crown' | 'party' | 'viking' | 'chef' | 'beanie';

export interface HatDef {
  id: HatId;
  name: string;
  price: number;
}

export const HATS: HatDef[] = [
  { id: 'cap', name: 'Cap', price: 20 },
  { id: 'wizard', name: 'Wizard Hat', price: 20 },
  { id: 'tophat', name: 'Top Hat', price: 20 },
  { id: 'sombrero', name: 'Sombrero', price: 20 },
  { id: 'cowboy', name: 'Cowboy Hat', price: 20 },
  { id: 'crown', name: 'Crown', price: 20 },
  { id: 'party', name: 'Party Hat', price: 20 },
  { id: 'viking', name: 'Viking Helmet', price: 20 },
  { id: 'chef', name: 'Chef Hat', price: 20 },
  { id: 'beanie', name: 'Beanie', price: 20 },
];

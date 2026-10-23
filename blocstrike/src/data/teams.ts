// The four team colours. There are always 2 or 4 teams; blue and red come first.

export interface TeamDef {
  id: number;
  name: string;
  color: number;
  /** Darker shade for legs and details. */
  dark: number;
}

export const TEAMS: TeamDef[] = [
  { id: 0, name: 'Blue', color: 0x2f7dff, dark: 0x1b3f8a },
  { id: 1, name: 'Red', color: 0xff3b3b, dark: 0x8a1b1b },
  { id: 2, name: 'Green', color: 0x35d04a, dark: 0x1b6e27 },
  { id: 3, name: 'Yellow', color: 0xffd23a, dark: 0x8a6b12 },
];

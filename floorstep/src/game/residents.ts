// The residents on a floor: where they are, what they mutter, and the conversations you have with them.
import * as THREE from 'three';
import { FIGHT_TIPS, type KeyFacts, RESIDENTS, type Resident, keyClue, where } from '../data/residents';
import { FURNITURE } from '../data/furniture';
import { QUIZ } from '../data/tuning';
import { JUNK } from '../data/lines';
import { buildResident, type ResidentRig } from '../entities/residentModel';
import { type Rect, inRect, rectDist, roomAt } from '../world/plan';
import { cyl, ink, unclipped } from '../world/toon';
import type { DialogOption } from '../ui/dialog';
import type { Floor, PieceRT } from './floor';
import { SFX } from './sounds';

export interface Placed {
  def: Resident;
  body: ResidentRig;
  x: number;
  z: number;
  yaw: number;
  room: number;
  box: Rect;
  t: number;
  mutterT: number;
  puffT: number;
  /** Can't be talked round again until this time (after a rude answer). */
  sulkUntil: number;
}

const pickOf = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export class Residents {
  readonly list: Placed[] = [];
  readonly group = new THREE.Group();
  private talking: Placed | null = null;
  private asked = { key: false, monster: false, joke: false };
  private generous = false;
  /** The quiz in progress: questions left, and wrong answers so far. */
  private quiz = { left: [] as Resident['quiz'], slips: 0 };
  /** Kinds of key clue already given on this floor (so the next resident says something new). */
  private given = new Set<string>();

  constructor(private f: Floor) {
    f.group.add(this.group);
    this.place();
  }

  /** Three residents per floor, preferring ones you haven't met yet, each in a room that suits them. */
  private place() {
    const f = this.f, plan = f.plan, run = f.ctx.run;
    const met = run.residents;
    const pool = [...RESIDENTS].sort(() => Math.random() - 0.5).sort((a, b) => (met[a.id] ? 1 : 0) - (met[b.id] ? 1 : 0));
    const used = new Set<number>([plan.startRoom]);
    for (const def of pool) {
      if (this.list.length >= 3) break;
      const rooms = plan.rooms.filter((r) => !used.has(r.id));
      if (!rooms.length) break;
      const liked = rooms.filter((r) => def.rooms.includes(r.type)).sort((a, b) => def.rooms.indexOf(a.type) - def.rooms.indexOf(b.type));
      const room = liked[0] ?? (this.list.length < 2 ? pickOf(rooms) : null);
      if (!room) continue;
      const spot = this.spotIn(room.id, def);
      if (!spot) continue;
      used.add(room.id);
      const body = buildResident(def);
      unclipped(body.root);
      body.root.position.set(spot.x, spot.y, spot.z);
      body.root.rotation.y = spot.yaw;
      if (spot.stool) body.root.add(spot.stool);
      body.root.visible = false;
      this.group.add(body.root);
      this.list.push({ def, body, x: spot.x, z: spot.z, yaw: spot.yaw, room: room.id, box: spot.box, t: Math.random() * 10, mutterT: 4 + Math.random() * 8, puffT: 0, sulkUntil: 0 });
    }
  }

  /** Somewhere to sit or stand in a room, out of the doorways and the furniture. */
  private spotIn(roomId: number, def: Resident) {
    const f = this.f, plan = f.plan;
    const r = plan.rooms[roomId].rect;
    // Sitters take an armchair or sofa if there's a free one.
    if (def.sits) {
      const chair = f.pieces.find((p: PieceRT) => p.p.room === roomId && (p.p.kind === 'armchair' || p.p.kind === 'sofa') && p !== f.keyPiece && !this.list.some((l) => rectDist(p.p.box, l.x, l.z) < 0.3));
      if (chair) {
        const fx = Math.sin(chair.p.rot), fz = Math.cos(chair.p.rot);
        const x = chair.p.x + fx * 0.06, z = chair.p.z + fz * 0.06;
        return { x, y: 0.2, z, yaw: chair.p.rot, box: chair.p.box, stool: null as THREE.Object3D | null };
      }
    }
    const nav = f.combat.nav();
    for (let i = 0; i < 40; i++) {
      const x = r.x0 + 1.2 + Math.random() * (r.x1 - r.x0 - 2.4);
      const z = r.z0 + 1.2 + Math.random() * (r.z1 - r.z0 - 2.4);
      if (nav.isBlocked(x, z) || [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]].some(([dx, dz]) => nav.isBlocked(x + dx, z + dz))) continue;
      if (plan.doors.some((d) => Math.hypot((d.axis === 'h' ? d.c : d.at) - x, (d.axis === 'h' ? d.at : d.c) - z) < 1.8)) continue;
      if (this.list.some((l) => Math.hypot(l.x - x, l.z - z) < 1.5)) continue;
      // Face roughly toward the middle of the room (and the camera).
      const yaw = Math.atan2((r.x0 + r.x1) / 2 - x, r.z1 - z) * 0.6;
      let stool: THREE.Object3D | null = null;
      if (def.sits) {
        stool = new THREE.Group();
        stool.add(cyl(0.18, 0.16, 0.05, 0x6a4428, 0, 0.36, -0.05));
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) stool.add(cyl(0.02, 0.02, 0.36, 0x5a3420, sx * 0.11, 0, -0.05 + sz * 0.11));
        ink(stool);
      }
      return { x, y: def.sits ? 0.14 : 0, z, yaw, box: { x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }, stool };
    }
    return null;
  }

  /** Solid footprints (so you can't walk through them). */
  solids(): Rect[] {
    return this.list.map((l) => l.box);
  }

  /** The resident you're close enough to talk to. */
  near(x: number, z: number) {
    let best: Placed | null = null, bestD = 1.35;
    for (const l of this.list) {
      if (!l.body.root.visible) continue;
      const d = Math.hypot(l.x - x, l.z - z);
      if (d < bestD) { bestD = d; best = l; }
    }
    return best;
  }

  update(dt: number) {
    const f = this.f, h = f.hero;
    for (const l of this.list) {
      l.body.root.visible = f.house.isRevealed(l.room);
      if (!l.body.root.visible) continue;
      l.t += dt;
      // When talking they look at you.
      const talking = this.talking === l;
      const want = talking ? Math.atan2(h.x - l.x, h.z - l.z) : l.yaw;
      l.body.root.rotation.y += (Math.atan2(Math.sin(want - l.body.root.rotation.y), Math.cos(want - l.body.root.rotation.y))) * Math.min(1, dt * 5);
      l.body.rig.animate(dt, talking && !l.def.sits ? 'idle' : l.body.pose, { speed: 0, stride: 0, turn: 0 }, l.t, 0, 0);
      // Pipe smoke, steam from the pot, snores.
      l.puffT -= dt;
      if (l.puffT <= 0) {
        const at = l.body.puffAt.getWorldPosition(new THREE.Vector3());
        if (l.def.activity === 'pipe') { l.puffT = 0.25; if (Math.sin(l.t * 0.7) > 0.6) f.particles.burst({ x: at.x, y: at.y, z: at.z, count: 1, color: 0xd8d0c8, speed: 0.2, up: 0.6, size: 0.06, life: 1.5, gravity: -0.4 }); }
        else if (l.def.activity === 'stir') { l.puffT = 0.35; f.particles.burst({ x: at.x + (Math.random() - 0.5) * 0.3, y: at.y, z: at.z, count: 1, color: 0x9ac060, speed: 0.15, up: 0.5, size: 0.07, life: 1.2, gravity: -0.3 }); }
        else l.puffT = 1;
      }
      // Muttering to themselves when you're around.
      l.mutterT -= dt;
      const d = Math.hypot(l.x - h.x, l.z - h.z);
      if (l.mutterT <= 0 && d < 5 && !talking && !f.ctx.bubbles.speaking(l.body.rig.headTop)) {
        l.mutterT = 7 + Math.random() * 8;
        f.ctx.bubbles.say(l.body.rig.headTop, pickOf(l.def.activity === 'snore' ? ['Zzz... zzz...', ...l.def.mutter] : l.def.mutter), { life: 2.2, onChar: (ch) => SFX.voice(l.def.voice, ch) });
      }
    }
  }

  // ---------- conversations ----------

  get busy() {
    return !!this.talking;
  }

  private portrait(l: Placed) {
    // Just the head (with hat and glasses), for a close-up.
    return this.f.ctx.portrait(`resident:${l.def.id}`, () => {
      const head = buildResident(l.def).rig.head;
      head.removeFromParent();
      head.position.set(0, 0, 0);
      head.rotation.set(0, 0, 0);
      return head;
    });
  }

  private line(text: string, options: DialogOption[]) {
    const l = this.talking!;
    this.f.ctx.dialog.say(l.def.name, this.portrait(l), text, options, l.def.voice);
  }

  private end() {
    this.f.ctx.dialog.close();
    this.talking = null;
    this.f.endTalk();
  }

  /** Hang up straight away (test robot). */
  endTalkNow() {
    this.talking = null;
    this.f.endTalk();
  }

  /** Walk up and talk. */
  talk(l: Placed) {
    const f = this.f, run = f.ctx.run;
    this.talking = l;
    this.asked = { key: false, monster: false, joke: false };
    this.generous = false;
    const st = (run.residents[l.def.id] ??= { mood: 0, met: 0 });
    st.met++;
    if (f.time < l.sulkUntil) {
      this.line(pickOf(['Hmph. I\'m not talking to you.', '...', 'Go away. I\'m sulking.']), [{ label: 'Fine. Bye.', action: () => this.end() }]);
      return;
    }
    // Old friends from lower floors remember you.
    if (st.mood > 0 && st.met > 1) {
      this.generous = st.mood >= 2;
      this.questions(pickOf(['Ah! My favourite visitor! What can I do for you?', 'You again! Lovely. Ask away.', 'Oh good, it\'s you.']));
      return;
    }
    const hello = st.mood < 0 && st.met > 1 ? 'YOU again. Hmph.' : pickOf(l.def.hello);
    // Five of their questions, in any order. A slip or two is forgiven, depending on difficulty.
    this.quiz = { left: [...l.def.quiz].sort(() => Math.random() - 0.5).slice(0, QUIZ.questions), slips: 0 };
    this.ask(hello);
  }

  /** The next quiz question, after whatever they said about your last answer. */
  private ask(before: string) {
    const l = this.talking!, run = this.f.ctx.run;
    const st = run.residents[l.def.id];
    const [q, right, ...wrong] = this.quiz.left.shift()!;
    const answers: [string, boolean][] = [[right, true], ...wrong.map((w): [string, boolean] => [w, false])];
    answers.sort(() => Math.random() - 0.5);
    const opts: DialogOption[] = answers.map(([label, good]) => ({
      label,
      action: () => {
        if (!good) this.quiz.slips++;
        if (this.quiz.slips > QUIZ.slips[run.difficulty]) {
          st.mood = -1;
          l.sulkUntil = this.f.time + QUIZ.sulk;
          SFX.empty();
          this.line(l.def.bad, [{ label: 'Oops. Bye.', action: () => this.end() }]);
        } else if (!this.quiz.left.length) {
          st.mood = Math.max(st.mood, 1);
          SFX.heal();
          this.questions(l.def.good);
        } else {
          if (good) SFX.ui(); else SFX.empty();
          this.ask(pickOf(good ? l.def.nod : l.def.frown));
        }
      },
    }));
    // Only on the first question: hand over a present instead of answering.
    if (this.quiz.left.length === QUIZ.questions - 1) this.giveOption(opts);
    opts.push({ label: 'Never mind. Bye!', action: () => this.end() });
    const n = QUIZ.questions - this.quiz.left.length;
    this.line(`${before} (${n}/${QUIZ.questions}) ${q}`, opts);
  }

  /** If you've got what they want in your pocket, you can hand it over. */
  private giveOption(opts: DialogOption[]) {
    const l = this.talking!, run = this.f.ctx.run;
    if (!run.pocket.includes(l.def.wants)) return;
    const item = JUNK.find((j) => j.id === l.def.wants)!;
    opts.push({
      label: `Here: ${item.icon} ${item.name}. For you.`,
      action: () => {
        run.pocket.splice(run.pocket.indexOf(item.id), 1);
        this.f.ctx.hud.setPocket(run.pocket);
        run.residents[l.def.id].mood = 2;
        this.generous = true;
        SFX.key();
        this.questions(l.def.thanks);
      },
    });
  }

  private questions(text: string) {
    const f = this.f;
    const opts: DialogOption[] = [];
    if (!this.asked.key) opts.push({ label: f.hasKey ? 'Know any good jokes?' : 'Seen a key anywhere?', action: () => this.askKey() });
    if (!this.asked.monster) opts.push({ label: 'Any monsters around here?', action: () => this.askMonster() });
    if (!this.generous) this.giveOption(opts);
    opts.push({ label: 'Thanks. Bye!', action: () => this.end() });
    this.line(text, opts);
  }

  private askKey() {
    const f = this.f, l = this.talking!;
    this.asked.key = true;
    if (f.hasKey) {
      this.questions(pickOf(['Why did the skeleton not go to the party? No BODY to go with! HAHAHA.', 'What do you call a sleeping monster? A DINO-SNORE. Hee hee.', 'Knock knock. Who\'s there? Not the key, you\'ve got it!']));
      return;
    }
    const clue = keyClue(f.ctx.run.difficulty, this.keyFacts(), this.generous, this.given);
    this.questions(fill(l.def.clue, { clue }).replace(/(^|[.!?] )([a-z])/g, (_, a: string, c: string) => a + c.toUpperCase()));
  }

  /** What there is to know about where the key is hidden. */
  private keyFacts(): KeyFacts {
    const plan = this.f.plan, k = this.f.keyPiece.p, room = plan.rooms[k.room];
    const b = plan.bounds, r = room.rect;
    const dx = ((r.x0 + r.x1) / 2 - (b.x0 + b.x1) / 2) / ((b.x1 - b.x0) / 2);
    const dz = ((r.z0 + r.z1) / 2 - (b.z0 + b.z1) / 2) / ((b.z1 - b.z0) / 2);
    const side = Math.max(Math.abs(dx), Math.abs(dz)) < 0.3 ? 'middle' : Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 'left' : 'right') : dz < 0 ? 'back' : 'front';
    // Neighbours through doors, and how many rooms you'd walk through from the start.
    const links = (id: number) => plan.doors.filter((d) => d.kind === 'door' && (d.lo === id || d.hi === id)).map((d) => (d.lo === id ? d.hi : d.lo));
    const next = [...new Set(links(room.id).map((id) => plan.rooms[id].type).filter((t) => t !== room.type))];
    const dist = new Map([[plan.startRoom, 0]]);
    const queue = [plan.startRoom];
    while (queue.length) {
      const a = queue.shift()!;
      for (const n of links(a)) if (!dist.has(n)) { dist.set(n, dist.get(a)! + 1); queue.push(n); }
    }
    return { room: room.type, how: FURNITURE[k.kind].search, side, next, steps: dist.get(room.id) ?? 0 };
  }

  private askMonster() {
    const f = this.f, l = this.talking!;
    this.asked.monster = true;
    const boss = f.combat.boss;
    if (!boss) {
      this.questions(pickOf(['Monsters? Not on this floor. Not tonight, anyway.', 'All quiet up here. Too quiet.']));
      return;
    }
    if (!boss.alive) {
      this.questions(pickOf([`${boss.name}? Gone! You saw to that.`, 'It ran off screaming. Was that you? Bravo.']));
      return;
    }
    const room = roomAt(f.plan, boss.x, boss.z);
    this.questions(fill(l.def.warn, { tip: pickOf(FIGHT_TIPS[boss.name]), where: where(room?.type ?? null) }));
  }

  /** Is (x, z) inside any resident? (for keeping critters out) */
  inside(x: number, z: number) {
    return this.list.some((l) => inRect(l.box, x, z));
  }
}

import * as THREE from 'three';
import { Thumbnailer } from '@engine/thumbnails';
import { SKINS, type SkinId } from '../data/blocs';
import { HATS, type HatId } from '../data/hats';
import { WEAPONS, WEAPON_IDS } from '../data/weapons';
import { ARENAS, type ArenaDef } from '../data/arenas';
import { Terrain } from '../world/terrain';
import { TEAMS } from '../data/teams';
import { SFX } from '../data/sounds';
import { TEXT } from '../data/text';
import { BlocView } from '../entities/blocView';
import { makeHeldWeapon } from '../entities/weaponModels';
import { save, settings } from '../settings';
import type { Card, Menus, Screen } from './menus';

type Tab = 'blocs' | 'hats' | 'weapons' | 'arenas';

/** The shop: bloc skins, hats and weapons, bought with bloccoins from one shared wallet. */
export class Shop {
  private tab: Tab = 'blocs';
  private player: 0 | 1 = 0;
  /** Item waiting for a second click to confirm the purchase. */
  private pending: string | null = null;
  private thumbs: Thumbnailer | null = null;
  private maps = new Map<string, string>();

  constructor(private menus: Menus, private onBack: () => void, private onArena: (id: string) => void = () => {}) {}

  open() {
    this.pending = null;
    this.menus.show(() => this.screen());
  }

  private pic(key: string, make: () => THREE.Object3D, opts?: { yaw?: number; pitch?: number; zoom?: number }) {
    this.thumbs ??= new Thumbnailer(220);
    return this.thumbs.render(key, make, opts);
  }

  private blocPic(skin: SkinId, hat: HatId | null) {
    const team = TEAMS[this.player === 1 && settings.p2Team === 'other' && settings.players === 2 ? 1 : 0];
    return this.pic(`bloc-${team.id}-${skin}-${hat}`, () => new BlocView(team, null, { skin, hat }, 'spear').pose(), { yaw: -0.45, zoom: hat ? 0.68 : 0.62 });
  }

  private screen(): Screen {
    const look = settings.looks[this.player];
    const header = `<div class="shop-top"><h2>${TEXT.shop}</h2><div class="coins">🪙 ${settings.coins} ${TEXT.coins}</div></div>`;
    const tabs = {
      kind: 'row' as const,
      items: (['blocs', 'hats', 'weapons', 'arenas'] as Tab[]).map((t) => ({
        kind: 'button' as const,
        label: t === 'blocs' ? '🟦 Blocs' : t === 'hats' ? '🎩 Hats' : t === 'weapons' ? '🗡️ Weapons' : '🌋 Arenas',
        selected: this.tab === t,
        onClick: () => { this.tab = t; this.pending = null; this.menus.refresh(); },
      })),
    };
    const who = {
      kind: 'option' as const,
      label: 'Dressing up',
      values: ['Player 1', 'Player 2'],
      get: () => this.player,
      set: (i: number) => { this.player = i as 0 | 1; this.pending = null; },
    };

    let cards: Card[];
    if (this.tab === 'blocs') {
      cards = SKINS.map((s) => this.card(`skin:${s.id}`, s.name, s.price, settings.ownedSkins.includes(s.id), look.skin === s.id,
        this.blocPic(s.id, null),
        () => { settings.ownedSkins.push(s.id); look.skin = s.id; },
        () => { look.skin = s.id; }));
    } else if (this.tab === 'hats') {
      cards = [
        {
          img: this.blocPic(look.skin, null), title: 'No hat', tag: look.hat === null ? 'WEARING' : 'Take off',
          tagClass: look.hat === null ? 'equipped' : 'owned', selected: look.hat === null,
          onClick: () => { look.hat = null; save(); SFX.ui(); this.menus.refresh(); },
        },
        ...HATS.map((h) => this.card(`hat:${h.id}`, h.name, h.price, settings.ownedHats.includes(h.id), look.hat === h.id,
          this.blocPic(look.skin, h.id),
          () => { settings.ownedHats.push(h.id); look.hat = h.id; },
          () => { look.hat = look.hat === h.id ? null : h.id; })),
      ];
    } else if (this.tab === 'arenas') {
      cards = ARENAS.map((a) => this.card(`arena:${a.id}`, `${a.icon} ${a.name}`, a.price, settings.ownedArenas.includes(a.id), settings.arena === a.id,
        this.mapPic(a),
        () => { settings.ownedArenas.push(a.id); settings.arena = a.id; this.onArena(a.id); },
        () => { settings.arena = a.id; this.onArena(a.id); }, 'PLAYING HERE'));
    } else {
      cards = WEAPON_IDS.map((id) => {
        const w = WEAPONS[id];
        const owned = settings.ownedWeapons.includes(id);
        const card = this.card(`weapon:${id}`, `${w.icon} ${w.name}`, w.price, owned, false,
          this.pic(`weapon-${id}`, () => makeHeldWeapon(id, TEAMS[0].color), { yaw: -1.2, pitch: 0.5, zoom: 0.9 }),
          () => { settings.ownedWeapons.push(id); settings.weapons[this.player] = id; },
          () => {});
        return card;
      });
    }

    const items: Screen['items'] = [tabs];
    if (this.tab === 'blocs' || this.tab === 'hats') items.push(who);
    items.push({ kind: 'grid', cards });
    if (this.tab === 'arenas') items.push({ kind: 'text', html: ARENAS.map((a) => `<b>${a.icon} ${a.name}:</b> ${a.description}`).join('<br>') });
    if (this.tab === 'weapons') items.push({ kind: 'text', html: '<b>Pick your weapon in Play before each match.</b><br>' + Object.values(WEAPONS).map((w) => `<b>${w.icon} ${w.name}:</b> ${w.description}`).join('<br>') });
    items.push({ kind: 'button', label: TEXT.back, onClick: this.onBack });
    return { header, items, onBack: this.onBack, wide: true };
  }

  /** A little top-down map of an arena, drawn from its rules (land, liquids, bridges, props). */
  private mapPic(def: ArenaDef) {
    const hit = this.maps.get(def.id);
    if (hit) return hit;
    const t = new Terrain(def);
    const w = 220, h = 220;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    const scale = Math.min(w / (def.halfW * 2 + 2), h / (def.halfD * 2 + 2));
    const px = (x: number) => w / 2 + x * scale, pz = (z: number) => h / 2 + z * scale;
    const LAND: Record<string, string> = { meadow: '#5aa83f', volcano: '#4a3a34', jungle: '#3f6a2a', beach: '#ead39c', ruins: '#c9a774', clouds: '#eef2fa' };
    const LIQ: Record<string, string> = { pond: '#3aa0c0', river: '#3f7a5a', sea: '#2a8fd0', lava: '#ff6a1a', quicksand: '#9c7a4a', sky: '#3a7fd0' };
    g.fillStyle = def.edge === 'lava' ? LIQ.lava : def.edge === 'sky' ? LIQ.sky : def.theme === 'beach' ? '#d9bf86' : def.theme === 'ruins' ? '#8a6b45' : '#1d3d1a';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const wx = (x - w / 2) / scale, wz = (y - h / 2) / scale;
        const liq = t.liquidAt(wx, wz);
        if (liq) g.fillStyle = LIQ[liq];
        else if (t.inLand(wx, wz)) g.fillStyle = LAND[def.theme];
        else continue;
        g.fillRect(x, y, 2, 2);
      }
    }
    // Boulder lanes and drifting clouds.
    g.lineCap = 'round';
    for (const b of t.boulders) {
      g.strokeStyle = 'rgba(90,65,35,0.8)';
      g.lineWidth = b.r * 2 * scale;
      g.beginPath(); g.moveTo(px(b.ax), pz(b.az)); g.lineTo(px(b.bx), pz(b.bz)); g.stroke();
    }
    g.fillStyle = '#ffffff';
    for (const p of t.platforms) {
      g.beginPath();
      p.poly.forEach(([x, z], i) => (i ? g.lineTo(px(p.cx + x), pz(p.cz + z)) : g.moveTo(px(p.cx + x), pz(p.cz + z))));
      g.fill();
    }
    g.fillStyle = '#b08850';
    for (const b of t.bridges) {
      if (b.style === 'rainbow') g.fillStyle = '#ff9ad5';
      g.save();
      g.translate(px(b.box.x), pz(b.box.z));
      g.rotate(b.box.angle);
      g.fillRect(-b.box.hl * scale, -b.box.ht * scale, b.box.hl * 2 * scale, b.box.ht * 2 * scale);
      g.restore();
    }
    g.fillStyle = '#8c8a78';
    for (const gt of t.gates) {
      g.save();
      g.translate(px(gt.box.x), pz(gt.box.z));
      g.rotate(gt.box.angle);
      g.fillRect(-gt.box.hl * scale, -2, gt.box.hl * 2 * scale, 4);
      g.restore();
    }
    for (const p of t.props) {
      g.fillStyle = p.kind === 'rock' || p.kind === 'pillar' ? '#8d939a' : p.kind === 'crate' || p.kind === 'sandcastle' ? '#c49a5a' : '#1f6b2a';
      g.beginPath();
      g.arc(px(p.x), pz(p.z), Math.max(2, p.r * scale), 0, Math.PI * 2);
      g.fill();
    }
    // Team starts.
    for (const team of [0, 1]) {
      const s = t.spawnFor(team);
      g.fillStyle = team === 0 ? '#2f7dff' : '#ff3b3b';
      for (const [x, z] of s.blocs) g.fillRect(px(x) - 3, pz(z) - 3, 6, 6);
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(px(s.bunny[0]), pz(s.bunny[1]), 3.5, 0, Math.PI * 2);
      g.fill();
    }
    const url = cv.toDataURL();
    this.maps.set(def.id, url);
    return url;
  }

  /** A shop card: first click on something new asks "Buy?", the second buys it. */
  private card(key: string, title: string, price: number, owned: boolean, wearing: boolean, img: string, buy: () => void, use: () => void, wearingLabel = 'WEARING'): Card {
    const confirming = this.pending === key;
    const tag = wearing ? wearingLabel : owned ? 'OWNED' : confirming ? `Buy for 🪙${price}?` : price === 0 ? 'FREE' : `🪙 ${price}`;
    return {
      img, title, tag,
      tagClass: wearing ? 'equipped' : owned ? 'owned' : confirming ? 'confirm' : price > settings.coins ? 'locked' : 'price',
      selected: wearing,
      onClick: () => {
        if (owned) {
          use();
          this.pending = null;
          SFX.ui();
        } else if (price > settings.coins) {
          SFX.nope();
          this.flash(TEXT.notEnough);
          return;
        } else if (!confirming) {
          this.pending = key;
          SFX.ui();
        } else {
          settings.coins -= price;
          buy();
          this.pending = null;
          SFX.buy();
          this.flash(TEXT.bought);
        }
        save();
        this.menus.refresh();
      },
    };
  }

  private flash(text: string) {
    const el = document.createElement('div');
    el.className = 'shop-flash';
    el.textContent = text;
    this.menus.root.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
}

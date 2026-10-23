import * as THREE from 'three';
import { Thumbnailer } from '@engine/thumbnails';
import { SKINS, type SkinId } from '../data/blocs';
import { HATS, type HatId } from '../data/hats';
import { WEAPONS, WEAPON_IDS } from '../data/weapons';
import { TEAMS } from '../data/teams';
import { SFX } from '../data/sounds';
import { TEXT } from '../data/text';
import { BlocView } from '../entities/blocView';
import { makeHeldWeapon } from '../entities/weaponModels';
import { save, settings } from '../settings';
import type { Card, Menus, Screen } from './menus';

type Tab = 'blocs' | 'hats' | 'weapons';

/** The shop: bloc skins, hats and weapons, bought with bloccoins from one shared wallet. */
export class Shop {
  private tab: Tab = 'blocs';
  private player: 0 | 1 = 0;
  /** Item waiting for a second click to confirm the purchase. */
  private pending: string | null = null;
  private thumbs: Thumbnailer | null = null;

  constructor(private menus: Menus, private onBack: () => void) {}

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
      items: (['blocs', 'hats', 'weapons'] as Tab[]).map((t) => ({
        kind: 'button' as const,
        label: t === 'blocs' ? '🟦 Blocs' : t === 'hats' ? '🎩 Hats' : '🗡️ Weapons',
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
    if (this.tab !== 'weapons') items.push(who);
    items.push({ kind: 'grid', cards });
    if (this.tab === 'weapons') items.push({ kind: 'text', html: '<b>Pick your weapon in Play before each match.</b><br>' + Object.values(WEAPONS).map((w) => `<b>${w.icon} ${w.name}:</b> ${w.description}`).join('<br>') });
    items.push({ kind: 'button', label: TEXT.back, onClick: this.onBack });
    return { header, items, onBack: this.onBack, wide: true };
  }

  /** A shop card: first click on something new asks "Buy?", the second buys it. */
  private card(key: string, title: string, price: number, owned: boolean, wearing: boolean, img: string, buy: () => void, use: () => void): Card {
    const confirming = this.pending === key;
    const tag = wearing ? 'WEARING' : owned ? 'OWNED' : confirming ? `Buy for 🪙${price}?` : price === 0 ? 'FREE' : `🪙 ${price}`;
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

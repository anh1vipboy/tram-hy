// Thiệp cưới vuông 3 trang: 1) bìa  2) nhà trai · nhà gái · hôn lễ  3) tiệc cưới.
// Mọi cỡ chữ / khoảng cách tính theo bề rộng trang (container query) → cùng một thiệp dùng cho ảnh nhỏ trong thư viện mẫu,
// khung xem trước và trang khách mời. Họa tiết là SVG tự vẽ (không dùng ảnh của bên thứ ba).
import { html } from '../core/utils.js';
import { lunarText } from '../core/lunar.js';
import { templateOf, TEMPLATE_FROM_THEME } from '../data/invitation-templates.js';

const WEEKDAY = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const pad = (n) => String(n).padStart(2, '0');
const givenName = (full) => String(full || '').trim().split(/\s+/).pop() || '';

// Giờ Việt Nam bất kể máy người xem đặt múi giờ nào
function vnParts(iso) {
  const d = new Date(new Date(iso).getTime() + 7 * 3600e3);
  return { h: d.getUTCHours(), m: d.getUTCMinutes(), day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear(), wd: d.getUTCDay() };
}
export function whenText(iso) {
  if (!iso) return 'Ngày giờ sẽ cập nhật';
  const p = vnParts(iso);
  return `${pad(p.h)} giờ ${pad(p.m)} | ${WEEKDAY[p.wd]} | ${pad(p.day)}.${pad(p.month)}.${p.year}`;
}

export const invitationTemplateKey = (inv) => inv.template || TEMPLATE_FROM_THEME[inv.theme] || 'la-tim';

// ---------- HỌA TIẾT SVG ----------
// Số ngẫu nhiên cố định theo vị trí → họa tiết giống nhau mỗi lần vẽ
const rnd = (i, s = 1) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
const f = (n) => Math.round(n * 10) / 10;

function quad(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    y: u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    a: (Math.atan2(2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]), 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])) * 180) / Math.PI,
  };
}

const leafPath = (L, W) => `M0 0C${f(L * 0.3)} ${f(-W)} ${f(L * 0.72)} ${f(-W)} ${f(L)} 0C${f(L * 0.72)} ${f(W)} ${f(L * 0.3)} ${f(W)} 0 0Z`;

// Cành lá màu nước dọc đường cong p0 → p2. kind: leaf (lá thon) | round (lá bạch đàn tròn)
function branch(id, p0, p1, p2, { count = 11, size = 52, kind = 'leaf', seed = 1 } = {}) {
  const leaves = [];
  for (let i = 0; i < count; i += 1) {
    const t = 0.08 + (0.9 * i) / (count - 1);
    const pt = quad(p0, p1, p2, t);
    const side = i % 2 ? 1 : -1;
    const k = 1 - 0.5 * t;
    if (kind === 'round') {
      const r = size * 0.32 * k * (0.85 + 0.3 * rnd(i, seed));
      const ang = ((pt.a + side * 90) * Math.PI) / 180;
      const cx = pt.x + Math.cos(ang) * r * 0.9;
      const cy = pt.y + Math.sin(ang) * r * 0.9;
      leaves.push(html`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(r)}" ry="${f(r * 0.86)}" fill="url(#${id}-g)" opacity="${f(0.55 + 0.4 * rnd(i, seed + 3))}"/>
        <ellipse cx="${f(cx + r * 0.15)}" cy="${f(cy - r * 0.1)}" rx="${f(r * 0.7)}" ry="${f(r * 0.55)}" fill="url(#${id}-w)" opacity=".5"/>`);
    } else {
      const L = size * k * (0.8 + 0.4 * rnd(i, seed));
      const rot = pt.a + side * (42 + 22 * rnd(i, seed + 7));
      leaves.push(html`<g transform="translate(${f(pt.x)} ${f(pt.y)}) rotate(${f(rot)})">
        <path d="${leafPath(L * 1.06, L * 0.36)}" fill="url(#${id}-w)" opacity=".45" transform="rotate(7)"/>
        <path d="${leafPath(L, L * 0.32)}" fill="url(#${id}-g)" opacity="${f(0.6 + 0.35 * rnd(i, seed + 5))}"/>
        <path d="M2 0L${f(L * 0.86)} 0" stroke="var(--inv-ink)" stroke-opacity=".35" stroke-width=".8"/></g>`);
    }
  }
  const tip = quad(p0, p1, p2, 1);
  return html`
    <path d="M${p0[0]} ${p0[1]}Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}" fill="none" stroke="var(--inv-ink)" stroke-opacity=".45" stroke-width="1.4"/>
    ${leaves}
    ${kind === 'leaf' ? html`<g transform="translate(${f(tip.x)} ${f(tip.y)}) rotate(${f(tip.a)})"><path d="${leafPath(size * 0.55, size * 0.17)}" fill="url(#${id}-g)" opacity=".85"/></g>` : ''}`;
}

function blossom(id, x, y, r, seed) {
  const petals = Array.from({ length: 5 }, (_, i) => {
    const a = i * 72 + rnd(i, seed) * 14;
    return html`<ellipse cx="0" cy="${f(-r * 0.55)}" rx="${f(r * 0.42)}" ry="${f(r * 0.6)}" transform="rotate(${f(a)})" fill="url(#${id}-g)" opacity="${f(0.75 + 0.2 * rnd(i, seed + 2))}"/>`;
  });
  return html`<g transform="translate(${f(x)} ${f(y)})">${petals}<circle r="${f(r * 0.2)}" fill="var(--inv-ink)" opacity=".55"/></g>`;
}

function star(x, y, r, opacity = 1) {
  return html`<path transform="translate(${f(x)} ${f(y)})" d="M0 ${f(-r)}Q${f(r * 0.15)} ${f(-r * 0.15)} ${f(r)} 0Q${f(r * 0.15)} ${f(r * 0.15)} 0 ${f(r)}Q${f(-r * 0.15)} ${f(r * 0.15)} ${f(-r)} 0Q${f(-r * 0.15)} ${f(-r * 0.15)} 0 ${f(-r)}Z" fill="var(--inv-accent)" opacity="${opacity}"/>`;
}

const defs = (id) => html`<defs>
  <linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--inv-accent)"/><stop offset="1" stop-color="var(--inv-ink)" stop-opacity=".85"/></linearGradient>
  <linearGradient id="${id}-w" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="var(--inv-soft)"/><stop offset="1" stop-color="var(--inv-accent)" stop-opacity=".35"/></linearGradient>
</defs>`;

// slot: cover (góc trên trái bìa) · cover-small (góc dưới phải bìa) · side (cạnh phải trang 2) · corner (2 góc trên trang 3)
function ornamentSvg(kind, slot, id) {
  const vb = slot === 'side' ? '0 0 120 260' : '0 0 200 200';
  let body;
  if (kind === 'leaves' || kind === 'eucalyptus') {
    const opt = { kind: kind === 'eucalyptus' ? 'round' : 'leaf' };
    body = {
      cover: html`${branch(id, [-6, 18], [70, 30], [168, 112], { ...opt, count: 12, size: 58 })}${branch(id, [8, -6], [30, 80], [70, 172], { ...opt, count: 8, size: 44, seed: 4 })}`,
      'cover-small': kind === 'leaves'
        ? html`${branch(id, [150, 200], [140, 150], [120, 95], { count: 5, size: 34, seed: 9 })}${blossom(id, 118, 92, 20, 3)}`
        : branch(id, [160, 200], [175, 140], [130, 90], { ...opt, count: 7, size: 40, seed: 9 }),
      side: html`${branch(id, [80, 262], [125, 150], [52, 8], { ...opt, count: 13, size: 60, seed: 2 })}${branch(id, [96, 262], [40, 210], [18, 150], { ...opt, count: 6, size: 40, seed: 6 })}`,
      corner: branch(id, [-4, 26], [80, 10], [178, 96], { ...opt, count: 10, size: 50, seed: 5 }),
    }[slot];
  } else if (kind === 'blossom') {
    body = {
      cover: html`${branch(id, [-6, 18], [70, 30], [168, 112], { count: 8, size: 42 })}${blossom(id, 60, 40, 26, 1)}${blossom(id, 120, 78, 20, 2)}${blossom(id, 30, 100, 16, 4)}`,
      'cover-small': html`${branch(id, [160, 200], [150, 150], [125, 105], { count: 4, size: 30 })}${blossom(id, 122, 100, 22, 6)}`,
      side: html`${branch(id, [80, 262], [125, 150], [52, 8], { count: 10, size: 46, seed: 2 })}${blossom(id, 60, 30, 22, 3)}${blossom(id, 92, 120, 18, 5)}${blossom(id, 70, 200, 15, 7)}`,
      corner: html`${branch(id, [-4, 26], [80, 10], [178, 96], { count: 7, size: 40, seed: 5 })}${blossom(id, 70, 26, 20, 8)}${blossom(id, 140, 70, 15, 9)}`,
    }[slot];
  } else if (kind === 'song-hy') {
    const corner = html`<path d="M6 120V30Q6 6 30 6H120" fill="none" stroke="var(--inv-accent)" stroke-width="2.4"/>
      <path d="M18 120V38Q18 18 38 18H120" fill="none" stroke="var(--inv-accent)" stroke-width="1" stroke-opacity=".8"/>
      <circle cx="30" cy="30" r="7" fill="none" stroke="var(--inv-accent)" stroke-width="1.6"/><circle cx="30" cy="30" r="2.4" fill="var(--inv-accent)"/>
      <path d="M44 18Q52 34 44 44Q34 52 18 44" fill="none" stroke="var(--inv-accent)" stroke-width="1.2"/>`;
    const emblem = (cx, cy, r) => html`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--inv-accent)" stroke-width="1.6"/>
      <circle cx="${cx}" cy="${cy}" r="${f(r * 0.86)}" fill="none" stroke="var(--inv-accent)" stroke-width=".7" stroke-dasharray="2 3"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${f(r * 1.05)}" fill="var(--inv-accent)" font-family="serif" font-weight="700">囍</text>`;
    body = { cover: corner, 'cover-small': emblem(140, 140, 36), side: html`<g opacity=".22">${emblem(60, 130, 52)}</g>`, corner }[slot];
  } else if (kind === 'deco') {
    const fan = html`${[40, 64, 88, 112].map((r, i) => html`<path d="M0 ${r}A${r} ${r} 0 0 0 ${r} 0" fill="none" stroke="var(--inv-accent)" stroke-width="${i % 2 ? 0.8 : 1.6}"/>`)}
      ${[15, 30, 45, 60, 75].map((a) => html`<path d="M0 0L${f(150 * Math.cos((a * Math.PI) / 180))} ${f(150 * Math.sin((a * Math.PI) / 180))}" stroke="var(--inv-accent)" stroke-width=".6" stroke-opacity=".7"/>`)}
      <path d="M128 6L134 0L140 6L134 12Z" fill="var(--inv-accent)"/>`;
    body = {
      cover: fan,
      'cover-small': html`<g transform="translate(200 200) rotate(180)">${fan}</g>`,
      side: html`<path d="M60 10V250" stroke="var(--inv-accent)" stroke-width="1"/><path d="M50 10V250M70 10V250" stroke="var(--inv-accent)" stroke-width=".5"/>
        ${[40, 130, 220].map((y) => html`<path d="M60 ${y - 12}L72 ${y}L60 ${y + 12}L48 ${y}Z" fill="var(--inv-bg)" stroke="var(--inv-accent)" stroke-width="1.2"/><circle cx="60" cy="${y}" r="3" fill="var(--inv-accent)"/>`)}`,
      corner: fan,
    }[slot];
  } else {   // stars
    const sky = (seed, n, w, h) => Array.from({ length: n }, (_, i) =>
      star(rnd(i, seed) * w, rnd(i, seed + 1) * h, 2 + 7 * rnd(i, seed + 2) ** 2, f(0.5 + 0.5 * rnd(i, seed + 3))));
    body = {
      cover: html`<path d="M0 150Q60 60 190 20" fill="none" stroke="var(--inv-accent)" stroke-width=".7" stroke-dasharray="1 4"/>${sky(1, 14, 170, 140)}${star(150, 34, 14)}`,
      'cover-small': html`${star(150, 150, 18)}${star(118, 176, 8, 0.7)}${star(176, 116, 6, 0.6)}`,
      side: html`<path d="M60 0V260" stroke="var(--inv-accent)" stroke-width=".6" stroke-dasharray="1 5"/>${sky(4, 12, 120, 260)}${star(60, 130, 16)}`,
      corner: html`${sky(7, 10, 170, 110)}${star(40, 30, 12)}`,
    }[slot];
  }
  return html`<svg class="inv-orn inv-orn-${slot}" viewBox="${vb}" aria-hidden="true" focusable="false">${defs(id)}${body}</svg>`;
}

// ---------- ẢNH / CHỮ LỒNG ----------
function photo(inv, cls) {
  const initials = `${givenName(inv.groom_name).charAt(0) || 'A'} & ${givenName(inv.bride_name).charAt(0) || 'B'}`;
  return html`<div class="inv-photo ${cls}">
    ${inv.photo_url ? html`<img src="${inv.photo_url}" alt="Ảnh cưới ${inv.groom_name} và ${inv.bride_name}" loading="lazy">`
      : html`<span class="inv-monogram">${initials}</span>`}
  </div>`;
}

function arcPhoto(inv, id) {
  return html`<div class="inv-arc">
    <svg viewBox="0 0 200 200" aria-hidden="true"><defs><path id="${id}-arc" d="M22 104A78 78 0 0 1 178 104"/></defs>
      <text font-size="8.6" letter-spacing=".4" fill="var(--inv-ink)"><textPath href="#${id}-arc" startOffset="50%" text-anchor="middle">
        Sự hiện diện của quý khách là niềm vinh hạnh của gia đình chúng tôi</textPath></text></svg>
    ${photo(inv, 'inv-photo-arc')}
  </div>`;
}

// ---------- THIỆP 3 TRANG ----------
/**
 * inv: { groom_name, bride_name, event_at, venue, template|theme, photo_url, details: {...} }
 * opts.guestName: tên khách trên dòng "Trân trọng kính mời" · opts.pages: [1,2,3] trang cần vẽ · opts.uid: tiền tố id SVG
 */
export function invitationPages(inv, { guestName = '', pages = [1, 2, 3], uid = 'inv' } = {}) {
  const tpl = templateOf(invitationTemplateKey(inv));
  const d = inv.details || {};
  const groomFirst = d.host !== 'gai';
  const [first, second] = groomFirst ? [inv.groom_name, inv.bride_name] : [inv.bride_name, inv.groom_name];
  const id = `${uid}-${tpl.key}`;
  const c = tpl.colors;
  const style = `--inv-bg:${c.bg};--inv-ink:${c.ink};--inv-accent:${c.accent};--inv-soft:${c.soft};--inv-script:'${tpl.script}', cursive`;
  const family = (title, father, mother, address) => html`<div class="inv-family-col">
    <span class="inv-caps">${title}</span>
    <span>Ông: ${father || '…'}</span><span>Bà: ${mother || '…'}</span>
    ${address ? html`<span class="inv-tiny">${address}</span>` : ''}</div>`;
  const guestLine = html`<div class="inv-guest">${guestName}</div>`;
  const venue = inv.venue || 'Tên nhà hàng';

  const page1 = html`<section class="inv-page inv-p1" aria-label="Bìa thiệp">
    ${ornamentSvg(tpl.ornament, 'cover', `${id}-1`)}
    ${photo(inv, 'inv-photo-cover')}
    <div class="inv-cover-names">
      <span class="inv-script">${givenName(inv.groom_name) || 'Chú rể'}</span><span class="inv-amp">&</span><span class="inv-script">${givenName(inv.bride_name) || 'Cô dâu'}</span>
    </div>
    <div class="inv-cover-foot"><span class="inv-caps inv-light">Our wedding</span><span class="inv-caps">Trân trọng kính mời</span>${guestLine}</div>
    ${ornamentSvg(tpl.ornament, 'cover-small', `${id}-1s`)}
  </section>`;

  const page2 = html`<section class="inv-page inv-p2" aria-label="Thông tin hôn lễ">
    ${ornamentSvg(tpl.ornament, 'side', `${id}-2`)}
    <div class="inv-p2-body">
      <div class="inv-families">
        ${family('Nhà trai', d.groom_father, d.groom_mother, d.groom_address)}
        ${family('Nhà gái', d.bride_father, d.bride_mother, d.bride_address)}
      </div>
      <div class="inv-block"><span class="inv-caps inv-light">Trân trọng báo tin</span>
        <span class="inv-caps">${groomFirst ? 'Lễ thành hôn' : 'Lễ vu quy'} của con chúng tôi</span></div>
      <div class="inv-fullnames"><span class="inv-script">${first || 'Họ tên'}</span><span class="inv-amp">&</span><span class="inv-script">${second || 'Họ tên'}</span></div>
      <div class="inv-block"><span class="inv-caps inv-light">Hôn lễ được cử hành vào lúc</span>
        <span class="inv-when">${whenText(d.ceremony_at || inv.event_at)}</span>
        ${d.ceremony_at || inv.event_at ? html`<span class="inv-tiny">(${lunarText(d.ceremony_at || inv.event_at)})</span>` : ''}</div>
      <div class="inv-block"><span class="inv-caps">Tại tư gia nhà ${groomFirst ? 'trai' : 'gái'}</span>
        <span class="inv-tiny">${(groomFirst ? d.groom_address : d.bride_address) || ''}</span></div>
    </div>
  </section>`;

  const page3 = html`<section class="inv-page inv-p3" aria-label="Thông tin tiệc cưới">
    ${ornamentSvg(tpl.ornament, 'corner', `${id}-3`)}
    <div class="inv-mirror">${ornamentSvg(tpl.ornament, 'corner', `${id}-3m`)}</div>
    <div class="inv-p3-body">
      <span class="inv-caps">Trân trọng kính mời</span>${guestLine}
      <span class="inv-note">Đến dự bữa tiệc thân mật chung vui cùng gia đình chúng tôi tại</span>
      <span class="inv-caps">${d.venue_label || 'Nhà hàng tiệc cưới'}</span>
      <span class="inv-script inv-venue ${venue.length > 22 ? 'is-long' : ''}">${venue}</span>
      ${d.venue_address ? html`<span class="inv-tiny">${d.venue_address}</span>` : ''}
      <span class="inv-caps inv-light">Tiệc được tổ chức vào lúc</span>
      <span class="inv-when">${whenText(inv.event_at)}</span>
      ${inv.event_at ? html`<span class="inv-tiny">(${lunarText(inv.event_at)})</span>` : ''}
    </div>
    ${arcPhoto(inv, `${id}-3`)}
  </section>`;

  const all = { 1: page1, 2: page2, 3: page3 };
  return html`<div class="inv inv-${tpl.ornament}" style="${style}">${pages.map((p) => all[p])}</div>`;
}

// ---------- PHONG BÌ (khách mời mở thiệp) ----------
export function invitationEnvelope(inv, guestName) {
  const tpl = templateOf(invitationTemplateKey(inv));
  const c = tpl.colors;
  const seal = tpl.ornament === 'song-hy' ? '囍' : `${givenName(inv.groom_name).charAt(0)}${givenName(inv.bride_name).charAt(0)}`;
  return html`<div class="envelope" style="--inv-bg:${c.bg};--inv-ink:${c.ink};--inv-accent:${c.accent};--inv-soft:${c.soft};--inv-script:'${tpl.script}', cursive">
    <div class="envelope-back"></div>
    <div class="envelope-letter"><span class="inv-script">${givenName(inv.groom_name)} & ${givenName(inv.bride_name)}</span></div>
    <div class="envelope-front">
      <div class="envelope-to"><span class="inv-caps">Kính gửi</span><span class="envelope-name">${guestName || 'Quý khách'}</span></div>
    </div>
    <div class="envelope-flap"></div>
    <button type="button" class="envelope-seal" data-open-envelope aria-label="Mở thiệp cưới"><span>${seal}</span></button>
  </div>`;
}

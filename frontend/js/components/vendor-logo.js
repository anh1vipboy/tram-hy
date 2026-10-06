// Ảnh đại diện (logo) tròn của tiệm – chưa có logo thì hiện chữ cái đầu tên tiệm
import { html, initials } from '../core/utils.js';

export function vendorLogo(vendor, { size = 40, className = '' } = {}) {
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px`;
  return vendor.logo_url
    ? html`<img class="vendor-logo ${className}" src="${vendor.logo_url}" alt="Logo ${vendor.name}" style="${style}" loading="lazy">`
    : html`<span class="vendor-logo ${className}" style="${style}" aria-hidden="true">${initials(vendor.name)}</span>`;
}

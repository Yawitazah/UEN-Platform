/**
 * UEN Merchant Widget
 * Embed on any Shopify store: <script src="https://your-uen-domain/widget.js" data-shop="store.myshopify.com"></script>
 * The widget detects logged-in UEN holders via localStorage and lets them redeem at checkout.
 */

// The widget runs on the merchant's domain, so API calls must target the UEN
// platform origin — derived from this script's own src.
const widgetScript =
  (document.currentScript as HTMLScriptElement | null) ??
  document.querySelector<HTMLScriptElement>('script[src*="widget.js"]');
const UEN_API_BASE: string =
  (window as any).__UEN_API_BASE__ || (widgetScript?.src ? new URL(widgetScript.src).origin : "");
const UEN_TOKEN_KEY = "uen_portal_token";

function getToken(): string {
  return localStorage.getItem(UEN_TOKEN_KEY) ?? "";
}

function setToken(token: string) {
  if (token) localStorage.setItem(UEN_TOKEN_KEY, token);
  else localStorage.removeItem(UEN_TOKEN_KEY);
}

function getShopDomain(): string {
  const el = widgetScript?.dataset.shop ? widgetScript : document.querySelector<HTMLScriptElement>("script[data-shop]");
  if (el?.dataset.shop) return el.dataset.shop;
  return window.location.hostname;
}

function getMerchantId(): string {
  const el = widgetScript?.dataset.merchantId ? widgetScript : document.querySelector<HTMLScriptElement>("script[data-merchant-id]");
  return el?.dataset.merchantId ?? "";
}

// Placement/branding settings — provided by the theme app extension's app
// embed block (Online Store > Customize > App embeds) or as data attributes
// on a manual script install. Defaults match the original widget.
type WidgetConfig = {
  position: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  offsetSide: number;
  offsetBottom: number;
  label: string;
  accent: string;
};

function getConfig(): WidgetConfig {
  const data = widgetScript?.dataset ?? {};
  const positions = ["bottom-right", "bottom-left", "top-right", "top-left"];
  const position = positions.includes(data.position ?? "") ? (data.position as WidgetConfig["position"]) : "bottom-right";
  const offsetSide = Math.max(0, parseInt(data.offsetSide ?? "", 10) || 24);
  const offsetBottom = Math.max(0, parseInt(data.offsetBottom ?? "", 10) || 24);
  const label = (data.label ?? "").trim() || "UEN Discount";
  const accent = /^#[0-9a-f]{3,8}$/i.test(data.accent ?? "") ? (data.accent as string) : "#75e3ad";
  return { position, offsetSide, offsetBottom, label, accent };
}

// Resolve the merchant: explicit data-merchant-id wins (legacy installs),
// otherwise look the store up by its myshopify domain. Stores that aren't
// connected to the UEN network render nothing.
async function resolveMerchantId(): Promise<string> {
  const explicit = getMerchantId();
  if (explicit) return explicit;
  const shop = getShopDomain();
  if (!shop || !UEN_API_BASE) return "";
  try {
    const response = await fetch(`${UEN_API_BASE}/api/public/widget-config?shop=${encodeURIComponent(shop)}`);
    if (!response.ok) return "";
    const payload = (await response.json()) as { merchantId?: string };
    return payload.merchantId ?? "";
  } catch {
    return "";
  }
}

type RedeemResult = {
  code: string;
  uenId: string;
  mode: "AUTO" | "MANUAL";
  shopDomain: string;
  autoApplyUrl: string | null;
  discountValue: number | null;
  discountType: string;
};

type WalletMerchant = {
  id: string;
  businessName: string;
  offer: { discountType: string; discountValue: number | null; minimumOrderAmount: number | null; usageLimitPerNote: number } | null;
  availableUens: number;
  redeemedUens: number;
  shopDomain: string | null;
};

async function fetchMerchantInfo(token: string, merchantId: string): Promise<WalletMerchant | null> {
  try {
    const response = await fetch(`${UEN_API_BASE}/api/holder/merchants?token=${encodeURIComponent(token)}`);
    if (!response.ok) return null;
    const merchants: WalletMerchant[] = await response.json();
    return merchants.find((m) => m.id === merchantId) ?? null;
  } catch {
    return null;
  }
}

async function redeem(token: string, merchantId: string, mode: "AUTO" | "MANUAL"): Promise<RedeemResult> {
  const response = await fetch(`${UEN_API_BASE}/api/holder/redeem?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ merchantId, mode })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as any).error ?? "Redemption failed");
  }
  return response.json();
}

async function fetchHolderName(token: string): Promise<string | null> {
  try {
    const r = await fetch(`${UEN_API_BASE}/api/holder/profile?token=${encodeURIComponent(token)}`);
    if (!r.ok) return null;
    const p = (await r.json()) as { firstName?: string | null };
    return p.firstName ?? null;
  } catch {
    return null;
  }
}

// Requests a one-time sign-in link by email. The server no longer returns a
// portal token here — it emails a secure link the shopper must click, so
// nobody can open a wallet by typing someone else's email.
async function widgetLogin(merchantId: string, email: string): Promise<void> {
  const response = await fetch(`${UEN_API_BASE}/api/holder/widget-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ merchantId, email })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as any).error ?? "Login failed");
  }
}

// Storefront teaser: does this email have notes, and how many? No login, no
// token — just enough to recognize them and nudge them to register.
async function widgetRecognize(merchantId: string, email: string): Promise<{ recognized: boolean; count: number; exchangeHubId: string | null }> {
  const response = await fetch(`${UEN_API_BASE}/api/holder/widget-recognize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ merchantId, email })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as any).error ?? "Could not check this email");
  }
  return response.json() as Promise<{ recognized: boolean; count: number; exchangeHubId: string | null }>;
}

// Email + password sign-in. Returns a portal token directly (no email step).
async function widgetLoginPassword(merchantId: string, email: string, password: string): Promise<string> {
  const response = await fetch(`${UEN_API_BASE}/api/holder/login-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ merchantId, email, password })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as any).error ?? "Sign in failed");
  }
  const payload = (await response.json()) as { portalToken: string };
  return payload.portalToken;
}

function formatOffer(merchant: WalletMerchant): string {
  const offer = merchant.offer;
  if (!offer) return "";
  if (offer.discountType === "PERCENTAGE") return `${offer.discountValue}% off`;
  if (offer.discountType === "FIXED_AMOUNT") return `$${offer.discountValue} off`;
  return "Offer active";
}

function injectStyles() {
  if (document.getElementById("uen-widget-styles")) return;
  const style = document.createElement("style");
  style.id = "uen-widget-styles";
  // Brand palette. Primary surfaces = ink greens + emerald/mint; text = white or
  // mint; gold (--uen-gold) is an ACCENT only (FAB pulse + the discount figure).
  // --uen-accent = merchant's optional override (default mint).
  style.textContent = `
    @keyframes uen-pop-in { from { opacity: 0; transform: translateY(18px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes uen-dot-pulse { 0%,100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--uen-gold) 70%, transparent); } 50% { box-shadow: 0 0 0 6px transparent; } }
    @keyframes uen-sheen { 0% { background-position: -180% 0; } 60%,100% { background-position: 180% 0; } }
    @keyframes uen-spin { to { transform: rotate(360deg); } }
    @keyframes uen-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
    @keyframes uen-coin-shine { 0% { transform: translateX(-120%) skewX(-18deg); } 100% { transform: translateX(220%) skewX(-18deg); } }

    #uen-widget-fab {
      --uen-ink1: #0C1A14; --uen-ink2: #0E261D; --uen-emerald: #1F6F5B; --uen-mint: #74E2AC; --uen-gold: #fbbf24;
      align-items: center;
      background: linear-gradient(135deg, var(--uen-emerald) 0%, var(--uen-ink2) 55%, var(--uen-ink1) 100%);
      border: 1px solid color-mix(in srgb, var(--uen-mint) 42%, transparent);
      border-radius: 50px;
      box-shadow: 0 6px 26px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
      color: #fff;
      cursor: pointer;
      display: flex;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 700;
      gap: 9px;
      overflow: hidden;
      padding: 11px 20px;
      position: fixed;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
      z-index: 99998;
    }
    #uen-widget-fab::after {
      content: ""; position: absolute; top: 0; left: 0; width: 40%; height: 100%;
      background: linear-gradient(100deg, transparent, rgba(255,255,255,0.32), transparent);
      animation: uen-coin-shine 4.5s ease-in-out infinite; pointer-events: none;
    }
    #uen-widget-fab:hover { box-shadow: 0 10px 36px rgba(0,0,0,0.5), 0 0 22px color-mix(in srgb, var(--uen-mint) 38%, transparent); transform: translateY(-3px); }
    #uen-widget-fab .uen-fab-dot {
      background: radial-gradient(circle at 35% 30%, #ffe9a8, var(--uen-gold));
      border-radius: 50%; height: 10px; width: 10px; flex: none;
      animation: uen-dot-pulse 2.4s ease-in-out infinite;
    }

    #uen-widget-panel {
      --uen-ink1: #0C1A14; --uen-ink2: #0E261D; --uen-emerald: #1F6F5B; --uen-mint: #74E2AC; --uen-gold: #fbbf24;
      background:
        radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--uen-mint) 16%, transparent), transparent 60%),
        linear-gradient(165deg, rgba(14,38,29,0.74) 0%, rgba(12,26,20,0.84) 70%, rgba(8,19,13,0.9) 100%);
      backdrop-filter: blur(20px) saturate(1.3);
      -webkit-backdrop-filter: blur(20px) saturate(1.3);
      border: 1px solid color-mix(in srgb, var(--uen-mint) 26%, transparent);
      border-radius: 22px;
      box-shadow: 0 18px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07);
      color: #fff;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-sizing: border-box;
      max-width: 330px;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 22px;
      position: fixed;
      width: calc(100vw - 48px);
      z-index: 99999;
    }
    #uen-widget-panel::-webkit-scrollbar { width: 0; }
    #uen-widget-panel.open { display: block; animation: uen-pop-in 0.42s cubic-bezier(0.22,1,0.36,1) both; }
    #uen-widget-panel::before {
      content: ""; position: absolute; inset: 0; pointer-events: none; border-radius: 22px;
      background:
        radial-gradient(2px 2px at 18% 22%, rgba(255,255,255,0.45), transparent),
        radial-gradient(1.5px 1.5px at 78% 30%, color-mix(in srgb, var(--uen-mint) 80%, transparent), transparent),
        radial-gradient(1.5px 1.5px at 62% 12%, rgba(255,255,255,0.35), transparent);
      opacity: 0.7; animation: uen-float 5s ease-in-out infinite;
    }

    .uen-panel-header { align-items: center; display: flex; justify-content: space-between; margin-bottom: 14px; position: relative; }
    .uen-panel-title {
      background: linear-gradient(90deg, #fff, var(--uen-gold) 60%, #fff);
      background-size: 200% auto; -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent; color: var(--uen-gold);
      font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase;
      animation: uen-sheen 5s linear infinite;
    }
    .uen-header-actions { display: flex; gap: 6px; }
    .uen-icon-btn {
      background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); border-radius: 9px;
      color: #cfe6da; cursor: pointer; font-size: 15px; height: 30px; width: 30px; line-height: 1;
      display: flex; align-items: center; justify-content: center; padding: 0;
      transition: background 0.15s, transform 0.4s ease, color 0.15s;
    }
    .uen-icon-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }
    .uen-icon-btn.spinning { animation: uen-spin 0.7s ease; }

    .uen-greeting { color: #cfe6da; font-size: 13.5px; margin: 0 0 10px; text-align: center; position: relative; }
    .uen-greeting strong { color: #fff; font-weight: 700; }
    .uen-count-display { text-align: center; padding: 8px 0 16px; position: relative; }
    .uen-count-display::before {
      content: ""; position: absolute; top: -6px; left: 50%; width: 150px; height: 150px;
      transform: translateX(-50%); pointer-events: none; opacity: 0.55;
      background: conic-gradient(from 0deg, transparent, color-mix(in srgb, var(--uen-mint) 50%, transparent), transparent 40%);
      border-radius: 50%; filter: blur(14px); animation: uen-spin 9s linear infinite;
    }
    .uen-count-display strong {
      position: relative;
      color: #fff; -webkit-text-fill-color: #fff;
      display: block; font-size: 60px; font-weight: 800; letter-spacing: -0.02em; line-height: 1;
      filter: drop-shadow(0 2px 14px color-mix(in srgb, var(--uen-mint) 45%, transparent));
    }
    .uen-count-display .uen-label { color: var(--uen-mint); display: block; font-size: 13px; font-weight: 700; letter-spacing: 0.2em; margin-top: 4px; text-transform: uppercase; position: relative; }
    .uen-count-display .uen-value { color: #cfe6da; font-size: 13px; margin-top: 8px; position: relative; }
    .uen-count-display .uen-value strong { color: var(--uen-gold); }
    .uen-panel-offer {
      background: linear-gradient(135deg, color-mix(in srgb, var(--uen-mint) 14%, transparent), color-mix(in srgb, var(--uen-emerald) 18%, transparent));
      border: 1px solid color-mix(in srgb, var(--uen-mint) 26%, transparent);
      border-radius: 12px; font-size: 13px; margin-bottom: 16px; padding: 11px 14px; text-align: center; color: #eafff5; position: relative;
    }
    .uen-panel-offer strong { color: var(--uen-gold); }
    .uen-offer-rule { color: #9ec0b2; display: block; font-size: 11px; margin-top: 5px; }
    .uen-panel-actions { display: flex; flex-direction: column; gap: 9px; position: relative; }
    .uen-btn { border: none; border-radius: 12px; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 700; padding: 13px; transition: transform 0.15s, box-shadow 0.2s, opacity 0.15s; width: 100%; position: relative; overflow: hidden; }
    .uen-btn-primary { background: linear-gradient(135deg, #ffe08a, var(--uen-gold) 55%, #e0930f); color: #2a1a02; box-shadow: 0 6px 18px color-mix(in srgb, var(--uen-gold) 30%, transparent); }
    .uen-btn-primary::after { content: ""; position: absolute; top: 0; left: 0; width: 40%; height: 100%; background: linear-gradient(100deg, transparent, rgba(255,255,255,0.55), transparent); animation: uen-coin-shine 3.8s ease-in-out infinite; }
    .uen-btn-secondary { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); color: #fff; }
    .uen-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 26px color-mix(in srgb, var(--uen-gold) 32%, transparent); }
    .uen-btn:disabled { cursor: default; opacity: 0.4; }
    .uen-code-result { background: rgba(255,255,255,0.05); border: 1px solid color-mix(in srgb, var(--uen-mint) 28%, transparent); border-radius: 12px; margin-top: 12px; padding: 14px; animation: uen-pop-in 0.3s ease both; }
    .uen-code-result p { color: #9ec0b2; font-size: 11px; margin: 0 0 6px; }
    .uen-code-value { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
    .uen-code-value code { color: var(--uen-mint); font-family: 'SF Mono', ui-monospace, monospace; font-size: 16px; font-weight: 700; letter-spacing: 0.04em; word-break: break-all; }
    .uen-copy-btn { background: color-mix(in srgb, var(--uen-mint) 18%, transparent); border: none; border-radius: 8px; color: var(--uen-mint); cursor: pointer; font-size: 12px; font-weight: 700; padding: 6px 12px; white-space: nowrap; transition: background 0.15s; }
    .uen-copy-btn:hover { background: color-mix(in srgb, var(--uen-mint) 28%, transparent); }
    .uen-dash-link { align-items: center; color: #cfe6da; display: flex; font-size: 12.5px; font-weight: 600; gap: 6px; justify-content: center; margin-top: 14px; padding-top: 13px; border-top: 1px solid rgba(255,255,255,0.08); text-decoration: none; transition: color 0.15s; position: relative; }
    .uen-dash-link:hover { color: var(--uen-mint); }
    .uen-dash-link .uen-arrow { transition: transform 0.2s; }
    .uen-dash-link:hover .uen-arrow { transform: translateX(3px); }
    .uen-signout { background: none; border: none; color: #7c9a8c; cursor: pointer; display: block; font-size: 11px; margin: 8px auto 0; padding: 2px; position: relative; text-decoration: underline; }
    .uen-signout:hover { color: #cfe6da; }
    .uen-teaser-count { text-align: center; padding: 10px 0 14px; }
    .uen-teaser-num { display: inline-block; font-size: 46px; font-weight: 800; color: #fff; filter: blur(11px); user-select: none; pointer-events: none; line-height: 1; }
    .uen-teaser-count .uen-label { color: var(--uen-mint); display: block; font-size: 12px; font-weight: 700; letter-spacing: 0.18em; margin-top: 8px; text-transform: uppercase; }
    .uen-teaser-sub { display: block; color: #9fc3b5; font-size: 11.5px; margin-top: 3px; font-style: italic; }
    .uen-msg { border-radius: 10px; font-size: 12px; margin-top: 10px; padding: 10px 12px; position: relative; }
    .uen-msg-error { background: rgba(255,80,80,0.14); color: #ffb3b3; }
    .uen-msg-info { background: rgba(255,255,255,0.05); color: #9ec0b2; }
    .uen-login-form { display: flex; flex-direction: column; gap: 9px; position: relative; }
    .uen-login-form p { color: #b9d4c8; font-size: 13px; line-height: 1.45; margin: 0 0 4px; text-align: center; }
    .uen-login-input { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.18); border-radius: 11px; box-sizing: border-box; color: #fff; font-family: inherit; font-size: 14px; padding: 13px; width: 100%; transition: border-color 0.15s, box-shadow 0.15s; }
    .uen-login-input:focus { border-color: var(--uen-mint); box-shadow: 0 0 0 3px color-mix(in srgb, var(--uen-mint) 20%, transparent); outline: none; }
    @keyframes uen-count-glow {
      0%, 100% { filter: drop-shadow(0 2px 10px color-mix(in srgb, var(--uen-mint) 35%, transparent)); }
      50% { filter: drop-shadow(0 2px 22px color-mix(in srgb, var(--uen-mint) 70%, transparent)); }
    }
    .uen-count-display strong { animation: uen-count-glow 3s ease-in-out infinite; }
    /* Reduced motion: only suppress translation-heavy movement; glows, sheens
       and pulses are gentle and stay on (they ARE the brand). */
    @media (prefers-reduced-motion: reduce) {
      #uen-widget-panel.open, #uen-widget-panel::before { animation: none !important; }
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildWidget(merchantId: string) {
  let token = getToken();
  const config = getConfig();
  const verticalEdge = config.position.startsWith("top") ? "top" : "bottom";
  const horizontalEdge = config.position.endsWith("left") ? "left" : "right";

  injectStyles();

  // FAB button
  const fab = document.createElement("button");
  fab.id = "uen-widget-fab";
  fab.innerHTML = `<span class="uen-fab-dot"></span> ${escapeHtml(config.label)}`;
  fab.style[verticalEdge] = `${config.offsetBottom}px`;
  fab.style[horizontalEdge] = `${config.offsetSide}px`;
  fab.style.setProperty("--uen-accent", config.accent);
  document.body.appendChild(fab);

  // Panel — opens off the same corner, clear of the FAB
  const panel = document.createElement("div");
  panel.id = "uen-widget-panel";
  panel.style[verticalEdge] = `${config.offsetBottom + 56}px`;
  panel.style[horizontalEdge] = `${config.offsetSide}px`;
  panel.style.setProperty("--uen-accent", config.accent);
  document.body.appendChild(panel);

  // Keep the panel within the viewport: it's anchored a fixed distance from one
  // edge, so the room it has is whatever's left to the opposite edge.
  const fitPanel = () => {
    const reserved = config.offsetBottom + 56 + 14;
    panel.style.maxHeight = `${Math.max(220, window.innerHeight - reserved)}px`;
  };
  fitPanel();
  window.addEventListener("resize", fitPanel);

  let panelOpen = false;
  let merchantInfo: WalletMerchant | null = null;
  let generatedCode: string | null = null;
  let holderName: string | null = null;

  function renderPanel(state: "loading" | "login" | "teaser" | "link-sent" | "no-uens" | "ready" | "code-shown" | "error", opts: { error?: string; code?: string; notice?: string; recognized?: boolean; count?: number; hubId?: string | null; email?: string } = {}) {
    const offerText = merchantInfo ? formatOffer(merchantInfo) : "";
    const available = merchantInfo?.availableUens ?? 0;

    const loggedIn = state === "ready" || state === "code-shown" || state === "no-uens";
    const dashboardUrl = `${UEN_API_BASE}/holder/portal?token=${encodeURIComponent(token)}`;

    panel.innerHTML = `
      <div class="uen-panel-header">
        <span class="uen-panel-title">UEN Wallet</span>
        <div class="uen-header-actions">
          ${loggedIn ? `<button class="uen-icon-btn" id="uen-refresh-btn" title="Refresh" aria-label="Refresh">&#x21bb;</button>` : ""}
          <button class="uen-icon-btn" id="uen-close-btn" title="Close" aria-label="Close">&times;</button>
        </div>
      </div>
      ${state === "loading" ? `<p class="uen-msg uen-msg-info">Loading your UEN wallet...</p>` : ""}
      ${state === "login" ? `
        <div class="uen-login-form">
          ${opts.notice ? `<p class="uen-msg uen-msg-info" style="margin:0 0 6px">${opts.notice}</p>` : ""}
          <p>Enter your email to check for Universal Exchange Notes (originally Love Notes) tied to it.</p>
          <input class="uen-login-input" id="uen-login-email" type="email" placeholder="you@example.com" autocomplete="email" />
          <button class="uen-btn uen-btn-primary" id="uen-login-btn">Check My Notes</button>
          ${opts.error ? `<p class="uen-msg uen-msg-error">${opts.error}</p>` : ""}
        </div>
      ` : ""}
      ${state === "teaser" ? `
        <div class="uen-login-form">
          ${opts.recognized ? `
            <p style="text-align:center;margin:0 0 2px;color:#fff;font-weight:700;font-size:15px;">We recognize you! 🎉</p>
            <p>You have notes waiting on this email.</p>
            <div class="uen-teaser-count">
              <span class="uen-teaser-num">${opts.count ?? 0}</span>
              <span class="uen-label">Universal Exchange Notes</span>
              <span class="uen-teaser-sub">originally known as Love Notes</span>
            </div>
            <p style="text-align:center;">Register to verify your email and see them in your dashboard.</p>
            <button class="uen-btn uen-btn-primary" id="uen-register-btn">Register to unlock</button>
          ` : `
            <p style="text-align:center;color:#fff;font-weight:600;">No wallet found for this email yet.</p>
            <p>Register to create your UEN wallet and start collecting Universal Exchange Notes (originally Love Notes).</p>
            <button class="uen-btn uen-btn-primary" id="uen-register-btn">Register now</button>
          `}
          <button class="uen-btn uen-btn-secondary" id="uen-teaser-back-btn">Use a different email</button>
        </div>
      ` : ""}
      ${state === "no-uens" ? `<p class="uen-msg uen-msg-info">You have no available notes for this merchant right now. Tap refresh after a new contribution, or open your full dashboard below.</p>` : ""}
      ${state === "error" ? `<p class="uen-msg uen-msg-error">${opts.error ?? "Something went wrong."}</p>` : ""}
      ${state === "ready" || state === "code-shown" ? `
        ${holderName ? `<p class="uen-greeting">Welcome, <strong>${escapeHtml(holderName)}</strong></p>` : ""}
        <div class="uen-count-display">
          <strong>${available}</strong>
          <span class="uen-label">UEN${available === 1 ? "" : "s"} available</span>
          ${offerText ? `<p class="uen-value">Each worth <strong>${offerText}</strong> here</p>` : ""}
        </div>
        ${offerText ? `
          <div class="uen-panel-offer">
            Use 1 UEN → <strong>${offerText}</strong> at checkout
            ${merchantInfo?.offer?.minimumOrderAmount ? `<span class="uen-offer-rule">Requires a minimum order of $${Number(merchantInfo.offer.minimumOrderAmount).toFixed(2)}</span>` : ""}
            <span class="uen-offer-rule">Each note can be used once at this store</span>
          </div>
        ` : ""}
        <div class="uen-panel-actions">
          <button class="uen-btn uen-btn-primary" id="uen-auto-btn" ${available === 0 ? "disabled" : ""}>Apply Discount Automatically</button>
          <button class="uen-btn uen-btn-secondary" id="uen-manual-btn" ${available === 0 ? "disabled" : ""}>Generate Code to Paste</button>
        </div>
        ${state === "code-shown" && opts.code ? `
          <div class="uen-code-result">
            <p>Your discount code (paste at checkout):</p>
            <div class="uen-code-value">
              <code>${opts.code}</code>
              <button class="uen-copy-btn" id="uen-copy-btn">Copy</button>
            </div>
          </div>
        ` : ""}
      ` : ""}
      ${loggedIn ? `
        <a class="uen-dash-link" id="uen-dash-link" href="${dashboardUrl}" target="_blank" rel="noopener">View my full dashboard <span class="uen-arrow">&rarr;</span></a>
        <button class="uen-signout" id="uen-signout-btn">Sign out</button>
      ` : ""}
    `;

    panel.scrollTop = 0; // always show the count/greeting first, esp. on mobile

    // Count-up: the UEN number rolls from 0 to its value when the wallet opens.
    if (state === "ready" && available > 0) {
      const counter = panel.querySelector(".uen-count-display strong");
      if (counter) {
        const started = performance.now();
        const duration = 650;
        const tick = (now: number) => {
          const t = Math.min(1, (now - started) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          counter.textContent = String(Math.round(eased * available));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }

    document.getElementById("uen-close-btn")?.addEventListener("click", closePanel);

    document.getElementById("uen-refresh-btn")?.addEventListener("click", (e) => {
      (e.currentTarget as HTMLElement).classList.add("spinning");
      generatedCode = null;
      void openPanel();
    });

    document.getElementById("uen-signout-btn")?.addEventListener("click", () => {
      setToken("");
      try { localStorage.removeItem("uen_portal_token"); } catch { /* storage may be blocked */ }
      token = "";
      merchantInfo = null;
      generatedCode = null;
      renderPanel("login", { notice: "You've been signed out of this store." });
    });

    const emailVal = () => (document.getElementById("uen-login-email") as HTMLInputElement | null)?.value.trim() ?? "";
    let lastEmail = "";
    let lastHubId: string | null = null;

    // Check the email and show the recognition teaser. Never logs in or reveals
    // the dashboard — registration (with email verification) is required for that.
    const checkNotes = async () => {
      const email = emailVal();
      if (!email) return;
      lastEmail = email;
      const btn = document.getElementById("uen-login-btn") as HTMLButtonElement | null;
      if (btn) { btn.disabled = true; btn.textContent = "Checking..."; }
      try {
        const result = await widgetRecognize(merchantId, email);
        lastHubId = result.exchangeHubId;
        renderPanel("teaser", { recognized: result.recognized, count: result.count, hubId: result.exchangeHubId, email });
      } catch (err) {
        renderPanel("login", { error: err instanceof Error ? err.message : "Could not check this email." });
      }
    };

    // Register / sign in — opens the standard registration page, pre-filled.
    const goRegister = () => {
      const params = new URLSearchParams();
      if (lastHubId) params.set("hub", lastHubId);
      if (lastEmail) params.set("email", lastEmail);
      window.open(`${UEN_API_BASE}/holder/register?${params.toString()}`, "_blank", "noopener");
    };

    document.getElementById("uen-login-btn")?.addEventListener("click", checkNotes);
    document.getElementById("uen-login-email")?.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") checkNotes();
    });
    document.getElementById("uen-register-btn")?.addEventListener("click", goRegister);
    document.getElementById("uen-teaser-back-btn")?.addEventListener("click", () => renderPanel("login"));

    document.getElementById("uen-auto-btn")?.addEventListener("click", async () => {
      const btn = document.getElementById("uen-auto-btn") as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = "Applying...";
      try {
        const result = await redeem(token, merchantId, "AUTO");
        if (result.code) {
          // Apply on the CURRENT storefront origin. The server's URL uses the
          // myshopify.com domain; on stores with a custom primary domain the
          // cross-domain redirect can drop the discount cookie. The widget is
          // already running on the storefront, so its own origin is always right.
          window.location.href = `${window.location.origin}/discount/${encodeURIComponent(result.code)}?redirect=/`;
        } else if (result.autoApplyUrl) {
          window.location.href = result.autoApplyUrl;
        }
      } catch (err) {
        renderPanel("error", { error: err instanceof Error ? err.message : "Could not apply discount." });
      }
    });

    document.getElementById("uen-manual-btn")?.addEventListener("click", async () => {
      const btn = document.getElementById("uen-manual-btn") as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = "Generating...";
      try {
        const result = await redeem(token, merchantId, "MANUAL");
        generatedCode = result.code;
        if (merchantInfo) merchantInfo.availableUens = Math.max(0, (merchantInfo.availableUens ?? 1) - 1);
        renderPanel("code-shown", { code: result.code });
      } catch (err) {
        renderPanel("error", { error: err instanceof Error ? err.message : "Could not generate code." });
      }
    });

    document.getElementById("uen-copy-btn")?.addEventListener("click", () => {
      if (generatedCode) {
        navigator.clipboard.writeText(generatedCode).catch(() => {});
        const btn = document.getElementById("uen-copy-btn");
        if (btn) { btn.textContent = "Copied!"; setTimeout(() => { if (btn) btn.textContent = "Copy"; }, 2000); }
      }
    });
  }

  async function openPanel() {
    panelOpen = true;
    panel.classList.add("open");

    token = getToken();
    if (!token) {
      renderPanel("login");
      return;
    }

    renderPanel("loading");
    const [info, name] = await Promise.all([fetchMerchantInfo(token, merchantId), fetchHolderName(token)]);
    merchantInfo = info;
    holderName = name;

    if (!merchantInfo) {
      // Token is stale or this merchant isn't visible to it — clear and re-login.
      setToken("");
      token = "";
      holderName = null;
      renderPanel("login", { error: "Your session expired. Enter your email to sign back in." });
      return;
    }

    if (merchantInfo.availableUens === 0) {
      renderPanel("no-uens");
      return;
    }

    renderPanel("ready");
  }

  function closePanel() {
    panelOpen = false;
    panel.classList.remove("open");
  }

  fab.addEventListener("click", () => {
    if (panelOpen) closePanel();
    else openPanel();
  });

  document.addEventListener("click", (e) => {
    // composedPath is captured at dispatch time, so this stays correct even
    // when a button's own handler re-renders the panel (detaching the target
    // from the DOM) before the event bubbles up here. panel.contains() would
    // see the detached node as "outside" and wrongly close the panel.
    const path = e.composedPath();
    if (panelOpen && !path.includes(panel) && !path.includes(fab)) {
      closePanel();
    }
  });
}

async function init() {
  const merchantId = await resolveMerchantId();
  if (!merchantId) return; // Store not connected to the UEN network — render nothing
  buildWidget(merchantId);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}

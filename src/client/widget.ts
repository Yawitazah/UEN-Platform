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
  offer: { discountType: string; discountValue: number | null } | null;
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

async function widgetLogin(merchantId: string, email: string): Promise<string> {
  const response = await fetch(`${UEN_API_BASE}/api/holder/widget-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ merchantId, email })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as any).error ?? "Login failed");
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
  // Accent color flows through --uen-accent (set inline on the fab/panel from
  // the embed settings); placement edges are set inline too, so the stylesheet
  // carries no corner assumptions.
  style.textContent = `
    #uen-widget-fab {
      align-items: center;
      background: linear-gradient(135deg, #1a4a36, #0f2d20);
      border: 1px solid color-mix(in srgb, var(--uen-accent, #75e3ad) 35%, transparent);
      border-radius: 50px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.35);
      color: #fff;
      cursor: pointer;
      display: flex;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 600;
      gap: 8px;
      padding: 10px 18px;
      position: fixed;
      transition: transform 0.15s, box-shadow 0.15s;
      z-index: 99998;
    }
    #uen-widget-fab:hover { box-shadow: 0 6px 32px rgba(0,0,0,0.45); transform: translateY(-2px); }
    #uen-widget-fab .uen-fab-dot { background: var(--uen-accent, #75e3ad); border-radius: 50%; height: 8px; width: 8px; }
    #uen-widget-panel {
      background: #0f1f18;
      border: 1px solid color-mix(in srgb, var(--uen-accent, #75e3ad) 25%, transparent);
      border-radius: 20px;
      box-shadow: 0 8px 48px rgba(0,0,0,0.55);
      color: #fff;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 320px;
      padding: 24px;
      position: fixed;
      width: calc(100vw - 48px);
      z-index: 99999;
    }
    #uen-widget-panel.open { display: block; }
    .uen-panel-header { align-items: center; display: flex; justify-content: space-between; margin-bottom: 16px; }
    .uen-panel-title { color: var(--uen-accent, #75e3ad); font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .uen-panel-close { background: none; border: none; color: #7fa898; cursor: pointer; font-size: 18px; line-height: 1; padding: 0; }
    .uen-count-display { text-align: center; padding: 12px 0 16px; }
    .uen-count-display strong { color: #fff; display: block; font-size: 56px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
    .uen-count-display .uen-label { color: var(--uen-accent, #75e3ad); display: block; font-size: 14px; font-weight: 700; letter-spacing: 0.18em; margin-top: 2px; text-transform: uppercase; }
    .uen-count-display .uen-value { color: #7fa898; font-size: 13px; margin-top: 6px; }
    .uen-panel-offer { background: color-mix(in srgb, var(--uen-accent, #75e3ad) 8%, transparent); border-radius: 10px; font-size: 13px; margin-bottom: 16px; padding: 10px 14px; text-align: center; }
    .uen-panel-offer strong { color: var(--uen-accent, #75e3ad); }
    .uen-panel-actions { display: flex; flex-direction: column; gap: 8px; }
    .uen-btn { border: none; border-radius: 10px; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 600; padding: 12px; transition: opacity 0.15s; width: 100%; }
    .uen-btn-primary { background: var(--uen-accent, #75e3ad); color: #0a1f16; }
    .uen-btn-secondary { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #fff; }
    .uen-btn:hover { opacity: 0.88; }
    .uen-btn:disabled { cursor: default; opacity: 0.45; }
    .uen-code-result { background: color-mix(in srgb, var(--uen-accent, #75e3ad) 8%, transparent); border-radius: 10px; margin-top: 12px; padding: 14px; }
    .uen-code-result p { color: #7fa898; font-size: 11px; margin: 0 0 6px; }
    .uen-code-value { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
    .uen-code-value code { color: var(--uen-accent, #75e3ad); font-family: monospace; font-size: 14px; font-weight: 700; word-break: break-all; }
    .uen-copy-btn { background: color-mix(in srgb, var(--uen-accent, #75e3ad) 15%, transparent); border: none; border-radius: 6px; color: var(--uen-accent, #75e3ad); cursor: pointer; font-size: 12px; padding: 4px 10px; white-space: nowrap; }
    .uen-msg { border-radius: 8px; font-size: 12px; margin-top: 10px; padding: 10px 12px; }
    .uen-msg-error { background: rgba(255,80,80,0.12); color: #ff9999; }
    .uen-msg-info { background: color-mix(in srgb, var(--uen-accent, #75e3ad) 8%, transparent); color: #7fa898; }
    .uen-login-prompt { color: #7fa898; font-size: 13px; text-align: center; padding: 8px 0; }
    .uen-login-prompt a { color: var(--uen-accent, #75e3ad); }
    .uen-login-form { display: flex; flex-direction: column; gap: 8px; }
    .uen-login-form p { color: #7fa898; font-size: 13px; line-height: 1.4; margin: 0 0 4px; text-align: center; }
    .uen-login-input { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16); border-radius: 10px; box-sizing: border-box; color: #fff; font-family: inherit; font-size: 14px; padding: 12px; width: 100%; }
    .uen-login-input:focus { border-color: var(--uen-accent, #75e3ad); outline: none; }
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

  let panelOpen = false;
  let merchantInfo: WalletMerchant | null = null;
  let generatedCode: string | null = null;

  function renderPanel(state: "loading" | "login" | "no-uens" | "ready" | "code-shown" | "error", opts: { error?: string; code?: string } = {}) {
    const offerText = merchantInfo ? formatOffer(merchantInfo) : "";
    const available = merchantInfo?.availableUens ?? 0;

    panel.innerHTML = `
      <div class="uen-panel-header">
        <span class="uen-panel-title">UEN Wallet</span>
        <button class="uen-panel-close" id="uen-close-btn">&times;</button>
      </div>
      ${state === "loading" ? `<p class="uen-msg uen-msg-info">Loading your UEN wallet...</p>` : ""}
      ${state === "login" ? `
        <div class="uen-login-form">
          <p>Enter the email you used for your UEN account or original Love Note purchase.</p>
          <input class="uen-login-input" id="uen-login-email" type="email" placeholder="you@example.com" autocomplete="email" />
          <button class="uen-btn uen-btn-primary" id="uen-login-btn">Access My Notes</button>
          ${opts.error ? `<p class="uen-msg uen-msg-error">${opts.error}</p>` : ""}
        </div>
      ` : ""}
      ${state === "no-uens" ? `<p class="uen-msg uen-msg-info">You have no available UENs for this merchant.</p>` : ""}
      ${state === "error" ? `<p class="uen-msg uen-msg-error">${opts.error ?? "Something went wrong."}</p>` : ""}
      ${state === "ready" || state === "code-shown" ? `
        <div class="uen-count-display">
          <strong>${available}</strong>
          <span class="uen-label">UEN</span>
          ${offerText ? `<p class="uen-value">Each worth <strong style="color:var(--uen-accent, #75e3ad)">${offerText}</strong> here</p>` : ""}
        </div>
        ${offerText ? `<div class="uen-panel-offer">Use 1 UEN → <strong>${offerText}</strong> at checkout</div>` : ""}
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
    `;

    document.getElementById("uen-close-btn")?.addEventListener("click", closePanel);

    const loginSubmit = async () => {
      const input = document.getElementById("uen-login-email") as HTMLInputElement | null;
      const email = input?.value.trim() ?? "";
      if (!email) return;
      const btn = document.getElementById("uen-login-btn") as HTMLButtonElement | null;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Checking...";
      }
      try {
        token = await widgetLogin(merchantId, email);
        setToken(token);
        await openPanel();
      } catch (err) {
        renderPanel("login", { error: err instanceof Error ? err.message : "Login failed." });
      }
    };
    document.getElementById("uen-login-btn")?.addEventListener("click", loginSubmit);
    document.getElementById("uen-login-email")?.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") loginSubmit();
    });

    document.getElementById("uen-auto-btn")?.addEventListener("click", async () => {
      const btn = document.getElementById("uen-auto-btn") as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = "Applying...";
      try {
        const result = await redeem(token, merchantId, "AUTO");
        if (result.autoApplyUrl) {
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
    merchantInfo = await fetchMerchantInfo(token, merchantId);

    if (!merchantInfo) {
      // Token is stale or this merchant isn't visible to it — clear and re-login.
      setToken("");
      token = "";
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
    if (panelOpen && !panel.contains(e.target as Node) && e.target !== fab) {
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

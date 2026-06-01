/**
 * UEN Merchant Widget
 * Embed on any Shopify store: <script src="https://your-uen-domain/widget.js" data-shop="store.myshopify.com"></script>
 * The widget detects logged-in UEN holders via localStorage and lets them redeem at checkout.
 */

const UEN_API_BASE = (window as any).__UEN_API_BASE__ || "";
const UEN_TOKEN_KEY = "uen_portal_token";

function getToken(): string {
  return localStorage.getItem(UEN_TOKEN_KEY) ?? "";
}

function getShopDomain(): string {
  const el = document.querySelector<HTMLScriptElement>('script[data-shop]');
  if (el?.dataset.shop) return el.dataset.shop;
  return window.location.hostname;
}

function getMerchantId(): string {
  const el = document.querySelector<HTMLScriptElement>('script[data-merchant-id]');
  return el?.dataset.merchantId ?? "";
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
  style.textContent = `
    #uen-widget-fab {
      align-items: center;
      background: linear-gradient(135deg, #1a4a36, #0f2d20);
      border: 1px solid rgba(117,227,173,0.35);
      border-radius: 50px;
      bottom: 24px;
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
      right: 24px;
      transition: transform 0.15s, box-shadow 0.15s;
      z-index: 99998;
    }
    #uen-widget-fab:hover { box-shadow: 0 6px 32px rgba(0,0,0,0.45); transform: translateY(-2px); }
    #uen-widget-fab .uen-fab-dot { background: #75e3ad; border-radius: 50%; height: 8px; width: 8px; }
    #uen-widget-panel {
      background: #0f1f18;
      border: 1px solid rgba(117,227,173,0.25);
      border-radius: 20px;
      bottom: 80px;
      box-shadow: 0 8px 48px rgba(0,0,0,0.55);
      color: #fff;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 320px;
      padding: 24px;
      position: fixed;
      right: 24px;
      width: calc(100vw - 48px);
      z-index: 99999;
    }
    #uen-widget-panel.open { display: block; }
    .uen-panel-header { align-items: center; display: flex; justify-content: space-between; margin-bottom: 16px; }
    .uen-panel-title { color: #75e3ad; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .uen-panel-close { background: none; border: none; color: #7fa898; cursor: pointer; font-size: 18px; line-height: 1; padding: 0; }
    .uen-count-display { text-align: center; padding: 12px 0 16px; }
    .uen-count-display strong { color: #fff; display: block; font-size: 56px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
    .uen-count-display .uen-label { color: #75e3ad; display: block; font-size: 14px; font-weight: 700; letter-spacing: 0.18em; margin-top: 2px; text-transform: uppercase; }
    .uen-count-display .uen-value { color: #7fa898; font-size: 13px; margin-top: 6px; }
    .uen-panel-offer { background: rgba(117,227,173,0.08); border-radius: 10px; font-size: 13px; margin-bottom: 16px; padding: 10px 14px; text-align: center; }
    .uen-panel-offer strong { color: #75e3ad; }
    .uen-panel-actions { display: flex; flex-direction: column; gap: 8px; }
    .uen-btn { border: none; border-radius: 10px; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 600; padding: 12px; transition: opacity 0.15s; width: 100%; }
    .uen-btn-primary { background: #75e3ad; color: #0a1f16; }
    .uen-btn-secondary { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #fff; }
    .uen-btn:hover { opacity: 0.88; }
    .uen-btn:disabled { cursor: default; opacity: 0.45; }
    .uen-code-result { background: rgba(117,227,173,0.08); border-radius: 10px; margin-top: 12px; padding: 14px; }
    .uen-code-result p { color: #7fa898; font-size: 11px; margin: 0 0 6px; }
    .uen-code-value { align-items: center; display: flex; gap: 8px; justify-content: space-between; }
    .uen-code-value code { color: #75e3ad; font-family: monospace; font-size: 14px; font-weight: 700; word-break: break-all; }
    .uen-copy-btn { background: rgba(117,227,173,0.15); border: none; border-radius: 6px; color: #75e3ad; cursor: pointer; font-size: 12px; padding: 4px 10px; white-space: nowrap; }
    .uen-msg { border-radius: 8px; font-size: 12px; margin-top: 10px; padding: 10px 12px; }
    .uen-msg-error { background: rgba(255,80,80,0.12); color: #ff9999; }
    .uen-msg-info { background: rgba(117,227,173,0.08); color: #7fa898; }
    .uen-login-prompt { color: #7fa898; font-size: 13px; text-align: center; padding: 8px 0; }
    .uen-login-prompt a { color: #75e3ad; }
  `;
  document.head.appendChild(style);
}

function buildWidget() {
  const token = getToken();
  const merchantId = getMerchantId();
  if (!merchantId) return; // Widget requires data-merchant-id attribute

  injectStyles();

  // FAB button
  const fab = document.createElement("button");
  fab.id = "uen-widget-fab";
  fab.innerHTML = `<span class="uen-fab-dot"></span> UEN Discount`;
  document.body.appendChild(fab);

  // Panel
  const panel = document.createElement("div");
  panel.id = "uen-widget-panel";
  document.body.appendChild(panel);

  let panelOpen = false;
  let merchantInfo: WalletMerchant | null = null;
  let generatedCode: string | null = null;

  function renderPanel(state: "loading" | "no-token" | "no-uens" | "ready" | "code-shown" | "error", opts: { error?: string; code?: string } = {}) {
    const offerText = merchantInfo ? formatOffer(merchantInfo) : "";
    const available = merchantInfo?.availableUens ?? 0;

    panel.innerHTML = `
      <div class="uen-panel-header">
        <span class="uen-panel-title">UEN Wallet</span>
        <button class="uen-panel-close" id="uen-close-btn">&times;</button>
      </div>
      ${state === "loading" ? `<p class="uen-msg uen-msg-info">Loading your UEN wallet...</p>` : ""}
      ${state === "no-token" ? `<p class="uen-login-prompt">Sign in to your <a href="/holder/portal" target="_blank">UEN portal</a> to use your notes here.</p>` : ""}
      ${state === "no-uens" ? `<p class="uen-msg uen-msg-info">You have no available UENs for this merchant.</p>` : ""}
      ${state === "error" ? `<p class="uen-msg uen-msg-error">${opts.error ?? "Something went wrong."}</p>` : ""}
      ${state === "ready" || state === "code-shown" ? `
        <div class="uen-count-display">
          <strong>${available}</strong>
          <span class="uen-label">UEN</span>
          ${offerText ? `<p class="uen-value">Each worth <strong style="color:#75e3ad">${offerText}</strong> here</p>` : ""}
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

    if (!token) {
      renderPanel("no-token");
      return;
    }

    renderPanel("loading");
    merchantInfo = await fetchMerchantInfo(token, merchantId);

    if (!merchantInfo) {
      renderPanel("error", { error: "Could not load merchant info. Make sure you are logged into your UEN portal." });
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", buildWidget);
} else {
  buildWidget();
}

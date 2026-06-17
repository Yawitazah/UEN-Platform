import React, { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { NavLink, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { BarChart3, Bell, CheckCircle, Copy, DollarSign, Download, Eye, EyeOff, ExternalLink, Globe, Heart, Link2, Mail, Menu, MessageCircle, Music, Pause, Pencil, Play, Repeat, Repeat1, RefreshCw, Search, Send, Shield, Shuffle, SkipBack, SkipForward, SlidersHorizontal, ShoppingBag, Star, Tag, Ticket, Trash2, TrendingUp, UploadCloud, Users, Volume1, Volume2, VolumeX, Wallet, X, Zap } from "lucide-react";
import creatorLiveSupport from "./assets/creator-live-support.png";
import "./styles.css";

const adminToken = () => localStorage.getItem("uen_admin_token") ?? "dev-admin-token";
const shopDomain = () => {
  const params = new URLSearchParams(window.location.search);
  // No silent fallback to a real store: a missing shop must surface as a
  // server-side "shopDomain is required" error, never as another shop's data.
  return params.get("shopDomain") ?? params.get("shop") ?? localStorage.getItem("uen_shop_domain") ?? "";
};
let authRefresh: (() => void) | null = null;

// Inside the Shopify admin iframe, third-party cookies are unreliable (and
// increasingly blocked outright), so every same-origin API call also carries
// an App Bridge session token. Wrapping fetch covers every call site at once;
// outside the embedded context window.shopify is absent and this is a no-op.
const rawFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const isApiCall = url.startsWith("/api/") || url.startsWith("/shopify/api");
    const bridge = (window as unknown as { shopify?: { idToken?: () => Promise<string> } }).shopify;
    if (isApiCall && bridge?.idToken) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has("authorization")) {
        const token = await bridge.idToken();
        if (token) headers.set("authorization", `Bearer ${token}`);
        return rawFetch(input, { ...init, headers });
      }
    }
  } catch {
    // fall through to a plain fetch
  }
  return rawFetch(input, init);
}) as typeof window.fetch;

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(localStorage.getItem("uen_admin_token") ? { authorization: `Bearer ${adminToken()}` } : {}),
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw new Error((await response.json()).error ?? response.statusText);
  return response.json();
}

async function shopifyApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`/shopify/api${path}${separator}shopDomain=${encodeURIComponent(shopDomain())}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
  if (!response.ok) throw new Error((await response.json()).error ?? response.statusText);
  return response.json();
}

const portalToken = () => new URLSearchParams(window.location.search).get("token") ?? "";

async function portalApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const response = await fetch(`${path}${sep}token=${encodeURIComponent(portalToken())}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
  if (!response.ok) throw new Error((await response.json()).error ?? response.statusText);
  return response.json();
}

type HomeSiteContent = {
  pageBackground: string;
  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  primaryCtaText: string;
  primaryCtaHref: string;
  secondaryCtaText: string;
  secondaryCtaHref: string;
  heroPreset: string;
  heroBgImage: string;
  heroVideoUrl: string;
  heroTextColor: string;
  heroAccentColor: string;
  heroTitleSize: number;
  faviconUrl: string;
  mediaLibrary: string[];
  textColors: Record<string, string>;
  textLinks: Record<string, string>;
  orbitCoreTitle: string;
  orbitCoreSubtitle: string;
  orbitHubLabel: string;
  orbitHolderLabel: string;
  orbitMerchantLabel: string;
  audienceEyebrow: string;
  audienceTitle: string;
  audienceBody: string;
  merchantPathKicker: string;
  merchantPathTitle: string;
  merchantPathBody: string;
  merchantPathCta: string;
  hubPathKicker: string;
  hubPathTitle: string;
  hubPathBody: string;
  hubPathCta: string;
  holderPathKicker: string;
  holderPathTitle: string;
  holderPathBody: string;
  holderPathCta: string;
  flowEyebrow: string;
  flowTitle: string;
  flowBody: string;
  flow1Title: string;
  flow1Body: string;
  flow1Image: string;
  flow1Badge: string;
  flow1Value: string;
  flow2Title: string;
  flow2Body: string;
  flow2Image: string;
  flow2Badge: string;
  flow2Value: string;
  flow3Title: string;
  flow3Body: string;
  flow3Image: string;
  flow3Badge: string;
  flow3Value: string;
  flow4Title: string;
  flow4Body: string;
  flow4Image: string;
  flow4Badge: string;
  flow4Value: string;
  creatorEyebrow: string;
  creatorTitle: string;
  creatorBody: string;
  creatorCard1Title: string;
  creatorCard1Body: string;
  creatorCard2Title: string;
  creatorCard2Body: string;
  creatorCard3Title: string;
  creatorCard3Body: string;
  creatorCard4Title: string;
  creatorCard4Body: string;
  storyImage: string;
  storyEyebrow: string;
  storyTitle: string;
  storyBody: string;
  storyStep1: string;
  storyStep2: string;
  storyStep3: string;
  storyStep4: string;
  collectionEyebrow: string;
  collectionTitle: string;
  collectionBody: string;
  collectionItem1Title: string;
  collectionItem1Body: string;
  collectionItem2Title: string;
  collectionItem2Body: string;
  collectionItem3Title: string;
  collectionItem3Body: string;
  collectionValueLabel: string;
  collectionValueAmount: string;
  collectionBadgeLabel: string;
  featuredEyebrow: string;
  featuredTitle: string;
  featuredBody: string;
  featured1Title: string;
  featured1Body: string;
  featured2Title: string;
  featured2Body: string;
  featured3Title: string;
  featured3Body: string;
  finalTitle: string;
  finalBody: string;
  finalCtaText: string;
  finalCtaHref: string;
  audienceBackground: string;
  flowBackground: string;
  creatorBackground: string;
  storyBackground: string;
  collectionBackground: string;
  featuredBackground: string;
  finalBackground: string;
};

const defaultHomeContent: HomeSiteContent = {
  pageBackground: "",
  heroEyebrow: "The possibilities are endless when we UENITE",
  heroTitle: "THE SMARTER WAY TO FUNDRAISE, SELL, AND SUPPORT.",
  heroBody: "UENITE helps people raise money while giving supporters something valuable back. Supporters become Holders, receive Notes and digital rewards, and can redeem value with participating merchants.",
  primaryCtaText: "Join the Merchant Network",
  primaryCtaHref: "/merchants/register",
  secondaryCtaText: "Choose your path",
  secondaryCtaHref: "#audiences",
  heroPreset: "emerald",
  heroBgImage: "",
  heroVideoUrl: "",
  heroTextColor: "#ffffff",
  heroAccentColor: "#75e3ad",
  heroTitleSize: 76,
  faviconUrl: "",
  mediaLibrary: [
    "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=1200&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=1200&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1556741533-6e6a62bd8b49?q=80&w=1200&auto=format&fit=crop"
  ],
  textColors: {},
  textLinks: {},
  orbitCoreTitle: "UEN",
  orbitCoreSubtitle: "Universal Exchange Note",
  orbitHubLabel: "Exchange Hub",
  orbitHolderLabel: "Holder",
  orbitMerchantLabel: "Merchant",
  audienceEyebrow: "Built for the whole exchange",
  audienceTitle: "Every participant has a reason to show up.",
  audienceBody: "UENITE is not just a checkout or a coupon app. It is a support ecosystem where fundraising, digital products, audience data, collections, merchant offers, and proof of goodwill move together.",
  merchantPathKicker: "Turn Holders into customers",
  merchantPathTitle: "Merchants",
  merchantPathBody: "Accept Universal Exchange Notes in Shopify and reach Holders who already supported something they care about and now have a reason to shop with you.",
  merchantPathCta: "Join the Merchant Network",
  hubPathKicker: "Activate your audience",
  hubPathTitle: "Exchange Hubs",
  hubPathBody: "Creators, influencers, ministries, causes, organizations, and brands can fundraise or sell through their own store while giving supporters notes, downloads, and memorable rewards.",
  hubPathCta: "Apply as an Exchange Hub",
  holderPathKicker: "Use your note with participating merchants",
  holderPathTitle: "Holders",
  holderPathBody: "Build a collection of notes, downloads, badges, campaign rewards, and merchant offers that proves what you supported and unlocks where you can go next.",
  holderPathCta: "Access My Wallet",
  flowEyebrow: "The UENITE exchange flow",
  flowTitle: "Support becomes value. Value becomes a collection. Collections can keep growing.",
  flowBody: "Instead of giving and receiving nothing back, supporters receive a UEN and, at minimum, a digital item. Exchange Hubs can add music, art, books, collectibles, campaign rewards, limited releases, and future perks.",
  flow1Title: "Supporters fund a cause or creator",
  flow1Body: "A Holder contributes to a fundraiser, campaign, creator, ministry, community, or pay-it-forward mission through the Exchange Hub's own commerce flow.",
  flow1Image: creatorLiveSupport,
  flow1Badge: "Support",
  flow1Value: "$",
  flow2Title: "They receive more than a receipt",
  flow2Body: "The supporter receives a Universal Exchange Note plus a digital download, reward, badge, or collectible tied to the story of what they supported.",
  flow2Image: "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?q=80&w=900&auto=format&fit=crop",
  flow2Badge: "UEN issued",
  flow2Value: "UEN",
  flow3Title: "Their UEN unlocks merchant value",
  flow3Body: "The Holder can use the note with participating merchants to unlock offers, savings, perks, or special access through normal checkout.",
  flow3Image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=900&auto=format&fit=crop",
  flow3Badge: "Checkout",
  flow3Value: "15%",
  flow4Title: "The ecosystem keeps giving back",
  flow4Body: "Merchants gain warm customer traffic, Exchange Hubs keep supporter relationships, and Holders build a collection that can become more useful over time.",
  flow4Image: "https://images.unsplash.com/photo-1556741533-6e6a62bd8b49?q=80&w=900&auto=format&fit=crop",
  flow4Badge: "Offer active",
  flow4Value: "SALE",
  creatorEyebrow: "Own the supporter relationship",
  creatorTitle: "Fundraising should build your community, not just process a donation.",
  creatorBody: "People have used donation platforms for years and often receive little more than a thank-you. UENITE helps Exchange Hubs turn support into an owned relationship, a digital product moment, and a value system that can continue rewarding the Holder.",
  creatorCard1Title: "Direct supporter data",
  creatorCard1Body: "Supporter names, emails, purchase history, and campaign activity can stay connected to your own commerce stack.",
  creatorCard2Title: "More value than a tip",
  creatorCard2Body: "A UEN can be paired with downloads, art, music, books, limited items, collectibles, crypto-linked perks, or merchant offers.",
  creatorCard3Title: "Campaign flexibility",
  creatorCard3Body: "Run fundraisers, pay-it-forward campaigns, limited releases, cause drives, loyalty drops, and community reward programs.",
  creatorCard4Title: "Built on Shopify rails",
  creatorCard4Body: "Use the store, products, checkout, digital delivery, customer records, and fulfillment tools you already understand.",
  storyImage: "https://images.unsplash.com/photo-1556745757-8d76bdb6984b?q=80&w=1200&auto=format&fit=crop",
  storyEyebrow: "How value moves",
  storyTitle: "Support becomes proof. Proof becomes access. Access can become value.",
  storyBody: "A Holder can look back at what they supported, what they received, what badges they earned, what downloads they own, and which merchants now recognize that value.",
  storyStep1: "Exchange Hub issues notes",
  storyStep2: "Holder receives value",
  storyStep3: "Merchant accepts notes",
  storyStep4: "Checkout creates sales",
  collectionEyebrow: "Supporter collection",
  collectionTitle: "Support should become something you can keep, show, and build on.",
  collectionBody: "With UENITE, Holders can collect Universal Exchange Notes, digital downloads, artwork, music, books, memorabilia, badges, and campaign rewards in one beautiful wallet. Every item can carry the story of what they supported, when they supported it, and what value it unlocked.",
  collectionItem1Title: "Digital downloads and collectibles",
  collectionItem1Body: "Exchange Hubs can offer music, art, books, limited-time items, campaign files, memorabilia, and other digital goods alongside the UEN.",
  collectionItem2Title: "Achievement badges",
  collectionItem2Body: "Supporters can earn visible proof of good will: fundraiser badges, pay-it-forward milestones, early supporter status, and cause-specific achievements.",
  collectionItem3Title: "Future value layer",
  collectionItem3Body: "Collections can show estimated value, organize/filter items, and later support transfers, trades, or resale between Holders where appropriate.",
  collectionValueLabel: "Collection value",
  collectionValueAmount: "$248.00",
  collectionBadgeLabel: "Founding Supporter",
  featuredEyebrow: "Featured network",
  featuredTitle: "The network makes good will visible and useful.",
  featuredBody: "Featured merchants, Exchange Hubs, campaigns, and Holder collections become the discovery layer that helps people decide who to support, what to collect, and where to redeem value.",
  featured1Title: "Featured Merchants",
  featured1Body: "Participating stores, offers, perks, and product categories.",
  featured2Title: "Featured Exchange Hubs",
  featured2Body: "Creators, communities, ministries, brands, and organizations issuing notes.",
  featured3Title: "Holder Collections",
  featured3Body: "A future-ready collection view for notes, downloads, badges, campaign memories, value, and redemption history.",
  finalTitle: "Ready to take support into the future?",
  finalBody: "UENITE turns giving, fundraising, selling, and loyalty into an ecosystem where supporters receive value and the network keeps growing.",
  finalCtaText: "Join the Merchant Network",
  finalCtaHref: "/merchants/register",
  audienceBackground: "",
  flowBackground: "",
  creatorBackground: "",
  storyBackground: "",
  collectionBackground: "",
  featuredBackground: "",
  finalBackground: ""
};

function normalizeHomeContent(value: Partial<HomeSiteContent> | null | undefined): HomeSiteContent {
  const merged = {
    ...defaultHomeContent,
    ...(value ?? {}),
    heroTitleSize: Number(value?.heroTitleSize ?? defaultHomeContent.heroTitleSize),
    mediaLibrary: Array.isArray(value?.mediaLibrary) ? value.mediaLibrary : defaultHomeContent.mediaLibrary,
    textColors: value?.textColors && typeof value.textColors === "object" ? value.textColors : {},
    textLinks: value?.textLinks && typeof value.textLinks === "object" ? value.textLinks : {}
  };
  if (merged.heroTitle === "When we UENite, the possibilities are endless." || merged.heroTitle === "A smarter way to fundraise, sell, support, and UENite." || merged.heroTitle === "The smarter way to fundraise, sell, and support.") {
    merged.heroTitle = defaultHomeContent.heroTitle;
  }
  if (merged.heroBody === "Creators and influencers keep direct audience data, supporters receive Universal Exchange Notes, and merchants turn that value into checkout-ready sales. Build the exchange without leaving your own store." || merged.heroBody === "UENITE turns audience support into a merchant-backed value network. Creators and Exchange Hubs keep direct supporter relationships, Holders receive Universal Exchange Notes and digital rewards, and participating merchants give those notes real checkout utility.") {
    merged.heroBody = defaultHomeContent.heroBody;
  }
  if (merged.heroEyebrow === "The possibilities are endless when we UENite" || merged.heroEyebrow === "A smarter way to fundraise, sell, and support") {
    merged.heroEyebrow = defaultHomeContent.heroEyebrow;
  }
  if (merged.flow1Image === "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=900&auto=format&fit=crop" || merged.flow1Image.includes("1611162617474")) {
    merged.flow1Image = defaultHomeContent.flow1Image;
  }
  return merged;
}

function useData<T>(loader: () => Promise<T>, deps: React.DependencyList = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void reload();
  }, deps);
  return { data, error, loading, reload };
}

function AnimatedNumber({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const duration = 1100;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setCurrent(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{prefix}{current.toLocaleString()}{suffix}</>;
}

function PoweredByFooter() {
  return (
    <footer className="uenite-footer">
      <div>
        <strong><span className="brand-uen">UEN</span><span className="brand-ite">ITE</span></strong>
        <span>A smarter way to fundraise, sell, and support.</span>
      </div>
      <p>Powered by Universal Exchange Notes.</p>
    </footer>
  );
}

function BrandWord() {
  return (
    <span className="brand-word" style={{ display: "inline-flex", flexDirection: "row", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
      <span className="brand-uen">UEN</span>
      <span className="brand-ite">ITE</span>
    </span>
  );
}

function AnimatedMoney({ amount }: { amount: string }) {
  const numeric = Number(amount.replace(/[^0-9.]/g, "")) || 0;
  return <><AnimatedNumber value={numeric} prefix="$" suffix={amount.includes(".") ? ".00" : ""} /></>;
}

function Shell() {
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const isPublicRoute = window.location.pathname === "/" || window.location.pathname === "/about" || window.location.pathname === "/privacy" || window.location.pathname === "/faq" || window.location.pathname === "/login" || window.location.pathname === "/forgot-password" || window.location.pathname === "/reset-password" || window.location.pathname === "/merchants/register" || window.location.pathname.startsWith("/merchant/install/") || window.location.pathname === "/holder/portal" || window.location.pathname === "/holder/collection" || window.location.pathname === "/holder/register" || window.location.pathname === "/signup" || window.location.pathname === "/exchange-hub/register" || window.location.pathname === "/widget-preview" || window.location.pathname === "/shopify/merchant";
  const refreshAuth = async () => {
    try {
      const storedToken = localStorage.getItem("uen_admin_token");
      const headers: Record<string, string> = {};
      if (storedToken) headers["authorization"] = `Bearer ${storedToken}`;
      const response = await fetch("/api/auth/me", { credentials: "include", headers });
      if (!response.ok) throw new Error("Not signed in");
      const payload = await response.json();
      setUser(payload.user);
    } catch (_error) {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };
  useEffect(() => {
    authRefresh = refreshAuth;
    void refreshAuth();
    return () => {
      authRefresh = null;
    };
  }, []);

  return (
    <Router>
      {isPublicRoute ? (
        <Routes>
          <Route path="/" element={<UeniteHome />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/merchants/register" element={<MerchantRegister />} />
          <Route path="/merchant/install/:token" element={<MerchantInstall />} />
          <Route path="/holder/portal" element={<HolderPortal />} />
          <Route path="/holder/collection" element={<HolderCollectionDemo />} />
          <Route path="/holder/register" element={<HolderRegister />} />
          <Route path="/signup" element={<SignupGateway />} />
          <Route path="/exchange-hub/register" element={<ExchangeHubRegister />} />
          <Route path="/widget-preview" element={<WidgetPreviewPage />} />
          <Route path="/shopify/merchant" element={<ShopifyMerchantPortal />} />
        </Routes>
      ) : (
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <Shield size={24} />
            <div>
              <strong>UEN Platform</strong>
              <span>Central + Shopify</span>
            </div>
          </div>
          <nav>
            {[
              ["/admin", "Dashboard"],
              ["/pages", "Public Pages"],
              ["/exchange-hubs", "Exchange Hubs"],
              ["/holders", "Holders"],
              ["/uens", "Universal Exchange Notes"],
              ["/merchants", "Merchants"],
              ["/issuance-products", "Product Issuance"],
              ["/offers", "Merchant Offers"],
              ["/access-rules", "Access Rules"],
              ["/connections", "Shopify Connections"],
              ["/sync-logs", "Sync Logs"],
              ["/shopify", "Shopify App"],
              ["/banners", "Portal Banners"],
              ["/notifications", "Notifications"]
            ].map(([to, label]) => (
              <NavLink key={to} to={to} end={to === "/"}>
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main>
          {authLoading ? (
            <Notice>Checking session...</Notice>
          ) : !user ? (
            <LoginPanel onLogin={refreshAuth} />
          ) : (
            <Routes>
              <Route path="/admin" element={<Dashboard user={user} />} />
              <Route path="/pages" element={<PagesAdmin user={user} />} />
              <Route path="/exchange-hubs" element={<ExchangeHubs user={user} />} />
              <Route path="/holders" element={<Holders user={user} />} />
              <Route path="/uens" element={<Uens user={user} />} />
              <Route path="/merchants" element={<Merchants user={user} />} />
              <Route path="/issuance-products" element={<IssuanceProducts user={user} />} />
              <Route path="/offers" element={<Offers user={user} />} />
              <Route path="/access-rules" element={<AccessRules user={user} />} />
              <Route path="/connections" element={<Connections user={user} />} />
              <Route path="/sync-logs" element={<SyncLogs user={user} />} />
              <Route path="/shopify" element={<ShopifyApp user={user} />} />
              <Route path="/banners" element={<BannersAdmin user={user} />} />
              <Route path="/notifications" element={<NotificationsAdmin user={user} />} />
            </Routes>
          )}
        </main>
      </div>
      )}
    </Router>
  );
}

function PublicShell({ children, compact = false, backTo }: { children: React.ReactNode; compact?: boolean; backTo?: string }) {
  return (
    <main className={`public-main ${compact ? "public-main-compact" : ""}`}>
      <section className="public-hero">
        <nav className="public-top-nav">
          <a className="uenite-logo" href="/"><Shield size={22} /><BrandWord /></a>
          {backTo && <a className="reg-back-link" href={backTo}>Back to all options</a>}
        </nav>
        <div className="hero-grid">
          <div className="hero-copy">
            <span className="eyebrow"><Ticket size={16} /> New customer channel for Shopify merchants</span>
            <h1>Turn creator support into sales for your store</h1>
            <p>Accept Universal Exchange Notes and reach motivated Holders from creators, influencers, organizations, ministries, and communities. You control the offer. We handle the note syncing. Your store gets access to warm traffic.</p>
            <div className="hero-actions">
              <a className="button-link button-link-large" href="#merchant-signup">Join the Merchant Network</a>
              <a className="text-link" href="#how-it-works">See how it works</a>
            </div>
            <div className="hero-proof">
              <span>No manual code uploads</span>
              <span>No second website</span>
              <span>No checkout rebuild</span>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="note-card note-card-a"><span>Holder traffic</span><strong>NUBREED74201UEN</strong></div>
            <div className="flow-line" />
            <div className="merchant-terminal">
              <div><Shield size={18} /><span>Shopify store</span><strong>Connected</strong></div>
              <div><Ticket size={18} /><span>Approved notes</span><strong>Auto synced</strong></div>
              <div><Play size={18} /><span>Merchant offer</span><strong>15% active</strong></div>
            </div>
            <div className="orb orb-one" />
            <div className="orb orb-two" />
          </div>
        </div>
      </section>
      {children}
      <PoweredByFooter />
    </main>
  );
}

type UeniteNavLink = { href: string; label: string; cta?: boolean };

function UeniteNav({ links, className = "" }: { links: UeniteNavLink[]; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <nav className={`uenite-nav ${className}`.trim()}>
      <a className="uenite-logo" href="/">
        <Shield size={24} />
        <BrandWord />
      </a>
      <button
        type="button"
        className="uenite-nav-toggle"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>
      <div className={`uenite-nav-links ${open ? "is-open" : ""}`.trim()}>
        {links.map((link) => (
          <a
            key={`${link.href}-${link.label}`}
            href={link.href}
            className={link.cta ? "uenite-nav-cta" : undefined}
            onClick={() => setOpen(false)}
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function UeniteHome() {
  const siteContent = useData<Record<string, Partial<HomeSiteContent>>>(() => api("/api/public/site-content"));
  const [publicAdmin, setPublicAdmin] = useState<any | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<keyof HomeSiteContent | "heroBackground" | "share" | null>(null);
  const savedContent = normalizeHomeContent(siteContent.data?.home);
  const [previewContent, setPreviewContent] = useState<HomeSiteContent>(savedContent);
  const content = previewContent;
  const heroStyle = {
    "--uenite-accent": content.heroAccentColor,
    color: content.heroTextColor,
    ...(content.heroBgImage ? { backgroundImage: `linear-gradient(135deg, rgba(7, 18, 14, 0.82), rgba(18, 51, 38, 0.74)), url("${content.heroBgImage}")` } : {})
  } as React.CSSProperties;
  const backgroundStyle = (field: keyof HomeSiteContent) => ({
    ...(String(content[field] ?? "").trim() ? { background: String(content[field]), backgroundPosition: "center", backgroundSize: "cover" } : {})
  } as React.CSSProperties);
  const particles = Array.from({ length: 24 }, (_, index) => ({
    left: `${(index * 37) % 96}%`,
    top: `${8 + ((index * 23) % 78)}%`,
    delay: `${index * -0.32}s`,
    size: `${4 + (index % 4)}px`
  }));
  const paths = [
    {
      Icon: ShoppingBag,
      titleField: "merchantPathTitle" as keyof HomeSiteContent,
      kickerField: "merchantPathKicker" as keyof HomeSiteContent,
      bodyField: "merchantPathBody" as keyof HomeSiteContent,
      ctaField: "merchantPathCta" as keyof HomeSiteContent,
      href: "/merchants/register",
      className: "path-merchant"
    },
    {
      Icon: Users,
      titleField: "hubPathTitle" as keyof HomeSiteContent,
      kickerField: "hubPathKicker" as keyof HomeSiteContent,
      bodyField: "hubPathBody" as keyof HomeSiteContent,
      ctaField: "hubPathCta" as keyof HomeSiteContent,
      href: "/exchange-hub/register",
      className: "path-hub"
    },
    {
      Icon: Ticket,
      titleField: "holderPathTitle" as keyof HomeSiteContent,
      kickerField: "holderPathKicker" as keyof HomeSiteContent,
      bodyField: "holderPathBody" as keyof HomeSiteContent,
      ctaField: "holderPathCta" as keyof HomeSiteContent,
      href: "/holder/register",
      className: "path-holder"
    }
  ];
  const editMode = Boolean(publicAdmin && editorOpen);
  const selectField = (field: keyof HomeSiteContent | "heroBackground" | "share") => (event: React.MouseEvent) => {
    if (!publicAdmin || !editMode) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedField(field);
    setEditorOpen(true);
  };
  const editableClass = (field: keyof HomeSiteContent | "heroBackground" | "share") =>
    editMode ? `editable-surface ${selectedField === field ? "selected" : ""}` : "";
  const editableText = (field: keyof HomeSiteContent, className = "") => ({
    className: `${className} ${editableClass(field)}`,
    onClick: selectField(field),
    style: content.textColors[String(field)] ? { color: content.textColors[String(field)] } : undefined
  });
  const editableAnchor = (field: keyof HomeSiteContent, defaultHref: string, className = "") => ({
    className: `${className} ${editableClass(field)}`,
    onClick: selectField(field),
    href: content.textLinks[String(field)] || defaultHref,
    style: content.textColors[String(field)] ? { color: content.textColors[String(field)] } : undefined
  });
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setPublicAdmin(payload?.user ?? null))
      .catch(() => setPublicAdmin(null));
  }, []);
  useEffect(() => {
    if (!content.faviconUrl) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = content.faviconUrl;
  }, [content.faviconUrl]);
  useEffect(() => {
    setPreviewContent(savedContent);
  }, [siteContent.data]);
  return (
    <main className={`uenite-main ${editableClass("pageBackground")}`} style={backgroundStyle("pageBackground")} onClick={selectField("pageBackground")}>
      <section className={`uenite-hero uenite-hero-${content.heroPreset} ${editableClass("heroBackground")}`} style={heroStyle} onClick={selectField("heroBackground")}>
        {content.heroVideoUrl && (
          <video className="hero-video-bg" autoPlay muted loop playsInline>
            <source src={content.heroVideoUrl} />
          </video>
        )}
        <div className="network-particles" aria-hidden="true">
          {particles.map((particle, index) => (
            <span key={index} style={{ left: particle.left, top: particle.top, animationDelay: particle.delay, width: particle.size, height: particle.size }} />
          ))}
        </div>
        <UeniteNav
          links={[
            { href: "#audiences", label: "Who it is for" },
            { href: "#featured-network", label: "Network" },
            { href: "/about", label: "About" },
            { href: "/signup", label: "Get Started", cta: true },
            { href: "/login", label: "Sign in" },
          ]}
        />
        <div className="uenite-hero-grid">
          <div className="uenite-copy">
            <span className={`eyebrow ${editableClass("heroEyebrow")}`} onClick={selectField("heroEyebrow")}><Star size={16} /> {content.heroEyebrow}</span>
            <h1 className={editableClass("heroTitle")} onClick={selectField("heroTitle")} style={{ color: content.heroTextColor, fontSize: `clamp(46px, 7vw, ${content.heroTitleSize}px)` }}>{content.heroTitle}</h1>
            <p className={editableClass("heroBody")} onClick={selectField("heroBody")} style={{ color: content.heroTextColor }}>{content.heroBody}</p>
            <div className="hero-actions">
              <a {...editableAnchor("primaryCtaText", content.primaryCtaHref, "button-link button-link-large")}>{content.primaryCtaText}</a>
              <a {...editableAnchor("secondaryCtaText", content.secondaryCtaHref, "text-link")}>{content.secondaryCtaText}</a>
            </div>
            <div className="creator-proof">
              <span><strong className="mini-money">$</strong> Sell notes through your own Shopify store</span>
              <span><Users size={15} /> Own the supporter relationship</span>
              <span><Zap size={15} /> Engage directly beyond social platforms</span>
            </div>
          </div>
          <div className="uenite-orbit" aria-hidden="true">
            <div className="money-symbol money-one">$</div>
            <div className="money-symbol money-two">$</div>
            <div className="money-symbol money-three">$</div>
            <div className="orbit-collection-card">
              <span>Holder collection</span>
              <strong>5 items</strong>
              <small>2 badges / 3 downloads</small>
            </div>
            <div className={`orbit-core ${editableClass("orbitCoreTitle")}`} onClick={selectField("orbitCoreTitle")}><strong>{content.orbitCoreTitle}</strong><span>{content.orbitCoreSubtitle}</span></div>
            <div className={`orbit-node node-hub ${editableClass("orbitHubLabel")}`} onClick={selectField("orbitHubLabel")}><Users size={18} /><span>{content.orbitHubLabel}</span></div>
            <div className={`orbit-node node-holder ${editableClass("orbitHolderLabel")}`} onClick={selectField("orbitHolderLabel")}><Ticket size={18} /><span>{content.orbitHolderLabel}</span></div>
            <div className={`orbit-node node-merchant ${editableClass("orbitMerchantLabel")}`} onClick={selectField("orbitMerchantLabel")}><ShoppingBag size={18} /><span>{content.orbitMerchantLabel}</span></div>
            <div className="orbit-ring orbit-ring-one" />
            <div className="orbit-ring orbit-ring-two" />
          </div>
        </div>
      </section>

      <section className={`audience-section ${editableClass("audienceBackground")}`} id="audiences" style={backgroundStyle("audienceBackground")} onClick={selectField("audienceBackground")}>
        <div className="section-inner">
          <div className="section-heading colorful-heading">
            <span {...editableText("audienceEyebrow", "eyebrow dark")}><Zap size={16} /> {content.audienceEyebrow}</span>
            <h2 {...editableText("audienceTitle")}>{content.audienceTitle}</h2>
            <p {...editableText("audienceBody")}>{content.audienceBody}</p>
          </div>
          <div className="path-grid">
            {paths.map(({ Icon, titleField, kickerField, bodyField, ctaField, href, className }) => (
              <article className={`path-card ${className}`} key={titleField}>
                <div className="path-icon"><Icon size={28} /></div>
                <span {...editableText(kickerField)}>{String(content[kickerField])}</span>
                <h3 {...editableText(titleField)}>{String(content[titleField])}</h3>
                <p {...editableText(bodyField)}>{String(content[bodyField])}</p>
                <a {...editableAnchor(ctaField, href)}>{String(content[ctaField])}</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`exchange-flow-section ${editableClass("flowBackground")}`} style={backgroundStyle("flowBackground")} onClick={selectField("flowBackground")}>
        <div className="section-inner">
          <div className="section-heading flow-heading">
            <span {...editableText("flowEyebrow", "eyebrow")}><RefreshCw size={16} /> {content.flowEyebrow}</span>
            <h2 {...editableText("flowTitle")}>{content.flowTitle}</h2>
            <p {...editableText("flowBody")}>{content.flowBody}</p>
          </div>
          <div className="exchange-flow-grid">
            {[
              {
                titleField: "flow1Title" as keyof HomeSiteContent,
                bodyField: "flow1Body" as keyof HomeSiteContent,
                imageField: "flow1Image" as keyof HomeSiteContent,
                badgeField: "flow1Badge" as keyof HomeSiteContent,
                valueField: "flow1Value" as keyof HomeSiteContent
              },
              {
                titleField: "flow2Title" as keyof HomeSiteContent,
                bodyField: "flow2Body" as keyof HomeSiteContent,
                imageField: "flow2Image" as keyof HomeSiteContent,
                badgeField: "flow2Badge" as keyof HomeSiteContent,
                valueField: "flow2Value" as keyof HomeSiteContent
              },
              {
                titleField: "flow3Title" as keyof HomeSiteContent,
                bodyField: "flow3Body" as keyof HomeSiteContent,
                imageField: "flow3Image" as keyof HomeSiteContent,
                badgeField: "flow3Badge" as keyof HomeSiteContent,
                valueField: "flow3Value" as keyof HomeSiteContent
              },
              {
                titleField: "flow4Title" as keyof HomeSiteContent,
                bodyField: "flow4Body" as keyof HomeSiteContent,
                imageField: "flow4Image" as keyof HomeSiteContent,
                badgeField: "flow4Badge" as keyof HomeSiteContent,
                valueField: "flow4Value" as keyof HomeSiteContent
              }
            ].map((step, index) => (
              <article className="exchange-flow-card" key={step.titleField} style={{ animationDelay: `${index * 120}ms` }}>
                <div className={`flow-image-wrap ${editableClass(step.imageField)}`} onClick={selectField(step.imageField)}>
                  <img src={String(content[step.imageField])} alt="" />
                  <div {...editableText(step.valueField, "flow-value-chip")}>{String(content[step.valueField])}</div>
                  <div {...editableText(step.badgeField, "flow-badge")}>{String(content[step.badgeField])}</div>
                </div>
                <div className="flow-card-copy">
                  <strong>{String(index + 1).padStart(2, "0")}</strong>
                  <h3 {...editableText(step.titleField)}>{String(content[step.titleField])}</h3>
                  <p {...editableText(step.bodyField)}>{String(content[step.bodyField])}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`creator-economy-section ${editableClass("creatorBackground")}`} style={backgroundStyle("creatorBackground")} onClick={selectField("creatorBackground")}>
        <div className="creator-economy-copy">
          <span {...editableText("creatorEyebrow", "eyebrow dark")}><strong className="mini-money">$</strong> {content.creatorEyebrow}</span>
          <h2 {...editableText("creatorTitle")}>{content.creatorTitle}</h2>
          <p {...editableText("creatorBody")}>{content.creatorBody}</p>
        </div>
        <div className="creator-economy-cards">
          {[
            ["creatorCard1Title", "creatorCard1Body"],
            ["creatorCard2Title", "creatorCard2Body"],
            ["creatorCard3Title", "creatorCard3Body"],
            ["creatorCard4Title", "creatorCard4Body"]
          ].map(([title, body]) => (
            <article key={title}>
              <strong className="card-money">$</strong>
              <h3 {...editableText(title as keyof HomeSiteContent)}>{String(content[title as keyof HomeSiteContent])}</h3>
              <p {...editableText(body as keyof HomeSiteContent)}>{String(content[body as keyof HomeSiteContent])}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`story-section ${editableClass("storyBackground")}`} style={backgroundStyle("storyBackground")} onClick={selectField("storyBackground")}>
        <div className={`story-image ${editableClass("storyImage")}`} onClick={selectField("storyImage")}>
          <img src={content.storyImage} alt="Merchant helping a customer" />
        </div>
        <div className="story-panel">
          <span {...editableText("storyEyebrow", "eyebrow dark")}><RefreshCw size={16} /> {content.storyEyebrow}</span>
          <h2 {...editableText("storyTitle")}>{content.storyTitle}</h2>
          <p {...editableText("storyBody")}>{content.storyBody}</p>
          <div className="story-flow">
            {["storyStep1", "storyStep2", "storyStep3", "storyStep4"].map((field, index) => (
              <div key={field}><strong>{index + 1}</strong><span {...editableText(field as keyof HomeSiteContent)}>{String(content[field as keyof HomeSiteContent])}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section className={`collection-section ${editableClass("collectionBackground")}`} style={backgroundStyle("collectionBackground")} onClick={selectField("collectionBackground")}>
        <div className="collection-copy">
          <span {...editableText("collectionEyebrow", "eyebrow dark")}><Wallet size={16} /> {content.collectionEyebrow}</span>
          <h2 {...editableText("collectionTitle")}>{content.collectionTitle}</h2>
          <p {...editableText("collectionBody")}>{content.collectionBody}</p>
          <div className="collection-filter-row">
            {["All", "Downloads", "Badges", "Campaigns", "Offers"].map((filter) => <span key={filter}>{filter}</span>)}
          </div>
        </div>
        <div className="collection-showcase">
          <div className="collection-toolbar">
            <span>Collection Vault</span>
            <div>
              <button type="button">Newest</button>
              <button type="button">Value</button>
              <button type="button">Cause</button>
            </div>
          </div>
          <div className="collection-value-card">
            <span {...editableText("collectionValueLabel")}>{content.collectionValueLabel}</span>
            <strong {...editableText("collectionValueAmount")}><AnimatedMoney amount={content.collectionValueAmount} /></strong>
            <small>Estimated holder value</small>
            <div className="collection-value-orbits" aria-hidden="true"><span /><span /><span /></div>
          </div>
          {[
            ["collectionItem1Title", "collectionItem1Body", Ticket, "Digital item"],
            ["collectionItem2Title", "collectionItem2Body", Star, content.collectionBadgeLabel],
            ["collectionItem3Title", "collectionItem3Body", RefreshCw, "Future utility"]
          ].map(([titleField, bodyField, Icon, badge], index) => (
            <article className={`collection-item collection-item-${index + 1}`} key={String(titleField)}>
              <div className="collection-item-top">
                <div className="collection-icon"><Icon size={24} /></div>
                <span>{String(badge)}</span>
              </div>
              <h3 {...editableText(titleField as keyof HomeSiteContent)}>{String(content[titleField as keyof HomeSiteContent])}</h3>
              <p {...editableText(bodyField as keyof HomeSiteContent)}>{String(content[bodyField as keyof HomeSiteContent])}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`featured-section ${editableClass("featuredBackground")}`} id="featured-network" style={backgroundStyle("featuredBackground")} onClick={selectField("featuredBackground")}>
        <div className="section-inner">
          <div className="section-heading colorful-heading">
            <span {...editableText("featuredEyebrow", "eyebrow dark")}><Star size={16} /> {content.featuredEyebrow}</span>
            <h2 {...editableText("featuredTitle")}>{content.featuredTitle}</h2>
            <p {...editableText("featuredBody")}>{content.featuredBody}</p>
          </div>
          <div className="featured-grid">
            {[
              ["featured1Title", "featured1Body"],
              ["featured2Title", "featured2Body"],
              ["featured3Title", "featured3Body"]
            ].map(([title, body]) => (
              <article className="featured-card" key={title}>
                <h3 {...editableText(title as keyof HomeSiteContent)}>{String(content[title as keyof HomeSiteContent])}</h3>
                <p {...editableText(body as keyof HomeSiteContent)}>{String(content[body as keyof HomeSiteContent])}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`uenite-final ${editableClass("finalBackground")}`} style={backgroundStyle("finalBackground")} onClick={selectField("finalBackground")}>
        <div>
          <h2 {...editableText("finalTitle")}>{content.finalTitle}</h2>
          <p {...editableText("finalBody")}>{content.finalBody}</p>
        </div>
        <a {...editableAnchor("finalCtaText", content.finalCtaHref, "button-link button-link-large")}>{content.finalCtaText}</a>
      </section>
      {publicAdmin && <SiteEditor initialContent={content} onPreview={setPreviewContent} onSaved={siteContent.reload} open={editorOpen} selectedField={selectedField} onOpenChange={(nextOpen) => { setEditorOpen(nextOpen); if (!nextOpen) setSelectedField(null); }} onSelect={setSelectedField} />}
      <PoweredByFooter />
    </main>
  );
}

function AboutPage() {
  return (
    <main className="about-page">
      <UeniteNav
        className="about-nav"
        links={[
          { href: "/", label: "Home" },
          { href: "/signup", label: "Get Started", cta: true },
          { href: "/login", label: "Sign in" },
        ]}
      />
      <section className="about-hero">
        <span className="eyebrow dark"><Star size={16} /> About UENITE</span>
        <h1>Support with memory, value, and momentum.</h1>
        <p>UENITE is a smarter way to fundraise, sell, and support. It turns contributions into Universal Exchange Notes, digital rewards, collectibles, badges, and merchant offers that Holders can keep, redeem, and remember.</p>
      </section>
      <section className="about-grid">
        {[
          ["Exchange Hubs", "Creators, causes, ministries, businesses, and communities can raise money while giving supporters something meaningful in return."],
          ["Holders", "Supporters become Holders with a growing vault of Notes, downloads, badges, campaign memories, and future value."],
          ["Merchants", "Participating merchants accept Universal Exchange Notes and turn supporter energy into customer activity."],
          ["Collections", "Every item can tell the story of what was supported, when it happened, what was unlocked, and why it matters."]
        ].map(([title, body]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <section className="about-statement">
        <h2>The future of support is an exchange.</h2>
        <p>People should be able to support what they believe in and hold something that reflects that goodwill. UENITE gives every campaign a collection, every Holder a reason to return, and every Merchant a new way to connect with motivated customers.</p>
        <a className="button-link button-link-large" href="/signup">Start with UENITE</a>
      </section>
      <PoweredByFooter />
    </main>
  );
}

function PrivacyPolicyPage() {
  return (
    <main className="about-page">
      <UeniteNav
        className="about-nav"
        links={[
          { href: "/", label: "Home" },
          { href: "/about", label: "About" },
          { href: "/login", label: "Sign in" },
        ]}
      />
      <section className="about-hero">
        <span className="eyebrow dark"><Shield size={16} /> Privacy Policy</span>
        <h1>How UENITE handles data.</h1>
        <p>Last updated June 10, 2026. UENITE is operated by Zah Brand Solutions. This policy explains what we collect, why we collect it, and the choices available to merchants, Exchange Hubs, and Holders.</p>
      </section>
      <section className="about-grid">
        {[
          ["What we collect", "Merchant account details (business name, contact email), Shopify store connection data, and order information from connected stores — including customer email addresses and names — solely to issue Universal Exchange Notes after qualifying purchases and to record when notes are redeemed. Holders share their name and email when they create a wallet."],
          ["Why we collect it", "App functionality only. Order emails let us deliver purchased notes to the right person; redemption records let merchants honor notes a single time each; holder emails power wallet login. We do not sell personal data, use it for advertising, or share it with third parties beyond the infrastructure that hosts the platform."],
          ["Where it lives", "Data is stored in a managed PostgreSQL database hosted on Railway with encryption in transit. Shopify access tokens are stored server-side and never exposed to browsers. Payment details are never collected — checkout happens entirely on the merchant's store."],
          ["Your choices", "Merchants can disconnect their store at any time, which stops all data flow. We honor Shopify's privacy webhooks: customer data requests, customer data deletion, and full shop deletion are processed automatically. Holders can request account deletion by contacting us."]
        ].map(([title, body]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <section className="about-statement">
        <h2>Questions about your data?</h2>
        <p>Contact us at cleannlawful@gmail.com and we will respond within 30 days. If you are a customer of a store using UENITE, you can also contact that merchant directly — deletion requests made through Shopify reach us automatically.</p>
      </section>
      <PoweredByFooter />
    </main>
  );
}

function FaqPage() {
  return (
    <main className="about-page">
      <UeniteNav
        className="about-nav"
        links={[
          { href: "/", label: "Home" },
          { href: "/about", label: "About" },
          { href: "/signup", label: "Get Started", cta: true },
          { href: "/login", label: "Sign in" },
        ]}
      />
      <section className="about-hero">
        <span className="eyebrow dark"><Star size={16} /> Frequently Asked Questions</span>
        <h1>How UENITE works.</h1>
        <p>UENITE turns support into value. Creators reward the supporters who back them with Universal Exchange Notes, and stores welcome those supporters by accepting the notes as discounts. Here are the questions we hear most.</p>
      </section>
      <section className="about-grid">
        {[
          ["What is a Universal Exchange Note?", "A digital note a supporter receives for backing a creator, cause, or community. It lives in their personal wallet, can be redeemed as a discount at participating stores, and stays as a keepsake of what they supported."],
          ["Who is UENITE for?", "Two kinds of Shopify store owners. Creators, influencers, causes, and communities (Exchange Hubs) issue notes to the supporters who back them. Other stores (Merchants) accept those notes as discounts to welcome engaged, values-driven shoppers."],
          ["How does a merchant accept exchange notes?", "Install UENITE and set your offer — a percentage or fixed amount, with an optional minimum order. Each note becomes a discount code that is validated automatically at checkout. A note can be redeemed once per store."],
          ["How does a supporter get and use a note?", "A note is issued when they back a creator or buy a qualifying product, and it lands in their UENITE wallet. The wallet shows where the note is redeemable, and they apply it as a discount at any participating store."],
          ["What does it cost?", "UENITE is free to install."],
          ["What about my customers' data?", "UENITE only reads customer name and email from orders, solely to deliver notes to the right person and record one-time redemptions. We never sell data, and we honor Shopify's privacy and redaction webhooks. See our Privacy Policy for details."],
          ["Can a note be used more than once?", "Each note is honored once per store and validated automatically. A supporter can use the same note at different participating stores, but not twice at the same one."],
          ["How do I get help?", "Email work@zahbrandsolutions.com and we will get back to you."]
        ].map(([title, body]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <section className="about-statement">
        <h2>Ready to spread the love?</h2>
        <p>Whether you reward the supporters who back you or welcome supporters into your store, UENITE gives every note a story and every store a community.</p>
        <a className="button-link button-link-large" href="/signup">Start with UENITE</a>
      </section>
      <PoweredByFooter />
    </main>
  );
}

type AlbumTrack = {
  id: string;
  title: string;
  trackNumber: number;
  fileUrl: string;
  durationSeconds?: number | null;
  likeCount?: number;
  likedByHolder?: boolean;
};

type CollectionItem = {
  id: string;
  type: string;
  title: string;
  source: string;
  rarity: string;
  value: string;
  date: string;
  status: string;
  description: string;
  // album-specific (optional)
  assetType?: "ALBUM" | "BOOK" | "IMAGE";
  artworkUrl?: string;
  artist?: string;
  tracks?: AlbumTrack[];
  // image/download collectible (optional)
  imageUrl?: string;
  downloadUrl?: string;
  downloadName?: string;
  tradable?: boolean;
  // lyrics (optional) — newline-separated; auto-scrolls with playback
  lyrics?: string;
  // timed lyrics (optional) — drives real karaoke-style sync to the audio clock
  lyricsTimed?: { t: number; text: string }[];
};

// The collectible digital Love Note given to every original Love Note supporter.
// Viewable + downloadable, but not tradable.
const LOVE_NOTE_COLLECTIBLE: CollectionItem = {
  id: "love-note-collectible",
  type: "Digital Download",
  title: "Your Digital Love Note",
  source: "Love Notes",
  rarity: "Keepsake",
  value: "Keepsake",
  date: "2026",
  status: "Owned",
  imageUrl: "https://cdn.shopify.com/s/files/1/0566/5367/6659/products/1ozofLove-KingDawidTrust.gif?v=1661117710",
  downloadUrl: "https://cdn.shopify.com/s/files/1/0566/5367/6659/products/1ozofLove-KingDawidTrust.gif?v=1661117710",
  downloadName: "Digital-Love-Note.gif",
  tradable: false,
  description: "Your collectible digital Love Note — a keepsake marking that you were part of the original Love Notes. Open it to view, and download it to keep. This one is yours to treasure, not to trade."
};

// Exclusive music for original Love Note supporters. Hosted on UEN itself
// (same-origin /music) so it streams + shows the waveform with no Shopify
// dependency. Plays in the existing album player.
const LOVE_NOTE_MUSIC: CollectionItem = {
  id: "love-note-music",
  type: "Digital Album",
  assetType: "ALBUM",
  title: "Filthy Coon",
  artist: "Nubreed ft. Yawitazah",
  source: "Nubreed ENT",
  rarity: "Exclusive",
  value: "Exclusive",
  date: "2026",
  status: "Owned",
  artworkUrl: "/music/filthy-coon-cover.jpg",
  description: "An exclusive track for original Love Note supporters — Nubreed ft. Yawitazah, “Filthy Coon.” Press play; it stays in your collection as part of the celebration.",
  lyrics: `They be out here doin' whatever for the dollar
A buncha excuses, "I'm just tryin' to provide for my family"
No honor, no dignity, no respect
Niggas is disgusting, they got some audacity
Keep speakin' that blast for me, you ain't got no strategy
Just shadowboxin' with a vendetta
Out here just bein' extra, I'm calculated
Two records, be a cataclysm, you misstep it
Life can change in a split second
Gotta move different, they volatile
We makin' plays, they outta bounds
Gossipin' is not allowed, over here you get exiled
These haters weirder than X-Files
At my apex, no predator
I'm FBA, no settlin', original, no competitor
Chatty patties turn federal
No sneak dissin', you can get a blessin'
That's 101 without a weapon, guns down, I'm a trendsetter
You filthy coons keep tap dancing
Gettin' back-handed by your white daddy
Cross the line, you get dispatched
When they showin' off, won't come outside
I'm like Gideon takin' whole squads
Chop 'em down, but I'm surgical, no foreheads
Your sick mind is a horror scene
Talkin' wild, you get blended up
Get a new grip, better switch it up
Made the mask slip, time to give it up
Dirty dancin' with the devil
Tap dancin' for dollars
With a price tag on they head
Sell they soul for some followers
A bunch of dirty ass coons
You're nothin' but a filthy coon

Yeah, it's good to see you back in the lab
This the type of song that really get these demons mad
When you doin' good, they gonna see you doin' bad
That's how demons are, that's the only happiness they have
That's how I know these coons from L.A. to St. Louis
Them stab a brother in their back and go and cut the lawn
Them sabotage the progress that you try to make
To make some things great for your people, they so filled with hate
It's in they DNA, snakin' in they DNA
Our skin might look the same, but they ain't got our DNA
This the games they play from way back in the day
They see the light in you and they wanna make it go away
Sick and unstable, hate to see a brother win
Cain wasn't able, so he killed his brother then
Esau wasn't right, turned Edomite
Used all they might to do us, they hate us Israelites
Man, it sucks to be a coon, you'll never be white
Man, it sucks to be a coon, you'll never see the light
Christ was a black man betrayed by Israelites
Coons hated Christ so much they loved him when they turned him white
Coons have always been around us, take a look around
They face down, lettin' MAGA clown go to pound town
Then turn around and call you liberal or a Democrat
You tried to bow yourself, puttin' on a MAGA hat
Pretty soon you'll see these coons gon' cry for Donald Trump
It's gonna be a war you've never seen and coons won't survive
Dirty dancin' with the devil, tap dancin' for dollars
With a price tag on they head, sell they soul for some followers
A bunch of dirty ass coons
You're nothin' but a filthy coon`,
  lyricsTimed: [{"t":0,"text":"They be out here doin' whatever for the dollar"},{"t":5,"text":"A buncha excuses, \"I'm just tryin' to provide for my family\""},{"t":10,"text":"No honor, no dignity, no respect"},{"t":12,"text":"Niggas is disgusting, they got some audacity"},{"t":15,"text":"Keep speakin' that blast for me, you ain't got no strategy"},{"t":18,"text":"Just shadowboxin' with a vendetta"},{"t":21,"text":"Out here just bein' extra, I'm calculated"},{"t":24,"text":"Two records, be a cataclysm, you misstep it"},{"t":26,"text":"Life can change in a split second"},{"t":28,"text":"Gotta move different, they volatile"},{"t":30,"text":"We makin' plays, they outta bounds"},{"t":32,"text":"Gossipin' is not allowed, over here you get exiled"},{"t":35,"text":"These haters weirder than X-Files"},{"t":37,"text":"At my apex, no predator"},{"t":39,"text":"I'm FBA, no settlin', original, no competitor"},{"t":42,"text":"Chatty patties turn federal"},{"t":44,"text":"No sneak dissin', you can get a blessin'"},{"t":46,"text":"That's 101 without a weapon, guns down, I'm a trendsetter"},{"t":49,"text":"You filthy coons keep tap dancing"},{"t":51,"text":"Gettin' back-handed by your white daddy"},{"t":53,"text":"Cross the line, you get dispatched"},{"t":55,"text":"When they showin' off, won't come outside"},{"t":57,"text":"I'm like Gideon takin' whole squads, chop 'em down"},{"t":60,"text":"But I'm surgical, no foreheads"},{"t":62,"text":"Your sick mind is a horror scene"},{"t":64,"text":"Talkin' wild, you get blended up"},{"t":67,"text":"Get a new grip, better switch it up"},{"t":69,"text":"Made the mask slip, time to give it up"},{"t":71,"text":"Dirty dancin' with the devil, tap dancin' for dollars"},{"t":78,"text":"With a price tag on they head"},{"t":81,"text":"Sell they soul for some followers"},{"t":84,"text":"A bunch of dirty ass coons"},{"t":90,"text":"You're nothin' but a filthy coon"},{"t":99,"text":"Yeah, it's good to see you back in the lab"},{"t":103,"text":"This the type of song that really get these demons mad"},{"t":106,"text":"When you doin' good, they gonna see you doin' bad"},{"t":109,"text":"That's how demons are, that's the only happiness they have"},{"t":113,"text":"That's how I know these coons from L.A. to St. Louis"},{"t":116,"text":"Them stab a brother in their back and go and cut the lawn"},{"t":120,"text":"Them sabotage the progress that you try to make"},{"t":123,"text":"To make things great for your people, they so filled with hate"},{"t":127,"text":"It's in they DNA, snakin' in they DNA"},{"t":130,"text":"Our skin might look the same, but they ain't got our DNA"},{"t":134,"text":"This the games they play from way back in the day"},{"t":137,"text":"They see the light in you and they wanna make it go away"},{"t":141,"text":"Sick and unstable, hate to see a brother win"},{"t":145,"text":"Cain wasn't able, so he killed his brother then"},{"t":148,"text":"Esau wasn't right, turned Edomite"},{"t":151,"text":"Used all they might to do us, they hate us Israelites"},{"t":155,"text":"Man, it sucks to be a coon, you'll never be white"},{"t":159,"text":"Man, it sucks to be a coon, you'll never see the light"},{"t":162,"text":"Christ was a black man betrayed by Israelites"},{"t":165,"text":"Coons hated Christ so much they loved him when they turned him white"},{"t":169,"text":"Coons have always been around us, take a look around"},{"t":172,"text":"They face down, lettin' MAGA clown go to pound town"},{"t":176,"text":"Then turn around and call you liberal or a Democrat"},{"t":180,"text":"You tried to bow yourself, puttin' on a MAGA hat"},{"t":190,"text":"Dr. King ain't never mention this in his dreams"},{"t":194,"text":"He said blacks and whites were holdin' hands, he's so advanced"},{"t":198,"text":"Or maybe he just knew these coons didn't stand a chance"},{"t":201,"text":"As soon as they gettin' a chance, they try to get in white's pants"},{"t":226,"text":"Pretty soon you'll see these coons gon' cry for Donald Trump"},{"t":233,"text":"They gonna make a Trump clone then execute him live"},{"t":236,"text":"It's gonna be a war you've never seen and coons won't survive"},{"t":240,"text":"Dirty dancin' with the devil, tap dancin' for dollars"},{"t":247,"text":"With a price tag on they head, sell they soul for some followers"},{"t":252,"text":"A bunch of dirty ass coons"},{"t":259,"text":"You're nothin' but a filthy coon"}],
  tradable: false,
  tracks: [
    { id: "filthy-coon-1", title: "Filthy Coon", trackNumber: 1, fileUrl: "/music/filthy-coon.mp3", likeCount: 0, likedByHolder: false }
  ]
};

const demoCollectionItems: CollectionItem[] = [
  {
    id: "demo-album",
    type: "Digital Album",
    assetType: "ALBUM",
    title: "If You — Type Beat 2026",
    artist: "Nubreed Global Truth",
    source: "Nubreed Global Truth",
    rarity: "Exclusive",
    value: "$45.00",
    date: "Jun 1, 2026",
    status: "Owned",
    artworkUrl: "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?q=80&w=900&auto=format&fit=crop",
    description: "An exclusive trap / melodic rap instrumental drop issued to founding supporters of Nubreed Global Truth. Stream every track, drop timed comments, and share the moment with other holders.",
    lyricsTimed: [{"t":0,"text":"Lights down low, the city's calling out my name"},{"t":4,"text":"Every note I wrote was a promise, not a game"},{"t":8,"text":"We built this from the ground, no shortcuts on the way"},{"t":12,"text":"Hold the moment close, let the rhythm have its say"},{"t":16,"text":"Run it back, run it back, let the bassline ride"},{"t":20,"text":"Everybody in the room got that fire inside"},{"t":24,"text":"This the kind of feeling that you cannot fake"},{"t":28,"text":"Every move we make is a move we make to elevate"},{"t":33,"text":"Started in the basement with a dollar and a dream"},{"t":38,"text":"Now the whole arena singin' every single theme"},{"t":43,"text":"They don't know the nights I spent just chasin' down the sound"},{"t":48,"text":"Turned the doubt to fuel and flipped the whole thing around"},{"t":53,"text":"Loyalty over everything, that's how we play"},{"t":58,"text":"Real ones stayed beside me when the skies were gray"},{"t":63,"text":"Count the wins, count the losses, all a part of growth"},{"t":68,"text":"Put my hand right on my heart and made it more than an oath"},{"t":73,"text":"Keep it movin', keep it honest, let the work speak loud"},{"t":78,"text":"Never needed validation from the passin' crowd"},{"t":83,"text":"When the lights hit different, I remember where I'm from"},{"t":88,"text":"Every beat a heartbeat of the people that I love"},{"t":94,"text":"So we run it up, run it up, never settle down"},{"t":100,"text":"Take the city on my back and never drop the crown"},{"t":106,"text":"This for everyone who told me I would never make it"},{"t":112,"text":"Took the vision in my head and found a way to shape it"},{"t":118,"text":"Hold the moment close, let the rhythm have its say"},{"t":124,"text":"Every move we make is a move we make to elevate"}],
    tracks: [
      { id: "demo-t1", title: "If You (Gunna x Future Type Beat)", trackNumber: 1, fileUrl: "https://cdn.shopify.com/s/files/1/0566/5367/6659/files/FREE_Gunna_x_Future_Type_Beat_2026_-_If_You.mp3?v=1780289598", likeCount: 12, likedByHolder: false }
    ]
  },
  {
    id: "demo-note",
    type: "Universal Exchange Note",
    title: "Founding Support Note",
    source: "Nubreed Global Truth",
    rarity: "Founding",
    value: "$45.00",
    date: "May 9, 2026",
    status: "Redeemable",
    description: "A Note received for supporting a launch campaign. It can unlock merchant value and remains part of the Holder's proof-of-support history."
  },
  {
    id: "demo-art",
    type: "Digital Download",
    title: "Infinite Love Artwork",
    source: "Digital Love Note",
    rarity: "Limited",
    value: "$25.00",
    date: "May 9, 2026",
    status: "Owned",
    description: "A digital keepsake attached to the campaign, housed with the Holder's Notes, badges, and unlock history."
  },
  {
    id: "demo-badge",
    type: "Achievement Badge",
    title: "Pay It Forward Supporter",
    source: "Community Campaign",
    rarity: "Earned",
    value: "$0.00",
    date: "May 9, 2026",
    status: "Visible",
    description: "A badge that proves the Holder supported a pay-it-forward campaign and can be shown as part of their goodwill profile."
  },
  {
    id: "demo-future",
    type: "Future Asset",
    title: "Trade Ready Collectible",
    source: "Future Vault Layer",
    rarity: "Potential",
    value: "$178.00",
    date: "Future",
    status: "Preview",
    description: "A preview of how select collection items could later support transfer, gifting, trading, or resale when enabled."
  }
];

type DemoComment = { id: string; body: string; timestampSeconds: number; holder: { firstName: string; lastName: string }; holderId?: string; isMine?: boolean };

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// A few seeded comments shown alongside real ones for social proof — when
// people see a track already has chatter, they're more likely to join in.
const SEED_COMMENTS: DemoComment[] = [
  { id: "seed-1", body: "This beat is COLD 🔥", timestampSeconds: 8, holder: { firstName: "Raquel", lastName: "H." } },
  { id: "seed-2", body: "Gunna would body this", timestampSeconds: 24, holder: { firstName: "Marcus", lastName: "T." } },
  { id: "seed-3", body: "The 808s are perfect 🙌", timestampSeconds: 47, holder: { firstName: "Aliyah", lastName: "W." } }
];

function AudioPlayerModal({ item, onClose, portalToken = "" }: { item: CollectionItem; onClose: () => void; portalToken?: string }) {
  const tracks = item.tracks ?? [];
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("off");
  const [artFlipped, setArtFlipped] = useState(false);
  const [liked, setLiked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(tracks.map((t) => [t.id, t.likedByHolder ?? false]))
  );
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(tracks.map((t) => [t.id, t.likeCount ?? 0]))
  );
  const [comments, setComments] = useState<DemoComment[]>(SEED_COMMENTS);
  const [commentInput, setCommentInput] = useState("");
  const [nearbyComment, setNearbyComment] = useState<DemoComment | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const fsLyricsRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");
  const hasLyrics = Boolean((item.lyricsTimed && item.lyricsTimed.length) || (item.lyrics ?? "").trim().length);
  const [panel, setPanel] = useState<"lyrics" | "queue" | "community">(hasLyrics ? "lyrics" : "queue");
  const [lyricsFs, setLyricsFs] = useState(false);
  // Dominant colors pulled from the artwork drive the whole immersive surface
  // (Spotify/Apple-Music style ambient color), with an emerald-brand fallback.
  const [palette, setPalette] = useState({ accent: "#34d399", bg1: "#11241a", bg2: "#070f0a", glow: "rgba(52,211,153,.5)" });
  const timedLyrics = item.lyricsTimed && item.lyricsTimed.length ? item.lyricsTimed : null;
  const lyricLines = timedLyrics ? timedLyrics.map((l) => l.text) : (item.lyrics ?? "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  // With real timestamps, highlight the last line whose start time has passed
  // (and nothing during the intro). Otherwise fall back to proportional scroll.
  const currentLine = (() => {
    if (timedLyrics) {
      let idx = -1;
      for (let i = 0; i < timedLyrics.length; i++) {
        if (currentTime >= timedLyrics[i].t) idx = i; else break;
      }
      return idx;
    }
    return duration > 0 && lyricLines.length ? Math.min(lyricLines.length - 1, Math.floor((currentTime / duration) * lyricLines.length)) : 0;
  })();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animRef = useRef<number>(0);
  const waveformReady = useRef(false);

  const track = tracks[trackIndex];

  // Deterministic waveform peaks per track — the bars are stable across renders
  // and seeks (a real song's waveform doesn't reshuffle). Seeded from the track
  // id so every track has its own distinct silhouette, SoundCloud-style.
  const BAR_COUNT = 72;
  const peaks = useMemo(() => {
    const seedStr = track?.id ?? "uen";
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
    const out: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      // Blend a couple of sines (musical "shape") with noise so it reads organic,
      // with a gentle fade-in/out at the ends like a real track envelope.
      const env = Math.sin((i / BAR_COUNT) * Math.PI);
      const body = 0.35 + 0.4 * Math.abs(Math.sin(i * 0.5 + seed * 0.0001)) + 0.3 * Math.abs(Math.sin(i * 0.17));
      out.push(Math.max(0.16, Math.min(1, body * (0.55 + 0.65 * env) * (0.7 + 0.6 * rand()))));
    }
    return out;
  }, [track?.id]);

  // Load real comments + like state for this track (signed-in supporters).
  // Real comments are merged below the seed comments; demo albums just 404 here
  // and keep the seeds.
  useEffect(() => {
    if (!portalToken || !track) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/holder/digital-products/${track.id}/comments?token=${encodeURIComponent(portalToken)}`);
        if (res.ok) {
          const real = (await res.json()) as DemoComment[];
          if (!cancelled) setComments([...SEED_COMMENTS, ...real].sort((a, b) => a.timestampSeconds - b.timestampSeconds));
        }
      } catch { /* keep seeds */ }
      try {
        const pres = await fetch(`/api/holder/digital-products/${item.id}?token=${encodeURIComponent(portalToken)}`);
        if (pres.ok) {
          const product = await pres.json();
          const t = (product.tracks ?? []).find((x: { id: string }) => x.id === track.id);
          if (t && !cancelled) {
            setLikeCounts((prev) => ({ ...prev, [track.id]: t.likeCount ?? 0 }));
            setLiked((prev) => ({ ...prev, [track.id]: Boolean(t.likedByHolder) }));
          }
        }
      } catch { /* keep defaults */ }
    })();
    return () => { cancelled = true; };
  }, [portalToken, track?.id, item.id]);

  // Auto-scroll lyrics so the current line stays centered as the song plays.
  // Scroll the specific container's own scrollTop (NOT scrollIntoView, which on
  // mobile can scroll the whole page) and target the line *inside that container*
  // — there are two lyric copies in the DOM when fullscreen is open, so a global
  // querySelector would grab the hidden panel copy and the overlay would never move.
  useEffect(() => {
    if (panel !== "lyrics" && !lyricsFs) return;
    const container = lyricsFs ? fsLyricsRef.current : lyricsRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`.np-lyric-line[data-line="${currentLine}"]`);
    if (!el) return;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const delta = (eRect.top - cRect.top) - (container.clientHeight / 2 - eRect.height / 2);
    container.scrollBy({ top: delta, behavior: "smooth" });
  }, [currentLine, panel, lyricsFs]);

  // Pull the dominant + most-vivid colors out of the artwork so the whole
  // player glows in the album's own palette. Falls back to emerald if the
  // image taints the canvas (cross-origin) or fails to load.
  useEffect(() => {
    if (!item.artworkUrl) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const S = 28;
        const c = document.createElement("canvas");
        c.width = S; c.height = S;
        const cx = c.getContext("2d");
        if (!cx) return;
        cx.drawImage(img, 0, 0, S, S);
        const d = cx.getImageData(0, 0, S, S).data;
        let vr = 0, vg = 0, vb = 0, vBest = -1; // most vivid (saturation*brightness)
        let ar = 0, ag = 0, ab = 0, n = 0;       // running average for the backdrop
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          ar += r; ag += g; ab += b; n++;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const sat = mx === 0 ? 0 : (mx - mn) / mx;
          const score = sat * (mx / 255) * (mx > 40 ? 1 : 0.2);
          if (score > vBest) { vBest = score; vr = r; vg = g; vb = b; }
        }
        ar = ar / n; ag = ag / n; ab = ab / n;
        const accent = `rgb(${vr},${vg},${vb})`;
        const dark = (r: number, g: number, b: number, f: number) => `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
        if (!cancelled) setPalette({
          accent,
          bg1: dark(vr * 0.5 + ar * 0.5, vg * 0.5 + ag * 0.5, vb * 0.5 + ab * 0.5, 0.42),
          bg2: dark(ar, ag, ab, 0.12),
          glow: `rgba(${vr},${vg},${vb},.55)`,
        });
      } catch { /* tainted canvas — keep emerald fallback */ }
    };
    img.src = item.artworkUrl;
    return () => { cancelled = true; };
  }, [item.artworkUrl]);

  const initAudioContext = useCallback(() => {
    if (!audioRef.current || waveformReady.current) return;
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;
      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
      waveformReady.current = true;
    } catch {
      // CORS or context error — waveform degrades gracefully
    }
  }, []);

  // SoundCloud-style waveform that IS the scrubber: the played portion is lit
  // emerald, the rest is muted, and bars near the playhead breathe with the
  // live audio energy while playing. Reads the clock straight off the <audio>
  // element so the playhead stays smooth between React state ticks.
  const drawWaveform = useCallback((active: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const gap = Math.max(2, W / BAR_COUNT * 0.34);
    const barW = (W - gap * (BAR_COUNT - 1)) / BAR_COUNT;
    const centerY = H / 2;

    let freq: Uint8Array<ArrayBuffer> | null = null;
    if (active && analyserRef.current) {
      freq = new Uint8Array(analyserRef.current.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      analyserRef.current.getByteFrequencyData(freq);
    }
    const el = audioRef.current;
    const dur = el && el.duration && isFinite(el.duration) ? el.duration : 0;
    const playRatio = dur ? el!.currentTime / dur : 0;

    for (let i = 0; i < BAR_COUNT; i++) {
      const base = peaks[i] ?? 0.3;
      let amp = base;
      if (freq) {
        const fi = Math.floor((i / BAR_COUNT) * freq.length);
        const energy = (freq[fi] ?? 0) / 255;
        const near = 1 - Math.min(1, Math.abs(i / BAR_COUNT - playRatio) * 5);
        amp = base * (1 + energy * 0.55 * Math.max(0, near));
      }
      const barH = Math.max(2, Math.min(H * 0.48, amp * (H * 0.46)));
      const x = i * (barW + gap);
      const played = (i + 0.5) / BAR_COUNT <= playRatio;

      if (played) {
        const grad = ctx.createLinearGradient(0, centerY - barH, 0, centerY + barH);
        grad.addColorStop(0, "#a8f5d0");
        grad.addColorStop(0.5, "#34d399");
        grad.addColorStop(1, "#178f5f");
        ctx.fillStyle = grad;
        ctx.shadowBlur = active ? 8 : 3;
        ctx.shadowColor = "rgba(52,211,153,.5)";
      } else {
        ctx.fillStyle = "rgba(150,185,170,.20)";
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.roundRect(x, centerY - barH, barW, barH * 2, Math.min(barW / 2, 3));
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (active) animRef.current = requestAnimationFrame(() => drawWaveform(true));
  }, [peaks]);

  useEffect(() => {
    if (playing) {
      animRef.current = requestAnimationFrame(() => drawWaveform(true));
      return () => cancelAnimationFrame(animRef.current);
    }
    cancelAnimationFrame(animRef.current);
    drawWaveform(false);
  }, [playing, drawWaveform]);

  // Repaint the played/unplayed split as the clock advances or after a seek
  // (the RAF loop covers the playing case; this keeps paused state in sync).
  useEffect(() => {
    if (!playing) drawWaveform(false);
  }, [currentTime, playing, drawWaveform]);

  // Find nearest comment as time progresses
  useEffect(() => {
    const nearby = comments
      .filter((c) => c.timestampSeconds <= currentTime + 2 && c.timestampSeconds >= currentTime - 1)
      .sort((a, b) => Math.abs(a.timestampSeconds - currentTime) - Math.abs(b.timestampSeconds - currentTime))[0] ?? null;
    setNearbyComment(nearby);
  }, [currentTime, comments]);

  const togglePlay = async () => {
    if (!audioRef.current) return;
    if (audioCtxRef.current?.state === "suspended") await audioCtxRef.current.resume();
    if (playing) {
      audioRef.current.pause();
    } else {
      initAudioContext();
      await audioRef.current.play().catch(() => {});
    }
    setPlaying(!playing);
  };

  // Scrub by clicking/dragging anywhere on the waveform — works for mouse AND
  // touch (pointer events). The whole waveform is the scrubber, SoundCloud-style.
  const seekToClientX = (clientX: number) => {
    const el = progressRef.current;
    if (!el || !audioRef.current || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audioRef.current.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  };
  const onProgressPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    seekToClientX(e.clientX);
    const move = (ev: PointerEvent) => seekToClientX(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Where "next" goes depends on shuffle/repeat — used by the button AND by
  // onEnded so auto-advance and manual skip behave identically.
  const goToNext = (auto: boolean) => {
    if (tracks.length <= 1) {
      if (auto && repeat !== "off" && audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); }
      return;
    }
    if (shuffle) {
      let n = trackIndex;
      while (n === trackIndex) n = Math.floor(Math.random() * tracks.length);
      changeTrack(n, true);
      return;
    }
    if (trackIndex < tracks.length - 1) changeTrack(trackIndex + 1, true);
    else if (repeat === "all") changeTrack(0, true);
    else setPlaying(false);
  };
  const goToPrev = () => {
    // Restart the track if we're past the 3s mark, otherwise step back.
    if (audioRef.current && audioRef.current.currentTime > 3) { audioRef.current.currentTime = 0; setCurrentTime(0); return; }
    changeTrack(Math.max(0, trackIndex - 1), playing);
  };

  const deleteComment = async (c: DemoComment) => {
    setComments((prev) => prev.filter((x) => x.id !== c.id));
    if (portalToken && !c.id.startsWith("local-") && !c.id.startsWith("seed-")) {
      try { await fetch(`/api/holder/digital-products/comments/${c.id}?token=${encodeURIComponent(portalToken)}`, { method: "DELETE" }); } catch { /* already removed locally */ }
    }
  };
  const saveEdit = async (c: DemoComment) => {
    const body = editInput.trim();
    if (!body) return;
    setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, body } : x)));
    setEditingId(null);
    if (portalToken && !c.id.startsWith("local-") && !c.id.startsWith("seed-")) {
      try {
        await fetch(`/api/holder/digital-products/comments/${c.id}?token=${encodeURIComponent(portalToken)}`, {
          method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ body })
        });
      } catch { /* kept local edit */ }
    }
  };

  const autoplayRef = useRef(false);
  const changeTrack = (index: number, autoplay = false) => {
    cancelAnimationFrame(animRef.current);
    autoplayRef.current = autoplay;
    setTrackIndex(index);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    waveformReady.current = false;
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
    }
    drawWaveform(false);
  };

  const toggleLike = async (trackId: string) => {
    if (portalToken) {
      try {
        const res = await fetch(`/api/holder/digital-products/${trackId}/like?token=${encodeURIComponent(portalToken)}`, { method: "POST" });
        const data = await res.json();
        setLiked((prev) => ({ ...prev, [trackId]: data.liked }));
        setLikeCounts((prev) => ({ ...prev, [trackId]: (prev[trackId] ?? 0) + (data.liked ? 1 : -1) }));
      } catch { /* ignore */ }
    } else {
      // Demo toggle
      const next = !liked[trackId];
      setLiked((prev) => ({ ...prev, [trackId]: next }));
      setLikeCounts((prev) => ({ ...prev, [trackId]: (prev[trackId] ?? 0) + (next ? 1 : -1) }));
    }
  };

  const postComment = async () => {
    if (!commentInput.trim() || !track) return;
    const ts = Math.floor(currentTime);
    const body = commentInput.trim();
    setCommentInput("");
    const byTs = (a: DemoComment, b: DemoComment) => a.timestampSeconds - b.timestampSeconds;
    if (portalToken) {
      try {
        const res = await fetch(`/api/holder/digital-products/${track.id}/comments?token=${encodeURIComponent(portalToken)}`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ body, timestampSeconds: ts })
        });
        if (res.ok) {
          const c = await res.json();
          // Only accept a well-formed comment — never append an error payload.
          if (c && typeof c.body === "string") {
            setComments((prev) => [...prev, c].sort(byTs));
            return;
          }
        }
      } catch { /* fall through to optimistic local */ }
    }
    // Fallback (demo, or save failed): show it locally so it never breaks.
    setComments((prev) => [...prev, { id: `local-${Date.now()}`, body, timestampSeconds: ts, holder: { firstName: "You", lastName: "" } }].sort(byTs));
  };

  const volIcon = volume === 0 ? <VolumeX size={18} /> : volume < 0.5 ? <Volume1 size={18} /> : <Volume2 size={18} />;
  const curLiked = track ? liked[track.id] : false;

  const paletteVars = {
    ["--np-accent" as string]: palette.accent,
    ["--np-bg1" as string]: palette.bg1,
    ["--np-bg2" as string]: palette.bg2,
    ["--np-glow" as string]: palette.glow,
  } as React.CSSProperties;

  const lyricBody = (fs: boolean) => (
    <div className={fs ? "np-lyrics np-lyrics-fs" : "np-lyrics"} ref={fs ? fsLyricsRef : lyricsRef}>
      {lyricLines.map((line, i) => (
        <p key={i} data-line={i} className={`np-lyric-line${i === currentLine ? " active" : ""}${i < currentLine ? " past" : ""}`}
          onClick={() => { if (audioRef.current) audioRef.current.currentTime = timedLyrics ? timedLyrics[i].t : (duration ? (i / lyricLines.length) * duration : 0); }}>
          {line || "♪"}
        </p>
      ))}
    </div>
  );

  return (
    <div className="player-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="player-modal np-immersive" style={paletteVars}>
        {/* Immersive album-color backdrop */}
        {item.artworkUrl && <div className="player-bg-blur" style={{ backgroundImage: `url(${item.artworkUrl})` }} />}
        <div className="np-mesh" />
        <div className="player-bg-dark" />
        <div className="np-grain" />

        {/* Top bar */}
        <div className="player-topbar">
          <span className="player-eyebrow"><span className={`player-eq ${playing ? "on" : ""}`}><i /><i /><i /></span>Now playing</span>
          <button className="player-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="player-layout">
          {/* LEFT — Hero artwork + transport */}
          <div className="player-left">
            {/* Artwork is the hero + flip card (front = art, back = asset details) */}
            <div className={`np-art-flip${artFlipped ? " flipped" : ""}`}>
              <div className="np-art-inner">
                <div className="np-art-face np-art-front">
                  {item.artworkUrl
                    ? <img className="np-art-img" src={item.artworkUrl} alt={item.title} />
                    : <div className="np-art-img np-art-placeholder"><Music size={72} /></div>}
                  <div className={`np-art-shine${playing ? " on" : ""}`} />
                  <button className="np-art-play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                    {playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" style={{ marginLeft: 4 }} />}
                  </button>
                  <button className="np-art-flipbtn" onClick={() => setArtFlipped(true)} aria-label="Asset details">
                    <Star size={13} /> Asset
                  </button>
                </div>
                <div className="np-art-face np-art-back">
                  <span className="np-art-back-kicker"><Star size={13} /> Asset Details</span>
                  <dl className="np-art-dl">
                    <div><dt>Exchange Hub</dt><dd>{item.source}</dd></div>
                    <div><dt>Received</dt><dd>{item.date}</dd></div>
                    <div><dt>Rarity</dt><dd>{item.rarity}</dd></div>
                    <div><dt>Status</dt><dd>{item.status}</dd></div>
                    <div><dt>Est. value</dt><dd>{item.value}</dd></div>
                  </dl>
                  {item.tradable === false
                    ? <span className="np-art-keepsake">Keepsake — yours to treasure, not to trade</span>
                    : <button className="np-art-trade" onClick={() => setArtFlipped(false)}><Tag size={14} /> Trade / Sell <span className="asset-soon">Soon</span></button>}
                  <button className="np-art-flipback" onClick={() => setArtFlipped(false)}><RefreshCw size={13} /> Back to artwork</button>
                </div>
              </div>
            </div>

            <div className="player-album-info">
              <h2 className="player-album-title">{track?.title ?? item.title}</h2>
              <p className="player-album-artist">{item.artist ?? item.source}</p>
              <p className="player-album-meta">{item.title} · {tracks.length} track{tracks.length !== 1 ? "s" : ""}</p>
            </div>

            {/* Waveform IS the scrubber */}
            <div className="player-waveform-wrap" ref={progressRef} onPointerDown={onProgressPointerDown}>
              <canvas ref={canvasRef} className="player-waveform" width={560} height={120} />
              {comments.map((c) => (
                <span key={c.id} className="player-wave-marker"
                  style={{ left: `${duration > 0 ? Math.min(99, (c.timestampSeconds / duration) * 100) : 0}%` }}
                  title={`${formatTime(c.timestampSeconds)} · ${c.holder?.firstName}: ${c.body}`}
                  onPointerDown={(e) => { e.stopPropagation(); if (audioRef.current) { audioRef.current.currentTime = c.timestampSeconds; setCurrentTime(c.timestampSeconds); } }} />
              ))}
            </div>
            <div className="player-progress-times">
              <span className="player-time">{formatTime(currentTime)}</span>
              <span className="player-time">-{formatTime(Math.max(0, duration - currentTime))}</span>
            </div>

            {/* Transport */}
            <div className="player-controls">
              <button className={`player-ctrl-btn ${shuffle ? "on" : ""}`} onClick={() => setShuffle((s) => !s)} aria-label="Shuffle" title="Shuffle">
                <Shuffle size={17} />
              </button>
              <button className="player-ctrl-btn" onClick={goToPrev} aria-label="Previous">
                <SkipBack size={20} fill="currentColor" />
              </button>
              <button className="player-play-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />}
              </button>
              <button className="player-ctrl-btn" onClick={() => goToNext(false)} aria-label="Next">
                <SkipForward size={20} fill="currentColor" />
              </button>
              <button className={`player-ctrl-btn ${repeat !== "off" ? "on" : ""}`}
                onClick={() => setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"))}
                aria-label="Repeat" title={`Repeat: ${repeat}`}>
                {repeat === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
              </button>
            </div>

            {/* Secondary row: like + volume */}
            <div className="player-subrow">
              <button className={`player-heart ${curLiked ? "liked" : ""}`} onClick={() => track && toggleLike(track.id)} aria-label="Like">
                <Heart size={16} fill={curLiked ? "currentColor" : "none"} />
                <span>{track ? (likeCounts[track.id] ?? 0) : 0}</span>
              </button>
              <div className="player-vol-group">
                <button className="player-vol-icon" onClick={() => { const v = volume === 0 ? 0.85 : 0; setVolume(v); if (audioRef.current) audioRef.current.volume = v; }} aria-label="Mute">{volIcon}</button>
                <input className="player-volume" type="range" min={0} max={1} step={0.02} value={volume}
                  style={{ ["--vol" as string]: `${volume * 100}%` }}
                  onChange={(e) => { setVolume(Number(e.target.value)); if (audioRef.current) audioRef.current.volume = Number(e.target.value); }} />
              </div>
            </div>
          </div>

          {/* RIGHT — glass panel: Lyrics / Up Next / Community */}
          <div className="player-right">
            <div className="np-seg">
              {hasLyrics && (
                <button className={panel === "lyrics" ? "active" : ""} onClick={() => setPanel("lyrics")}><Music size={14} /> Lyrics</button>
              )}
              <button className={panel === "queue" ? "active" : ""} onClick={() => setPanel("queue")}><Menu size={14} /> Up Next</button>
              <button className={panel === "community" ? "active" : ""} onClick={() => setPanel("community")}><MessageCircle size={14} /> Community</button>
            </div>

            {panel === "lyrics" && hasLyrics && (
              <div className="np-panel-body np-lyrics-wrap">
                <button className="np-lyrics-expand" onClick={() => setLyricsFs(true)} title="Fullscreen lyrics"><Eye size={13} /> Immersive</button>
                {lyricBody(false)}
              </div>
            )}

            {panel === "queue" && (
              <div className="np-panel-body player-tracklist">
                {tracks.map((t, i) => (
                  <div key={t.id} role="button" tabIndex={0} className={`player-track-row ${i === trackIndex ? "active" : ""}`}
                    onClick={() => changeTrack(i, true)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); changeTrack(i, true); } }}>
                    <span className="player-track-num">
                      {i === trackIndex && playing ? <span className="player-eq on small"><i /><i /><i /></span> : <span className="player-track-no">{t.trackNumber}</span>}
                      <Play className="player-track-hoverplay" size={13} fill="currentColor" />
                    </span>
                    <span className="player-track-title">{t.title}</span>
                    <div className="player-track-actions">
                      <button className={`player-like-btn ${liked[t.id] ? "liked" : ""}`}
                        onClick={(e) => { e.stopPropagation(); toggleLike(t.id); }} aria-label="Like track">
                        <Heart size={13} fill={liked[t.id] ? "currentColor" : "none"} /> {likeCounts[t.id] ?? 0}
                      </button>
                      {t.durationSeconds && <span className="player-track-dur">{formatTime(t.durationSeconds)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {panel === "community" && (
              <div className="np-panel-body player-comments">
                <div className="player-comments-list">
                  {comments.map((c) => (
                    <div key={c.id} className={`player-comment-item ${nearbyComment?.id === c.id ? "highlight" : ""}`}>
                      <button className="player-comment-ts" onClick={() => { if (audioRef.current) audioRef.current.currentTime = c.timestampSeconds; }}>
                        {formatTime(c.timestampSeconds)}
                      </button>
                      <div className="player-comment-body">
                        <strong>{c.holder?.firstName} {c.holder?.lastName}</strong>
                        {editingId === c.id ? (
                          <div className="player-comment-edit">
                            <input value={editInput} autoFocus onChange={(e) => setEditInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(c); if (e.key === "Escape") setEditingId(null); }} />
                            <button onClick={() => saveEdit(c)}>Save</button>
                            <button className="ghost" onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <span>{c.body}</span>
                        )}
                      </div>
                      {c.isMine && editingId !== c.id && (
                        <div className="player-comment-actions">
                          <button onClick={() => { setEditingId(c.id); setEditInput(c.body); }} aria-label="Edit comment"><Pencil size={13} /></button>
                          <button onClick={() => deleteComment(c)} aria-label="Delete comment"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="player-comment-input-row">
                  <input
                    className="player-comment-input"
                    placeholder={`Comment at ${formatTime(Math.floor(currentTime))}…`}
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") postComment(); }}
                  />
                  <button className="player-comment-submit" onClick={postComment} disabled={!commentInput.trim()} aria-label="Post comment"><Send size={15} /></button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Immersive fullscreen lyrics overlay */}
        {lyricsFs && (
          <div className="np-fs" style={paletteVars}>
            {item.artworkUrl && <div className="player-bg-blur" style={{ backgroundImage: `url(${item.artworkUrl})` }} />}
            <div className="np-mesh" />
            <div className="player-bg-dark" />
            <div className="np-fs-head">
              <div className="np-fs-now">
                {item.artworkUrl && <img src={item.artworkUrl} alt="" />}
                <div>
                  <strong>{track?.title ?? item.title}</strong>
                  <span>{item.artist ?? item.source}</span>
                </div>
              </div>
              <button className="player-close" onClick={() => setLyricsFs(false)} aria-label="Close lyrics"><X size={18} /></button>
            </div>
            {lyricBody(true)}
            <div className="np-fs-foot">
              <button className="player-ctrl-btn" onClick={goToPrev} aria-label="Previous"><SkipBack size={20} fill="currentColor" /></button>
              <button className="player-play-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />}
              </button>
              <button className="player-ctrl-btn" onClick={() => goToNext(false)} aria-label="Next"><SkipForward size={20} fill="currentColor" /></button>
            </div>
          </div>
        )}

        {/* Hidden audio element */}
        {track && (
          <audio
            ref={audioRef}
            src={track.fileUrl}
            crossOrigin="anonymous"
            preload="metadata"
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
            onLoadedMetadata={() => {
              setDuration(audioRef.current?.duration ?? 0);
              if (audioRef.current) audioRef.current.volume = volume;
              if (autoplayRef.current) {
                autoplayRef.current = false;
                initAudioContext();
                audioRef.current?.play().then(() => setPlaying(true)).catch(() => {});
              }
            }}
            onEnded={() => {
              if (repeat === "one" && audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); return; }
              goToNext(true);
            }}
          />
        )}
      </div>
    </div>
  );
}

function HolderCollectionExperience({ holderName = "Holder", items = demoCollectionItems, portalToken = "" }: { holderName?: string; items?: CollectionItem[]; portalToken?: string }) {
  const [opened, setOpened] = useState(false);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [openAlbum, setOpenAlbum] = useState<CollectionItem | null>(null);
  const [openImage, setOpenImage] = useState<CollectionItem | null>(null);
  const [openDetail, setOpenDetail] = useState<CollectionItem | null>(null);

  const isAlbum = (i: CollectionItem) => i.assetType === "ALBUM";
  const isBadge = (i: CollectionItem) => i.type.includes("Badge") || i.type.includes("Achievement");
  const isFuture = (i: CollectionItem) => i.type.includes("Future");
  const isDownload = (i: CollectionItem) => (Boolean(i.imageUrl) || i.type.includes("Download")) && !isAlbum(i);
  const isNote = (i: CollectionItem) => i.type.includes("Note") && !isAlbum(i);
  const categories: { key: string; label: string; icon: React.ReactNode; test: (i: CollectionItem) => boolean }[] = [
    { key: "Album", label: "Music", icon: <Play size={14} />, test: isAlbum },
    { key: "Download", label: "Downloads", icon: <Download size={14} />, test: isDownload },
    { key: "Note", label: "Notes", icon: <Ticket size={14} />, test: isNote },
    { key: "Badge", label: "Badges", icon: <Star size={14} />, test: isBadge },
    { key: "Future", label: "Future", icon: <Zap size={14} />, test: isFuture }
  ];
  const counts: Record<string, number> = Object.fromEntries(categories.map((c) => [c.key, items.filter(c.test).length]));
  const present = categories.filter((c) => counts[c.key] > 0);
  const totalValue = items.reduce((sum, item) => sum + (Number(item.value.replace(/[^0-9.]/g, "")) || 0), 0);

  const matches = (item: CollectionItem) => {
    if (filter !== "All") {
      const cat = categories.find((c) => c.key === filter);
      if (cat && !cat.test(item)) return false;
    }
    const hay = `${item.title} ${item.type} ${item.source} ${item.rarity} ${item.status}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  };
  const filtered = items.filter(matches);

  // One tap opens the right experience: album player, image viewer, or details.
  const open = (item: CollectionItem) => {
    if (isAlbum(item) && item.tracks?.length) { setOpenAlbum(item); return; }
    if (item.imageUrl) { setOpenImage(item); return; }
    setOpenDetail(item);
  };
  if (!opened) {
    return (
      <section className="collection-experience">
        <div className="vault-cover">
          <span className="eyebrow"><Wallet size={16} /> Holder Collection</span>
          <h1>{holderName}'s Support Vault</h1>
          <p>Your notes, music, downloads and badges all live here — proof of what you supported and the value it unlocked.</p>
          <div className="vault-breakdown">
            {present.length > 0
              ? present.map((c) => <span key={c.key} className="vault-chip">{c.icon} {counts[c.key]} {c.label}</span>)
              : <span className="vault-chip">Your collection is waiting</span>}
          </div>
          <div className="vault-meta">
            {items.length} item{items.length !== 1 ? "s" : ""}{totalValue > 0 ? <> · <strong>${totalValue.toFixed(2)}</strong> in value</> : null}
          </div>
          <button className="vault-open-btn" onClick={() => setOpened(true)}>Open My Collection <span aria-hidden="true">→</span></button>
        </div>
      </section>
    );
  }

  return (
    <section className="collection-experience">
      <div className="collection-open">
        <div className="collection-open-head">
          <button className="collection-back" onClick={() => setOpened(false)}>← Overview</button>
          <h2>{holderName}'s Collection</h2>
          <label className="collection-search collection-search-open">
            <Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your collection..." />
          </label>
        </div>
        <div className="collection-cat-tabs">
          <button className={filter === "All" ? "active" : ""} onClick={() => setFilter("All")}>All <em>{items.length}</em></button>
          {present.map((c) => (
            <button key={c.key} className={filter === c.key ? "active" : ""} onClick={() => setFilter(c.key)}>{c.icon} {c.label} <em>{counts[c.key]}</em></button>
          ))}
        </div>
        <div className="collection-inventory">
          {filtered.map((item) => {
            const typeLabel = item.type;

            // ── Rich visual tile for items with artwork ──
            if (item.artworkUrl && item.assetType === "ALBUM") {
              return (
                <div key={item.id} className={`tile-album-frame`}>
                  <button className={`collection-tile-album`} onClick={() => open(item)}>
                    <img className="tile-art-img" src={item.artworkUrl} alt="" aria-hidden="true" />
                    <div className="tile-art-overlay" />
                    {/* Glass dome — static corner glints + silver film */}
                    <div className="tile-glass-dome" />
                    <div className="tile-glass-top-edge" />
                    {/* Sweeping shimmer — light crossing the glass face */}
                    <div className="tile-glass-shimmer" />
                    <div className="tile-vinyl-wrap">
                      <div className="tile-vinyl">
                        <div className="tile-vinyl-label" style={{ backgroundImage: `url(${item.artworkUrl})` }} />
                        <div className="tile-vinyl-ring tile-vinyl-ring-1" />
                        <div className="tile-vinyl-ring tile-vinyl-ring-2" />
                        <div className="tile-vinyl-ring tile-vinyl-ring-3" />
                        <div className="tile-vinyl-hole" />
                      </div>
                    </div>
                    <div className="tile-art-info">
                      <span className="tile-art-type">{typeLabel}</span>
                      <strong className="tile-art-title">{item.title}</strong>
                      <small className="tile-art-meta">{item.tracks?.length ?? 0} tracks · {item.value}</small>
                    </div>
                  </button>
                </div>
              );
            }

            // ── Image collectible tile (e.g. the digital Love Note) ──
            if (item.imageUrl) {
              return (
                <button key={item.id} className={`collection-tile-art`} onClick={() => open(item)}>
                  <img className="tile-art-img" src={item.imageUrl} alt={item.title} />
                  <div className="tile-art-overlay" />
                  <div className="tile-glass-shimmer" />
                  <div className="tile-art-info">
                    <span className="tile-art-type">{typeLabel}</span>
                    <strong className="tile-art-title">{item.title}</strong>
                    <small className="tile-art-meta">{item.rarity} · Tap to view</small>
                  </div>
                </button>
              );
            }

            // ── Badge tile — PS4/PS5 style achievement ──
            if (item.type.includes("Badge") || item.type.includes("Achievement")) {
              return (
                <button key={item.id} className={`collection-tile-badge`} onClick={() => open(item)}>
                  {item.artworkUrl ? (
                    // Exchange Hub custom artwork
                    <img className="tile-art-img" src={item.artworkUrl} alt="" aria-hidden="true" />
                  ) : (
                    // Default — premium achievement visual
                    <>
                      <div className="badge-bg-atmos" />
                      <div className="badge-rays" />
                      <div className="badge-medal-wrap">
                        <div className="badge-medal">
                          <div className="badge-medal-inner" />
                          <div className="badge-medal-shine" />
                          <div className="badge-medal-icon">
                            <span className="badge-heart-symbol">♥</span>
                          </div>
                          <div className="badge-sparkle badge-sparkle-1">✦</div>
                          <div className="badge-sparkle badge-sparkle-2">✦</div>
                        </div>
                        <div className="badge-medal-glow" />
                        <div className="badge-medal-glow badge-medal-glow-2" />
                      </div>
                    </>
                  )}
                  <div className="badge-info-bar">
                    <span className="badge-type-tag">{typeLabel}</span>
                    <strong className="badge-title-text">{item.title}</strong>
                    <small className="badge-meta-text">{item.rarity} · {item.value}</small>
                  </div>
                </button>
              );
            }

            // ── Future asset tile ──
            if (item.type.includes("Future")) {
              return (
                <button key={item.id} className={`collection-tile collection-tile-future`} onClick={() => open(item)}>
                  <div className="tile-orb" />
                  <span>{typeLabel}</span>
                  <strong>{item.title}</strong>
                  <small>{item.rarity} · {item.value}</small>
                </button>
              );
            }

            // ── UEN note tile ──
            if (item.type.includes("Note")) {
              return (
                <button key={item.id} className={`collection-tile collection-tile-note`} onClick={() => open(item)}>
                  <div className="tile-uen-chip">
                    <span>UEN</span>
                  </div>
                  <span>{typeLabel}</span>
                  <strong>{item.title}</strong>
                  <small>{item.rarity} · {item.value}</small>
                </button>
              );
            }

            // ── Default tile ──
            return (
              <button key={item.id} className={`collection-tile`} onClick={() => open(item)}>
                <span>{typeLabel}</span>
                <strong>{item.title}</strong>
                <small>{item.rarity} / {item.value}</small>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="collection-empty">
              <Search size={26} />
              <strong>No collection items found</strong>
              <span>Clear the search or switch filters to see more items.</span>
            </div>
          )}
        </div>
      </div>
      {openAlbum && <AudioPlayerModal item={openAlbum} onClose={() => setOpenAlbum(null)} portalToken={portalToken} />}
      {openImage && <CollectibleViewer item={openImage} onClose={() => setOpenImage(null)} />}
      {openDetail && <GenericDetailModal item={openDetail} onClose={() => setOpenDetail(null)} />}
    </section>
  );
}

// Detail modal for non-media collectibles (notes, badges, future assets).
// Reusable asset details: the stat grid + a trade/sell affordance. Shown in
// every open-asset view so the stats and the (coming-soon) trade button are
// consistent. Keepsakes (tradable === false) show a "not tradable" note instead.
function AssetMeta({ item }: { item: CollectionItem }) {
  const [flipped, setFlipped] = useState(false);
  const [soon, setSoon] = useState(false);
  const keepsake = item.tradable === false;
  return (
    <div className={`asset-flip${flipped ? " flipped" : ""}`}>
      <div className="asset-flip-inner">
        {/* FRONT — tappable button that flips to the details */}
        <button
          type="button"
          className="asset-flip-face asset-flip-front"
          onClick={() => setFlipped(true)}
          aria-hidden={flipped}
          tabIndex={flipped ? -1 : 0}
        >
          <span className="asset-flip-front-icon"><Star size={18} /></span>
          <span className="asset-flip-front-text">
            <strong>Asset Details</strong>
            <em>{keepsake ? "Keepsake · tap to view" : "Stats · trade · sell"}</em>
          </span>
          <span className="asset-flip-cue">Flip <RefreshCw size={13} /></span>
        </button>

        {/* BACK — the stat grid + trade/sell (or keepsake) + flip back */}
        <div className="asset-flip-face asset-flip-back" aria-hidden={!flipped}>
          <dl className="collection-detail-dl">
            <div><dt>Exchange Hub</dt><dd>{item.source}</dd></div>
            <div><dt>Received</dt><dd>{item.date}</dd></div>
            <div><dt>Rarity</dt><dd>{item.rarity}</dd></div>
            <div><dt>Status</dt><dd>{item.status}</dd></div>
            <div><dt>Value</dt><dd>{item.value}</dd></div>
          </dl>
          {keepsake ? (
            <span className="asset-keepsake">Keepsake — yours to treasure, not to trade</span>
          ) : (
            <div className="asset-trade-row">
              <button type="button" className="asset-trade-btn" onClick={() => setSoon(true)} tabIndex={flipped ? 0 : -1}>
                <Tag size={15} /> Trade / Sell <span className="asset-soon">Coming soon</span>
              </button>
              {soon && <p className="asset-meta-msg">Trading &amp; selling assets between holders is coming soon.</p>}
            </div>
          )}
          <button type="button" className="asset-flip-back-btn" onClick={() => setFlipped(false)} tabIndex={flipped ? 0 : -1}>
            <RefreshCw size={13} /> Flip back
          </button>
        </div>
      </div>
    </div>
  );
}

function GenericDetailModal({ item, onClose }: { item: CollectionItem; onClose: () => void }) {
  return (
    <div className="ln-viewer-backdrop" onClick={onClose}>
      <div className="ln-viewer" onClick={(e) => e.stopPropagation()}>
        <button className="ln-viewer-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        <div className="ln-viewer-meta" style={{ paddingTop: 46 }}>
          <span className="ln-viewer-kicker">{item.source} · {item.rarity}</span>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          <AssetMeta item={item} />
        </div>
      </div>
    </div>
  );
}

// Lightbox for image collectibles (the digital Love Note): displays the art
// large and offers a real download (blob fetch, with a new-tab fallback).
function CollectibleViewer({ item, onClose }: { item: CollectionItem; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    const url = item.downloadUrl ?? item.imageUrl;
    if (!url) return;
    setDownloading(true);
    try {
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = item.downloadName ?? "love-note.gif";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    } catch {
      window.open(url, "_blank", "noopener");
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="ln-viewer-backdrop" onClick={onClose}>
      <div className="ln-viewer" onClick={(e) => e.stopPropagation()}>
        <button className="ln-viewer-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        <div className="ln-viewer-stage">
          <img src={item.imageUrl} alt={item.title} />
        </div>
        <div className="ln-viewer-meta">
          <span className="ln-viewer-kicker">{item.source} · {item.rarity}</span>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          <div className="ln-viewer-actions">
            <button className="ln-viewer-download" onClick={download} disabled={downloading}>
              <Download size={16} /> {downloading ? "Preparing…" : "Download"}
            </button>
          </div>
          <AssetMeta item={item} />
        </div>
      </div>
    </div>
  );
}

function HolderCollectionDemo() {
  return (
    <main className="collection-demo-page">
      <UeniteNav
        className="about-nav"
        links={[
          { href: "/", label: "Home" },
          { href: "/about", label: "About" },
          { href: "/signup", label: "Get Started", cta: true },
        ]}
      />
      <HolderCollectionExperience holderName="Raquel" />
      <PoweredByFooter />
    </main>
  );
}

function DemoHolderPortal() {
  const [activeTab, setActiveTab] = useState<"collection" | "wallet" | "merchants">("collection");
  const [notifOpen, setNotifOpen] = useState(false);
  const demoCodes = [
    { id: "code-1", code: "NUBREED9827391UEN", status: "ACTIVE", merchants: "3 synced stores" },
    { id: "code-2", code: "LOVE70402UEN", status: "ACTIVE", merchants: "1 synced store" },
    { id: "code-3", code: "PAYIT2026UEN", status: "GRACE_PERIOD", merchants: "Pending merchant access" }
  ];
  const demoMerchants = [
    { id: "merchant-1", businessName: "Nubreed Global Truth", offer: "15% off", availableUens: 2, redeemedUens: 1, shopUrl: "https://nubreed-love.myshopify.com" },
    { id: "merchant-2", businessName: "Infinite Love Goods", offer: "$10 off $50", availableUens: 1, redeemedUens: 0, shopUrl: "" },
    { id: "merchant-3", businessName: "Future Merchant Partner", offer: "Free shipping", availableUens: 0, redeemedUens: 0, shopUrl: "" }
  ];
  return (
    <div className="portal-root">
      <nav className="portal-nav">
        <div className="portal-nav-brand">
          <div className="portal-hub-dot" style={{ background: "#75e3ad" }} />
          <span><BrandWord /> Holder Demo</span>
        </div>
        <div className="portal-nav-actions">
          <button className="portal-notif-btn" onClick={() => setNotifOpen(!notifOpen)}>
            <Bell size={20} />
            <span className="portal-notif-badge">2</span>
          </button>
        </div>
      </nav>

      {notifOpen && (
        <div className="portal-notif-drawer">
          <div className="portal-notif-header">
            <h3>Notifications</h3>
            <button className="portal-icon-btn" onClick={() => setNotifOpen(false)}><X size={18} /></button>
          </div>
          <div className="portal-notif-item">
            <strong>New merchant offer available</strong>
            <p>Nubreed Global Truth is accepting your active Universal Exchange Notes.</p>
            <span>Today</span>
          </div>
          <div className="portal-notif-item">
            <strong>Collection value updated</strong>
            <p>Your support vault now includes a future asset preview.</p>
            <span>Today</span>
          </div>
        </div>
      )}

      <section className="portal-hero">
        <div className="portal-hero-inner">
          <div className="portal-hero-copy">
            <p className="portal-greeting">Welcome back,</p>
            <h1 className="portal-name">Raquel Holder</h1>
            <div className="portal-stats-row">
              <div className="portal-stat"><Wallet size={18} /><div><strong>2</strong><span>Active UENs</span></div></div>
              <div className="portal-stat"><CheckCircle size={18} /><div><strong>1</strong><span>Times redeemed</span></div></div>
              <div className="portal-stat"><DollarSign size={18} /><div><strong>$248.00</strong><span>Collection value</span></div></div>
            </div>
          </div>
          <div className="portal-hero-uen-chip">
            <div className="portal-uen-chip-inner">
              <span>UENITE Network</span>
              <strong>3</strong>
              <span className="uen-label">UEN</span>
              <span>Notes active</span>
            </div>
          </div>
        </div>
      </section>

      <div className="portal-tabs">
        <button className={`portal-tab ${activeTab === "collection" ? "active" : ""}`} onClick={() => setActiveTab("collection")}><Star size={16} /> Collection</button>
        <button className={`portal-tab ${activeTab === "merchants" ? "active" : ""}`} onClick={() => setActiveTab("merchants")}><Globe size={16} /> Where to Redeem</button>
        <button className={`portal-tab ${activeTab === "wallet" ? "active" : ""}`} onClick={() => setActiveTab("wallet")}><Wallet size={16} /> My Codes</button>
      </div>

      {activeTab === "collection" && <HolderCollectionExperience holderName="Raquel" />}

      {activeTab === "merchants" && (
        <section className="portal-section">
          <div className="portal-section-inner">
            <div className="portal-merchant-grid">
              {demoMerchants.map((merchant) => (
                <article key={merchant.id} className="portal-merchant-card">
                  <div className="portal-merchant-offer"><Tag size={16} /><span>{merchant.offer}</span></div>
                  <h3 className="portal-merchant-name">{merchant.businessName}</h3>
                  <div className="portal-merchant-meta">
                    <span className={merchant.availableUens > 0 ? "portal-avail-yes" : "portal-avail-no"}><CheckCircle size={13} /> {merchant.availableUens} available</span>
                    <span className="portal-redeemed-count"><RefreshCw size={13} /> {merchant.redeemedUens} used</span>
                  </div>
                  {merchant.shopUrl ? (
                    <a className="portal-shop-btn" href={merchant.shopUrl} target="_blank" rel="noopener noreferrer">Shop Now <ExternalLink size={14} /></a>
                  ) : (
                    <span className="portal-shop-note">Merchant listing preview</span>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === "wallet" && (
        <section className="portal-section">
          <div className="portal-section-inner">
            <div className="portal-code-grid">
              {demoCodes.map((uen) => (
                <article key={uen.id} className="portal-code-card">
                  <div className="portal-code-top">
                    <span className="portal-code-label">UEN Code</span>
                    <button className="portal-copy-btn" onClick={() => navigator.clipboard.writeText(uen.code)} title="Copy code"><Copy size={14} /></button>
                  </div>
                  <div className="portal-code-value">{uen.code}</div>
                  <div className="portal-code-footer">
                    <span className={`portal-code-status ${uen.status === "ACTIVE" ? "active" : "inactive"}`}>{uen.status === "GRACE_PERIOD" ? "Grace Period" : uen.status}</span>
                    <span className="portal-code-meta"><CheckCircle size={12} /> {uen.merchants}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SiteEditor({
  initialContent,
  onPreview,
  onSaved,
  open,
  selectedField,
  onOpenChange,
  onSelect
}: {
  initialContent: HomeSiteContent;
  onPreview: (content: HomeSiteContent) => void;
  onSaved: () => Promise<void>;
  open: boolean;
  selectedField: keyof HomeSiteContent | "heroBackground" | "share" | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (field: keyof HomeSiteContent | "heroBackground" | "share" | null) => void;
}) {
  const [draft, setDraft] = useState<HomeSiteContent>(initialContent);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const fieldLabels: Record<string, string> = {
    heroBackground: "Hero background",
    heroEyebrow: "Hero eyebrow",
    heroTitle: "Hero headline",
    heroBody: "Hero body",
    primaryCtaText: "Primary button",
    secondaryCtaText: "Secondary link",
    orbitCoreTitle: "UEN center badge",
    orbitHubLabel: "Exchange Hub icon label",
    orbitHolderLabel: "Holder icon label",
    orbitMerchantLabel: "Merchant icon label",
    share: "Share and site settings"
  };
  const imageFields = new Set<keyof HomeSiteContent>(["heroBgImage", "flow1Image", "flow2Image", "flow3Image", "flow4Image", "storyImage"]);
  const backgroundFields = new Set<string>(["heroBackground", "pageBackground", "audienceBackground", "flowBackground", "creatorBackground", "storyBackground", "collectionBackground", "featuredBackground", "finalBackground"]);
  const linkFields: Partial<Record<keyof HomeSiteContent, keyof HomeSiteContent>> = {
    primaryCtaText: "primaryCtaHref",
    secondaryCtaText: "secondaryCtaHref",
    finalCtaText: "finalCtaHref"
  };
  const formatFieldLabel = (field: string) => fieldLabels[field] ?? field.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
  const shareLinks = [
    ["Homepage", `${window.location.origin}/`],
    ["Merchant signup", `${window.location.origin}/merchants/register`],
    ["Login", `${window.location.origin}/login`]
  ];
  useEffect(() => setDraft(initialContent), [initialContent]);
  const update = (patch: Partial<HomeSiteContent>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      onPreview(next);
      return next;
    });
  };
  const save = async () => {
    try {
      setStatus("Saving...");
      await api("/api/site-content/home", { method: "PATCH", body: JSON.stringify({ value: draft }) });
      await onSaved();
      setStatus("Saved live");
      onSelect(null);
      onOpenChange(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    }
  };
  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setStatus("Copied link");
  };
  const uploadMedia = async (file: File, mediaType: "image" | "video", targetField?: keyof HomeSiteContent) => {
    try {
      setUploading(true);
      setStatus("Uploading...");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const saved = await api<{ url: string }>("/api/site-media", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, dataUrl, mediaType })
      });
      const nextLibrary = Array.from(new Set([saved.url, ...draft.mediaLibrary]));
      update({ mediaLibrary: nextLibrary, ...(targetField ? { [targetField]: saved.url } : {}) } as Partial<HomeSiteContent>);
      setStatus("Uploaded");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };
  const selectedKey = selectedField as keyof HomeSiteContent;
  const selectedIsImage = selectedField && imageFields.has(selectedKey);
  const selectedIsBackground = Boolean(selectedField && backgroundFields.has(String(selectedField)));
  const selectedIsText = selectedField && !selectedIsBackground && selectedField !== "share" && !selectedIsImage && selectedField !== "heroVideoUrl" && selectedField !== "faviconUrl" && selectedField !== "mediaLibrary";
  const undo = () => {
    setDraft(initialContent);
    onPreview(initialContent);
    setStatus("Preview reset");
  };
  return (
    <>
      <button className={`site-edit-toggle ${open ? "active" : ""}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenChange(!open); if (!open && !selectedField) onSelect("share"); }} title="Edit public page">
        <SlidersHorizontal size={18} />
      </button>
      {open && (
        <aside className="site-editor-panel" onClick={(event) => event.stopPropagation()}>
          <div className="editor-head">
            <div>
              <strong>{selectedField ? formatFieldLabel(String(selectedField)) : "Click anything to edit"}</strong>
              <span>{status || "Select visible text, buttons, icons, or the hero background"}</span>
            </div>
            <button className="icon-button" onClick={() => onOpenChange(false)} title="Close editor"><X size={16} /></button>
          </div>
          <div className="editor-scroll">
            {!selectedField && <Notice>Click a visible page element to edit that exact element.</Notice>}
            {selectedIsText && (
              <>
                <label>Text
                  {String(selectedField).includes("Body") || selectedField === "heroTitle" || selectedField === "creatorTitle" || selectedField === "finalTitle" ? (
                    <textarea value={String(draft[selectedKey] ?? "")} onChange={(event) => update({ [selectedKey]: event.target.value } as Partial<HomeSiteContent>)} />
                  ) : (
                    <input value={String(draft[selectedKey] ?? "")} onChange={(event) => update({ [selectedKey]: event.target.value } as Partial<HomeSiteContent>)} />
                  )}
                </label>
                {selectedField === "orbitCoreTitle" && <label>Subtitle<input value={draft.orbitCoreSubtitle} onChange={(event) => update({ orbitCoreSubtitle: event.target.value })} /></label>}
                {linkFields[selectedKey] && <label>Link URL<input value={String(draft[linkFields[selectedKey]!] ?? "")} onChange={(event) => update({ [linkFields[selectedKey]!]: event.target.value } as Partial<HomeSiteContent>)} /></label>}
                <div className="editor-grid">
                  <label>Text color<input type="color" value={draft.textColors[String(selectedKey)] || draft.heroTextColor} onChange={(event) => update({ textColors: { ...draft.textColors, [String(selectedKey)]: event.target.value } })} /></label>
                  <label>Accent<input type="color" value={draft.heroAccentColor} onChange={(event) => update({ heroAccentColor: event.target.value })} /></label>
                </div>
                <label>Hyperlink URL<input value={draft.textLinks[String(selectedKey)] || String(draft[linkFields[selectedKey]!] ?? "") || ""} onChange={(event) => update({ textLinks: { ...draft.textLinks, [String(selectedKey)]: event.target.value }, ...(linkFields[selectedKey] ? { [linkFields[selectedKey]!]: event.target.value } : {}) } as Partial<HomeSiteContent>)} placeholder="https://... or /signup" /></label>
                {selectedField === "heroTitle" && <label>Size<input type="range" min="52" max="104" value={draft.heroTitleSize} onChange={(event) => update({ heroTitleSize: Number(event.target.value) })} /></label>}
              </>
            )}
            {selectedIsImage && (
              <>
                <label>Image URL<input value={String(draft[selectedKey] ?? "")} onChange={(event) => update({ [selectedKey]: event.target.value } as Partial<HomeSiteContent>)} placeholder="https://..." /></label>
                <label className="upload-drop">Upload image<input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && uploadMedia(event.target.files[0], "image", selectedKey)} /></label>
                <div className="media-library-list">
                  {draft.mediaLibrary.map((url) => (
                    <button key={url} type="button" onClick={() => update({ [selectedKey]: url } as Partial<HomeSiteContent>)}>
                      <img src={url} alt="" />
                      <span>Use</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {selectedIsBackground && (
              <>
                <div className="preset-grid">
                  {[
                    ["linear-gradient(135deg, #07120e 0%, #123326 48%, #0b1512 100%)", "Emerald network", "emerald"],
                    ["linear-gradient(135deg, #150f05 0%, #604315 54%, #10130c 100%)", "Gold exchange", "gold"],
                    ["linear-gradient(135deg, #0a1024 0%, #39215f 56%, #07120e 100%)", "Violet creator", "violet"],
                    ["linear-gradient(135deg, #020617 0%, #0f2f2e 52%, #070b12 100%)", "Midnight market", "midnight"],
                    ["#f8faf6", "Soft light", "light"],
                    ["#0c1a12", "Deep green", "deep"]
                  ].map(([preset, label, id]) => {
                    const active = selectedField === "heroBackground" ? draft.heroPreset === id : String(draft[selectedKey] ?? "") === preset;
                    return (
                      <button className={`preset-tile preset-${id} ${active ? "active" : ""}`} key={id} type="button" onClick={() => selectedField === "heroBackground" ? update({ heroPreset: id, heroBgImage: "" } as Partial<HomeSiteContent>) : update({ [selectedKey]: preset } as Partial<HomeSiteContent>)}>
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
                <label>Background CSS / color / image<input value={selectedField === "heroBackground" ? draft.heroBgImage : String(draft[selectedKey] ?? "")} onChange={(event) => selectedField === "heroBackground" ? update({ heroBgImage: event.target.value }) : update({ [selectedKey]: event.target.value } as Partial<HomeSiteContent>)} placeholder="#07120e or linear-gradient(...) or url(...)" /></label>
                {selectedField === "heroBackground" && <label>Video URL<input value={draft.heroVideoUrl} onChange={(event) => update({ heroVideoUrl: event.target.value })} placeholder="https://...mp4" /></label>}
                <div className="editor-grid">
                  <label className="upload-drop">Upload image<input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && uploadMedia(event.target.files[0], "image", selectedField === "heroBackground" ? "heroBgImage" : selectedKey)} /></label>
                  {selectedField === "heroBackground" && <label className="upload-drop">Upload video<input type="file" accept="video/*" onChange={(event) => event.target.files?.[0] && uploadMedia(event.target.files[0], "video", "heroVideoUrl")} /></label>}
                </div>
                <div className="editor-grid">
                  <label>Text color<input type="color" value={draft.heroTextColor} onChange={(event) => update({ heroTextColor: event.target.value })} /></label>
                  <label>Accent<input type="color" value={draft.heroAccentColor} onChange={(event) => update({ heroAccentColor: event.target.value })} /></label>
                </div>
                <div className="media-library-list">
                  {draft.mediaLibrary.map((url) => (
                    <button key={url} type="button" onClick={() => selectedField === "heroBackground" ? update({ heroBgImage: url }) : update({ [selectedKey]: `url("${url}")` } as Partial<HomeSiteContent>)}>
                      <img src={url} alt="" />
                      <span>Use</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {selectedField === "share" && (
              <>
                <label>Favicon URL<input value={draft.faviconUrl} onChange={(event) => update({ faviconUrl: event.target.value })} placeholder="https://.../favicon.png" /></label>
                <label className="upload-drop">Upload image<input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && uploadMedia(event.target.files[0], "image")} /></label>
                <label>Media library URLs<textarea value={draft.mediaLibrary.join("\n")} onChange={(event) => update({ mediaLibrary: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
                <div className="editor-share">
                  <strong>Share</strong>
                  {shareLinks.map(([label, url]) => (
                    <button key={label} type="button" onClick={() => copy(url)}>
                      <Copy size={14} /> {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="editor-actions">
            <button className="ghost" onClick={undo}>Undo</button>
            <button onClick={save} disabled={uploading}><UploadCloud size={16} /> {uploading ? "Uploading..." : "Save live"}</button>
          </div>
        </aside>
      )}
    </>
  );
}

function LoginPage() {
  return (
    <main className="admin-login-screen">
      <div className="admin-login-card">
        <a className="admin-login-brand" href="/"><Shield size={24} /><BrandWord /></a>
        <LoginPanel onLogin={() => { window.location.href = "/admin"; }} />
        <div className="login-page-divider" />
        <div className="login-page-signup">
          <p>New to UENITE? Choose how you want to participate.</p>
          <a className="login-page-signup-btn" href="/signup">
            <Star size={15} /> Get Started
          </a>
        </div>
      </div>
    </main>
  );
}

// Step 1 of password recovery: request a reset link. Always shows the same
// "if an account exists..." confirmation so the page never reveals which
// emails have accounts (matches the server's anti-enumeration response).
function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() })
      });
      setSent(true);
    } catch {
      setError("Could not reach the app server. Refresh the page and try again.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="admin-login-screen">
      <div className="admin-login-card">
        <a className="admin-login-brand" href="/"><Shield size={24} /><BrandWord /></a>
        <section className="login-panel">
          <h1>Reset your password</h1>
          {sent ? (
            <>
              <p>If an account exists for <strong>{email.trim()}</strong>, we've sent a link to choose a new password. It works for the next 60 minutes.</p>
              <Notice>Check your inbox — and your spam folder — for an email from UEN.</Notice>
              <a className="login-page-signup-btn" href="/login" style={{ marginTop: 16 }}>Back to sign in</a>
            </>
          ) : (
            <>
              <p>Enter the email on your account and we'll send you a link to set a new password.</p>
              {error && <Notice tone="bad">{error}</Notice>}
              <Input label="Email" value={email} onChange={setEmail} type="email" />
              <button onClick={submit} disabled={loading || !email.trim()}>{loading ? "Sending..." : "Send reset link"}</button>
              <a href="/login" style={{ display: "block", marginTop: 16, fontSize: 14, color: "#64748b" }}>Back to sign in</a>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

// Step 2: land here from the emailed link. Validate the token first so an
// expired/used link shows a clear message instead of a dead form; on success
// the server signs the user straight in and returns where to send them.
function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [status, setStatus] = useState<"checking" | "valid" | "invalid">("checking");
  const [accountEmail, setAccountEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
        const data = await response.json();
        if (data.valid) {
          setAccountEmail(data.email ?? "");
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      } catch {
        setStatus("invalid");
      }
    })();
  }, []);

  const strong = password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
  const submit = async () => {
    setError("");
    if (!strong) { setError("Use at least 8 characters, including a letter and a number."); return; }
    if (password !== confirm) { setError("Those passwords don't match."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not reset your password.");
        setLoading(false);
        return;
      }
      if (data.token) localStorage.setItem("uen_admin_token", data.token);
      window.location.href = data.redirect ?? "/login";
    } catch {
      setError("Could not reach the app server. Refresh the page and try again.");
      setLoading(false);
    }
  };

  return (
    <main className="admin-login-screen">
      <div className="admin-login-card">
        <a className="admin-login-brand" href="/"><Shield size={24} /><BrandWord /></a>
        <section className="login-panel">
          {status === "checking" && <p>Checking your link…</p>}
          {status === "invalid" && (
            <>
              <h1>Link expired</h1>
              <Notice tone="bad">This password reset link is invalid or has already been used.</Notice>
              <a className="login-page-signup-btn" href="/forgot-password" style={{ marginTop: 16 }}>Request a new link</a>
            </>
          )}
          {status === "valid" && (
            <>
              <h1>Choose a new password</h1>
              <p>Setting a new password{accountEmail ? <> for <strong>{accountEmail}</strong></> : null}.</p>
              {error && <Notice tone="bad">{error}</Notice>}
              <PasswordInput label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
              <PasswordInput label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
              <p style={{ margin: "8px 0 14px", fontSize: 13, color: strong ? "#059669" : "#94a3b8" }}>
                At least 8 characters, including a letter and a number.
              </p>
              <button onClick={submit} disabled={loading}>{loading ? "Saving…" : "Save new password"}</button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

type MpNav = "dashboard" | "offer" | "sync" | "settings" | "help";

// Preview/demo data so the Public Page Studio can render the real merchant and
// Exchange Hub dashboards without a login. Driven by ?preview=merchant|hub.
const MP_PREVIEW_ANALYTICS = {
  totalSyncedUens: 128,
  revenueInPeriod: 4820.5,
  allTimeRevenue: 18640.25,
  redemptionsInPeriod: 64,
  allTimeRedemptions: 212,
  recentSyncLogs: [
    { status: "SUCCESS", message: "12 codes created", totalCreated: 12, createdAt: "2026-05-30T15:04:00Z" },
    { status: "SUCCESS", message: "8 codes created", totalCreated: 8, createdAt: "2026-05-28T11:20:00Z" },
    { status: "PARTIAL", message: "1 code skipped (already exists)", totalCreated: 5, createdAt: "2026-05-25T09:10:00Z" },
  ],
};
const MP_PREVIEW_OFFER = {
  activeOffer: { discountType: "PERCENTAGE", discountValue: 15, minimumOrderAmount: 25, usageLimitPerNote: 1 },
  platformConnectionStatus: "ACTIVE",
  lastSyncTime: "2026-05-30T15:04:00Z",
  merchantStatus: "ACTIVE",
};
const MP_PREVIEW_MERCHANT = { id: "preview-merchant", businessName: "Riverside Goods", contactEmail: "owner@riversidegoods.co", shopDomain: "riverside-goods.myshopify.com", isExchangeHub: false, hubStatus: "NONE", hub: null };
const MP_PREVIEW_HUB = { id: "preview-hub", businessName: "Nu Breed Collective", contactEmail: "team@nubreed.co", shopDomain: "nubreed-love.myshopify.com", isExchangeHub: true, hubStatus: "APPROVED", hub: { id: "preview-hub-id", displayName: "Nu Breed Collective" } };

function ShopifyMerchantPortal() {
  const params = new URLSearchParams(window.location.search);
  const shop = params.get("shopDomain") ?? params.get("shop") ?? "";
  const host = params.get("host") ?? "";

  // Studio preview mode: render the real dashboard with demo data, no login.
  const previewRole = params.get("preview"); // "merchant" | "hub" | null
  const isPreview = previewRole === "merchant" || previewRole === "hub";

  // Initialize Shopify App Bridge when running inside the Shopify admin frame.
  // Uses the CDN script (Shopify's current requirement for embedded apps); it
  // auto-initializes from the shopify-api-key meta tag.
  useEffect(() => {
    if (!host) return;
    fetch("/api/public/shopify-config")
      .then((r) => r.json())
      .then(({ apiKey }: { apiKey: string }) => {
        if (!apiKey || document.querySelector('meta[name="shopify-api-key"]')) return;
        const meta = document.createElement("meta");
        meta.name = "shopify-api-key";
        meta.content = apiKey;
        document.head.appendChild(meta);
        const script = document.createElement("script");
        script.src = "https://cdn.shopify.com/shopifycloud/app-bridge.js";
        document.head.appendChild(script);
      })
      .catch(() => {});
  }, [host]);

  // Auth
  const [authState, setAuthState] = useState<"loading" | "no-account" | "login" | "dashboard">("loading");
  const [merchant, setMerchant] = useState<any>(null);

  // Create account form
  const [setupForm, setSetupForm] = useState({ businessName: shop.replace(/\.myshopify\.com$/, "").replace(/-/g, " "), email: "", password: "", confirmPassword: "" });
  const [setupError, setSetupError] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);

  // Login form
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Self-service password reset — only offered inside the Shopify admin,
  // where the App Bridge session token proves store ownership (no emails).
  const [resetMode, setResetMode] = useState(false);
  const [resetForm, setResetForm] = useState({ email: "", password: "", confirm: "" });
  const [resetError, setResetError] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const submitReset = async () => {
    setResetError("");
    if (resetForm.password.length < 8) { setResetError("Password must be at least 8 characters."); return; }
    if (resetForm.password !== resetForm.confirm) { setResetError("Passwords do not match."); return; }
    setResetLoading(true);
    try {
      const idToken = await (window as any).shopify?.idToken?.();
      if (!idToken) throw new Error("Could not verify store ownership. Open this app from your Shopify admin.");
      const r = await fetch("/shopify/api/merchant/reset-credentials", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ newPassword: resetForm.password, newEmail: resetForm.email.trim() || undefined })
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Reset failed");
      setResetNotice(`Password updated${body.contactEmail ? ` for ${body.contactEmail}` : ""}. Sign in with your new password.`);
      setLoginForm({ email: body.contactEmail ?? resetForm.email, password: "" });
      setResetForm({ email: "", password: "", confirm: "" });
      setResetMode(false);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Reset failed");
    }
    setResetLoading(false);
  };

  // Navigation
  const [nav, setNav] = useState<MpNav>("dashboard");

  // Editable account details (Settings tab)
  const [acctForm, setAcctForm] = useState({ businessName: "", contactEmail: "" });
  const [acctSaving, setAcctSaving] = useState(false);
  const [acctMsg, setAcctMsg] = useState("");
  const [acctErr, setAcctErr] = useState("");

  // Change password (Settings tab)
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [pwShow, setPwShow] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const changePassword = async () => {
    setPwErr(""); setPwMsg("");
    if (!(pwForm.newPassword.length >= 8 && /[A-Za-z]/.test(pwForm.newPassword) && /[0-9]/.test(pwForm.newPassword))) {
      setPwErr("New password must be at least 8 characters, including a letter and a number."); return;
    }
    if (pwForm.newPassword !== pwForm.confirm) { setPwErr("New passwords don't match."); return; }
    setPwSaving(true);
    try {
      const r = await fetch("/api/merchant/change-password", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }) });
      const data = await r.json();
      if (!r.ok) { setPwErr(data.error ?? "Could not change password."); }
      else { setPwMsg("Password updated. We emailed you a confirmation."); setPwForm({ currentPassword: "", newPassword: "", confirm: "" }); }
    } catch { setPwErr("Could not connect. Try again."); }
    finally { setPwSaving(false); }
  };

  // Email verification banner (non-blocking nudge for new accounts)
  const [verifyConfirmed] = useState(() => new URLSearchParams(window.location.search).get("verified") === "1");
  const [verifyResent, setVerifyResent] = useState(false);
  const [verifyErr, setVerifyErr] = useState("");
  const resendVerification = async () => {
    setVerifyErr("");
    try {
      const r = await fetch("/api/merchant/resend-verification", { method: "POST", credentials: "include" });
      const data = await r.json();
      if (!r.ok) { setVerifyErr(data.error ?? "Could not resend the link."); return; }
      setVerifyResent(true);
    } catch { setVerifyErr("Could not connect. Try again."); }
  };
  useEffect(() => {
    if (merchant) setAcctForm({ businessName: merchant.businessName ?? "", contactEmail: merchant.contactEmail ?? "" });
  }, [merchant?.businessName, merchant?.contactEmail]);

  // Analytics
  const [period, setPeriod] = useState("month");
  const analytics = useData<any>(
    () => isPreview
      ? Promise.resolve(MP_PREVIEW_ANALYTICS)
      : fetch(`/shopify/api/analytics?shopDomain=${encodeURIComponent(shop)}&period=${period}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : Promise.reject(r))),
    [shop, period, authState]
  );

  // Offer
  const [offer, setOffer] = useState({ discountType: "PERCENTAGE", discountValue: "15", minimumOrderAmount: "", usageLimitPerNote: "1" });
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const activeOffer = useData<any>(
    () => isPreview
      ? Promise.resolve(MP_PREVIEW_OFFER)
      : fetch(`/shopify/api/dashboard?shopDomain=${encodeURIComponent(shop)}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : Promise.reject(r))),
    [shop, authState]
  );
  useEffect(() => {
    if (activeOffer.data?.activeOffer) {
      const o = activeOffer.data.activeOffer;
      setOffer({ discountType: o.discountType ?? "PERCENTAGE", discountValue: String(o.discountValue ?? 15), minimumOrderAmount: String(o.minimumOrderAmount ?? ""), usageLimitPerNote: String(o.usageLimitPerNote ?? 1) });
    }
  }, [activeOffer.data]);

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  // Exchange Hub application
  const [hubForm, setHubForm] = useState({ displayName: "", hubType: "creator", description: "" });
  const [hubApplying, setHubApplying] = useState(false);
  const [hubError, setHubError] = useState("");
  const [hubApplied, setHubApplied] = useState(false);

  // On mount: check session, then account status
  useEffect(() => {
    // Studio preview: load demo merchant/hub and jump straight to the dashboard.
    if (isPreview) {
      setMerchant(previewRole === "hub" ? MP_PREVIEW_HUB : MP_PREVIEW_MERCHANT);
      setAuthState("dashboard");
      return;
    }
    // Inside the Shopify admin, the App Bridge session token IS the login.
    // Merchants (and app reviewers) must never see a create-account or sign-in
    // wall there — requiring separate credentials in an embedded app is an
    // explicit App Store rejection reason. App Bridge can come up a beat after
    // first render, so wait briefly for the token instead of racing it.
    const embeddedToken = async () => {
      if (!host) return null;
      for (let attempt = 0; attempt < 16; attempt += 1) {
        try {
          const token = await (window as unknown as { shopify?: { idToken?: () => Promise<string> } }).shopify?.idToken?.();
          if (token) return token;
        } catch {
          // App Bridge not ready yet
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return null;
    };
    (async () => {
      const token = await embeddedToken();
      try {
        // Check for an existing login. A self-registered creator / Exchange Hub
        // merchant has no Shopify shop param but is still a valid session, so
        // we must not bounce them to a login screen on sight. The explicit
        // bearer header covers the embedded case even before the global fetch
        // wrapper can see App Bridge.
        const response = await fetch("/api/merchant/me", {
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : {}
        });
        const data = response.ok ? await response.json() : null;
        if (data?.merchant) { setMerchant(data.merchant); setAuthState("dashboard"); return; }
        if (!shop) { setAuthState("login"); return; }
        const status = await fetch(`/api/merchant/account-status?shopDomain=${encodeURIComponent(shop)}`).then((res) => res.json());
        setAuthState(status.hasAccount ? "login" : "no-account");
      } catch {
        setAuthState("login");
      }
    })();
  }, [shop]);

  const submitSetup = async () => {
    if (setupForm.password !== setupForm.confirmPassword) { setSetupError("Passwords do not match."); return; }
    if (setupForm.password.length < 8) { setSetupError("Password must be at least 8 characters."); return; }
    setSetupError(""); setSetupLoading(true);
    try {
      const r = await fetch("/api/merchant/setup", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ shopDomain: shop, businessName: setupForm.businessName, email: setupForm.email, password: setupForm.password }) });
      const data = await r.json();
      if (!r.ok) { setSetupError(data.error ?? "Setup failed."); return; }
      setMerchant(data.merchant); setAuthState("dashboard");
    } catch { setSetupError("Could not connect. Try again."); }
    finally { setSetupLoading(false); }
  };

  const submitLogin = async () => {
    setLoginError(""); setLoginLoading(true);
    try {
      const r = await fetch("/api/merchant/login", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: loginForm.email, password: loginForm.password }) });
      const data = await r.json();
      if (!r.ok) { setLoginError(data.error ?? "Login failed."); return; }
      setMerchant(data.merchant); setAuthState("dashboard");
    } catch { setLoginError("Could not connect. Try again."); }
    finally { setLoginLoading(false); }
  };

  const logout = async () => {
    await fetch("/api/merchant/logout", { method: "POST", credentials: "include" });
    setMerchant(null); setAuthState("login");
  };

  const saveOffer = async () => {
    setSaveMsg(""); setSaveErr("");
    try {
      const r = await fetch(`/shopify/api/offer-settings?shopDomain=${encodeURIComponent(shop)}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...offer, discountValue: Number(offer.discountValue), minimumOrderAmount: offer.minimumOrderAmount ? Number(offer.minimumOrderAmount) : undefined, usageLimitPerNote: Number(offer.usageLimitPerNote) }) });
      if (!r.ok) { setSaveErr("Could not save offer."); return; }
      setSaveMsg("Offer saved successfully.");
      activeOffer.reload();
    } catch { setSaveErr("Could not save offer."); }
  };

  const syncNow = async () => {
    setSyncing(true); setSyncMsg("");
    try {
      const r = await fetch(`/shopify/api/sync?shopDomain=${encodeURIComponent(shop)}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await r.json();
      setSyncMsg(data.message ?? "Sync complete.");
      analytics.reload();
    } catch { setSyncMsg("Sync failed — try again."); }
    finally { setSyncing(false); }
  };

  const navItems: { id: MpNav; label: string; Icon: React.ElementType }[] = [
    { id: "dashboard", label: "Dashboard", Icon: BarChart3 },
    { id: "offer", label: "My Offer", Icon: Tag },
    { id: "sync", label: "Sync", Icon: RefreshCw },
    { id: "settings", label: "Settings", Icon: SlidersHorizontal },
  ];

  // ── Auth screens ──────────────────────────────────────────────────────────
  if (authState === "loading") {
    // Same branded loader as the holder portal: the UENITE coin floating and
    // breathing over a pulsing glow, instead of a bare "Loading…" card.
    return (
      <div className="portal-loading">
        <div className="portal-loading-coin-wrap">
          <div className="portal-loading-glow" />
          <img className="portal-loading-coin" src="/uenite-coin.png" alt="UENITE" />
        </div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  if (authState === "no-account") {
    return (
      <main className="mp-auth-screen">
        <div className="mp-auth-card">
          <div className="mp-auth-brand"><Shield size={26} /><BrandWord /></div>
          <h1>Create your account</h1>
          <p>Your Shopify store is connected. Set up your merchant account to get started.</p>
          {setupError && <p className="mp-error">{setupError}</p>}
          <div className="mp-auth-form">
            <label>Business name<input value={setupForm.businessName} onChange={(e) => setSetupForm({ ...setupForm, businessName: e.target.value })} placeholder="Your store name" /></label>
            <label>Email address<input type="email" value={setupForm.email} onChange={(e) => setSetupForm({ ...setupForm, email: e.target.value })} placeholder="you@yourbusiness.com" /></label>
            <label>Password<input type="password" value={setupForm.password} onChange={(e) => setSetupForm({ ...setupForm, password: e.target.value })} placeholder="At least 8 characters" /></label>
            <label>Confirm password<input type="password" value={setupForm.confirmPassword} onChange={(e) => setSetupForm({ ...setupForm, confirmPassword: e.target.value })} placeholder="Repeat password" /></label>
            <button className="mp-btn mp-btn-full" onClick={submitSetup} disabled={setupLoading}>{setupLoading ? "Creating account…" : "Create merchant account"}</button>
          </div>
          <p className="mp-auth-switch">Already have an account? <button className="mp-link-btn" onClick={() => setAuthState("login")}>Sign in</button></p>
        </div>
      </main>
    );
  }

  if (authState === "login") {
    if (resetMode) {
      return (
        <main className="mp-auth-screen">
          <div className="mp-auth-card">
            <div className="mp-auth-brand"><Shield size={26} /><BrandWord /></div>
            <h1>Reset your password</h1>
            <p>You're signed into this store's Shopify admin, which verifies you own it — no reset email needed.</p>
            {resetError && <p className="mp-error">{resetError}</p>}
            <div className="mp-auth-form">
              <label>Login email (optional — leave blank to keep current)<input type="email" value={resetForm.email} onChange={(e) => setResetForm({ ...resetForm, email: e.target.value })} placeholder="you@yourbusiness.com" /></label>
              <label>New password<input type="password" value={resetForm.password} onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })} placeholder="At least 8 characters" /></label>
              <label>Confirm new password<input type="password" value={resetForm.confirm} onChange={(e) => setResetForm({ ...resetForm, confirm: e.target.value })} placeholder="Repeat the new password" onKeyDown={(e) => { if (e.key === "Enter") submitReset(); }} /></label>
              <button className="mp-btn mp-btn-full" onClick={submitReset} disabled={resetLoading}>{resetLoading ? "Updating…" : "Update password"}</button>
            </div>
            <p className="mp-auth-switch"><button className="mp-link-btn" onClick={() => { setResetMode(false); setResetError(""); }}>Back to sign in</button></p>
          </div>
        </main>
      );
    }
    return (
      <main className="mp-auth-screen">
        <div className="mp-auth-card">
          <div className="mp-auth-brand"><Shield size={26} /><BrandWord /></div>
          <h1>Merchant sign in</h1>
          <p>Sign in to manage your UEN offer and store settings.</p>
          {resetNotice && <p className="mp-notice">{resetNotice}</p>}
          {loginError && <p className="mp-error">{loginError}</p>}
          <div className="mp-auth-form">
            <label>Email address<input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} placeholder="you@yourbusiness.com" /></label>
            <label>Password<input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="Your password" onKeyDown={(e) => { if (e.key === "Enter") submitLogin(); }} /></label>
            <button className="mp-btn mp-btn-full" onClick={submitLogin} disabled={loginLoading}>{loginLoading ? "Signing in…" : "Sign in"}</button>
          </div>
          {host && <p className="mp-auth-switch"><button className="mp-link-btn" onClick={() => { setResetMode(true); setResetNotice(""); }}>Forgot password? Reset it here</button></p>}
          {shop && <p className="mp-auth-switch">New store? <button className="mp-link-btn" onClick={() => setAuthState("no-account")}>Create account</button></p>}
        </div>
      </main>
    );
  }

  // ── Authenticated dashboard ───────────────────────────────────────────────
  const connectionOk = activeOffer.data?.platformConnectionStatus === "ACTIVE";
  const currentOfferSummary = activeOffer.data?.activeOffer
    ? `${activeOffer.data.activeOffer.discountValue}${activeOffer.data.activeOffer.discountType === "PERCENTAGE" ? "%" : "$"} off`
    : "No offer set";

  // Approved Exchange Hubs get a visually distinct (violet) workspace so they
  // always know they're in the Hub, not the standard merchant view.
  const isHub = merchant?.hubStatus === "APPROVED";
  const workspaceName = isHub ? (merchant?.hub?.displayName ?? merchant?.businessName) : merchant?.businessName;
  const shopDisplay = merchant?.shopDomain ?? shop;

  return (
    <main className={`mp-root ${isHub ? "mp-hub" : ""}`}>
      {/* ── Sidebar ── */}
      <aside className="mp-sidebar">
        <div className="mp-sidebar-brand">
          <Shield size={20} />
          <BrandWord />
        </div>

        <div className={`mp-workspace-tag ${isHub ? "mp-workspace-tag-hub" : "mp-workspace-tag-merchant"}`}>
          {isHub ? <Users size={13} /> : <ShoppingBag size={13} />}
          <span>{isHub ? "Exchange Hub" : "Merchant"}</span>
        </div>

        <div className="mp-sidebar-store">
          <span className={`mp-status-dot ${connectionOk ? "mp-dot-green" : "mp-dot-warn"}`} />
          <span className="mp-store-name">{workspaceName || shop.replace(/\.myshopify\.com$/, "")}</span>
        </div>

        <nav className="mp-nav">
          {navItems.map(({ id, label, Icon }) => (
            <button key={id} className={`mp-nav-item ${nav === id ? "mp-nav-active" : ""}`} onClick={() => setNav(id)}>
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="mp-sidebar-footer">
          <a className="mp-nav-item mp-nav-help" href="#" onClick={(e) => { e.preventDefault(); setNav("help"); }}>
            <Globe size={15} />
            <span>Help</span>
          </a>
          {/* Inside the Shopify admin, auth is the App Bridge session token —
              signing out is meaningless there and only strands the merchant on
              a login card, which reviewers flag. Only offer it standalone. */}
          {!host && <button className="mp-signout" onClick={logout}>Sign out</button>}
          <span className="mp-domain">{shopDisplay}</span>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="mp-main">

        {/* Workspace identity — tells merchants vs. Exchange Hubs where they are */}
        <div className={`mp-workspace-banner ${isHub ? "mp-workspace-banner-hub" : "mp-workspace-banner-merchant"}`}>
          <div className="mp-workspace-mark">{isHub ? <Users size={18} /> : <ShoppingBag size={18} />}</div>
          <div className="mp-workspace-copy">
            <span>{isHub ? "Exchange Hub workspace" : "Merchant workspace"}</span>
            <strong>{workspaceName}</strong>
          </div>
          <span className="mp-workspace-pill">{isHub ? "Issues UEN notes" : "Accepts UEN notes"}</span>
        </div>

        {/* Email confirmed toast (returning from the verify link) */}
        {verifyConfirmed && (
          <div className="mp-workspace-banner" style={{ background: "#ecfdf5", border: "1px solid #6ee7b7" }}>
            <div className="mp-workspace-mark" style={{ background: "transparent", color: "#059669" }}><CheckCircle size={18} /></div>
            <div className="mp-workspace-copy"><strong>Email confirmed</strong><span>Thanks — your account is fully verified.</span></div>
          </div>
        )}

        {/* Confirm-your-email reminder (non-blocking) */}
        {!isPreview && merchant?.contactEmail && merchant?.emailVerified === false && (
          <div className="mp-workspace-banner" style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}>
            <div className="mp-workspace-mark" style={{ background: "transparent", color: "#b45309" }}><Mail size={18} /></div>
            <div className="mp-workspace-copy">
              <strong>Confirm your email</strong>
              <span>
                {verifyResent
                  ? `Sent again to ${merchant.contactEmail} — check your inbox and spam.`
                  : verifyErr
                    ? verifyErr
                    : `We sent a confirmation link to ${merchant.contactEmail}.`}
              </span>
            </div>
            {!verifyResent && <button className="mp-btn" onClick={resendVerification}>Resend link</button>}
          </div>
        )}

        {/* Dashboard */}
        {nav === "dashboard" && (
          <div className="mp-section">
            <div className="mp-section-head">
              <div>
                <h1>Dashboard</h1>
                <p>Your UEN performance at a glance.</p>
              </div>
              <div className="mp-period-tabs">
                {(["day", "month", "year", "max"] as const).map((p) => (
                  <button key={p} className={`mp-period-btn ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>
                    {p === "day" ? "Today" : p === "month" ? "30 days" : p === "year" ? "Year" : "Max"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mp-stat-grid">
              <div className="mp-stat-card mp-stat-primary">
                <span className="mp-stat-label">UEN Codes Synced</span>
                <strong className="mp-stat-value">{analytics.loading ? "—" : analytics.data?.totalSyncedUens ?? 0}</strong>
                <span className="mp-stat-sub">Ready to use at checkout</span>
              </div>
              <div className="mp-stat-card mp-stat-revenue">
                <span className="mp-stat-label">{period === "max" ? "All-time revenue" : "Revenue from UENs"}</span>
                <strong className="mp-stat-value">
                  ${analytics.loading ? "—" : period === "max"
                    ? (analytics.data?.allTimeRevenue ?? 0).toFixed(2)
                    : (analytics.data?.revenueInPeriod ?? 0).toFixed(2)}
                </strong>
                <span className="mp-stat-sub">{period === "max" ? "Total revenue ever from UEN codes" : "Orders placed with a UEN code"}</span>
              </div>
              <div className="mp-stat-card">
                <span className="mp-stat-label">{period === "max" ? "All-time redemptions" : "Redemptions this period"}</span>
                <strong className="mp-stat-value">
                  {analytics.loading ? "—" : period === "max"
                    ? analytics.data?.allTimeRedemptions ?? 0
                    : analytics.data?.redemptionsInPeriod ?? 0}
                </strong>
                <span className="mp-stat-sub">Codes used at checkout</span>
              </div>
              <div className="mp-stat-card">
                <span className="mp-stat-label">All-time redemptions</span>
                <strong className="mp-stat-value">{analytics.loading ? "—" : analytics.data?.allTimeRedemptions ?? 0}</strong>
                <span className="mp-stat-sub">Total codes redeemed ever</span>
              </div>
            </div>

            <div className="mp-dash-row">
              <div className="mp-info-card">
                <div className="mp-info-label"><Tag size={14} /> Current offer</div>
                <strong className="mp-info-value">{currentOfferSummary}</strong>
                <button className="mp-link-btn" onClick={() => setNav("offer")}>Edit offer →</button>
              </div>
              <div className="mp-info-card">
                <div className="mp-info-label"><RefreshCw size={14} /> Last sync</div>
                <strong className="mp-info-value">{activeOffer.data?.lastSyncTime ? new Date(activeOffer.data.lastSyncTime).toLocaleString() : "Never"}</strong>
                <button className="mp-link-btn" onClick={() => setNav("sync")}>Sync now →</button>
              </div>
              <div className={`mp-info-card ${connectionOk ? "mp-info-ok" : "mp-info-warn"}`}>
                <div className="mp-info-label"><Shield size={14} /> Connection</div>
                <strong className="mp-info-value">{activeOffer.data?.platformConnectionStatus ?? "—"}</strong>
                <span className="mp-info-sub">{activeOffer.data?.merchantStatus ?? ""}</span>
              </div>
            </div>

            {analytics.data?.recentSyncLogs?.length > 0 && (
              <div className="mp-log-section">
                <h3>Recent sync activity</h3>
                <div className="mp-log-list">
                  {analytics.data.recentSyncLogs.map((log: any, i: number) => (
                    <div key={i} className="mp-log-row">
                      <span className={`mp-log-status ${log.status === "SUCCESS" ? "mp-green" : "mp-warn"}`}>{log.status}</span>
                      <span className="mp-log-msg">{log.message ?? `${log.totalCreated} created`}</span>
                      <span className="mp-log-time">{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* My Offer */}
        {nav === "offer" && (
          <div className="mp-section">
            <div className="mp-section-head">
              <div>
                <h1>My Offer</h1>
                <p>Set what Holders receive when they use a UEN code at your checkout.</p>
              </div>
            </div>
            <div className="mp-form-card">
              <div className="mp-form-grid">
                <label>
                  Discount type
                  <select value={offer.discountType} onChange={(e) => setOffer({ ...offer, discountType: e.target.value })}>
                    <option value="PERCENTAGE">Percentage off</option>
                    <option value="FIXED_AMOUNT">Fixed amount off ($)</option>
                  </select>
                </label>
                <label>
                  Value {offer.discountType === "PERCENTAGE" ? "(%)" : "($)"}
                  <input type="number" min="1" value={offer.discountValue} onChange={(e) => setOffer({ ...offer, discountValue: e.target.value })} />
                </label>
                <label>
                  Minimum order amount ($)
                  <input type="number" min="0" value={offer.minimumOrderAmount} onChange={(e) => setOffer({ ...offer, minimumOrderAmount: e.target.value })} placeholder="No minimum" />
                </label>
                <label>
                  Uses per UEN code
                  <input type="number" min="1" value={offer.usageLimitPerNote} onChange={(e) => setOffer({ ...offer, usageLimitPerNote: e.target.value })} />
                </label>
              </div>
              {saveErr && <p className="mp-error">{saveErr}</p>}
              {saveMsg && <p className="mp-success">{saveMsg}</p>}
              <button className="mp-btn" onClick={saveOffer}>Save offer</button>
            </div>
          </div>
        )}

        {/* Sync */}
        {nav === "sync" && (
          <div className="mp-section">
            <div className="mp-section-head">
              <div>
                <h1>UEN Code Sync</h1>
                <p>Approved UEN codes are pushed to your Shopify discount list automatically. Trigger a manual sync anytime.</p>
              </div>
            </div>
            <div className="mp-form-card">
              <div className="mp-sync-row">
                <div>
                  <strong>Last sync</strong>
                  <span>{activeOffer.data?.lastSyncTime ? new Date(activeOffer.data.lastSyncTime).toLocaleString() : "Never synced"}</span>
                </div>
                <div>
                  <strong>Total synced codes</strong>
                  <span>{analytics.data?.totalSyncedUens ?? "—"}</span>
                </div>
              </div>
              {syncMsg && <p className="mp-success">{syncMsg}</p>}
              <button className="mp-btn" onClick={syncNow} disabled={syncing}>
                <RefreshCw size={15} /> {syncing ? "Syncing…" : "Sync UEN codes now"}
              </button>
            </div>

            {analytics.data?.recentSyncLogs?.length > 0 && (
              <div className="mp-log-section" style={{ marginTop: 24 }}>
                <h3>Sync history</h3>
                <div className="mp-log-list">
                  {analytics.data.recentSyncLogs.map((log: any, i: number) => (
                    <div key={i} className="mp-log-row">
                      <span className={`mp-log-status ${log.status === "SUCCESS" ? "mp-green" : "mp-warn"}`}>{log.status}</span>
                      <span className="mp-log-msg">{log.message ?? `${log.totalCreated} created`}</span>
                      <span className="mp-log-time">{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        {nav === "settings" && (
          <div className="mp-section">
            <div className="mp-section-head">
              <div>
                <h1>Settings</h1>
                <p>Account details and network access.</p>
              </div>
            </div>

            <div className="mp-form-card">
              <h2>Account</h2>
              {acctMsg && <p className="mp-notice">{acctMsg}</p>}
              {acctErr && <p className="mp-error">{acctErr}</p>}
              <div className="mp-form-grid">
                <label>Business name<input value={acctForm.businessName} onChange={(e) => setAcctForm({ ...acctForm, businessName: e.target.value })} /></label>
                <label>Contact email<input type="email" value={acctForm.contactEmail} onChange={(e) => setAcctForm({ ...acctForm, contactEmail: e.target.value })} /></label>
              </div>
              <button className="mp-btn" style={{ marginTop: 14 }} disabled={acctSaving} onClick={async () => {
                setAcctSaving(true); setAcctErr(""); setAcctMsg("");
                try {
                  const r = await fetch("/api/merchant/me", { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(acctForm) });
                  const data = await r.json();
                  if (!r.ok) { setAcctErr(data.error ?? "Could not save."); }
                  else {
                    setMerchant((prev: any) => ({ ...prev, businessName: data.businessName, contactEmail: data.contactEmail }));
                    setAcctMsg("Account details saved.");
                  }
                } catch { setAcctErr("Could not connect. Try again."); }
                finally { setAcctSaving(false); }
              }}>{acctSaving ? "Saving…" : "Save changes"}</button>
              <div className="mp-account-row" style={{ marginTop: 18 }}>
                <span>Shopify store</span>
                <strong>{merchant?.shopDomain ?? shopDisplay ?? "Not connected"}</strong>
              </div>
              {!merchant?.shopDomain && !shop && (
                <p className="mp-muted-note">No Shopify store is connected to this account yet. Store connections are set up with the UENITE team — email <a href="mailto:work@zahbrandsolutions.com?subject=Connect my Shopify store">work@zahbrandsolutions.com</a> and we'll link your store, load your notes, and switch on order tracking.</p>
              )}
            </div>

            <div className="mp-form-card">
              <h2>Password</h2>
              {pwMsg && <p className="mp-notice">{pwMsg}</p>}
              {pwErr && <p className="mp-error">{pwErr}</p>}
              <div className="mp-form-grid">
                <label style={{ gridColumn: "1 / -1" }}>Current password<input type={pwShow ? "text" : "password"} autoComplete="current-password" value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} /></label>
                <label>New password<input type={pwShow ? "text" : "password"} autoComplete="new-password" value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} /></label>
                <label>Confirm new password<input type={pwShow ? "text" : "password"} autoComplete="new-password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} /></label>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, margin: "10px 0 0", cursor: "pointer" }}>
                <input type="checkbox" checked={pwShow} onChange={(e) => setPwShow(e.target.checked)} style={{ width: "auto", margin: 0 }} /> Show passwords
              </label>
              <p className="mp-muted-note" style={{ margin: "6px 0 0" }}>At least 8 characters, including a letter and a number.</p>
              <button className="mp-btn" style={{ marginTop: 14 }} disabled={pwSaving || !pwForm.currentPassword || !pwForm.newPassword} onClick={changePassword}>{pwSaving ? "Saving…" : "Update password"}</button>
            </div>

            <div className={`mp-form-card mp-hub-card ${merchant?.hubStatus === "APPROVED" ? "mp-hub-active" : merchant?.hubStatus === "PENDING" ? "mp-hub-pending" : "mp-hub-apply"}`}>
              {merchant?.hubStatus === "APPROVED" && (
                <>
                  <div className="mp-hub-badge"><Users size={16} /> Exchange Hub — Active</div>
                  <h2>{merchant.hub?.displayName ?? merchant.businessName}</h2>
                  <p>Your Exchange Hub is active. You can now issue Universal Exchange Notes to your supporters and build your holder network.</p>
                </>
              )}
              {merchant?.hubStatus === "PENDING" && (
                <>
                  <div className="mp-hub-badge" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}><Users size={16} /> Exchange Hub Application — Pending</div>
                  <h2>Under review</h2>
                  <p>Your application has been submitted. Your dashboard will update automatically once it's approved — no reinstall needed.</p>
                </>
              )}
              {(!merchant?.hubStatus || merchant?.hubStatus === "NONE") && !hubApplied && (
                <>
                  <div className="mp-hub-badge" style={{ background: "rgba(96,165,250,0.1)", color: "#60a5fa" }}><Users size={16} /> Become an Exchange Hub</div>
                  <h2>Issue UEN notes to your community</h2>
                  <p>Exchange Hubs issue Universal Exchange Notes to supporters, customers, or community members. Applications are reviewed and approved by the UENITE team.</p>
                  {hubError && <p className="mp-error">{hubError}</p>}
                  <div className="mp-form-grid" style={{ marginTop: 16 }}>
                    <label>Organization name<input value={hubForm.displayName} onChange={(e) => setHubForm({ ...hubForm, displayName: e.target.value })} placeholder="e.g. Hebrew Care" /></label>
                    <label>Hub type
                      <select value={hubForm.hubType} onChange={(e) => setHubForm({ ...hubForm, hubType: e.target.value })}>
                        <option value="creator">Creator</option>
                        <option value="ministry">Ministry / Church</option>
                        <option value="nonprofit">Nonprofit / Cause</option>
                        <option value="community">Community</option>
                        <option value="brand">Brand</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label style={{ gridColumn: "1 / -1" }}>Tell us about your community (optional)<input value={hubForm.description} onChange={(e) => setHubForm({ ...hubForm, description: e.target.value })} placeholder="Brief description of your cause or audience" /></label>
                  </div>
                  <button className="mp-btn" style={{ marginTop: 16 }} disabled={hubApplying || !hubForm.displayName} onClick={async () => {
                    setHubApplying(true); setHubError("");
                    try {
                      const r = await fetch("/api/merchant/apply-hub", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(hubForm) });
                      const data = await r.json();
                      if (!r.ok) { setHubError(data.error ?? "Could not submit."); }
                      else { setHubApplied(true); setMerchant((prev: any) => ({ ...prev, hubStatus: "PENDING" })); }
                    } catch { setHubError("Could not connect. Try again."); }
                    finally { setHubApplying(false); }
                  }}>
                    <Users size={15} /> {hubApplying ? "Submitting…" : "Apply as Exchange Hub"}
                  </button>
                </>
              )}
              {hubApplied && (
                <>
                  <div className="mp-hub-badge" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}><Users size={16} /> Application Submitted</div>
                  <p>Your application is under review. This dashboard will update automatically once approved.</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Help */}
        {nav === "help" && (
          <div className="mp-section">
            <div className="mp-section-head"><div><h1>Help</h1><p>How the UENITE merchant network works.</p></div></div>
            <div className="mp-form-card">
              <h2>How UEN codes work at checkout</h2>
              <p>When a Holder purchases through an Exchange Hub, they receive a Universal Exchange Note (UEN) code. That code gets synced to your Shopify store as a discount code. When they shop with you and enter the code at checkout, they receive the offer you set.</p>
            </div>
            <div className="mp-form-card">
              <h2>Your offer</h2>
              <p>You control what Holders receive — a percentage off, a fixed dollar amount off, with or without a minimum order, and how many times each code can be used. Change it anytime under My Offer.</p>
            </div>
            <div className="mp-form-card">
              <h2>Sync</h2>
              <p>Codes sync automatically when a new note is issued. You can also trigger a manual sync from the Sync section if you ever need to force an update.</p>
            </div>
            <div className="mp-form-card">
              <h2>Exchange Hub</h2>
              <p>If you want to issue UEN codes to your own community — not just accept them — apply to become an Exchange Hub under Settings. Applications are reviewed by the UENITE team.</p>
            </div>
            <div className="mp-form-card">
              <a className="mp-link-btn" href="/">Learn more at uenite.com</a>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}

function MerchantRegister() {
  const hubs = useData<any[]>(() => api("/api/public/exchange-hubs"));
  const [form, setForm] = useState({ businessName: "", contactName: "", contactEmail: "", shopDomain: "", requestedExchangeHubId: "" });
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState("");
  const submit = async () => {
    setError("");
    try {
      const payload = await api<any>("/api/merchant-onboarding/register", {
        method: "POST",
        body: JSON.stringify({ ...form, requestedExchangeHubId: form.requestedExchangeHubId || undefined })
      });
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register merchant");
    }
  };
  const valueItems = [
    { Icon: SlidersHorizontal, title: "You control the offer", body: "Set percentage, fixed amount, minimum order, usage limits, and when to pause participation.", accent: "#a78bfa", bg: "rgba(167,139,250,0.15)" },
    { Icon: Zap, title: "We sync the notes", body: "Approved Universal Exchange Notes are pushed into Shopify without manual CSV uploads or code management.", accent: "#fbbf24", bg: "rgba(251,191,36,0.13)" },
    { Icon: ShoppingBag, title: "Your checkout stays yours", body: "Holders redeem through your existing Shopify checkout using the value you define.", accent: "#60a5fa", bg: "rgba(96,165,250,0.13)" },
    { Icon: TrendingUp, title: "Traffic with a reason", body: "Supporter energy becomes a simple reason to discover your store and make a purchase.", accent: "#34d399", bg: "rgba(52,211,153,0.13)" },
  ];
  const stepItems = [
    { Icon: Download, title: "Install the merchant app", body: "Connect your Shopify store in minutes without rebuilding your site." },
    { Icon: SlidersHorizontal, title: "Set your offer", body: "Choose what UEN Holders receive when they shop with you." },
    { Icon: RefreshCw, title: "Notes sync automatically", body: "The platform keeps approved notes available in your store." },
    { Icon: ShoppingBag, title: "Holders shop with you", body: "Customers enter their note at checkout and receive your offer." },
    { Icon: TrendingUp, title: "You gain new customers", body: "Join a network where more Exchange Hubs can send motivated traffic." },
  ];
  return (
    <PublicShell backTo="/signup">
      {/* -- Value band -- */}
      <section className="value-band">
        <div className="section-inner">
          <div className="section-heading">
            <span className="eyebrow value-eyebrow"><Shield size={16} /> Why merchants join</span>
            <h2>Access warm traffic from trusted communities</h2>
            <p>Holders are not random visitors. They received value through an Exchange Hub they support, and now they are looking for participating merchants where that value works.</p>
          </div>
          <div className="value-grid">
            {valueItems.map(({ Icon, title, body, accent, bg }, i) => (
              <article className="value-card" key={title} style={{ "--card-accent": accent, "--card-bg": bg, animationDelay: `${i * 80}ms` } as React.CSSProperties}>
                <div className="value-icon" style={{ background: bg, color: accent }}><Icon size={22} /></div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* -- Community image band -- */}
      <section className="community-band">
        <div className="community-inner">
          <div className="community-text">
            <span className="eyebrow dark"><Users size={16} /> Real buyers, real communities</span>
            <h2>Not cold ads. Warm Holders.</h2>
            <p>Every Holder has a UEN tied to a creator, ministry, or organization they already support. When they shop with you, they bring real intent - not impulse scrolling.</p>
            <ul className="community-list">
              <li><CheckCircle size={18} /><span>Holders are pre-qualified - they already have value to spend with you</span></li>
              <li><CheckCircle size={18} /><span>Zero ad spend needed to reach them</span></li>
              <li><CheckCircle size={18} /><span>Each Exchange Hub brings its own community of motivated buyers</span></li>
            </ul>
          </div>
          <div className="community-visual">
            <div className="comm-img-wrap">
              <img src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=800&auto=format&fit=crop" alt="People shopping together" />
              <div className="comm-badge"><CheckCircle size={14} /><span>Verified merchant network</span></div>
              <div className="comm-stat-bubble comm-stat-1"><TrendingUp size={14} /><div><strong>Warm traffic</strong><span>from 12+ hub types</span></div></div>
              <div className="comm-stat-bubble comm-stat-2"><Users size={14} /><div><strong>Real intent</strong><span>not cold ad clicks</span></div></div>
            </div>
          </div>
        </div>
      </section>

      {/* -- How it works -- */}
      <section className="how-band" id="how-it-works">
        <div className="section-inner">
          <div className="section-heading">
            <span className="eyebrow dark"><RefreshCw size={16} /> How it works</span>
            <h2>Connect once. Start accepting notes.</h2>
            <p>Five simple steps from installation to your first Holder checkout - no technical rebuilds required.</p>
          </div>
          <div className="steps-grid">
            {stepItems.map(({ Icon, title, body }, index) => (
              <article className="step-card" key={title} style={{ animationDelay: `${index * 80}ms` }}>
                <div className="step-num-wrap"><strong>{index + 1}</strong></div>
                <div className="step-icon-wrap"><Icon size={18} /></div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* -- Network image band -- */}
      <section className="network-band">
        <img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=1400&auto=format&fit=crop" alt="" className="network-bg-img" />
        <div className="network-overlay" />
        <div className="network-content section-inner">
          <span className="eyebrow"><Star size={16} /> Growing network</span>
          <h2>Every hub adds more Holders to your store</h2>
          <div className="network-stats">
            <div><strong>Auto</strong><span>Note syncing</span></div>
            <div><strong>0</strong><span>Manual uploads</span></div>
            <div><strong>unlimited</strong><span>Hub connections</span></div>
          </div>
        </div>
      </section>

      {/* -- Signup card -- */}
      <div className="public-card-wrap">
        <section className="public-card signup-card" id="merchant-signup">
          <div className="signup-inner">
            <div className="signup-left">
              <div className="signup-heading">
                <span className="eyebrow dark"><Shield size={16} /> Merchant signup</span>
                <h2>Join the Merchant Network</h2>
                <p>Connect your Shopify store and turn Holder traffic into real customer opportunities.</p>
              </div>
              {error && <Notice tone="bad">{error}</Notice>}
              {result ? (
                <div className="success-panel">
                  <Ticket size={32} />
                  <h3>Registration created</h3>
                  <p>Your shareable install page is ready. Send this link to the store owner so they can connect Shopify.</p>
                  <span>Store {result.onboarding.shopDomain}</span>
                  <span>Install link {result.installUrl}</span>
                  <button type="button" className="button-link button-link-large" onClick={() => navigator.clipboard.writeText(result.installUrl)}><Copy size={16} /> Copy Install Link</button>
                  <a className="button-link button-link-large" href={result.installUrl}>Open Install Instructions</a>
                </div>
              ) : (
                <FormGrid>
                  <Input label="Business name" value={form.businessName} onChange={(businessName) => setForm({ ...form, businessName })} />
                  <Input label="Contact name" value={form.contactName} onChange={(contactName) => setForm({ ...form, contactName })} />
                  <Input label="Contact email" value={form.contactEmail} onChange={(contactEmail) => setForm({ ...form, contactEmail })} />
                  <Input label="Shopify store domain" value={form.shopDomain} onChange={(shopDomain) => setForm({ ...form, shopDomain: shopDomain.toLowerCase().trim() })} />
                  <Select label="UEN hub to accept" value={form.requestedExchangeHubId} options={hubs.data ?? []} onChange={(requestedExchangeHubId) => setForm({ ...form, requestedExchangeHubId })} />
                  <button onClick={submit}><Link2 size={16} /> Join the Merchant Network</button>
                </FormGrid>
              )}
            </div>
            <div className="signup-right">
              <div className="signup-perks">
                <h3>What you get</h3>
                <ul>
                  {[
                    [ShoppingBag, "Your existing Shopify checkout - no changes needed"],
                    [Zap, "Automatic note syncing across all connected hubs"],
                    [SlidersHorizontal, "Full control over offer type, value, and limits"],
                    [TrendingUp, "Access to growing Holder traffic from multiple hubs"],
                    [Shield, "Merchant dashboard for managing your participation"],
                  ].map(([Icon, text], i) => (
                    <li key={i}><span className="perk-icon"><Icon size={15} /></span><span>{text as string}</span></li>
                  ))}
                </ul>
              </div>
              <div className="signup-img-wrap">
                <img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=600&auto=format&fit=crop" alt="" />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* -- Benefit strip -- */}
      <section className="benefit-strip-outer">
        <div className="benefit-strip section-inner">
          {["Shopify app connection", "Automatic note syncing", "Access to Holder traffic", "Controlled discounts", "No manual code uploads", "Your store stays in control"].map((item) => (
            <span key={item}><Ticket size={15} /> {item}</span>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}

function MerchantInstall() {
  const token = window.location.pathname.split("/").pop() ?? "";
  const installed = new URLSearchParams(window.location.search).get("installed") === "1";
  const onboarding = useData<any>(() => api(`/api/merchant-onboarding/${token}`), [token]);
  return (
    <PublicShell compact>
      <section className="public-card">
        <h2>Shopify Installation</h2>
        {onboarding.error && <Notice tone="bad">{onboarding.error}</Notice>}
        {onboarding.loading && <Notice>Loading install details...</Notice>}
        {onboarding.data && (
          <>
            {installed && <Notice>Shopify is connected. You can now configure the merchant offer in the UEN merchant dashboard.</Notice>}
            <div className="facts">
              <span>Merchant {onboarding.data.businessName}</span>
              <span>Store {onboarding.data.shopDomain}</span>
              <span>Status <Status value={onboarding.data.status} /></span>
              <span>Offer {onboarding.data.offer ? `${onboarding.data.offer.discountValue}%` : "Default offer pending"}</span>
              <span>Accepted hubs {onboarding.data.exchangeHubs.length ? onboarding.data.exchangeHubs.join(", ") : "Pending admin access"}</span>
            </div>
            <div className="install-steps">
              <div><strong>1</strong><span>Confirm this is your Shopify store.</span></div>
              <div><strong>2</strong><span>Approve the UEN Platform app permissions in Shopify.</span></div>
              <div><strong>3</strong><span>Return here, set your offer, then sync UEN codes.</span></div>
            </div>
            <a className="button-link" href={onboarding.data.installUrl}><Link2 size={16} /> Install Shopify App</a>
          </>
        )}
      </section>
    </PublicShell>
  );
}

function LoginPanel({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [linkSentTo, setLinkSentTo] = useState("");
  const [loading, setLoading] = useState(false);
  // One sign-in for everyone — admin, merchant/hub, or wallet member. The server
  // figures out which kind of account the email is and either signs them in or
  // (for a wallet with no/incorrect password) emails a one-time link.
  const login = async () => {
    setError("");
    setLinkSentTo("");
    if (!email.trim()) { setError("Enter your email to sign in."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, remember })
      });
      const loginData = await response.json();
      if (!response.ok) {
        setError(loginData.error ?? "Could not sign in");
        return;
      }
      // Wallet member without a matching password: the server emailed them a
      // secure sign-in link instead of failing.
      if (loginData.linkSent) {
        setLinkSentTo(loginData.email ?? email.trim());
        return;
      }
      if (loginData.token) localStorage.setItem("uen_admin_token", loginData.token);
      // Merchants and wallet members go to their own destination; admins refresh
      // in place into the dashboard.
      if (loginData.actorType !== "admin" && loginData.redirect) {
        window.location.href = loginData.redirect;
        return;
      }
      onLogin();
    } catch (_error) {
      setError("Could not reach the app server. Refresh the page and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (linkSentTo) {
    return (
      <section className="login-panel">
        <h1>Check your email</h1>
        <Notice>We sent a secure sign-in link to <strong>{linkSentTo}</strong>. Open it to access your wallet — the link works for 15 minutes.</Notice>
        <p style={{ fontSize: 14, color: "#64748b", marginTop: 12 }}>
          Didn't get it? Check spam, or <button className="button-link" style={{ padding: 0 }} onClick={() => setLinkSentTo("")}>try again</button>.
        </p>
      </section>
    );
  }

  return (
    <section className="login-panel">
      <h1>Sign in</h1>
      <p>One sign-in for your wallet, merchant tools, Exchange Hub, and platform dashboard.</p>
      {error && <Notice tone="bad">{error}</Notice>}
      <form onSubmit={(event) => { event.preventDefault(); if (!loading) login(); }}>
        <Input label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" name="email" autoFocus />
        <PasswordInput label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#475569", margin: "4px 0 12px", cursor: "pointer" }}>
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} style={{ width: "auto", margin: 0 }} />
          Remember me on this device
        </label>
        <button type="submit" disabled={loading}>{loading ? "Signing In..." : "Sign In"}</button>
      </form>
      <p style={{ fontSize: 13, color: "#94a3b8", margin: "10px 0 0" }}>
        Wallet member without a password? Leave it blank and we'll email you a secure sign-in link.
      </p>
      <a href="/forgot-password" style={{ display: "block", marginTop: 12, fontSize: 14, color: "#64748b", textDecoration: "none" }}>Forgot your password?</a>
    </section>
  );
}

function Header({ title, subtitle, user }: { title: string; subtitle: string; user?: any }) {
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    localStorage.removeItem("uen_admin_token");
    window.location.href = "/login";
  };
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {user && <div className="user-chip"><span>{user.email ?? user.role}</span><button className="ghost" onClick={logout}>Logout</button></div>}
    </header>
  );
}

function Status({ value }: { value?: string }) {
  return <span className={`status status-${(value ?? "unknown").toLowerCase()}`}>{value ?? "UNKNOWN"}</span>;
}

function DataTable({ rows, columns }: { rows: any[]; columns: [string, (row: any) => React.ReactNode][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map(([label]) => <th key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map(([label, render]) => (
                <td key={label}>{render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard({ user }: { user: any }) {
  const { data, error, loading } = useData<any>(() => api("/api/admin/dashboard"));
  return (
    <>
      <Header title="Admin Dashboard" subtitle="Monitor platform operations, sync health, and system totals." user={user} />
      {error && <Notice tone="bad">{error}</Notice>}
      {loading && <Notice>Loading dashboard...</Notice>}
      {data && (
        <>
          <section className="metrics">
            {Object.entries(data.counts).map(([label, value]) => (
              <div className="metric" key={label}>
                <span>{label.replace(/([A-Z])/g, " $1")}</span>
                <strong>{String(value)}</strong>
              </div>
            ))}
          </section>
          <h2>Recent Sync Logs</h2>
          <DataTable
            rows={data.recentSyncLogs}
            columns={[
              ["Merchant", (row) => row.merchant.businessName],
              ["Status", (row) => <Status value={row.status} />],
              ["Message", (row) => row.message],
              ["Created", (row) => new Date(row.createdAt).toLocaleString()]
            ]}
          />
        </>
      )}
    </>
  );
}

function PagesAdmin({ user }: { user: any }) {
  return (
    <>
      <Header title="Public Page Studio" subtitle="Share, preview, and test public pages without mixing them into the operational dashboard." user={user} />
      <SharePanel />
      <PublicPreviews />
    </>
  );
}

function SharePanel() {
  const links = [
    ["UENITE homepage", `${window.location.origin}/`],
    ["Merchant signup", `${window.location.origin}/merchants/register`],
    ["Sign in", `${window.location.origin}/login`]
  ];
  const [copied, setCopied] = useState("");
  const copyLink = async (label: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(label);
  };
  return (
    <section className="share-panel">
      <div>
        <span>Share UENITE</span>
        <strong>Send the right link without leaving admin.</strong>
      </div>
      <div className="share-links">
        {links.map(([label, url]) => (
          <button className="ghost" key={label} onClick={() => copyLink(label, url)}>
            <Copy size={15} /> {copied === label ? "Copied" : label}
          </button>
        ))}
      </div>
    </section>
  );
}

function PublicPreviews() {
  const groups = {
    Public: {
      summary: "Brand, education, signup, and login pages.",
      pages: [
        { label: "Homepage", path: "/", description: "Main UENITE brand and ecosystem story.", access: "Public" },
        { label: "About", path: "/about", description: "Plain-language overview of what UENITE is.", access: "Public" },
        { label: "Signup Gateway", path: "/signup", description: "Role selection for new users.", access: "Public" },
        { label: "Login", path: "/login", description: "Standard sign-in for admins, merchants, hubs, and future users.", access: "Public" }
      ]
    },
    Holder: {
      summary: "Supporter wallet, collection, badges, rewards, and redemption view.",
      pages: [
        { label: "Collection Demo", path: "/holder/collection", description: "Game-like support vault with value, filters, and details.", access: "Public demo" },
        { label: "Holder Signup", path: "/holder/register", description: "Holder access form and portal link flow.", access: "Public" },
        { label: "Holder Portal Demo", path: "/holder/portal?demo=1", description: "Preview of the live Holder wallet, collection, merchant directory, and codes.", access: "Demo" },
        { label: "UEN Widget Preview", path: "/widget-preview", description: "Floating merchant widget — shows UEN count, value, auto-apply and code-paste buttons as they appear on a merchant site.", access: "Demo" }
      ]
    },
    Merchant: {
      summary: "Merchant onboarding, Shopify tools, offers, and redemption setup.",
      pages: [
        { label: "Merchant Dashboard (live)", path: "/shopify/merchant?preview=merchant", description: "The real logged-in merchant portal with demo data — exactly what a merchant sees.", access: "Live preview" },
        { label: "Merchant Signup", path: "/merchants/register", description: "Public merchant network registration.", access: "Public" },
        { label: "Shopify App", path: "/shopify", description: "Installed merchant app dashboard and sync controls.", access: "Login required" },
        { label: "Merchant Offers", path: "/offers", description: "Admin offer management for participating stores.", access: "Admin" }
      ]
    },
    Hub: {
      summary: "Exchange Hub setup, Holders, UEN generation, and campaign operations.",
      pages: [
        { label: "Exchange Hub Dashboard (live)", path: "/shopify/merchant?preview=hub", description: "The real logged-in Exchange Hub portal with demo data — compare it side by side with the merchant dashboard.", access: "Live preview" },
        { label: "Exchange Hub Signup", path: "/exchange-hub/register", description: "Public application path for creators and organizations.", access: "Public" },
        { label: "Exchange Hubs Admin", path: "/exchange-hubs", description: "Create, edit, and suspend Exchange Hubs.", access: "Admin" },
        { label: "Universal Exchange Notes", path: "/uens", description: "Generate, disable, remove, or delete Notes.", access: "Admin" }
      ]
    }
  };
  const [activeGroup, setActiveGroup] = useState<keyof typeof groups>("Public");
  const [selectedPage, setSelectedPage] = useState(0);
  const role = groups[activeGroup];
  const pages = role.pages;
  const selected = pages[Math.min(selectedPage, pages.length - 1)];
  const selectGroup = (group: keyof typeof groups) => {
    setActiveGroup(group);
    setSelectedPage(0);
  };
  const copySelected = async () => navigator.clipboard.writeText(`${window.location.origin}${selected.path}`);
  return (
    <section className="preview-panel">
      <div className="preview-panel-head">
        <div>
          <span>Page testing studio</span>
          <strong>Preview the page, then open it full size when you need to click through the flow.</strong>
        </div>
        <div className="preview-switcher">
          {(Object.keys(groups) as Array<keyof typeof groups>).map((group) => (
            <button key={group} className={activeGroup === group ? "active" : ""} onClick={() => selectGroup(group)}>{group}</button>
          ))}
        </div>
      </div>
      <div className="preview-console">
        <aside className="preview-context">
          <span>Viewing as</span>
          <strong>{activeGroup}</strong>
          <p>{role.summary}</p>
          <div className="preview-selected">
            <small>Selected page</small>
            <b>{selected.label}</b>
            <em>{selected.access}</em>
          </div>
          <div className="preview-actions">
            <a className="button-link" href={selected.path} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open selected</a>
            <button className="ghost" onClick={copySelected}><Copy size={14} /> Copy link</button>
          </div>
        </aside>
        <div className="preview-list">
          {pages.map((page, index) => (
            <button className={`preview-row ${index === selectedPage ? "active" : ""}`} onClick={() => setSelectedPage(index)} key={page.path}>
              <div>
                <strong>{page.label}</strong>
                <small>{page.access}</small>
              </div>
              <span>{page.description}</span>
              <code>{page.path}</code>
            </button>
          ))}
        </div>
      </div>
      <div className="preview-frame-shell">
        <div className="preview-frame-head">
          <div>
            <strong>{selected.label}</strong>
            <span>{selected.description}</span>
          </div>
          <code>{selected.path}</code>
        </div>
        <iframe key={selected.path} title={`${selected.label} preview`} src={selected.path} />
      </div>
    </section>
  );
}

function ExchangeHubs({ user }: { user: any }) {
  const { data, reload } = useData<any[]>(() => api("/api/exchange-hubs"));
  const [form, setForm] = useState({ name: "", displayName: "", hubType: "creator", codePrefix: "", subdomain: "" });
  const [editing, setEditing] = useState<any | null>(null);
  const create = async () => {
    await api("/api/exchange-hubs", { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", displayName: "", hubType: "creator", codePrefix: "", subdomain: "" });
    await reload();
  };
  const suspend = async (id: string) => {
    await api(`/api/exchange-hubs/${id}/suspend`, { method: "POST" });
    await reload();
  };
  const approve = async (id: string) => {
    await api(`/api/exchange-hubs/${id}/approve`, { method: "POST" });
    await reload();
  };
  const saveEdit = async () => {
    if (!editing) return;
    await api(`/api/exchange-hubs/${editing.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: editing.name,
        displayName: editing.displayName,
        hubType: editing.hubType,
        codePrefix: editing.codePrefix ?? "",
        subdomain: editing.subdomain ?? ""
      })
    });
    setEditing(null);
    await reload();
  };

  const deleteHub = async (id: string, displayName: string) => {
    if (!window.confirm(`Delete "${displayName}" and all associated records? This cannot be undone.`)) return;
    try {
      await api(`/api/exchange-hubs/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const pending = (data ?? []).filter((h) => h.status === "PENDING_REVIEW");
  const active = (data ?? []).filter((h) => h.status !== "PENDING_REVIEW");

  return (
    <>
      <Header title="Exchange Hubs" subtitle="Create and suspend audience-holders that issue UENs." user={user} />

      {pending.length > 0 && (
        <>
          <h2 style={{ margin: "24px 0 8px", color: "#b45309" }}>⏳ Pending Applications ({pending.length})</h2>
          <DataTable
            rows={pending}
            columns={[
              ["Display Name", (row) => row.displayName],
              ["Type", (row) => row.hubType],
              ["Applied by", (row) => row.applicantMerchantId ? `Merchant ${row.applicantMerchantId.slice(0, 8)}…` : "Public form"],
              ["Action", (row) => (
                <div className="actions">
                  <button onClick={() => approve(row.id)}><CheckCircle size={15} /> Approve</button>
                  <button className="ghost" onClick={() => suspend(row.id)}><Pause size={16} /> Deny</button>
                  <button className="ghost danger" onClick={() => deleteHub(row.id, row.displayName)}>Delete</button>
                </div>
              )]
            ]}
          />
        </>
      )}

      {editing && (
        <FormGrid>
          <Input label="Name" value={editing.name} onChange={(name) => setEditing({ ...editing, name })} />
          <Input label="Display name" value={editing.displayName} onChange={(displayName) => setEditing({ ...editing, displayName })} />
          <Input label="Hub type" value={editing.hubType} onChange={(hubType) => setEditing({ ...editing, hubType })} />
          <Input label="Code prefix" value={editing.codePrefix ?? ""} onChange={(codePrefix) => setEditing({ ...editing, codePrefix })} />
          <Input label="Subdomain" value={editing.subdomain ?? ""} onChange={(subdomain) => setEditing({ ...editing, subdomain })} />
          <button onClick={saveEdit}><UploadCloud size={16} /> Save Hub</button>
          <button className="ghost" onClick={() => setEditing(null)}>Cancel</button>
        </FormGrid>
      )}
      <FormGrid>
        <Input label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Input label="Display name" value={form.displayName} onChange={(displayName) => setForm({ ...form, displayName })} />
        <Input label="Hub type" value={form.hubType} onChange={(hubType) => setForm({ ...form, hubType })} />
        <Input label="Code prefix" value={form.codePrefix} onChange={(codePrefix) => setForm({ ...form, codePrefix })} />
        <Input label="Subdomain" value={form.subdomain} onChange={(subdomain) => setForm({ ...form, subdomain })} />
        <button onClick={create}><UploadCloud size={16} /> Create Hub</button>
      </FormGrid>
      <DataTable
        rows={active}
        columns={[
          ["Display Name", (row) => row.displayName],
          ["Type", (row) => row.hubType],
          ["Code Prefix", (row) => row.codePrefix ?? "-"],
          ["UEN Value", (row) => `$${Number(row.uenValue ?? 1).toFixed(2)}`],
          ["Status", (row) => <Status value={row.status} />],
          ["Billing", (row) => row.billingStatus],
          ["Action", (row) => <div className="actions"><button className="ghost" onClick={() => setEditing(row)}>Edit</button><button className="ghost" onClick={() => suspend(row.id)}><Pause size={16} /> Suspend</button><button className="ghost danger" onClick={() => deleteHub(row.id, row.displayName)}>Delete</button></div>]
        ]}
      />
      {active.map((hub: any) => (
        <details key={hub.id} style={{ marginBottom: 12 }}>
          <summary style={{ cursor: "pointer", padding: "8px 0", fontWeight: 600, color: "#17201b" }}>
            <BarChart3 size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
            {hub.displayName} Analytics
          </summary>
          <HubAnalyticsPanel hubId={hub.id} />
        </details>
      ))}
    </>
  );
}

function Holders({ user }: { user: any }) {
  const hubs = useData<any[]>(() => api("/api/exchange-hubs"));
  const holders = useData<any[]>(() => api("/api/holders"));
  const [form, setForm] = useState({ exchangeHubId: "", firstName: "", lastName: "", email: "", phone: "" });
  const [portalLinks, setPortalLinks] = useState<Record<string, string>>({});
  const create = async () => {
    await api(`/api/exchange-hubs/${form.exchangeHubId}/holders`, { method: "POST", body: JSON.stringify(form) });
    await holders.reload();
  };
  const getPortalLink = async (holderId: string) => {
    const result = await api<any>(`/api/holders/${holderId}/portal-token`, { method: "POST" });
    setPortalLinks((prev) => ({ ...prev, [holderId]: result.portalUrl }));
  };
  const copyLink = (url: string) => navigator.clipboard.writeText(window.location.origin + url);
  return (
    <>
      <Header title="Holders" subtitle="Manage supporters and customers that own Universal Exchange Notes." user={user} />
      <FormGrid>
        <Select label="Hub" value={form.exchangeHubId} options={hubs.data ?? []} onChange={(exchangeHubId) => setForm({ ...form, exchangeHubId })} />
        <Input label="First" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} />
        <Input label="Last" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} />
        <Input label="Email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
        <button onClick={create}><UploadCloud size={16} /> Create Holder</button>
      </FormGrid>
      <DataTable
        rows={holders.data ?? []}
        columns={[
          ["Name", (r) => `${r.firstName} ${r.lastName}`],
          ["Email", (r) => r.email],
          ["Hub", (r) => r.exchangeHub.displayName],
          ["Status", (r) => <Status value={r.status} />],
          ["Portal", (r) => (
            <div className="actions">
              {portalLinks[r.id] ? (
                <>
                  <span style={{ fontSize: 12, color: "#607069", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}>{portalLinks[r.id]}</span>
                  <button className="ghost" onClick={() => copyLink(portalLinks[r.id])}><Copy size={14} /> Copy</button>
                </>
              ) : (
                <button className="ghost" onClick={() => getPortalLink(r.id)}><Wallet size={14} /> Portal Link</button>
              )}
            </div>
          )]
        ]}
      />
    </>
  );
}

function Uens({ user }: { user: any }) {
  const hubs = useData<any[]>(() => api("/api/exchange-hubs"));
  const holders = useData<any[]>(() => api("/api/holders"));
  const uens = useData<any[]>(() => api("/api/uens"));
  const [form, setForm] = useState({ exchangeHubId: "", holderId: "", codePrefix: "", code: "" });
  const hubHolders = useMemo(() => (holders.data ?? []).filter((h) => h.exchangeHubId === form.exchangeHubId), [holders.data, form.exchangeHubId]);
  const create = async () => {
    await api(`/api/exchange-hubs/${form.exchangeHubId}/uens`, {
      method: "POST",
      body: JSON.stringify({
        holderId: form.holderId,
        codePrefix: form.codePrefix || undefined,
        code: form.code || undefined
      })
    });
    await uens.reload();
  };
  const disable = async (id: string) => {
    await api(`/api/uens/${id}/disable`, { method: "POST" });
    await uens.reload();
  };
  const removeFromCirculation = async (id: string) => {
    await api(`/api/uens/${id}/remove-from-circulation`, { method: "POST" });
    await uens.reload();
  };
  const hardDelete = async (id: string) => {
    await api(`/api/uens/${id}`, { method: "DELETE" });
    await uens.reload();
  };
  return (
    <>
      <Header title="Universal Exchange Notes" subtitle="Generate, disable, or remove platform value/access units from circulation." user={user} />
      <FormGrid>
        <Select label="Hub" value={form.exchangeHubId} options={hubs.data ?? []} onChange={(exchangeHubId) => setForm({ ...form, exchangeHubId, holderId: "" })} />
        <Select label="Holder" value={form.holderId} options={hubHolders} labelKey="email" onChange={(holderId) => setForm({ ...form, holderId })} />
        <Input label="Hub code prefix" value={form.codePrefix} onChange={(codePrefix) => setForm({ ...form, codePrefix })} />
        <Input label="Manual code override" value={form.code} onChange={(code) => setForm({ ...form, code })} />
        <button onClick={create}><Ticket size={16} /> Generate UEN</button>
      </FormGrid>
      <DataTable rows={uens.data ?? []} columns={[["Code", (r) => r.code], ["Hub", (r) => r.exchangeHub.displayName], ["Holder", (r) => r.holder.email], ["Status", (r) => <Status value={r.status} />], ["Actions", (r) => <div className="actions"><button className="ghost" onClick={() => disable(r.id)}>Disable</button><button className="ghost danger" onClick={() => removeFromCirculation(r.id)}>Remove from Circulation</button><button className="ghost danger" onClick={() => hardDelete(r.id)}>Delete</button></div>]]} />
    </>
  );
}

function Merchants({ user }: { user: any }) {
  const hubs = useData<any[]>(() => api("/api/exchange-hubs"));
  const merchants = useData<any[]>(() => api("/api/merchants"));
  const [form, setForm] = useState({ businessName: "", platformType: "SHOPIFY", isExchangeHub: false, linkedExchangeHubId: "" });
  const [credForm, setCredForm] = useState({ merchantId: "", contactEmail: "", password: "" });
  const [credMsg, setCredMsg] = useState("");
  const create = async () => {
    await api("/api/merchants", { method: "POST", body: JSON.stringify({ ...form, linkedExchangeHubId: form.linkedExchangeHubId || undefined }) });
    await merchants.reload();
  };
  const resetCredentials = async () => {
    setCredMsg("");
    try {
      const body: Record<string, string> = {};
      if (credForm.contactEmail) body.contactEmail = credForm.contactEmail;
      if (credForm.password) body.password = credForm.password;
      const result = await api<any>(`/api/merchants/${credForm.merchantId}/credentials`, { method: "PATCH", body: JSON.stringify(body) });
      setCredMsg(`Done. ${result.businessName} (${result.contactEmail}) credentials updated.`);
      setCredForm({ merchantId: "", contactEmail: "", password: "" });
    } catch (err) {
      setCredMsg(err instanceof Error ? err.message : "Failed");
    }
  };
  return (
    <>
      <Header title="Merchants" subtitle="Create redemption partners and optionally link them to Exchange Hubs." user={user} />
      <FormGrid>
        <Input label="Business name" value={form.businessName} onChange={(businessName) => setForm({ ...form, businessName })} />
        <Select label="Linked hub" value={form.linkedExchangeHubId} options={hubs.data ?? []} onChange={(linkedExchangeHubId) => setForm({ ...form, linkedExchangeHubId, isExchangeHub: Boolean(linkedExchangeHubId) })} />
        <button onClick={create}><UploadCloud size={16} /> Create Merchant</button>
      </FormGrid>
      <DataTable rows={merchants.data ?? []} columns={[
        ["Business", (r) => r.businessName],
        ["Platform", (r) => r.platformType],
        ["Email", (r) => r.contactEmail ?? "—"],
        ["Status", (r) => <Status value={r.status} />],
        ["Exchange Hub Merchant", (r) => r.isExchangeHub ? "Yes" : "No"],
        ["Actions", (r) => (
          <button className="ghost danger" onClick={async () => {
            if (!window.confirm(`Delete ${r.businessName} and all associated records? This cannot be undone.`)) return;
            try {
              await api(`/api/merchants/${r.id}`, { method: "DELETE" });
              await merchants.reload();
            } catch (err) {
              alert(err instanceof Error ? err.message : "Delete failed");
            }
          }}>Delete</button>
        )]
      ]} />
      <section className="panel" style={{ marginTop: 24 }}>
        <h2>Reset Merchant Login Credentials</h2>
        {credMsg && <Notice tone={credMsg.startsWith("Done") ? "neutral" : "bad"}>{credMsg}</Notice>}
        <FormGrid>
          <Select label="Merchant" value={credForm.merchantId} options={merchants.data ?? []} labelKey="businessName" onChange={(merchantId) => setCredForm({ ...credForm, merchantId })} />
          <Input label="New email (optional)" value={credForm.contactEmail} onChange={(contactEmail) => setCredForm({ ...credForm, contactEmail })} />
          <Input label="New password (optional, min 8)" value={credForm.password} onChange={(password) => setCredForm({ ...credForm, password })} type="password" />
          <button onClick={resetCredentials} disabled={!credForm.merchantId || (!credForm.contactEmail && !credForm.password)}>Reset Credentials</button>
        </FormGrid>
      </section>
    </>
  );
}

function IssuanceProducts({ user }: { user: any }) {
  const hubs = useData<any[]>(() => api("/api/exchange-hubs"));
  const products = useData<any[]>(() => api("/api/issuance-products"));
  const logs = useData<any[]>(() => api("/api/issuance-logs"));
  const [shopifyProducts, setShopifyProducts] = useState<any[]>([]);
  const [selectedIssuanceProductId, setSelectedIssuanceProductId] = useState("");
  const [bulkCount, setBulkCount] = useState("25");
  const [bulkCodes, setBulkCodes] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    exchangeHubId: "",
    shopDomain: "nubreed-love.myshopify.com",
    shopifyProductId: "",
    productTitle: "",
    productImageUrl: "",
    digitalAssetUrl: ""
  });
  const loadShopifyProducts = async () => {
    try {
      const response = await fetch(`/shopify/api/products?shopDomain=${encodeURIComponent(form.shopDomain)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load products");
      setShopifyProducts(payload);
      setNotice(`Loaded ${payload.length} Shopify products`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load Shopify products");
    }
  };
  const create = async () => {
    await api("/api/issuance-products", { method: "POST", body: JSON.stringify(form) });
    await products.reload();
    await logs.reload();
  };
  const selectedHubId = products.data?.find((product) => product.id === selectedIssuanceProductId)?.exchangeHubId ?? form.exchangeHubId;
  const generateCodes = async () => {
    const result = await api<any>(`/api/exchange-hubs/${selectedHubId}/code-inventory/generate`, {
      method: "POST",
      body: JSON.stringify({ count: bulkCount, issuanceProductId: selectedIssuanceProductId || undefined })
    });
    setNotice(`Generated ${result.created} codes. Synced ${result.sync?.synced ?? 0} Shopify discount codes across ${result.sync?.merchantStores ?? 0} store connections.`);
    await products.reload();
  };
  const importCodes = async () => {
    const codes = bulkCodes.split(/\r?\n|,/).map((code) => code.trim()).filter(Boolean);
    const result = await api<any>(`/api/exchange-hubs/${selectedHubId}/code-inventory/import`, {
      method: "POST",
      body: JSON.stringify({ codes, issuanceProductId: selectedIssuanceProductId || undefined })
    });
    setBulkCodes("");
    setNotice(`Imported ${result.created} codes. Synced ${result.sync?.synced ?? 0} Shopify discount codes across ${result.sync?.merchantStores ?? 0} store connections.`);
    await products.reload();
  };
  const syncAvailableCodes = async () => {
    const result = await api<any>(`/api/exchange-hubs/${selectedHubId}/code-inventory/sync`, {
      method: "POST",
      body: JSON.stringify({ issuanceProductId: selectedIssuanceProductId || undefined })
    });
    setNotice(`Selected ${result.selected} available codes. Synced ${result.sync?.synced ?? 0}, skipped ${result.sync?.skipped ?? 0}, errors ${result.sync?.errors ?? 0}.`);
    await products.reload();
  };
  return (
    <>
      <Header title="Product Issuance" subtitle="Map Shopify products to Exchange Hubs so paid orders issue UENs." user={user} />
      {notice && <Notice tone={notice.toLowerCase().includes("could not") || notice.toLowerCase().includes("not connected") ? "bad" : "neutral"}>{notice}</Notice>}
      <FormGrid>
        <Select label="Exchange Hub" value={form.exchangeHubId} options={hubs.data ?? []} onChange={(exchangeHubId) => setForm({ ...form, exchangeHubId })} />
        <Input label="Shop domain" value={form.shopDomain} onChange={(shopDomain) => setForm({ ...form, shopDomain })} />
        <button className="ghost" onClick={loadShopifyProducts}><RefreshCw size={16} /> Load Shopify Products</button>
        <label>
          Selected product
          <input value={form.productTitle || "No product selected"} readOnly />
        </label>
        <Input label="Product title" value={form.productTitle} onChange={(productTitle) => setForm({ ...form, productTitle })} />
        <Input label="Digital asset URL" value={form.digitalAssetUrl} onChange={(digitalAssetUrl) => setForm({ ...form, digitalAssetUrl })} />
        <button onClick={create}><Link2 size={16} /> Map Product</button>
      </FormGrid>
      {shopifyProducts.length > 0 && (
        <section className="product-grid">
          {shopifyProducts.map((product) => (
            <button
              className={`product-option ${form.shopifyProductId === product.id ? "selected" : ""}`}
              key={product.id}
              onClick={() => setForm({ ...form, shopifyProductId: product.id, productTitle: product.title, productImageUrl: product.imageUrl ?? "" })}
            >
              {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className="product-placeholder" />}
              <span>{product.title}</span>
            </button>
          ))}
        </section>
      )}
      <DataTable rows={products.data ?? []} columns={[["Product", (r) => <div className="product-cell">{r.productImageUrl ? <img src={r.productImageUrl} alt="" /> : <span className="product-placeholder" />}<span>{r.productTitle ?? "-"}</span></div>], ["Shop", (r) => r.shopDomain], ["Hub", (r) => r.exchangeHub.displayName], ["Available", (r) => r.availableKeys], ["Issued", (r) => r.issuedKeys], ["Status", (r) => <Status value={r.status} />], ["Action", (r) => <button className="ghost" onClick={() => setSelectedIssuanceProductId(r.id)}>Manage Keys</button>]]} />
      <section className="panel">
        <h2>Code Inventory</h2>
        <FormGrid>
          <SelectText label="Mapped product ID" value={selectedIssuanceProductId} options={(products.data ?? []).map((product) => product.id)} onChange={setSelectedIssuanceProductId} />
          <Input label="Generate count" value={bulkCount} onChange={setBulkCount} />
          <button onClick={generateCodes}><UploadCloud size={16} /> Generate Codes</button>
          <button className="ghost" onClick={syncAvailableCodes}><RefreshCw size={16} /> Sync Available Codes</button>
        </FormGrid>
        <FormGrid>
          <label className="wide">
            Import codes
            <textarea value={bulkCodes} onChange={(event) => setBulkCodes(event.target.value)} placeholder="One code per line or comma-separated" />
          </label>
          <button onClick={importCodes}><UploadCloud size={16} /> Import Codes</button>
        </FormGrid>
      </section>
      <h2>Issuance Logs</h2>
      <DataTable rows={logs.data ?? []} columns={[["Customer", (r) => r.customerEmail], ["Shop", (r) => r.shopDomain], ["Order", (r) => r.shopifyOrderId], ["Status", (r) => <Status value={r.status} />], ["Message", (r) => r.message ?? "-"]]} />
    </>
  );
}

function Offers({ user }: { user: any }) {
  const merchants = useData<any[]>(() => api("/api/merchants"));
  const offers = useData<any[]>(() => api("/api/merchant-offers"));
  const [form, setForm] = useState({ merchantId: "", discountType: "PERCENTAGE", discountValue: "15", minimumOrderAmount: "", usageLimitPerNote: "1" });
  const create = async () => {
    await api(`/api/merchants/${form.merchantId}/offers`, { method: "POST", body: JSON.stringify(form) });
    await offers.reload();
  };
  return (
    <>
      <Header title="Merchant Offers" subtitle="Set merchant-specific value for the same UEN codes." user={user} />
      <FormGrid>
        <Select label="Merchant" value={form.merchantId} options={merchants.data ?? []} labelKey="businessName" onChange={(merchantId) => setForm({ ...form, merchantId })} />
        <SelectText label="Type" value={form.discountType} options={["PERCENTAGE", "FIXED_AMOUNT"]} onChange={(discountType) => setForm({ ...form, discountType })} />
        <Input label="Value" value={form.discountValue} onChange={(discountValue) => setForm({ ...form, discountValue })} />
        <Input label="Minimum order" value={form.minimumOrderAmount} onChange={(minimumOrderAmount) => setForm({ ...form, minimumOrderAmount })} />
        <button onClick={create}><UploadCloud size={16} /> Create Offer</button>
      </FormGrid>
      <DataTable rows={offers.data ?? []} columns={[["Merchant", (r) => r.merchant.businessName], ["Type", (r) => r.discountType], ["Value", (r) => String(r.discountValue)], ["Status", (r) => <Status value={r.status} />]]} />
    </>
  );
}

function AccessRules({ user }: { user: any }) {
  const merchants = useData<any[]>(() => api("/api/merchants"));
  const hubs = useData<any[]>(() => api("/api/exchange-hubs"));
  const rules = useData<any[]>(() => api("/api/merchant-access-rules"));
  const [form, setForm] = useState({ merchantId: "", exchangeHubId: "", status: "ACTIVE" });
  const create = async () => {
    await api(`/api/merchants/${form.merchantId}/access-rules`, { method: "POST", body: JSON.stringify(form) });
    await rules.reload();
  };
  return (
    <>
      <Header title="Merchant Access Rules" subtitle="Decide which Exchange Hub UENs each merchant accepts." user={user} />
      <FormGrid>
        <Select label="Merchant" value={form.merchantId} options={merchants.data ?? []} labelKey="businessName" onChange={(merchantId) => setForm({ ...form, merchantId })} />
        <Select label="Hub" value={form.exchangeHubId} options={hubs.data ?? []} onChange={(exchangeHubId) => setForm({ ...form, exchangeHubId })} />
        <SelectText label="Status" value={form.status} options={["ACTIVE", "PAUSED", "BLOCKED"]} onChange={(status) => setForm({ ...form, status })} />
        <button onClick={create}><Link2 size={16} /> Save Rule</button>
      </FormGrid>
      <DataTable rows={rules.data ?? []} columns={[["Merchant", (r) => r.merchant.businessName], ["Exchange Hub", (r) => r.exchangeHub.displayName], ["Status", (r) => <Status value={r.status} />]]} />
    </>
  );
}

function Connections({ user }: { user: any }) {
  const { data } = useData<any[]>(() => api("/api/shopify-connections"));
  const synced = useData<any[]>(() => api("/api/shopify-synced-notes"));
  const [importStatus, setImportStatus] = useState<Record<string, string>>({});
  const [codePrefixes, setCodePrefixes] = useState<Record<string, string>>({});

  const importHistorical = async (shopDomain: string) => {
    const prefix = (codePrefixes[shopDomain] ?? "").trim();
    if (!prefix) {
      setImportStatus((prev) => ({ ...prev, [shopDomain]: "Enter a code prefix first (e.g. LOVE)" }));
      return;
    }
    setImportStatus((prev) => ({ ...prev, [shopDomain]: `Importing ${prefix}* codes — scanning all orders…` }));
    try {
      const result = await api<any>(`/api/shopify-connections/${encodeURIComponent(shopDomain)}/import-historical`, {
        method: "POST",
        body: JSON.stringify({ codePrefix: prefix })
      });
      const codesText = result.matchedCodes?.length
        ? ` Codes found: ${result.matchedCodes.join(", ")}`
        : " No matching codes found in orders.";
      setImportStatus((prev) => ({ ...prev, [shopDomain]: (result.message ?? "Done") + codesText }));
    } catch (err) {
      setImportStatus((prev) => ({ ...prev, [shopDomain]: err instanceof Error ? err.message : "Import failed" }));
    }
  };

  return (
    <>
      <Header title="Shopify Connections" subtitle="Import historical redemption data by specifying the UEN code prefix used in that store." user={user} />
      <DataTable
        rows={data ?? []}
        columns={[
          ["Shop", (r) => r.shopDomain],
          ["Merchant", (r) => r.merchant.businessName],
          ["Status", (r) => <Status value={r.status} />],
          ["Last Sync", (r) => r.lastSyncAt ? new Date(r.lastSyncAt).toLocaleString() : "Never"],
          ["Import Historical", (r) => (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="actions">
                <input
                  style={{ padding: "4px 8px", fontSize: 12, border: "1px solid #d9e2dd", borderRadius: 4, width: 90 }}
                  placeholder="Prefix (LOVE)"
                  value={codePrefixes[r.shopDomain] ?? ""}
                  onChange={(e) => setCodePrefixes((prev) => ({ ...prev, [r.shopDomain]: e.target.value.toUpperCase() }))}
                />
                <button onClick={() => importHistorical(r.shopDomain)}>
                  <Download size={14} /> Import
                </button>
              </div>
              {importStatus[r.shopDomain] && (
                <span style={{ fontSize: 11, color: "#607069", maxWidth: 340, lineHeight: 1.4 }}>{importStatus[r.shopDomain]}</span>
              )}
            </div>
          )]
        ]}
      />
      <h2>Synced Notes</h2>
      <DataTable rows={synced.data ?? []} columns={[["Code", (r) => r.uenCode], ["Merchant", (r) => r.merchant.businessName], ["Status", (r) => <Status value={r.syncStatus} />], ["Discount ID", (r) => r.shopifyDiscountId ?? "-"]]} />
    </>
  );
}

function SyncLogs({ user }: { user: any }) {
  const { data } = useData<any[]>(() => api("/api/sync-logs"));
  return (
    <>
      <Header title="Sync Logs" subtitle="Audit Shopify sync outcomes and partial failures." user={user} />
      <DataTable rows={data ?? []} columns={[["Merchant", (r) => r.merchant.businessName], ["Shop", (r) => r.shopDomain], ["Status", (r) => <Status value={r.status} />], ["Fetched", (r) => r.totalFetched], ["Errors", (r) => r.totalErrors], ["Message", (r) => r.message]]} />
    </>
  );
}

function ShopifyApp({ user }: { user: any }) {
  const [shop, setShop] = useState(shopDomain());
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const dashboard = useData<any>(() => shopifyApi("/dashboard"), [shop]);
  const logs = useData<any[]>(() => shopifyApi("/sync-logs"), [shop]);
  const [offer, setOffer] = useState({ discountType: "PERCENTAGE", discountValue: "15", minimumOrderAmount: "", usageLimitPerNote: "1" });
  useEffect(() => {
    localStorage.setItem("uen_shop_domain", shop);
  }, [shop]);
  const installOrReconnect = () => {
    setActionError(null);
    setActionMessage(null);
    if (!shop.endsWith(".myshopify.com")) {
      setActionError("Enter the store domain ending in .myshopify.com");
      return;
    }
    window.location.href = `/shopify/auth?shop=${encodeURIComponent(shop)}`;
  };
  const sync = async () => {
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await shopifyApi<any>("/sync", { method: "POST", body: JSON.stringify({}) });
      setActionMessage(result.message ?? "Sync completed");
      await dashboard.reload();
      await logs.reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Sync failed");
    }
  };
  const updateOffer = async () => {
    await shopifyApi("/offer-settings", { method: "POST", body: JSON.stringify(offer) });
    await dashboard.reload();
  };
  const pause = async () => {
    await shopifyApi("/pause", { method: "POST", body: JSON.stringify({}) });
    await dashboard.reload();
  };
  return (
    <>
      <Header title="Shopify Merchant App" subtitle="Connect a store, configure merchant offer rules, and sync allowed UENs." user={user} />
        <section className="split">
        <div className="panel">
          <h2>Store Connection</h2>
          {dashboard.data ? (
            <div className="facts">
              <span>Store {dashboard.data.shopDomain}</span>
              <span>Connection <Status value={dashboard.data.platformConnectionStatus} /></span>
              <span>Merchant <Status value={dashboard.data.merchantStatus} /></span>
            </div>
          ) : (
            <>
              <Notice>{dashboard.error ?? "Install the app to connect this Shopify store automatically."}</Notice>
              <Input label="Shop domain" value={shop} onChange={setShop} />
              <button onClick={installOrReconnect}><Link2 size={16} /> Install or Reconnect</button>
            </>
          )}
        </div>
        <div className="panel">
          <h2>Dashboard</h2>
          {dashboard.data ? (
            <div className="facts">
              <span>Offer {dashboard.data.activeOffer ? `${dashboard.data.activeOffer.discountValue}%` : "None"}</span>
              <span>Synced UENs {dashboard.data.totalSyncedUens}</span>
              <span>Last sync {dashboard.data.lastSyncTime ? new Date(dashboard.data.lastSyncTime).toLocaleString() : "Never"}</span>
            </div>
          ) : <Notice>{dashboard.error ?? "Connect the store to load dashboard data."}</Notice>}
          <div className="actions">
            <button onClick={sync} disabled={!dashboard.data}><RefreshCw size={16} /> Sync UENs Now</button>
            <button className="ghost" onClick={pause} disabled={!dashboard.data}><Pause size={16} /> Pause</button>
          </div>
        </div>
        </section>
        {actionError && <Notice tone="bad">{actionError}</Notice>}
        {actionMessage && <Notice>{actionMessage}</Notice>}
      <section className="panel">
        <h2>Offer Settings</h2>
        <FormGrid>
          <SelectText label="Type" value={offer.discountType} options={["PERCENTAGE", "FIXED_AMOUNT"]} onChange={(discountType) => setOffer({ ...offer, discountType })} />
          <Input label="Value" value={offer.discountValue} onChange={(discountValue) => setOffer({ ...offer, discountValue })} />
          <Input label="Minimum order" value={offer.minimumOrderAmount} onChange={(minimumOrderAmount) => setOffer({ ...offer, minimumOrderAmount })} />
          <Input label="Usage limit" value={offer.usageLimitPerNote} onChange={(usageLimitPerNote) => setOffer({ ...offer, usageLimitPerNote })} />
          <button onClick={updateOffer}><Play size={16} /> Save Offer</button>
        </FormGrid>
      </section>
      <h2>Sync Logs</h2>
      <DataTable rows={logs.data ?? []} columns={[["Status", (r) => <Status value={r.status} />], ["Fetched", (r) => r.totalFetched], ["Created", (r) => r.totalCreated], ["Errors", (r) => r.totalErrors], ["Message", (r) => r.message]]} />
      {dashboard.data?.merchantId && <MerchantAnalyticsPanel merchantId={dashboard.data.merchantId} />}
    </>
  );
}

function Input({ label, value, onChange, type = "text", autoComplete, name, autoFocus }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; name?: string; autoFocus?: boolean }) {
  return (
    <label>
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} name={name} autoFocus={autoFocus} />
    </label>
  );
}

// Password field with the standard eyeball reveal toggle. Mirrors Input's label
// wrapper so it inherits the same form styling; the input is wrapped in a
// relative span so the icon button stays centered on the field regardless of
// the label text above it.
function PasswordInput({ label, value, onChange, autoComplete = "current-password", name = "password" }: { label: string; value: string; onChange: (value: string) => void; autoComplete?: string; name?: string }) {
  const [show, setShow] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const checkCaps = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof event.getModifierState === "function") setCapsOn(event.getModifierState("CapsLock"));
  };
  return (
    <label>
      {label}
      <span style={{ position: "relative", display: "block" }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyUp={checkCaps}
          onKeyDown={checkCaps}
          autoComplete={autoComplete}
          name={name}
          style={{ width: "100%", paddingRight: 42 }}
        />
        <button
          type="button"
          onClick={() => setShow((prev) => !prev)}
          aria-label={show ? "Hide password" : "Show password"}
          title={show ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "auto",
            background: "transparent",
            border: "none",
            padding: 4,
            margin: 0,
            cursor: "pointer",
            color: "#94a3b8"
          }}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
      {capsOn && <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "#b45309" }}>⚠ Caps Lock is on</span>}
    </label>
  );
}

function Select({ label, value, options, onChange, labelKey = "displayName" }: { label: string; value: string; options: any[]; onChange: (value: string) => void; labelKey?: string }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select...</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option[labelKey] ?? option.name ?? option.id}</option>)}
      </select>
    </label>
  );
}

function SelectText({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <section className="form-grid">{children}</section>;
}

function Notice({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "bad" }) {
  return <div className={`notice notice-${tone}`}>{children}</div>;
}

// --- HolderRegister ---

function HolderRegister() {
  const params = new URLSearchParams(window.location.search);
  const preselectedHub = params.get("hub") ?? "";
  const preselectedEmail = params.get("email") ?? "";
  const hubs = useData<any[]>(() => fetch("/api/public/exchange-hubs").then((r) => r.json()));
  const [form, setForm] = useState({ exchangeHubId: preselectedHub, email: preselectedEmail, password: "" });
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState(params.get("expired") === "1" ? "That sign-in link expired. Enter your email and we'll send a fresh one." : "");
  const [loading, setLoading] = useState(false);
  // The hub is normally known (passed by the widget, or resolved from the email),
  // so the picker stays hidden until the server says it genuinely needs one.
  const [showHubPicker, setShowHubPicker] = useState(false);
  const [showPw, setShowPw] = useState(false);
  // Hide the bootstrap/test hub from the public picker.
  const hubOptions = (hubs.data ?? []).filter((h: any) => h.displayName !== "Exchange Hub A");

  // Emails a one-time sign-in link (passwordless / forgot-password path).
  const sendLink = async () => {
    setError("");
    if (!form.email) { setError("Please enter your email address."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/holder/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exchangeHubId: form.exchangeHubId, email: form.email })
      });
      const payload = await res.json();
      if (!res.ok) {
        if (payload.needsHub) setShowHubPicker(true);
        throw new Error(payload.error ?? "Could not send your sign-in link");
      }
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your sign-in link");
    } finally {
      setLoading(false);
    }
  };

  // Primary action: with a password, sign in directly; without one, fall back
  // to the email link so nobody is stuck.
  const signIn = async () => {
    setError("");
    if (!form.email) { setError("Please enter your email address."); return; }
    if (!form.password) { return sendLink(); }
    setLoading(true);
    try {
      const res = await fetch("/api/holder/login-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exchangeHubId: form.exchangeHubId || undefined, email: form.email, password: form.password })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Could not sign in");
      try { localStorage.setItem("uen_portal_token", payload.portalToken); } catch { /* storage may be blocked */ }
      window.location.href = `/holder/portal?token=${encodeURIComponent(payload.portalToken)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      setLoading(false);
    }
  };

  return (
    <div className="holder-reg-root">
      <nav className="holder-reg-nav">
        <a className="uenite-logo" href="/"><Shield size={22} /><BrandWord /></a>
        <a className="reg-back-link" href="/signup">Back to all options</a>
      </nav>

      <div className="holder-reg-body">
        <div className="holder-reg-card">
          {!result ? (
            <>
              <div className="holder-reg-icon"><Wallet size={32} /></div>
              <h1 className="holder-reg-title">Access your UEN wallet</h1>
              <p className="holder-reg-sub">Your UEN wallet holds your <strong>Universal Exchange Notes</strong> — the original <strong>Love Notes</strong> — in one place, ready to redeem with participating merchants. Enter your email and we'll send a secure link to open it.</p>

              {error && <div className="holder-reg-error">{error}</div>}

              <div className="holder-reg-form">
                {showHubPicker && (
                  <label className="holder-reg-label">
                    Where did you get your notes from?
                    <select
                      className="holder-reg-input"
                      value={form.exchangeHubId}
                      onChange={(e) => setForm({ ...form, exchangeHubId: e.target.value })}
                    >
                      <option value="">Select where you got your notes</option>
                      {hubOptions.map((h: any) => (
                        <option key={h.id} value={h.id}>{h.displayName}</option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="holder-reg-label">
                  Email address
                  <input
                    className="holder-reg-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@email.com"
                    onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
                  />
                </label>

                <label className="holder-reg-label">
                  Password
                  <span style={{ position: "relative", display: "block" }}>
                    <input
                      className="holder-reg-input"
                      type={showPw ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="Leave blank to get a sign-in link"
                      onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
                      style={{ paddingRight: 42 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((prev) => !prev)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                      title={showPw ? "Hide password" : "Show password"}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", justifyContent: "center", width: "auto", background: "transparent", border: "none", padding: 4, margin: 0, cursor: "pointer", color: "#94a3b8" }}
                    >
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>

                <button className="holder-reg-btn" onClick={signIn} disabled={loading}>
                  {loading ? "Working..." : form.password ? <><Shield size={16} /> Sign In</> : <><Mail size={16} /> Email Me a Sign-In Link</>}
                </button>

                <button className="mp-link-btn" style={{ marginTop: 10 }} onClick={sendLink} disabled={loading}>
                  Forgot your password? Email me a sign-in link
                </button>

                <p className="holder-reg-fine">
                  No password yet? Leave it blank for a secure email link — you can set a password later in your wallet settings.
                </p>
              </div>
            </>
          ) : (
            <div className="holder-reg-success">
              <div className="holder-reg-success-icon"><Mail size={40} /></div>
              <h1>Check your email</h1>
              <p>We sent a secure sign-in link to <strong>{result.email}</strong>. Open that email and tap <strong>Open my wallet</strong> to view your notes. The link works for 15 minutes.</p>

              <p className="holder-reg-fine">
                Didn't get it? Check your spam folder, or{" "}
                <button className="mp-link-btn" onClick={() => { setResult(null); }}>try again</button>.
              </p>
            </div>
          )}
        </div>

        <div className="holder-reg-side">
          <div className="holder-reg-side-content">
            <span className="eyebrow"><Ticket size={16} /> What is a UEN wallet?</span>
            <h2>Your Love Notes, now Universal Exchange Notes.</h2>
            <p className="holder-reg-side-intro">A Universal Exchange Note (UEN) is the original Love Note — a token of support you can actually redeem for value. Your wallet keeps every one of them in a single place.</p>
            <ul className="holder-reg-perks">
              {[
                [Wallet, "Every Love Note you've received, now as Universal Exchange Notes, in one place"],
                [DollarSign, "Redeem them for real discounts at participating merchants"],
                [ShoppingBag, "See which merchants and offers your notes unlock"],
                [CheckCircle, "Track what you've redeemed and where"],
                [Bell, "Get notified when new value or merchants are added"]
              ].map(([Icon, text], i) => (
                <li key={i}>
                  <span className="holder-reg-perk-icon"><Icon size={16} /></span>
                  <span>{text as string}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <PoweredByFooter />
    </div>
  );
}

// --- WidgetPreviewPage ---

function WidgetPreviewPage() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [codeShown, setCodeShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const demoCode = "NUBREED9827391UEN";
  const demoAvailable = 3;
  const demoOffer = "15% off";
  const demoValue = "$45.00 in available value";

  const copyCode = () => {
    navigator.clipboard.writeText(demoCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="widget-preview-page">
      <nav className="uenite-nav about-nav">
        <a className="uenite-logo" href="/"><Shield size={24} /><BrandWord /></a>
        <div>
          <a href="/holder/portal?demo=1">Holder Portal</a>
          <a href="/merchants/register">Merchant Signup</a>
        </div>
      </nav>

      <section className="widget-preview-hero">
        <span className="eyebrow dark"><Zap size={16} /> Merchant Widget Preview</span>
        <h1>The UEN widget as it appears on a merchant's Shopify store</h1>
        <p>Once a merchant installs the UEN app, this floating widget appears on every page of their store. UEN holders who are logged in will see their available notes and can redeem instantly.</p>
      </section>

      <div className="widget-preview-shell">
        {/* Mock merchant storefront */}
        <div className="widget-mock-store">
          <div className="widget-mock-header">
            <div className="widget-mock-logo"><ShoppingBag size={18} /><strong>Demo Merchant Store</strong></div>
            <div className="widget-mock-nav"><span>Home</span><span>Shop</span><span>About</span><a href="#" className="widget-mock-cart"><Tag size={16} /> Cart (1)</a></div>
          </div>
          <div className="widget-mock-product">
            <div className="widget-mock-product-img" />
            <div className="widget-mock-product-info">
              <span className="widget-mock-category">Featured Product</span>
              <h2>Signature Collection Item</h2>
              <p>A premium product available to UEN holders with an automatic 15% discount applied at checkout through the UEN merchant network.</p>
              <div className="widget-mock-price">
                <strong>$89.99</strong>
                <span className="widget-mock-discount">UEN holders: ~$76.49</span>
              </div>
              <button className="widget-mock-buy">Add to Cart</button>
            </div>
          </div>
          <p className="widget-mock-note"><Shield size={13} /> This store accepts Universal Exchange Notes. Look for the UEN widget button at the bottom right.</p>
        </div>

        {/* Floating FAB */}
        <button className="widget-preview-fab" onClick={() => { setPanelOpen(!panelOpen); setCodeShown(false); }}>
          <span className="widget-fab-dot" />
          UEN Discount
        </button>

        {/* Widget panel */}
        {panelOpen && (
          <div className="widget-preview-panel">
            <div className="widget-panel-header">
              <span className="widget-panel-title">UEN Wallet</span>
              <button className="widget-panel-close" onClick={() => setPanelOpen(false)}>×</button>
            </div>

            <div className="widget-count-display">
              <strong>{demoAvailable}</strong>
              <span className="widget-uen-label">UEN</span>
              <p className="widget-value-line">Each worth <strong>{demoOffer}</strong> here</p>
            </div>

            <div className="widget-offer-pill">
              Use 1 UEN → <strong>{demoOffer}</strong> at checkout
            </div>

            {!codeShown ? (
              <div className="widget-actions">
                <button className="widget-btn widget-btn-primary" onClick={() => { setPanelOpen(false); }}>
                  Apply Discount Automatically
                </button>
                <button className="widget-btn widget-btn-secondary" onClick={() => setCodeShown(true)}>
                  Generate Code to Paste
                </button>
              </div>
            ) : (
              <>
                <div className="widget-actions">
                  <button className="widget-btn widget-btn-primary" disabled>
                    Apply Discount Automatically
                  </button>
                  <button className="widget-btn widget-btn-secondary" disabled>
                    Code Generated
                  </button>
                </div>
                <div className="widget-code-result">
                  <p>Your discount code (paste at checkout):</p>
                  <div className="widget-code-row">
                    <code>{demoCode}</code>
                    <button className="widget-copy-btn" onClick={copyCode}>{copied ? "Copied!" : "Copy"}</button>
                  </div>
                </div>
              </>
            )}

            <p className="widget-footer-note"><Shield size={11} /> Powered by UENITE · {demoValue}</p>
          </div>
        )}
      </div>

      <section className="widget-preview-explainer">
        <div className="widget-explainer-grid">
          <article>
            <Wallet size={28} />
            <h3>Holder sees UEN count + value</h3>
            <p>The big number shows how many UENs they have available at this specific merchant. Each UEN is worth whatever the merchant has set (e.g. 15% off).</p>
          </article>
          <article>
            <Zap size={28} />
            <h3>Two redemption paths</h3>
            <p><strong>Auto:</strong> One click sends them straight to checkout with the discount pre-applied. <strong>Manual:</strong> Generates a unique code they copy and paste themselves.</p>
          </article>
          <article>
            <Shield size={28} />
            <h3>One use per merchant</h3>
            <p>Each UEN can only be redeemed once per merchant. The same UEN stays valid at every other merchant in the network until used there.</p>
          </article>
          <article>
            <Tag size={28} />
            <h3>Install via Shopify</h3>
            <p>Merchants install the UEN app from their Shopify admin. One script tag is injected automatically — no theme coding required.</p>
          </article>
        </div>
      </section>

      <PoweredByFooter />
    </main>
  );
}

// --- HolderPortal ---

function HolderPortal() {
  const token = portalToken();
  const demoMode = new URLSearchParams(window.location.search).get("demo") === "1";

  if (!token && demoMode) {
    return <DemoHolderPortal />;
  }

  if (!token) {
    return (
      <div className="portal-error">
        <Shield size={48} />
        <h1>No portal token</h1>
        <p>This link is missing a valid portal token. Contact your Exchange Hub for your personal portal link.</p>
      </div>
    );
  }

  return <LiveHolderPortal token={token} />;
}

function HolderProfilePrompt({ holder, onSaved, editing = false }: { holder: any; onSaved: () => void; editing?: boolean }) {
  const knownName = holder.firstName && holder.firstName.trim().toLowerCase() !== "holder";
  const [first, setFirst] = useState(knownName ? holder.firstName : "");
  const [last, setLast] = useState(knownName ? (holder.lastName ?? "") : "");
  const [phone, setPhone] = useState(holder.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    if (!first.trim()) { setErr("Please enter your first name."); return; }
    if (phone.replace(/\D/g, "").length < 7) { setErr("Please enter a valid phone number."); return; }
    setSaving(true); setErr("");
    try {
      await portalApi("/api/holder/profile", { method: "POST", body: JSON.stringify({ firstName: first.trim(), lastName: last.trim(), phone: phone.trim() }) });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  };
  return (
    <div className="portal-profile-prompt">
      <p>{editing
        ? "Update your details below."
        : knownName
        ? "Verify your details and add your phone number to unlock all wallet features."
        : "Verify your details to unlock all wallet features — redeeming, codes, and merchant offers."}</p>
      <div className="portal-profile-email">Signed in as <strong>{holder.email}</strong></div>
      <div className="portal-profile-fields">
        <input placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} />
        <input placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} />
        <input placeholder="Phone number (required)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        <button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save details" : "Verify & Unlock"}</button>
      </div>
      {err && <p className="portal-profile-err">{err}</p>}
      {editing && <HolderEmailSection holder={holder} />}
      {editing && <HolderPasswordSection holder={holder} />}
    </div>
  );
}

function HolderEmailSection({ holder }: { holder: any }) {
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const submit = async () => {
    setErr(""); setMsg("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail.trim())) { setErr("Enter a valid email address."); return; }
    setBusy(true);
    try {
      await portalApi("/api/holder/request-email-change", { method: "POST", body: JSON.stringify({ newEmail: newEmail.trim() }) });
      setMsg(`We sent a confirmation link to ${newEmail.trim()}. Click it to switch your email — nothing changes until you do.`);
      setNewEmail("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the email change");
    } finally { setBusy(false); }
  };
  return (
    <div className="portal-settings-section">
      <h4>Email address</h4>
      <p className="portal-settings-hint">Your email is how you sign in. Changing it sends a confirmation link to the new address.</p>
      <div className="portal-profile-fields">
        <input placeholder={`New email (current: ${holder.email})`} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        <button onClick={submit} disabled={busy}>{busy ? "Sending…" : "Send confirmation link"}</button>
      </div>
      {msg && <p className="portal-profile-msg">{msg}</p>}
      {err && <p className="portal-profile-err">{err}</p>}
    </div>
  );
}

function HolderPasswordSection({ holder }: { holder: any }) {
  const hasPassword = Boolean(holder.hasPassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const submit = async () => {
    setErr(""); setMsg("");
    if (next.length < 8) { setErr("Password must be at least 8 characters."); return; }
    setBusy(true);
    try {
      await portalApi("/api/holder/password", { method: "POST", body: JSON.stringify({ currentPassword: current || undefined, newPassword: next }) });
      setMsg(hasPassword ? "Password updated." : "Password set. You can now sign in with your email and password.");
      setCurrent(""); setNext("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update password");
    } finally { setBusy(false); }
  };
  return (
    <div className="portal-settings-section">
      <h4>{hasPassword ? "Change password" : "Set a password"}</h4>
      <p className="portal-settings-hint">{hasPassword ? "Update the password you use to sign in." : "Optional — set one so you can sign in with a password instead of an email link each time."}</p>
      <div className="portal-profile-fields">
        {hasPassword && <input placeholder="Current password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
        <input placeholder="New password (min 8 characters)" type="password" value={next} onChange={(e) => setNext(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        <button onClick={submit} disabled={busy}>{busy ? "Saving…" : hasPassword ? "Update password" : "Set password"}</button>
      </div>
      {msg && <p className="portal-profile-msg">{msg}</p>}
      {err && <p className="portal-profile-err">{err}</p>}
    </div>
  );
}

// Spectacular celebration banner shown only to original Love Note supporters.
// Desktop: a multi-color glow tracks the cursor. Touch: the glow drifts on
// scroll. The "Love Notes" wordmark runs an animated sky-blue -> green -> pink
// -> purple gradient. Pure CSS/JS, no libraries.
function LoveNoteSupporterBanner() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    if (finePointer) {
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
        el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
      };
      el.addEventListener("mousemove", onMove);
      return () => el.removeEventListener("mousemove", onMove);
    }
    // Touch devices: the glow sweeps across as the supporter scrolls.
    const onScroll = () => {
      const p = Math.min(1, Math.max(0, window.scrollY / 500));
      el.style.setProperty("--mx", `${15 + p * 70}%`);
      el.style.setProperty("--my", `${25 + p * 50}%`);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className="ln-banner" ref={ref}>
      <div className="ln-banner-aurora" />
      <div className="ln-banner-glow" />
      <div className="ln-banner-sparkles" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} style={{ top: `${(i * 61) % 96}%`, left: `${(i * 37) % 94}%`, animationDelay: `${(i % 7) * 0.45}s` } as React.CSSProperties} />
        ))}
      </div>
      <div className="ln-banner-art" aria-hidden="true">
        <svg viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="lnArtGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f7d889" />
              <stop offset="0.55" stopColor="#f2c14e" />
              <stop offset="1" stopColor="#caa4ff" />
            </linearGradient>
          </defs>
          <g stroke="url(#lnArtGrad)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
            <rect x="22" y="46" width="96" height="60" rx="12" />
            <path d="M24 52 L70 84 L116 52" />
          </g>
          <g className="ln-art-heart" transform="translate(57 24) scale(1.15)">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="url(#lnArtGrad)" />
          </g>
        </svg>
      </div>
      <div className="ln-banner-content">
        <span className="ln-banner-eyebrow">A celebration of you</span>
        <h2 className="ln-banner-title">Welcome, <span className="ln-gradient">Love Note</span> Supporter</h2>
        <p className="ln-banner-text">
          <strong>Love Notes</strong> flourished because of you. Every note you hold is a thank-you —
          and this wallet is our way of celebrating the supporters who made it all possible.
        </p>
      </div>
    </div>
  );
}

function LiveHolderPortal({ token }: { token: string }) {
  const wallet = useData<any>(() => portalApi("/api/holder/wallet"), [token]);
  const merchants = useData<any[]>(() => portalApi("/api/holder/merchants"), [token]);
  const banners = useData<any[]>(() => portalApi("/api/holder/banners"), [token]);
  const [activeTab, setActiveTab] = useState<"collection" | "wallet" | "merchants">("collection");
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const signOut = () => {
    localStorage.removeItem("uen_portal_token");
    window.location.href = "/";
  };

  if (wallet.loading) {
    return (
      <div className="portal-loading">
        <div className="portal-loading-coin-wrap">
          <div className="portal-loading-glow" />
          <img className="portal-loading-coin" src="/uenite-coin.png" alt="UENITE" />
        </div>
        <p>Loading your wallet...</p>
      </div>
    );
  }

  if (wallet.error || !wallet.data) {
    return (
      <div className="portal-error">
        <Shield size={48} />
        <h1>Could not load wallet</h1>
        <p>{wallet.error ?? "Invalid or expired portal link."}</p>
      </div>
    );
  }

  const { holder, uens, notifications, unreadCount, estimatedTotalValue, participatingMerchants } = wallet.data;
  const hub = holder.exchangeHub;
  const holderHasName = Boolean(holder.firstName) && holder.firstName.trim().toLowerCase() !== "holder";
  const profileComplete = holderHasName && Boolean(holder.phone);
  const totalActive = uens.filter((u: any) => u.status === "ACTIVE").length;
  const totalRedeemed = uens.reduce((n: number, u: any) => n + u.redemptions.filter((r: any) => r.redeemed).length, 0);
  const uenItems: CollectionItem[] = uens.map((uen: any, index: number) => ({
    id: uen.id,
    type: "Universal Exchange Note",
    title: uen.code,
    source: hub.displayName,
    rarity: index === 0 ? "Founding" : "Earned",
    value: uen.estimatedValue > 0 ? `$${Number(uen.estimatedValue).toFixed(2)}` : "Redeemable",
    date: new Date(uen.issuedAt ?? uen.createdAt).toLocaleDateString(),
    status: uen.status,
    description: `A Universal Exchange Note issued by ${hub.displayName}. This item stays in your collection as proof of support and can unlock value with participating merchants.`
  }));
  // Love Note supporters always get the collectible digital Love Note, pinned first.
  const ownedItems: CollectionItem[] = holder.isLoveNoteSupporter ? [LOVE_NOTE_COLLECTIBLE, LOVE_NOTE_MUSIC, ...uenItems] : uenItems;
  const holderCollectionItems = ownedItems.length > 0 ? ownedItems : demoCollectionItems;

  const formatOffer = (offer: any) => {
    if (!offer) return "No offer";
    if (offer.discountType === "PERCENTAGE") return `${offer.discountValue}% off`;
    if (offer.discountType === "FIXED_AMOUNT") return `$${offer.discountValue} off`;
    return "Offer active";
  };

  const emailChangeStatus = new URLSearchParams(window.location.search).get("emailChange");

  return (
    <div className="portal-root">
      {emailChangeStatus && (
        <div className={`portal-banner ${emailChangeStatus === "success" ? "portal-banner-ok" : "portal-banner-warn"}`}>
          {emailChangeStatus === "success"
            ? `Your email was changed to ${holder.email}.`
            : emailChangeStatus === "taken"
            ? "That email is already in use, so your email wasn't changed."
            : "That email-change link expired. Please try again from your settings."}
        </div>
      )}
      {/* Nav */}
      <nav className="portal-nav">
        <div className="portal-nav-brand">
          <div className="portal-hub-dot portal-hub-dot-pulse" style={{ background: hub.brandColor ?? "#1f6f5b" }} />
          <span className="portal-brand-text">UENITE<small>Universal Exchange Note</small><small className="portal-brand-sub">the original Love Note</small></span>
        </div>
        <div className="portal-nav-actions">
          <button className="portal-notif-btn" onClick={() => { setNotifOpen(!notifOpen); setMenuOpen(false); }}>
            <Bell size={20} />
            {unreadCount > 0 && <span className="portal-notif-badge">{unreadCount}</span>}
          </button>
          <button className="portal-notif-btn" onClick={() => { setMenuOpen(!menuOpen); setNotifOpen(false); }} aria-label="Account menu">
            <Menu size={20} />
          </button>
        </div>
      </nav>

      {/* Account menu */}
      {menuOpen && (
        <div className="portal-menu-drawer">
          <button onClick={() => { setEditOpen(true); setMenuOpen(false); }}>Edit my details</button>
          <a href={`mailto:work@zahbrandsolutions.com?subject=UENITE help request&body=Wallet email: ${encodeURIComponent(holder.email)}`}>Help &amp; contact</a>
          <a href={`mailto:work@zahbrandsolutions.com?subject=Something is missing from my wallet&body=Wallet email: ${encodeURIComponent(holder.email)}%0AWhat's missing: `}>Report something missing</a>
          <a href={`mailto:work@zahbrandsolutions.com?subject=Delete my UENITE account&body=Please delete the account for: ${encodeURIComponent(holder.email)}`}>Request account deletion</a>
          <button className="portal-menu-signout" onClick={signOut}>Sign out</button>
        </div>
      )}

      {/* Edit profile modal */}
      {editOpen && (
        <div className="portal-modal-backdrop" onClick={() => setEditOpen(false)}>
          <div className="portal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="portal-notif-header">
              <h3>My details</h3>
              <button className="portal-icon-btn" onClick={() => setEditOpen(false)}><X size={18} /></button>
            </div>
            <HolderProfilePrompt holder={holder} editing onSaved={() => { setEditOpen(false); wallet.reload(); }} />
          </div>
        </div>
      )}

      {/* Notification drawer */}
      {notifOpen && (
        <div className="portal-notif-drawer">
          <div className="portal-notif-header">
            <h3>Notifications</h3>
            <button className="portal-icon-btn" onClick={() => setNotifOpen(false)}><X size={18} /></button>
          </div>
          {notifications.length === 0 ? (
            <p className="portal-notif-empty">No notifications yet.</p>
          ) : (
            notifications.map((n: any) => (
              <div key={n.id} className={`portal-notif-item ${n.readAt ? "portal-notif-read" : ""}`}>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <span>{new Date(n.createdAt).toLocaleDateString()}</span>
              </div>
            ))
          )}
        </div>
      )}

      {holder.isLoveNoteSupporter && <LoveNoteSupporterBanner />}

      {/* Hero / wallet overview */}
      <section className="portal-hero">
        <div className="portal-hero-inner">
          <div className="portal-hero-copy">
            <p className="portal-greeting">{holderHasName ? "Welcome back," : "Welcome to your wallet"}</p>
            <h1 className="portal-name">{holderHasName ? `${holder.firstName} ${holder.lastName}`.trim() : "Let's finish setting up"}</h1>
            {!profileComplete && <HolderProfilePrompt holder={holder} onSaved={wallet.reload} />}
            <div className="portal-stats-row">
              <div className="portal-stat">
                <Wallet size={18} />
                <div>
                  <strong>{totalActive}</strong>
                  <span>Active UEN{totalActive !== 1 ? "s" : ""}</span>
                </div>
              </div>
              {estimatedTotalValue > 0 && (
                <div className="portal-stat">
                  <DollarSign size={18} />
                  <div>
                    <strong>${Number(estimatedTotalValue).toFixed(2)}</strong>
                    <span>Est. value across {participatingMerchants} merchant{participatingMerchants !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              )}
              <div className="portal-stat">
                <CheckCircle size={18} />
                <div>
                  <strong>{totalRedeemed}</strong>
                  <span>Times redeemed</span>
                </div>
              </div>
            </div>
          </div>
          <div className="portal-hero-uen-chip">
            <div className="portal-uen-chip-inner">
              <span>UENITE Network</span>
              <strong>{totalActive}</strong>
              <span className="uen-label">UEN</span>
              <span>Notes active</span>
            </div>
          </div>
        </div>
      </section>

      {/* Banners */}
      {(banners.data ?? []).length > 0 && (
        <div className="portal-banners">
          {(banners.data ?? []).map((banner: any) => (
            <div
              key={banner.id}
              className="portal-banner"
              style={{ background: banner.bgColor, color: banner.textColor }}
            >
              {banner.imageUrl && <img src={banner.imageUrl} alt="" />}
              <div className="portal-banner-copy">
                <strong>{banner.title}</strong>
                {banner.body && <p>{banner.body}</p>}
                {banner.linkUrl && (
                  <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer">
                    {banner.linkLabel ?? "Learn more"} <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar — redemption features unlock once the profile is verified */}
      <div className="portal-tabs">
        <button className={`portal-tab ${activeTab === "collection" ? "active" : ""}`} onClick={() => setActiveTab("collection")}>
          <Star size={16} /> Collection
        </button>
        <button className={`portal-tab ${activeTab === "merchants" ? "active" : ""} ${!profileComplete ? "portal-tab-locked" : ""}`} onClick={() => profileComplete && setActiveTab("merchants")}>
          <Globe size={16} /> Where to Redeem {!profileComplete && <Shield size={12} />}
        </button>
        <button className={`portal-tab ${activeTab === "wallet" ? "active" : ""} ${!profileComplete ? "portal-tab-locked" : ""}`} onClick={() => profileComplete && setActiveTab("wallet")}>
          <Wallet size={16} /> My Codes {!profileComplete && <Shield size={12} />}
        </button>
      </div>
      {!profileComplete && (
        <p className="portal-locked-note">Verify your name and phone number above to unlock redemption features.</p>
      )}

      {activeTab === "collection" && (
        <HolderCollectionExperience holderName={holder.firstName} items={holderCollectionItems} portalToken={token} />
      )}

      {/* Merchant directory */}
      {activeTab === "merchants" && (
        <section className="portal-section">
          <div className="portal-section-inner">
            {merchants.loading && <p className="portal-loading-text">Loading merchants...</p>}
            {(merchants.data ?? []).length === 0 && !merchants.loading && (
              <div className="portal-empty">
                <ShoppingBag size={40} />
                <p>No merchants available yet. Check back soon.</p>
              </div>
            )}
            <div className="portal-merchant-grid">
              {(merchants.data ?? []).map((m: any) => (
                <article key={m.id} className="portal-merchant-card">
                  <div className="portal-merchant-offer">
                    <Tag size={16} />
                    <span>{formatOffer(m.offer)}</span>
                  </div>
                  <h3 className="portal-merchant-name">{m.businessName}</h3>
                  {m.offer?.minimumOrderAmount && (
                    <p className="portal-merchant-min">Min. order ${m.offer.minimumOrderAmount}</p>
                  )}
                  <div className="portal-merchant-meta">
                    <span className={m.availableUens > 0 ? "portal-avail-yes" : "portal-avail-no"}>
                      <CheckCircle size={13} /> {m.availableUens} available
                    </span>
                    {m.redeemedUens > 0 && (
                      <span className="portal-redeemed-count">
                        <RefreshCw size={13} /> {m.redeemedUens} used
                      </span>
                    )}
                  </div>
                  {m.shopUrl && (
                    <a className="portal-shop-btn" href={m.shopUrl} target="_blank" rel="noopener noreferrer">
                      Shop Now <ExternalLink size={14} />
                    </a>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Wallet / code list */}
      {activeTab === "wallet" && (
        <section className="portal-section">
          <div className="portal-section-inner">
            {uens.length === 0 && (
              <div className="portal-empty">
                <Ticket size={40} />
                <p>No active UEN codes yet.</p>
              </div>
            )}
            <div className="portal-code-grid">
              {uens.map((uen: any) => {
                const usedAt = uen.redemptions.filter((r: any) => r.redeemed);
                const availableAt = uen.redemptions.filter((r: any) => !r.redeemed && r.syncStatus === "SYNCED");
                return (
                  <article key={uen.id} className="portal-code-card">
                    <div className="portal-code-top">
                      <span className="portal-code-label">UEN Code</span>
                      <button className="portal-copy-btn" onClick={() => navigator.clipboard.writeText(uen.code)} title="Copy code">
                        <Copy size={14} />
                      </button>
                    </div>
                    <div className="portal-code-value">{uen.code}</div>
                    <div className="portal-code-footer">
                      <span className={`portal-code-status ${uen.status === "ACTIVE" ? "active" : "inactive"}`}>
                        {uen.status}
                      </span>
                      {availableAt.length > 0 && (
                        <span className="portal-code-meta">
                          <CheckCircle size={12} /> Available at {availableAt.length} merchant{availableAt.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {usedAt.length > 0 && (
                        <span className="portal-code-meta used">
                          <RefreshCw size={12} /> Used at {usedAt.length} merchant{usedAt.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {usedAt.length > 0 && (
                      <div className="portal-code-used-list">
                        {usedAt.map((r: any) => (
                          <span key={r.merchantId} className="portal-used-chip">
                            {r.merchantName}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <footer className="portal-footer">
        <Shield size={16} />
        <span>Powered by UENITE (Universal Exchange Note)</span>
      </footer>
    </div>
  );
}

// --- BannersAdmin ---

function BannersAdmin({ user }: { user: any }) {
  const hubs = useData<any[]>(() => api("/api/exchange-hubs"));
  const banners = useData<any[]>(() => api("/api/banners"));
  const [form, setForm] = useState({
    title: "", body: "", imageUrl: "", linkUrl: "", linkLabel: "",
    bgColor: "#1f6f5b", textColor: "#ffffff", targetScope: "ALL", priority: "0"
  });
  const [msg, setMsg] = useState("");

  const create = async () => {
    await api("/api/banners", { method: "POST", body: JSON.stringify(form) });
    setMsg("Banner created");
    setForm({ title: "", body: "", imageUrl: "", linkUrl: "", linkLabel: "", bgColor: "#1f6f5b", textColor: "#ffffff", targetScope: "ALL", priority: "0" });
    await banners.reload();
  };

  const archive = async (id: string) => {
    await api(`/api/banners/${id}`, { method: "PATCH", body: JSON.stringify({ status: "ARCHIVED" }) });
    await banners.reload();
  };

  const del = async (id: string) => {
    await api(`/api/banners/${id}`, { method: "DELETE" });
    await banners.reload();
  };

  return (
    <>
      <Header title="Portal Banners" subtitle="Create promotional banners displayed in the Holder portal." user={user} />
      {msg && <Notice>{msg}</Notice>}
      <section className="panel">
        <h2>New Banner</h2>
        <div className="banner-preview" style={{ background: form.bgColor, color: form.textColor }}>
          <strong>{form.title || "Banner title preview"}</strong>
          {form.body && <p>{form.body}</p>}
          {form.linkLabel && <span>{`${form.linkLabel} ->`}</span>}
        </div>
        <FormGrid>
          <Input label="Title *" value={form.title} onChange={(title) => setForm({ ...form, title })} />
          <Input label="Body text" value={form.body} onChange={(body) => setForm({ ...form, body })} />
          <Input label="Image URL" value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
          <Input label="Link URL" value={form.linkUrl} onChange={(linkUrl) => setForm({ ...form, linkUrl })} />
          <Input label="Link label" value={form.linkLabel} onChange={(linkLabel) => setForm({ ...form, linkLabel })} />
          <label>
            Background color
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.bgColor} onChange={(e) => setForm({ ...form, bgColor: e.target.value })} style={{ width: 48, minHeight: 38, padding: 2 }} />
              <input value={form.bgColor} onChange={(e) => setForm({ ...form, bgColor: e.target.value })} style={{ flex: 1 }} />
            </div>
          </label>
          <label>
            Text color
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.textColor} onChange={(e) => setForm({ ...form, textColor: e.target.value })} style={{ width: 48, minHeight: 38, padding: 2 }} />
              <input value={form.textColor} onChange={(e) => setForm({ ...form, textColor: e.target.value })} style={{ flex: 1 }} />
            </div>
          </label>
          <label>
            Target audience
            <select value={form.targetScope} onChange={(e) => setForm({ ...form, targetScope: e.target.value })}>
              <option value="ALL">All Holders</option>
              {(hubs.data ?? []).map((h: any) => <option key={h.id} value={h.id}>{h.displayName} only</option>)}
            </select>
          </label>
          <Input label="Priority (higher = first)" value={form.priority} onChange={(priority) => setForm({ ...form, priority })} />
          <button onClick={create}><UploadCloud size={16} /> Create Banner</button>
        </FormGrid>
      </section>
      <DataTable
        rows={banners.data ?? []}
        columns={[
          ["Preview", (r) => <div style={{ background: r.bgColor, color: r.textColor, padding: "6px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, minWidth: 100 }}>{r.title}</div>],
          ["Body", (r) => r.body ?? "-"],
          ["Target", (r) => r.targetScope === "ALL" ? "All Holders" : r.targetScope],
          ["Priority", (r) => r.priority],
          ["Status", (r) => <Status value={r.status} />],
          ["Actions", (r) => (
            <div className="actions">
              {r.status === "ACTIVE" && <button className="ghost" onClick={() => archive(r.id)}>Archive</button>}
              <button className="ghost danger" onClick={() => del(r.id)}><X size={14} /> Delete</button>
            </div>
          )]
        ]}
      />
    </>
  );
}

// --- NotificationsAdmin ---

function NotificationsAdmin({ user }: { user: any }) {
  const hubs = useData<any[]>(() => api("/api/exchange-hubs"));
  const logs = useData<any[]>(() => api("/api/notifications"));
  const [form, setForm] = useState({ title: "", body: "", targetType: "all", exchangeHubId: "" });
  const [msg, setMsg] = useState("");

  const send = async () => {
    if (!form.title || !form.body) { setMsg("Title and body are required"); return; }
    setMsg("");
    const payload: any = { title: form.title, body: form.body };
    if (form.targetType === "hub" && form.exchangeHubId) payload.exchangeHubId = form.exchangeHubId;
    const result = await api<any>("/api/notifications/send", { method: "POST", body: JSON.stringify(payload) });
    setMsg(`Sent to ${result.sent} holder${result.sent !== 1 ? "s" : ""}`);
    setForm({ ...form, title: "", body: "" });
    await logs.reload();
  };

  return (
    <>
      <Header title="Push Notifications" subtitle="Send promo and announcement notifications to Holders." user={user} />
      {msg && <Notice>{msg}</Notice>}
      <section className="panel">
        <h2>Send Notification</h2>
        <FormGrid>
          <Input label="Title *" value={form.title} onChange={(title) => setForm({ ...form, title })} />
          <label className="wide">
            Message *
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write your notification message here..." />
          </label>
          <label>
            Send to
            <select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}>
              <option value="all">All Holders</option>
              <option value="hub">Specific Exchange Hub</option>
            </select>
          </label>
          {form.targetType === "hub" && (
            <Select label="Exchange Hub" value={form.exchangeHubId} options={hubs.data ?? []} onChange={(exchangeHubId) => setForm({ ...form, exchangeHubId })} />
          )}
          <button onClick={send}><Bell size={16} /> Send Notification</button>
        </FormGrid>
      </section>
      <h2>Recent Notifications</h2>
      <DataTable
        rows={logs.data ?? []}
        columns={[
          ["Holder", (r) => `${r.holder.firstName} ${r.holder.lastName} (${r.holder.email})`],
          ["Title", (r) => r.title],
          ["Body", (r) => r.body],
          ["Read", (r) => r.readAt ? new Date(r.readAt).toLocaleString() : "Unread"],
          ["Sent", (r) => new Date(r.createdAt).toLocaleString()]
        ]}
      />
    </>
  );
}

// --- Hub Analytics Panel (used inside ExchangeHubs) ---

function HubAnalyticsPanel({ hubId }: { hubId: string }) {
  const [period, setPeriod] = useState("month");
  const { data, loading, reload } = useData<any>(() => api(`/api/exchange-hubs/${hubId}/analytics?period=${period}`), [hubId, period]);
  const [uenValue, setUenValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const saveValue = async () => {
    setSaving(true);
    await api(`/api/exchange-hubs/${hubId}/uen-value`, { method: "PATCH", body: JSON.stringify({ uenValue: parseFloat(uenValue) }) });
    setSaving(false);
    setSavedMsg("UEN value saved");
    await reload();
  };

  return (
    <div className="analytics-panel">
      <div className="analytics-header">
        <h3><BarChart3 size={16} /> Analytics</h3>
        <div className="analytics-period-tabs">
          {["day", "month", "year"].map((p) => (
            <button key={p} className={`ghost analytics-period-btn ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>
      {loading && <p style={{ color: "#607069", fontSize: 13 }}>Loading...</p>}
      {data && (
        <>
          <div className="analytics-stats">
            <div className="analytics-stat"><strong>{data.totalUens}</strong><span>Total UENs</span></div>
            <div className="analytics-stat"><strong>{data.totalHolders}</strong><span>Total Holders</span></div>
            <div className="analytics-stat"><strong>{data.issuedInPeriod}</strong><span>Issued ({period})</span></div>
            <div className="analytics-stat"><strong>{data.holdersInPeriod}</strong><span>New holders ({period})</span></div>
            <div className="analytics-stat"><strong>{data.redemptionsInPeriod}</strong><span>Redemptions ({period})</span></div>
            <div className="analytics-stat highlight"><strong>${data.revenueInPeriod.toFixed(2)}</strong><span>Revenue ({period})</span></div>
          </div>
          <div className="analytics-value-row">
            <span>UEN value: <strong>${data.hub.uenValue}</strong></span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                style={{ width: 100, minHeight: 32, padding: "4px 8px", fontSize: 13 }}
                value={uenValue}
                placeholder="New value"
                onChange={(e) => setUenValue(e.target.value)}
              />
              <button style={{ minHeight: 32, padding: "4px 10px", fontSize: 13 }} onClick={saveValue} disabled={saving}><DollarSign size={13} /> Set</button>
            </div>
            {savedMsg && <span style={{ color: "#1f6f5b", fontSize: 12 }}>{savedMsg}</span>}
          </div>
        </>
      )}
    </div>
  );
}

// --- Merchant Analytics Panel ---

function MerchantAnalyticsPanel({ merchantId }: { merchantId: string }) {
  const [period, setPeriod] = useState("month");
  const { data, loading } = useData<any>(() => api(`/api/merchants/${merchantId}/analytics?period=${period}`), [merchantId, period]);

  return (
    <div className="analytics-panel">
      <div className="analytics-header">
        <h3><BarChart3 size={16} /> UEN Analytics</h3>
        <div className="analytics-period-tabs">
          {["day", "month", "year"].map((p) => (
            <button key={p} className={`ghost analytics-period-btn ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>
      {loading && <p style={{ color: "#607069", fontSize: 13 }}>Loading...</p>}
      {data && (
        <div className="analytics-stats">
          <div className="analytics-stat"><strong>{data.totalSyncedUens}</strong><span>Synced UENs</span></div>
          <div className="analytics-stat"><strong>{data.allTimeRedemptions}</strong><span>All-time redemptions</span></div>
          <div className="analytics-stat"><strong>{data.redemptionsInPeriod}</strong><span>Redemptions ({period})</span></div>
          <div className="analytics-stat highlight"><strong>${data.revenueInPeriod.toFixed(2)}</strong><span>UEN Revenue ({period})</span></div>
        </div>
      )}
    </div>
  );
}

// --- SignupGateway ---

function SignupGateway() {
  const roles = [
    {
      icon: ShoppingBag,
      badge: "For store owners",
      title: "I run a store",
      body: "You have a Shopify store and want to reach motivated customers who already have a note to spend. Accept Universal Exchange Notes at checkout and grow your customer base through trusted communities.",
      perks: [
        "No changes to your Shopify checkout",
        "Automatic note syncing - no CSV uploads",
        "You set the offer, discount, and limits",
        "Access to warm traffic from multiple hubs"
      ],
      cta: "Connect my store",
      href: "/merchants/register",
      accent: "#60a5fa",
      bg: "rgba(96,165,250,0.10)",
      accentDark: "#1e3a5f"
    },
    {
      icon: Users,
      badge: "For creators & communities",
      title: "I lead a community",
      body: "You have an audience, congregation, fan base, or following. You want to reward supporters with notes they can use at real stores - turning your community's energy into something tangible.",
      perks: [
        "Issue notes to anyone who supports you",
        "Choose which stores your supporters can shop at",
        "Keep your supporter list - it's your data",
        "Works with your existing Shopify store"
      ],
      cta: "Apply as a Hub",
      href: "/exchange-hub/register",
      accent: "#a78bfa",
      bg: "rgba(167,139,250,0.10)",
      accentDark: "#2d1f5e"
    },
    {
      icon: Ticket,
      badge: "For note holders",
      title: "I have a note to use",
      body: "You received a Universal Exchange Note from a creator, church, community, or organization you support. Get your personal wallet link to see where you can use it and track your codes.",
      perks: [
        "See all your notes in one place",
        "Find participating stores and their offers",
        "Use your code at Shopify checkout",
        "Track which codes you've used and where"
      ],
      cta: "Access my wallet",
      href: "/holder/register",
      accent: "#34d399",
      bg: "rgba(52,211,153,0.10)",
      accentDark: "#0d2e1e"
    }
  ];

  return (
    <div className="signup-gw-root">
      <nav className="signup-gw-nav">
        <a className="uenite-logo" href="/"><Shield size={22} /><BrandWord /></a>
        <div className="signup-gw-nav-links">
          <a href="/login">Sign in</a>
        </div>
      </nav>

      <div className="signup-gw-hero">
        <span className="eyebrow"><Star size={16} /> Universal Exchange Note Network</span>
        <h1>Choose how you want to participate</h1>
        <p>UENITE connects creators, stores, and supporters through a simple exchange system. Pick the role that fits you and get started in minutes - no complicated setup, no jargon.</p>
      </div>

      <div className="signup-gw-cards">
        {roles.map(({ icon: Icon, badge, title, body, perks, cta, href, accent, bg, accentDark }) => (
          <article
            className="signup-gw-card"
            key={title}
            style={{ "--gw-accent": accent, "--gw-bg": bg, "--gw-dark": accentDark } as React.CSSProperties}
          >
            <div className="signup-gw-card-top">
              <div className="signup-gw-icon" style={{ background: bg, color: accent }}>
                <Icon size={30} />
              </div>
              <span className="signup-gw-badge" style={{ color: accent, background: bg }}>{badge}</span>
            </div>
            <h2 className="signup-gw-title">{title}</h2>
            <p className="signup-gw-body">{body}</p>
            <ul className="signup-gw-perks">
              {perks.map((perk) => (
                <li key={perk}>
                  <CheckCircle size={15} style={{ color: accent, flexShrink: 0 }} />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
            <a className="signup-gw-cta" href={href} style={{ background: accent, color: "#07120e" }}>
              {cta}
            </a>
          </article>
        ))}
      </div>

      <div className="signup-gw-footer">
        <p>Already have an account? <a href="/login">Sign in here</a></p>
        <p className="signup-gw-powered"><Shield size={14} /> Powered by UENITE (Universal Exchange Note)</p>
      </div>
    </div>
  );
}

// --- ExchangeHubRegister ---

function ExchangeHubRegister() {
  const [form, setForm] = useState({
    displayName: "",
    hubType: "creator",
    contactName: "",
    contactEmail: "",
    website: "",
    description: "",
    password: "",
    confirmPassword: ""
  });
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const hubTypeOptions = [
    { value: "creator", label: "Creator or Influencer" },
    { value: "ministry", label: "Ministry or Church" },
    { value: "community", label: "Community or Group" },
    { value: "brand", label: "Brand or Business" },
    { value: "sports", label: "Sports Team or Club" },
    { value: "nonprofit", label: "Nonprofit or Charity" },
    { value: "other", label: "Other" }
  ];

  const submit = async () => {
    setError("");
    if (!form.displayName.trim() || !form.contactEmail.trim()) {
      setError("Your name and contact email are required.");
      return;
    }
    if (!form.contactEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!form.password || form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/exchange-hub/register", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName,
          hubType: form.hubType,
          contactName: form.contactName,
          contactEmail: form.contactEmail,
          website: form.website,
          description: form.description,
          password: form.password
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Could not submit application");
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const whatYouGet = [
    [Ticket, "Issue Universal Exchange Notes to your supporters"],
    [ShoppingBag, "Choose which stores accept notes from your community"],
    [Users, "Keep your supporter data - it stays with you"],
    [Globe, "Your community gets a private wallet to track their notes"],
    [Zap, "Works with Shopify - no complex technical setup"],
    [Shield, "Full admin dashboard to manage your hub"]
  ];

  return (
    <div className="hub-apply-root">
      <nav className="hub-apply-nav">
        <a className="uenite-logo" href="/"><Shield size={22} /><BrandWord /></a>
        <a className="reg-back-link" href="/signup">Back to all options</a>
      </nav>

      <div className="hub-apply-body">
        <div className="hub-apply-form-col">
          {!result ? (
            <div className="hub-apply-card">
              <div className="hub-apply-icon"><Users size={32} /></div>
              <h1 className="hub-apply-title">Apply as an Exchange Hub</h1>
              <p className="hub-apply-sub">Tell us about your community. Our team reviews every application and will reach out within a few business days. There is no cost to apply right now.</p>

              {error && <div className="hub-apply-error">{error}</div>}

              <div className="hub-apply-form">
                <label className="hub-apply-label">
                  Your name or organization name <span className="req">*</span>
                  <input
                    className="hub-apply-input"
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    placeholder="e.g. NuBreed Love, Cornerstone Church, The Collective"
                  />
                </label>

                <label className="hub-apply-label">
                  What best describes you? <span className="req">*</span>
                  <select
                    className="hub-apply-input"
                    value={form.hubType}
                    onChange={(e) => setForm({ ...form, hubType: e.target.value })}
                  >
                    {hubTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>

                <label className="hub-apply-label">
                  Your name (contact person) <span className="req">*</span>
                  <input
                    className="hub-apply-input"
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    placeholder="First and last name"
                  />
                </label>

                <label className="hub-apply-label">
                  Email address <span className="req">*</span>
                  <input
                    className="hub-apply-input"
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                    placeholder="you@yourdomain.com"
                  />
                </label>

                <label className="hub-apply-label">
                  Create a password <span className="req">*</span>
                  <input
                    className="hub-apply-input"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="At least 8 characters"
                  />
                </label>

                <label className="hub-apply-label">
                  Confirm password <span className="req">*</span>
                  <input
                    className="hub-apply-input"
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="Repeat your password"
                  />
                </label>

                <label className="hub-apply-label">
                  Website or social link <span className="hub-apply-opt">(optional)</span>
                  <input
                    className="hub-apply-input"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://yourwebsite.com or @yourhandle"
                  />
                </label>

                <label className="hub-apply-label">
                  Tell us about your community <span className="hub-apply-opt">(optional)</span>
                  <textarea
                    className="hub-apply-input hub-apply-textarea"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="How many supporters do you have? What kind of content or community do you run? How do you think UENite could help?"
                    rows={4}
                  />
                </label>

                <button className="hub-apply-btn" onClick={submit} disabled={loading}>
                  {loading ? "Submitting..." : <><Users size={16} /> Submit My Application</>}
                </button>

                <p className="hub-apply-fine">
                  By submitting, you agree that our team may contact you at the email provided. No credit card or payment required to apply.
                </p>
              </div>
            </div>
          ) : (
            <div className="hub-apply-card hub-apply-success">
              <div className="hub-apply-success-icon"><CheckCircle size={44} /></div>
              <h1>You're in!</h1>
              <p>Your merchant account is active. Your Exchange Hub application for <strong>{result.hub?.displayName}</strong> is under review — you'll be notified when it's approved.</p>
              <p className="hub-apply-success-note">In the meantime, you can set up your store offer, connect Shopify, and explore your merchant dashboard.</p>
              <div className="hub-apply-success-links">
                <a className="hub-apply-btn" href="/shopify/merchant">Go to my merchant dashboard</a>
                <a className="hub-apply-btn-ghost" href="/">Back to home</a>
              </div>
            </div>
          )}
        </div>

        <div className="hub-apply-side">
          <div className="hub-apply-side-content">
            <span className="eyebrow"><Star size={16} /> What you get as a Hub</span>
            <h2>Turn your audience into a real exchange network</h2>
            <p>As an approved Exchange Hub, you can issue Universal Exchange Notes to anyone in your community - and those notes become real value they can spend at participating stores.</p>
            <ul className="hub-apply-perks">
              {whatYouGet.map(([Icon, text], i) => (
                <li key={i}>
                  <span className="hub-apply-perk-icon"><Icon size={16} /></span>
                  <span>{text as string}</span>
                </li>
              ))}
            </ul>
            <div className="hub-apply-note">
              <Shield size={16} />
              <span>Every application is reviewed by our team before approval. This keeps the network trusted and high-quality for all participants.</span>
            </div>
          </div>
        </div>
      </div>
      <PoweredByFooter />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Shell />);

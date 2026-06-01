import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { NavLink, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { BarChart3, Bell, CheckCircle, Copy, DollarSign, Download, ExternalLink, Globe, Link2, Pause, Play, RefreshCw, Search, Shield, SlidersHorizontal, ShoppingBag, Star, Tag, Ticket, TrendingUp, UploadCloud, Users, Wallet, X, Zap } from "lucide-react";
import creatorLiveSupport from "./assets/creator-live-support.png";
import "./styles.css";

const adminToken = () => localStorage.getItem("uen_admin_token") ?? "dev-admin-token";
const shopDomain = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("shopDomain") ?? params.get("shop") ?? localStorage.getItem("uen_shop_domain") ?? "nubreed-love.myshopify.com";
};
let authRefresh: (() => void) | null = null;

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
  return <span className="brand-word"><span className="brand-uen">UEN</span><span className="brand-ite">ITE</span></span>;
}

function AnimatedMoney({ amount }: { amount: string }) {
  const numeric = Number(amount.replace(/[^0-9.]/g, "")) || 0;
  return <><AnimatedNumber value={numeric} prefix="$" suffix={amount.includes(".") ? ".00" : ""} /></>;
}

function Shell() {
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const isPublicRoute = window.location.pathname === "/" || window.location.pathname === "/about" || window.location.pathname === "/login" || window.location.pathname === "/merchants/register" || window.location.pathname.startsWith("/merchant/install/") || window.location.pathname === "/holder/portal" || window.location.pathname === "/holder/collection" || window.location.pathname === "/holder/register" || window.location.pathname === "/signup" || window.location.pathname === "/exchange-hub/register" || window.location.pathname === "/widget-preview";
  const refreshAuth = async () => {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
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
          <Route path="/login" element={<LoginPage />} />
          <Route path="/merchants/register" element={<MerchantRegister />} />
          <Route path="/merchant/install/:token" element={<MerchantInstall />} />
          <Route path="/holder/portal" element={<HolderPortal />} />
          <Route path="/holder/collection" element={<HolderCollectionDemo />} />
          <Route path="/holder/register" element={<HolderRegister />} />
          <Route path="/signup" element={<SignupGateway />} />
          <Route path="/exchange-hub/register" element={<ExchangeHubRegister />} />
          <Route path="/widget-preview" element={<WidgetPreviewPage />} />
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

function PublicShell({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <main className={`public-main ${compact ? "public-main-compact" : ""}`}>
      <section className="public-hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="brand public-brand"><Shield size={24} /><div><strong><BrandWord /></strong><span>Merchant acceptance network</span></div></div>
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
        <nav className="uenite-nav">
          <a className="uenite-logo" href="/">
            <Shield size={24} />
            <BrandWord />
          </a>
          <div>
            <a href="#audiences">Who it is for</a>
            <a href="#featured-network">Network</a>
            <a href="/about">About</a>
            <a href="/signup" className="uenite-nav-cta">Get Started</a>
            <a href="/login">Sign in</a>
          </div>
        </nav>
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
          <span {...editableText("collectionEyebrow", "eyebrow")}><Wallet size={16} /> {content.collectionEyebrow}</span>
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
      <nav className="uenite-nav about-nav">
        <a className="uenite-logo" href="/"><Shield size={24} /><BrandWord /></a>
        <div>
          <a href="/">Home</a>
          <a href="/signup" className="uenite-nav-cta">Get Started</a>
          <a href="/login">Sign in</a>
        </div>
      </nav>
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

const demoCollectionItems = [
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

type CollectionItem = typeof demoCollectionItems[number];

function HolderCollectionExperience({ holderName = "Holder", items = demoCollectionItems }: { holderName?: string; items?: CollectionItem[] }) {
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("Newest");
  const [selected, setSelected] = useState(items[0]);
  const [actionMessage, setActionMessage] = useState("");
  useEffect(() => {
    setSelected(items[0]);
  }, [items]);
  const filtered = items
    .filter((item) => filter === "All" ? true : item.type.includes(filter) || item.rarity === filter)
    .filter((item) => {
      const haystack = `${item.title} ${item.type} ${item.source} ${item.rarity} ${item.status}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    })
    .sort((a, b) => {
      if (sortMode === "Value") return (Number(b.value.replace(/[^0-9.]/g, "")) || 0) - (Number(a.value.replace(/[^0-9.]/g, "")) || 0);
      if (sortMode === "Rarity") return a.rarity.localeCompare(b.rarity);
      return b.date.localeCompare(a.date);
    });
  const totalValue = items.reduce((sum, item) => sum + (Number(item.value.replace(/[^0-9.]/g, "")) || 0), 0);
  const noteCount = items.filter((item) => item.type.includes("Note")).length;
  const downloadCount = items.filter((item) => item.type.includes("Download")).length;
  const badgeCount = items.filter((item) => item.type.includes("Badge")).length;
  const futureCount = items.filter((item) => item.type.includes("Future")).length;
  const typeSummary = [
    noteCount > 0 ? `${noteCount} Note${noteCount !== 1 ? "s" : ""}` : "",
    downloadCount > 0 ? `${downloadCount} Download${downloadCount !== 1 ? "s" : ""}` : "",
    badgeCount > 0 ? `${badgeCount} Badge${badgeCount !== 1 ? "s" : ""}` : "",
    futureCount > 0 ? `${futureCount} Future` : ""
  ].filter(Boolean).join(" · ");
  const selectItem = (item: CollectionItem) => {
    setSelected(item);
    setActionMessage("");
  };
  const openItem = () => {
    setActionMessage(`${selected.title} is open. This is where the Holder would preview files, reward details, redemption utility, and the campaign memory attached to the item.`);
  };
  const previewTrade = () => {
    setActionMessage(`${selected.title} is not transferable yet. Future trade, gift, or resale controls can be enabled per item type when the network rules are ready.`);
  };
  return (
    <section className="collection-experience">
      <div className="collection-experience-head">
        <div>
          <span className="eyebrow dark"><Wallet size={16} /> Holder Collection</span>
          <h1>{holderName}'s Support Vault</h1>
          <p>Notes, downloads, badges, rewards, and future assets live together as proof of what a Holder supported and what value they unlocked.</p>
        </div>
        <div className="collection-total">
          <span>Total collection value</span>
          <strong><AnimatedNumber value={totalValue} prefix="$" suffix=".00" /></strong>
          <small>{items.length} collection item{items.length !== 1 ? "s" : ""}</small>
          {typeSummary && <span className="collection-type-summary">{typeSummary}</span>}
        </div>
      </div>
      <div className="collection-console">
        <div className="collection-console-toolbar">
          <div className="collection-filter-buttons">
            {["All", "Note", "Download", "Badge", "Future"].map((option) => (
              <button key={option} className={filter === option ? "active" : ""} onClick={() => setFilter(option)}>{option}</button>
            ))}
          </div>
          <label className="collection-search">
            <span>Search</span>
            <div><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find notes, badges, downloads..." /></div>
          </label>
          <label className="collection-sort">
            <span>Sort</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
              <option>Newest</option>
              <option>Value</option>
              <option>Rarity</option>
            </select>
          </label>
        </div>
        <div className="collection-inventory">
          {filtered.map((item, index) => {
            const sameTypeBefore = filtered.slice(0, index).filter((i) => i.type === item.type).length;
            const totalOfType = filtered.filter((i) => i.type === item.type).length;
            const typeLabel = totalOfType > 1 ? `${item.type} ${sameTypeBefore + 1} of ${totalOfType}` : item.type;
            return (
              <button key={item.id} className={`collection-tile ${selected.id === item.id ? "active" : ""}`} onClick={() => selectItem(item)}>
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
        <aside className="collection-detail">
          <span>{selected.type}</span>
          <h2>{selected.title}</h2>
          <p>{selected.description}</p>
          <dl>
            <div><dt>Exchange Hub</dt><dd>{selected.source}</dd></div>
            <div><dt>Received</dt><dd>{selected.date}</dd></div>
            <div><dt>Rarity</dt><dd>{selected.rarity}</dd></div>
            <div><dt>Status</dt><dd>{selected.status}</dd></div>
            <div><dt>Value</dt><dd>{selected.value}</dd></div>
          </dl>
          {actionMessage && <div className="collection-action-message">{actionMessage}</div>}
          <div className="collection-actions">
            <button onClick={openItem}>Open Item</button>
            <button className="ghost" onClick={previewTrade}>Gift / Trade Preview</button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function HolderCollectionDemo() {
  return (
    <main className="collection-demo-page">
      <nav className="uenite-nav about-nav">
        <a className="uenite-logo" href="/"><Shield size={24} /><BrandWord /></a>
        <div>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/signup" className="uenite-nav-cta">Get Started</a>
        </div>
      </nav>
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
                    <span className={`portal-code-status ${uen.status === "ACTIVE" ? "active" : "inactive"}`}>{uen.status}</span>
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
    <>
      <main className="public-main login-public">
        <a className="uenite-logo login-logo" href="/"><Shield size={24} /><BrandWord /></a>
        <LoginPanel onLogin={() => { window.location.href = "/admin"; }} />
      </main>
      <PoweredByFooter />
    </>
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
    <PublicShell>
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
                  <p>Your install page is ready. Open it to connect Shopify and activate the merchant app.</p>
                  <span>Store {result.onboarding.shopDomain}</span>
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
            {installed && <Notice>Shopify is connected. You can now configure the merchant offer in the embedded app.</Notice>}
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
  const [email, setEmail] = useState("admin@uen.local");
  const [password, setPassword] = useState("change-me");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = async () => {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!response.ok) {
        const payload = await response.json();
        setError(payload.error ?? "Could not sign in");
        return;
      }
      const sessionCheck = await fetch("/api/auth/me", { credentials: "include" });
      if (!sessionCheck.ok) {
        setError("Sign-in was accepted, but the browser did not keep the session. In Shopify, confirm the app URL uses HTTPS and redeploy the latest Railway build.");
        return;
      }
      onLogin();
    } catch (_error) {
      setError("Could not reach the app server. Refresh the page and try again.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="login-panel">
      <h1>Sign in</h1>
      <p>Access your UENITE workspace, merchant tools, Exchange Hub controls, and platform dashboard.</p>
      {error && <Notice tone="bad">{error}</Notice>}
      <Input label="Email" value={email} onChange={setEmail} />
      <Input label="Password" value={password} onChange={setPassword} type="password" />
      <button onClick={login} disabled={loading}>{loading ? "Signing In..." : "Sign In"}</button>
    </section>
  );
}

function Header({ title, subtitle, user }: { title: string; subtitle: string; user?: any }) {
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    localStorage.removeItem("uen_admin_token");
    authRefresh?.();
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
        { label: "Merchant Signup", path: "/merchants/register", description: "Public merchant network registration.", access: "Public" },
        { label: "Shopify App", path: "/shopify", description: "Installed merchant app dashboard and sync controls.", access: "Login required" },
        { label: "Merchant Offers", path: "/offers", description: "Admin offer management for participating stores.", access: "Admin" }
      ]
    },
    Hub: {
      summary: "Exchange Hub setup, Holders, UEN generation, and campaign operations.",
      pages: [
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
  return (
    <>
      <Header title="Exchange Hubs" subtitle="Create and suspend audience-holders that issue UENs." user={user} />
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
        rows={data ?? []}
        columns={[
          ["Display Name", (row) => row.displayName],
          ["Type", (row) => row.hubType],
          ["Code Prefix", (row) => row.codePrefix ?? "-"],
          ["UEN Value", (row) => `$${Number(row.uenValue ?? 1).toFixed(2)}`],
          ["Status", (row) => <Status value={row.status} />],
          ["Billing", (row) => row.billingStatus],
          ["Action", (row) => <div className="actions"><button className="ghost" onClick={() => setEditing(row)}>Edit</button><button className="ghost" onClick={() => suspend(row.id)}><Pause size={16} /> Suspend</button></div>]
        ]}
      />
      {(data ?? []).map((hub: any) => (
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
  const create = async () => {
    await api("/api/merchants", { method: "POST", body: JSON.stringify({ ...form, linkedExchangeHubId: form.linkedExchangeHubId || undefined }) });
    await merchants.reload();
  };
  return (
    <>
      <Header title="Merchants" subtitle="Create redemption partners and optionally link them to Exchange Hubs." user={user} />
      <FormGrid>
        <Input label="Business name" value={form.businessName} onChange={(businessName) => setForm({ ...form, businessName })} />
        <Select label="Linked hub" value={form.linkedExchangeHubId} options={hubs.data ?? []} onChange={(linkedExchangeHubId) => setForm({ ...form, linkedExchangeHubId, isExchangeHub: Boolean(linkedExchangeHubId) })} />
        <button onClick={create}><UploadCloud size={16} /> Create Merchant</button>
      </FormGrid>
      <DataTable rows={merchants.data ?? []} columns={[["Business", (r) => r.businessName], ["Platform", (r) => r.platformType], ["Status", (r) => <Status value={r.status} />], ["Exchange Hub Merchant", (r) => r.isExchangeHub ? "Yes" : "No"]]} />
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
  return (
    <>
      <Header title="Shopify Connections" subtitle="Review server-side store connections and synced UEN codes." user={user} />
      <DataTable rows={data ?? []} columns={[["Shop", (r) => r.shopDomain], ["Merchant", (r) => r.merchant.businessName], ["Status", (r) => <Status value={r.status} />], ["Last Sync", (r) => r.lastSyncAt ? new Date(r.lastSyncAt).toLocaleString() : "Never"]]} />
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

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label>
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
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
  const hubs = useData<any[]>(() => fetch("/api/public/exchange-hubs").then((r) => r.json()));
  const [form, setForm] = useState({ exchangeHubId: preselectedHub, firstName: "", lastName: "", email: "" });
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setError("");
    if (!form.exchangeHubId || !form.email) { setError("Exchange Hub and email are required."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/holder/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Registration failed");
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(window.location.origin + result.portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="holder-reg-root">
      <nav className="holder-reg-nav">
        <a className="uenite-logo" href="/"><Shield size={22} /><BrandWord /></a>
      </nav>

      <div className="holder-reg-body">
        <div className="holder-reg-card">
          {!result ? (
            <>
              <div className="holder-reg-icon"><Wallet size={32} /></div>
              <h1 className="holder-reg-title">Access your UEN wallet</h1>
              <p className="holder-reg-sub">Enter your details to get your personal portal link. If you already have UEN codes from an Exchange Hub, they will appear in your wallet.</p>

              {error && <div className="holder-reg-error">{error}</div>}

              <div className="holder-reg-form">
                <label className="holder-reg-label">
                  Exchange Hub
                  <select
                    className="holder-reg-input"
                    value={form.exchangeHubId}
                    onChange={(e) => setForm({ ...form, exchangeHubId: e.target.value })}
                  >
                    <option value="">Select your hub...</option>
                    {(hubs.data ?? []).map((h: any) => (
                      <option key={h.id} value={h.id}>{h.displayName}</option>
                    ))}
                  </select>
                </label>

                <div className="holder-reg-name-row">
                  <label className="holder-reg-label">
                    First name
                    <input
                      className="holder-reg-input"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      placeholder="Alex"
                    />
                  </label>
                  <label className="holder-reg-label">
                    Last name
                    <input
                      className="holder-reg-input"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      placeholder="Johnson"
                    />
                  </label>
                </div>

                <label className="holder-reg-label">
                  Email address
                  <input
                    className="holder-reg-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@email.com"
                  />
                </label>

                <button className="holder-reg-btn" onClick={submit} disabled={loading}>
                  {loading ? "Setting up..." : <><Wallet size={16} /> Get My Portal Link</>}
                </button>

                <p className="holder-reg-fine">
                  Already accessed your portal? Use your original link or enter your email above to retrieve it.
                </p>
              </div>
            </>
          ) : (
            <div className="holder-reg-success">
              <div className="holder-reg-success-icon"><CheckCircle size={40} /></div>
              <h1>You're in, {result.holder.firstName}!</h1>
              <p>Your personal UEN wallet is ready. Save this link - it's how you access your wallet. Anyone with this link can view your wallet, so keep it private.</p>

              <div className="holder-reg-link-box">
                <span className="holder-reg-link-text">{window.location.origin + result.portalUrl}</span>
                <button className="holder-reg-copy-btn" onClick={copy}>
                  {copied ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                </button>
              </div>

              <a className="holder-reg-open-btn" href={result.portalUrl}>
                Open my wallet <ExternalLink size={16} />
              </a>

              <p className="holder-reg-fine">
                <strong>{result.holder.exchangeHub}</strong> - {result.holder.email}
              </p>
            </div>
          )}
        </div>

        <div className="holder-reg-side">
          <div className="holder-reg-side-content">
            <span className="eyebrow"><Ticket size={16} /> Your UEN wallet</span>
            <h2>One link. All your notes. Every merchant.</h2>
            <ul className="holder-reg-perks">
              {[
                [Wallet, "See all your Universal Exchange Notes in one place"],
                [ShoppingBag, "Discover participating merchants and their current offers"],
                [CheckCircle, "Track which codes you've used and where"],
                [Bell, "Receive notifications and promos from your Exchange Hub"],
                [Shield, "Your portal link is personal - no password needed"]
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

function LiveHolderPortal({ token }: { token: string }) {
  const wallet = useData<any>(() => portalApi("/api/holder/wallet"), [token]);
  const merchants = useData<any[]>(() => portalApi("/api/holder/merchants"), [token]);
  const banners = useData<any[]>(() => portalApi("/api/holder/banners"), [token]);
  const [activeTab, setActiveTab] = useState<"collection" | "wallet" | "merchants">("collection");
  const [notifOpen, setNotifOpen] = useState(false);

  if (wallet.loading) {
    return <div className="portal-loading"><div className="portal-spinner" /><p>Loading your wallet...</p></div>;
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

  const { holder, uens, notifications, unreadCount } = wallet.data;
  const hub = holder.exchangeHub;
  const totalActive = uens.filter((u: any) => u.status === "ACTIVE").length;
  const totalRedeemed = uens.reduce((n: number, u: any) => n + u.redemptions.filter((r: any) => r.redeemed).length, 0);
  const holderCollectionItems = uens.length > 0 ? uens.map((uen: any, index: number) => ({
    id: uen.id,
    type: "Universal Exchange Note",
    title: uen.code,
    source: hub.displayName,
    rarity: index === 0 ? "Founding" : "Earned",
    value: hub.uenValue > 0 ? `$${hub.uenValue.toFixed(2)}` : "$0.00",
    date: new Date(uen.issuedAt ?? uen.createdAt).toLocaleDateString(),
    status: uen.status,
    description: `A Universal Exchange Note issued by ${hub.displayName}. This item stays in your collection as proof of support and can unlock value with participating merchants.`
  })) : demoCollectionItems;

  const formatOffer = (offer: any) => {
    if (!offer) return "No offer";
    if (offer.discountType === "PERCENTAGE") return `${offer.discountValue}% off`;
    if (offer.discountType === "FIXED_AMOUNT") return `$${offer.discountValue} off`;
    return "Offer active";
  };

  return (
    <div className="portal-root">
      {/* Nav */}
      <nav className="portal-nav">
        <div className="portal-nav-brand">
          <div className="portal-hub-dot" style={{ background: hub.brandColor ?? "#1f6f5b" }} />
          <span>{hub.displayName}</span>
        </div>
        <div className="portal-nav-actions">
          <button className="portal-notif-btn" onClick={() => setNotifOpen(!notifOpen)}>
            <Bell size={20} />
            {unreadCount > 0 && <span className="portal-notif-badge">{unreadCount}</span>}
          </button>
        </div>
      </nav>

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

      {/* Hero / wallet overview */}
      <section className="portal-hero">
        <div className="portal-hero-inner">
          <div className="portal-hero-copy">
            <p className="portal-greeting">Welcome back,</p>
            <h1 className="portal-name">{holder.firstName} {holder.lastName}</h1>
            <div className="portal-stats-row">
              <div className="portal-stat">
                <Wallet size={18} />
                <div>
                  <strong>{totalActive}</strong>
                  <span>Active UEN{totalActive !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <div className="portal-stat">
                <CheckCircle size={18} />
                <div>
                  <strong>{totalRedeemed}</strong>
                  <span>Times redeemed</span>
                </div>
              </div>
              {hub.uenValue > 0 && (
                <div className="portal-stat">
                  <DollarSign size={18} />
                  <div>
                    <strong>${(totalActive * hub.uenValue).toFixed(2)}</strong>
                    <span>Available value</span>
                  </div>
                </div>
              )}
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

      {/* Tab bar */}
      <div className="portal-tabs">
        <button className={`portal-tab ${activeTab === "collection" ? "active" : ""}`} onClick={() => setActiveTab("collection")}>
          <Star size={16} /> Collection
        </button>
        <button className={`portal-tab ${activeTab === "merchants" ? "active" : ""}`} onClick={() => setActiveTab("merchants")}>
          <Globe size={16} /> Where to Redeem
        </button>
        <button className={`portal-tab ${activeTab === "wallet" ? "active" : ""}`} onClick={() => setActiveTab("wallet")}>
          <Wallet size={16} /> My Codes
        </button>
      </div>

      {activeTab === "collection" && (
        <HolderCollectionExperience holderName={holder.firstName} items={holderCollectionItems} />
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
    description: ""
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
    setLoading(true);
    try {
      const res = await fetch("/api/exchange-hub/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
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
        <a className="hub-apply-back" href="/signup">Back to all options</a>
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
              <h1>Application received!</h1>
              <p>Thank you, <strong>{form.contactName || form.displayName}</strong>. We've received your application for <strong>{result.displayName}</strong> and our team will review it shortly.</p>
              <p className="hub-apply-success-note">We'll reach out to <strong>{form.contactEmail}</strong> within a few business days. While you wait, feel free to explore the platform.</p>
              <div className="hub-apply-success-links">
                <a className="hub-apply-btn" href="/">Back to home</a>
                <a className="hub-apply-btn-ghost" href="/merchants/register">Register a store instead</a>
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

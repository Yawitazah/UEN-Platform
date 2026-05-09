import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { NavLink, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { BarChart3, Bell, CheckCircle, Copy, DollarSign, Download, ExternalLink, Globe, Link2, Pause, Play, RefreshCw, Shield, SlidersHorizontal, ShoppingBag, Star, Tag, Ticket, TrendingUp, UploadCloud, Users, Wallet, X, Zap } from "lucide-react";
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

function Shell() {
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const isPublicRoute = window.location.pathname === "/" || window.location.pathname === "/login" || window.location.pathname === "/merchants/register" || window.location.pathname.startsWith("/merchant/install/") || window.location.pathname === "/holder/portal";
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
          <Route path="/login" element={<LoginPage />} />
          <Route path="/merchants/register" element={<MerchantRegister />} />
          <Route path="/merchant/install/:token" element={<MerchantInstall />} />
          <Route path="/holder/portal" element={<HolderPortal />} />
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
            <div className="brand public-brand"><Shield size={24} /><div><strong>UENite</strong><span>Merchant acceptance network</span></div></div>
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
    </main>
  );
}

function UeniteHome() {
  const paths = [
    {
      Icon: ShoppingBag,
      title: "Merchants",
      kicker: "Turn Holders into customers",
      body: "Accept Universal Exchange Notes in Shopify, set your own offer, and get access to motivated traffic from trusted communities.",
      cta: "Join the Merchant Network",
      href: "/merchants/register",
      className: "path-merchant"
    },
    {
      Icon: Users,
      title: "Exchange Hubs",
      kicker: "Activate your audience",
      body: "Creators, influencers, ministries, organizations, and brands can turn supporter energy into portable value for Holders.",
      cta: "Create an Exchange Hub",
      href: "/login",
      className: "path-hub"
    },
    {
      Icon: Ticket,
      title: "Holders",
      kicker: "Use your note with participating merchants",
      body: "Discover merchants, offers, and Exchange Hubs you want to support as the UENite network grows.",
      cta: "Explore the Network",
      href: "#featured-network",
      className: "path-holder"
    }
  ];
  return (
    <main className="uenite-main">
      <section className="uenite-hero">
        <nav className="uenite-nav">
          <a className="uenite-logo" href="/">
            <Shield size={24} />
            <span>UENite</span>
          </a>
          <div>
            <a href="#audiences">Who it is for</a>
            <a href="#featured-network">Network</a>
            <a href="/login">Sign in</a>
          </div>
        </nav>
        <div className="uenite-hero-grid">
          <div className="uenite-copy">
            <span className="eyebrow"><Star size={16} /> The possibilities are endless when we UENite</span>
            <h1>When we UENite, the possibilities are endless.</h1>
            <p>Creators and influencers keep direct audience data, supporters receive Universal Exchange Notes, and merchants turn that value into checkout-ready sales. Build the exchange without leaving your own store.</p>
            <div className="hero-actions">
              <a className="button-link button-link-large" href="/merchants/register">Join the Merchant Network</a>
              <a className="text-link" href="#audiences">Choose your path</a>
            </div>
            <div className="creator-proof">
              <span><strong className="mini-money">$</strong> Sell notes through your own Shopify store</span>
              <span><Users size={15} /> Own the supporter relationship</span>
              <span><Zap size={15} /> Engage directly beyond social platforms</span>
            </div>
          </div>
          <div className="uenite-orbit" aria-hidden="true">
            <div className="money-symbol money-one">$</div>
            <div className="money-symbol money-two">¢</div>
            <div className="money-symbol money-three">$</div>
            <div className="orbit-core"><strong>UEN</strong><span>Universal Exchange Note</span></div>
            <div className="orbit-node node-hub"><Users size={18} /><span>Exchange Hub</span></div>
            <div className="orbit-node node-holder"><Ticket size={18} /><span>Holder</span></div>
            <div className="orbit-node node-merchant"><ShoppingBag size={18} /><span>Merchant</span></div>
            <div className="orbit-ring orbit-ring-one" />
            <div className="orbit-ring orbit-ring-two" />
          </div>
        </div>
      </section>

      <section className="audience-section" id="audiences">
        <div className="section-inner">
          <div className="section-heading colorful-heading">
            <span className="eyebrow dark"><Zap size={16} /> Built for the whole exchange</span>
            <h2>Every participant has a reason to show up.</h2>
            <p>UENite is not just a coupon app. It is a network where support, access, discovery, and redemption move together.</p>
          </div>
          <div className="path-grid">
            {paths.map(({ Icon, title, kicker, body, cta, href, className }) => (
              <article className={`path-card ${className}`} key={title}>
                <div className="path-icon"><Icon size={28} /></div>
                <span>{kicker}</span>
                <h3>{title}</h3>
                <p>{body}</p>
                <a href={href}>{cta}</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="exchange-flow-section">
        <div className="section-inner">
          <div className="section-heading flow-heading">
            <span className="eyebrow"><RefreshCw size={16} /> The UENite exchange flow</span>
            <h2>Support becomes a note. A note becomes a reason to shop.</h2>
            <p>UENite turns audience loyalty into portable value that travels from the creator to the Holder to participating merchants.</p>
          </div>
          <div className="exchange-flow-grid">
            {[
              {
                title: "Audience Supports the Hub",
                body: "A creator, influencer, ministry, brand, or community receives direct support through their own commerce flow.",
                image: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=900&auto=format&fit=crop",
                badge: "Support",
                value: "$"
              },
              {
                title: "Holder Receives a UEN",
                body: "The supporter becomes a Holder and receives a Universal Exchange Note connected to that relationship.",
                image: "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?q=80&w=900&auto=format&fit=crop",
                badge: "UEN issued",
                value: "UEN"
              },
              {
                title: "Holder Shops With a Merchant",
                body: "The Holder discovers participating merchants and uses the note through the existing Shopify checkout.",
                image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=900&auto=format&fit=crop",
                badge: "Checkout",
                value: "15%"
              },
              {
                title: "Merchant Delivers Real Value",
                body: "The merchant controls the offer, gains warm traffic, and turns supporter energy into customer activity.",
                image: "https://images.unsplash.com/photo-1556741533-6e6a62bd8b49?q=80&w=900&auto=format&fit=crop",
                badge: "Offer active",
                value: "SALE"
              }
            ].map((step, index) => (
              <article className="exchange-flow-card" key={step.title} style={{ animationDelay: `${index * 120}ms` }}>
                <div className="flow-image-wrap">
                  <img src={step.image} alt="" />
                  <div className="flow-value-chip">{step.value}</div>
                  <div className="flow-badge">{step.badge}</div>
                </div>
                <div className="flow-card-copy">
                  <strong>{String(index + 1).padStart(2, "0")}</strong>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="creator-economy-section">
        <div className="creator-economy-copy">
          <span className="eyebrow dark"><strong className="mini-money">$</strong> Creator owned support</span>
          <h2>Audience support should build your own customer list, not someone else’s platform.</h2>
          <p>Exchange Hubs can sell notes through their own Shopify store, collect supporter data directly, and stay connected after the sale. Instead of audience value being trapped inside social platforms, UENite helps turn support into owned relationships and merchant-ready value.</p>
        </div>
        <div className="creator-economy-cards">
          {[
            ["Direct data", "Supporter names, emails, and purchase history flow through your own commerce stack."],
            ["Lower-friction support", "A note purchase can compete with tip-style support while creating value the Holder can use."],
            ["Ongoing engagement", "Holders can be contacted, rewarded, and directed to participating merchants."],
            ["Shopify ecosystem", "Creators with stores can pair note sales, digital products, merch, and merchant redemption."]
          ].map(([title, body]) => (
            <article key={title}>
              <strong className="card-money">$</strong>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="story-section">
        <div className="story-image">
          <img src="https://images.unsplash.com/photo-1556745757-8d76bdb6984b?q=80&w=1200&auto=format&fit=crop" alt="Merchant helping a customer" />
        </div>
        <div className="story-panel">
          <span className="eyebrow dark"><RefreshCw size={16} /> How value moves</span>
          <h2>Support becomes access. Access becomes traffic. Traffic becomes sales.</h2>
          <p>A Holder receives a Universal Exchange Note from an Exchange Hub they trust. That note gives them a reason to discover participating merchants, unlock value, and come back again.</p>
          <div className="story-flow">
            {["Exchange Hub issues notes", "Holder receives value", "Merchant accepts notes", "Checkout creates sales"].map((item, index) => (
              <div key={item}><strong>{index + 1}</strong><span>{item}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section className="featured-section" id="featured-network">
        <div className="section-inner">
          <div className="section-heading colorful-heading">
            <span className="eyebrow dark"><Star size={16} /> Featured network</span>
            <h2>Holders will discover where their notes have value.</h2>
            <p>Featured merchants and Exchange Hubs become the discovery layer that helps Holders choose who to support and where to shop.</p>
          </div>
          <div className="featured-grid">
            {[
              ["Featured Merchants", "Participating stores, offers, perks, and product categories."],
              ["Featured Exchange Hubs", "Creators, communities, ministries, brands, and organizations issuing notes."],
              ["Holder Wallet", "A future holder view for owned notes, eligible stores, and redemption history."]
            ].map(([title, body]) => (
              <article className="featured-card" key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="uenite-final">
        <div>
          <h2>Ready to UENite your audience, customers, and community?</h2>
          <p>Start with a merchant connection today, then grow into the full exchange network.</p>
        </div>
        <a className="button-link button-link-large" href="/merchants/register">Join the Merchant Network</a>
      </section>
    </main>
  );
}

function LoginPage() {
  return (
    <main className="public-main login-public">
      <a className="uenite-logo login-logo" href="/"><Shield size={24} /><span>UENite</span></a>
      <LoginPanel onLogin={() => { window.location.href = "/admin"; }} />
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
    <PublicShell>
      {/* ── Value band ── */}
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

      {/* ── Community image band ── */}
      <section className="community-band">
        <div className="community-inner">
          <div className="community-text">
            <span className="eyebrow dark"><Users size={16} /> Real buyers, real communities</span>
            <h2>Not cold ads. Warm Holders.</h2>
            <p>Every Holder has a UEN tied to a creator, ministry, or organization they already support. When they shop with you, they bring real intent — not impulse scrolling.</p>
            <ul className="community-list">
              <li><CheckCircle size={18} /><span>Holders are pre-qualified — they already have value to spend with you</span></li>
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

      {/* ── How it works ── */}
      <section className="how-band" id="how-it-works">
        <div className="section-inner">
          <div className="section-heading">
            <span className="eyebrow dark"><RefreshCw size={16} /> How it works</span>
            <h2>Connect once. Start accepting notes.</h2>
            <p>Five simple steps from installation to your first Holder checkout — no technical rebuilds required.</p>
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

      {/* ── Network image band ── */}
      <section className="network-band">
        <img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=1400&auto=format&fit=crop" alt="" className="network-bg-img" />
        <div className="network-overlay" />
        <div className="network-content section-inner">
          <span className="eyebrow"><Star size={16} /> Growing network</span>
          <h2>Every hub adds more Holders to your store</h2>
          <div className="network-stats">
            <div><strong>Auto</strong><span>Note syncing</span></div>
            <div><strong>0</strong><span>Manual uploads</span></div>
            <div><strong>∞</strong><span>Hub connections</span></div>
          </div>
        </div>
      </section>

      {/* ── Signup card ── */}
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
                    [ShoppingBag, "Your existing Shopify checkout — no changes needed"],
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

      {/* ── Benefit strip ── */}
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
      <p>Access your UENite workspace, merchant tools, Exchange Hub controls, and platform dashboard.</p>
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
      <Header title="Admin Dashboard" subtitle="Operate Exchange Hubs, UEN validity, merchant access, and Shopify syncs." user={user} />
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

// ─── HolderPortal ───

function HolderPortal() {
  const token = portalToken();
  const wallet = useData<any>(() => portalApi("/api/holder/wallet"), [token]);
  const merchants = useData<any[]>(() => portalApi("/api/holder/merchants"), [token]);
  const banners = useData<any[]>(() => portalApi("/api/holder/banners"), [token]);
  const [activeTab, setActiveTab] = useState<"wallet" | "merchants">("merchants");
  const [notifOpen, setNotifOpen] = useState(false);

  if (!token) {
    return (
      <div className="portal-error">
        <Shield size={48} />
        <h1>No portal token</h1>
        <p>This link is missing a valid portal token. Contact your Exchange Hub for your personal portal link.</p>
      </div>
    );
  }

  if (wallet.loading) {
    return <div className="portal-loading"><div className="portal-spinner" /><p>Loading your wallet…</p></div>;
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
              <span>UENite Network</span>
              <strong>{totalActive}</strong>
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
        <button className={`portal-tab ${activeTab === "merchants" ? "active" : ""}`} onClick={() => setActiveTab("merchants")}>
          <Globe size={16} /> Where to Redeem
        </button>
        <button className={`portal-tab ${activeTab === "wallet" ? "active" : ""}`} onClick={() => setActiveTab("wallet")}>
          <Wallet size={16} /> My Codes
        </button>
      </div>

      {/* Merchant directory */}
      {activeTab === "merchants" && (
        <section className="portal-section">
          <div className="portal-section-inner">
            {merchants.loading && <p className="portal-loading-text">Loading merchants…</p>}
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
        <span>Powered by UENite Exchange Network</span>
      </footer>
    </div>
  );
}

// ─── BannersAdmin ───

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
          {form.linkLabel && <span>{form.linkLabel} →</span>}
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
          ["Body", (r) => r.body ?? "—"],
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

// ─── NotificationsAdmin ───

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
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write your notification message here…" />
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

// ─── Hub Analytics Panel (used inside ExchangeHubs) ───

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
      {loading && <p style={{ color: "#607069", fontSize: 13 }}>Loading…</p>}
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

// ─── Merchant Analytics Panel ───

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
      {loading && <p style={{ color: "#607069", fontSize: 13 }}>Loading…</p>}
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

createRoot(document.getElementById("root")!).render(<Shell />);

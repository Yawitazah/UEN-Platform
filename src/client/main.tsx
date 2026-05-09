import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { NavLink, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { Link2, Pause, Play, RefreshCw, Shield, Ticket, UploadCloud } from "lucide-react";
import "./styles.css";

const adminToken = () => localStorage.getItem("uen_admin_token") ?? "dev-admin-token";
const shopDomain = () => new URLSearchParams(window.location.search).get("shopDomain") ?? localStorage.getItem("uen_shop_domain") ?? "merchant-a.myshopify.com";
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
              ["/", "Admin Dashboard"],
              ["/exchange-hubs", "Exchange Hubs"],
              ["/holders", "Holders"],
              ["/uens", "Universal Exchange Notes"],
              ["/merchants", "Merchants"],
              ["/issuance-products", "Product Issuance"],
              ["/offers", "Merchant Offers"],
              ["/access-rules", "Access Rules"],
              ["/connections", "Shopify Connections"],
              ["/sync-logs", "Sync Logs"],
              ["/shopify", "Shopify App"]
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
              <Route path="/" element={<Dashboard user={user} />} />
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
            </Routes>
          )}
        </main>
      </div>
    </Router>
  );
}

function LoginPanel({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("admin@uen.local");
  const [password, setPassword] = useState("change-me");
  const [error, setError] = useState("");
  const login = async () => {
    setError("");
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
    onLogin();
  };
  return (
    <section className="login-panel">
      <h1>Admin Login</h1>
      <p>Sign in to manage Exchange Hubs, UENs, merchants, product issuance, and Shopify sync.</p>
      {error && <Notice tone="bad">{error}</Notice>}
      <Input label="Email" value={email} onChange={setEmail} />
      <Input label="Password" value={password} onChange={setPassword} type="password" />
      <button onClick={login}>Sign In</button>
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
          ["Status", (row) => <Status value={row.status} />],
          ["Billing", (row) => row.billingStatus],
          ["Action", (row) => <div className="actions"><button className="ghost" onClick={() => setEditing(row)}>Edit</button><button className="ghost" onClick={() => suspend(row.id)}><Pause size={16} /> Suspend</button></div>]
        ]}
      />
    </>
  );
}

function Holders({ user }: { user: any }) {
  const hubs = useData<any[]>(() => api("/api/exchange-hubs"));
  const holders = useData<any[]>(() => api("/api/holders"));
  const [form, setForm] = useState({ exchangeHubId: "", firstName: "", lastName: "", email: "", phone: "" });
  const create = async () => {
    await api(`/api/exchange-hubs/${form.exchangeHubId}/holders`, { method: "POST", body: JSON.stringify(form) });
    await holders.reload();
  };
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
      <DataTable rows={holders.data ?? []} columns={[["Name", (r) => `${r.firstName} ${r.lastName}`], ["Email", (r) => r.email], ["Hub", (r) => r.exchangeHub.displayName], ["Status", (r) => <Status value={r.status} />]]} />
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
  const [token, setToken] = useState("uen_dev_merchant_token");
  const dashboard = useData<any>(() => shopifyApi("/dashboard"), [shop]);
  const logs = useData<any[]>(() => shopifyApi("/sync-logs"), [shop]);
  const [offer, setOffer] = useState({ discountType: "PERCENTAGE", discountValue: "15", minimumOrderAmount: "", usageLimitPerNote: "1" });
  const saveShop = () => {
    localStorage.setItem("uen_shop_domain", shop);
    void dashboard.reload();
    void logs.reload();
  };
  const connect = async () => {
    setActionError(null);
    setActionMessage(null);
    const response = await fetch("/shopify/api/platform-connection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shopDomain: shop, connectionToken: token })
    });
    if (!response.ok) {
      const payload = await response.json();
      setActionError(payload.error ?? "Could not link store");
      return;
    }
    setActionMessage("Store linked");
    saveShop();
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
          <h2>Platform Connection</h2>
          <Input label="Shop domain" value={shop} onChange={setShop} />
          <Input label="Connection token" value={token} onChange={setToken} />
          <button onClick={connect}><Link2 size={16} /> Link Store</button>
        </div>
        <div className="panel">
          <h2>Dashboard</h2>
          {dashboard.data ? (
            <div className="facts">
              <span>Connection <Status value={dashboard.data.platformConnectionStatus} /></span>
              <span>Merchant <Status value={dashboard.data.merchantStatus} /></span>
              <span>Offer {dashboard.data.activeOffer ? `${dashboard.data.activeOffer.discountValue}%` : "None"}</span>
              <span>Synced UENs {dashboard.data.totalSyncedUens}</span>
              <span>Last sync {dashboard.data.lastSyncTime ? new Date(dashboard.data.lastSyncTime).toLocaleString() : "Never"}</span>
            </div>
          ) : <Notice>{dashboard.error ?? "Connect the store to load dashboard data."}</Notice>}
          <div className="actions">
            <button onClick={sync}><RefreshCw size={16} /> Sync UENs Now</button>
            <button className="ghost" onClick={pause}><Pause size={16} /> Pause</button>
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

createRoot(document.getElementById("root")!).render(<Shell />);

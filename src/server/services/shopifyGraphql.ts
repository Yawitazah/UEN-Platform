import { config } from "../config";

type DiscountInput = {
  shopDomain: string;
  accessToken: string;
  code: string;
  title: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  usageLimitPerNote: number;
  minimumOrderAmount?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

type ShopifyDiscountResult = {
  shopifyDiscountId: string;
  shopifyDiscountCodeId: string;
};

type ShopifyBulkAddResult = {
  bulkCreationId: string;
};

const mutation = `
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            codes(first: 1) {
              nodes {
                id
                code
              }
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function discountValue(input: DiscountInput) {
  if (input.discountType === "PERCENTAGE") {
    return { percentage: input.discountValue / 100 };
  }
  return {
    discountAmount: {
      amount: input.discountValue.toFixed(2),
      appliesOnEachItem: false
    }
  };
}

function minimumRequirement(input: DiscountInput) {
  if (!input.minimumOrderAmount) return undefined;
  return {
    subtotal: {
      greaterThanOrEqualToSubtotal: input.minimumOrderAmount.toFixed(2)
    }
  };
}

export async function createShopifyDiscountCode(input: DiscountInput): Promise<ShopifyDiscountResult> {
  if (config.shopifySyncMode === "mock" || input.accessToken.startsWith("shpat_placeholder")) {
    return {
      shopifyDiscountId: `gid://shopify/DiscountCodeNode/mock-${input.code}`,
      shopifyDiscountCodeId: `gid://shopify/DiscountRedeemCode/mock-${input.code}`
    };
  }

  const response = await fetch(`https://${input.shopDomain}/admin/api/${config.shopifyApiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": input.accessToken
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        basicCodeDiscount: {
          title: input.title,
          code: input.code,
          startsAt: (input.startsAt ?? new Date()).toISOString(),
          endsAt: input.endsAt?.toISOString(),
          customerSelection: { all: true },
          customerGets: {
            value: discountValue(input),
            items: { all: true }
          },
          minimumRequirement: minimumRequirement(input),
          usageLimit: input.usageLimitPerNote,
          appliesOncePerCustomer: false
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Shopify GraphQL request failed with ${response.status}`);
  }

  const payload = await response.json();
  const result = payload.data?.discountCodeBasicCreate;
  const errors = result?.userErrors ?? payload.errors;
  if (errors?.length) {
    throw new Error(errors.map((error: { message: string }) => error.message).join("; "));
  }

  const node = result?.codeDiscountNode;
  const codeNode = node?.codeDiscount?.codes?.nodes?.[0];
  if (!node?.id || !codeNode?.id) {
    throw new Error("Shopify did not return discount identifiers");
  }

  return { shopifyDiscountId: node.id, shopifyDiscountCodeId: codeNode.id };
}

export async function findShopifyDiscountNodeByCode(input: {
  shopDomain: string;
  accessToken: string;
  code: string;
}): Promise<{ shopifyDiscountId: string } | null> {
  if (config.shopifySyncMode === "mock" || input.accessToken.startsWith("shpat_placeholder")) {
    // Test fixture: codes prefixed MOCKEXISTING simulate a pre-existing store discount.
    return input.code.toUpperCase().startsWith("MOCKEXISTING")
      ? { shopifyDiscountId: `gid://shopify/DiscountCodeNode/mock-existing-${input.code}` }
      : null;
  }

  const response = await fetch(`https://${input.shopDomain}/admin/api/${config.shopifyApiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": input.accessToken
    },
    body: JSON.stringify({
      query: `
        query codeDiscountNodeByCode($code: String!) {
          codeDiscountNodeByCode(code: $code) {
            id
          }
        }
      `,
      variables: { code: input.code }
    })
  });

  if (!response.ok) {
    throw new Error(`Shopify GraphQL request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error: { message: string }) => error.message).join("; "));
  }

  const id = payload.data?.codeDiscountNodeByCode?.id;
  return id ? { shopifyDiscountId: id } : null;
}

export async function addShopifyDiscountCodes(input: {
  shopDomain: string;
  accessToken: string;
  shopifyDiscountId: string;
  codes: string[];
}): Promise<ShopifyBulkAddResult> {
  if (!input.codes.length) {
    throw new Error("No discount codes were provided");
  }

  if (config.shopifySyncMode === "mock" || input.accessToken.startsWith("shpat_placeholder")) {
    return { bulkCreationId: `gid://shopify/DiscountRedeemCodeBulkCreation/mock-${input.codes.length}` };
  }

  const response = await fetch(`https://${input.shopDomain}/admin/api/${config.shopifyApiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": input.accessToken
    },
    body: JSON.stringify({
      query: `
        mutation discountRedeemCodeBulkAdd($discountId: ID!, $codes: [DiscountRedeemCodeInput!]!) {
          discountRedeemCodeBulkAdd(discountId: $discountId, codes: $codes) {
            bulkCreation {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      variables: {
        discountId: input.shopifyDiscountId,
        codes: input.codes.map((code) => ({ code }))
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Shopify GraphQL request failed with ${response.status}`);
  }

  const payload = await response.json();
  const result = payload.data?.discountRedeemCodeBulkAdd;
  const errors = result?.userErrors ?? payload.errors;
  if (errors?.length) {
    throw new Error(errors.map((error: { message: string }) => error.message).join("; "));
  }

  const bulkCreationId = result?.bulkCreation?.id;
  if (!bulkCreationId) {
    throw new Error("Shopify did not return a bulk code creation identifier");
  }

  return { bulkCreationId };
}

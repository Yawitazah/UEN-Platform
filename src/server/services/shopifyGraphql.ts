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

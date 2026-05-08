import { MerchantStatus, UenStatus } from "../constants";
import { prisma } from "../db";

export async function getValidUensForMerchant(merchantId: string) {
  const now = new Date();
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: {
      offers: {
        where: {
          status: "ACTIVE",
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }]
        },
        orderBy: { createdAt: "desc" },
        take: 1
      },
      accessRules: {
        where: { status: "ACTIVE" },
        include: {
          exchangeHub: {
            include: {
              universalExchangeNotes: {
                where: {
                  status: { in: [UenStatus.ACTIVE, UenStatus.GRACE_PERIOD] },
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                  holder: { status: "ACTIVE" }
                },
                include: { holder: true, exchangeHub: true }
              }
            }
          }
        }
      }
    }
  });

  if (!merchant || merchant.status !== MerchantStatus.ACTIVE) {
    return { merchant, offer: null, uens: [] };
  }

  const offer = merchant.offers[0] ?? null;
  const uens = merchant.accessRules.flatMap((rule) =>
    rule.exchangeHub.universalExchangeNotes.filter((uen) => {
      const hubActive = uen.exchangeHub.status === "ACTIVE";
      const inGrace = uen.status === UenStatus.GRACE_PERIOD;
      return hubActive || inGrace;
    })
  );

  return { merchant, offer, uens };
}

export async function validateUenForMerchant(merchantId: string, code: string) {
  const { merchant, offer, uens } = await getValidUensForMerchant(merchantId);
  const note = uens.find((uen) => uen.code.toLowerCase() === code.toLowerCase());
  return {
    valid: Boolean(merchant && offer && note),
    merchant,
    offer,
    note,
    reason: !merchant ? "MERCHANT_NOT_FOUND_OR_INACTIVE" : !offer ? "NO_ACTIVE_OFFER" : !note ? "UEN_NOT_VALID_FOR_MERCHANT" : undefined
  };
}

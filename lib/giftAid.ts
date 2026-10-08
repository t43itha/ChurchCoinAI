// Churches created before the setting existed have no value stored, and they
// all used Gift Aid, so only an explicit `false` switches it off.
export const isGiftAidEnabled = (
  organization: { giftAidEnabled?: boolean } | null | undefined
): boolean => organization?.giftAidEnabled !== false;

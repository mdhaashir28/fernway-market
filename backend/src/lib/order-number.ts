/** Shown to customers, e.g. MS-00012 (MS = Meeranji Supermarket). */
export const orderNumber = (id: number) => `MS-${String(id).padStart(5, '0')}`;

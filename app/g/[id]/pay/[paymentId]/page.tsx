import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PaymentForm } from "@/components/payment-form";
import { loadGroupSnapshot } from "@/lib/server/load-group";

export const metadata: Metadata = {
  title: "立て替えを編集",
  robots: { index: false, follow: false },
};

/** 立て替えの編集 */
export default async function EditPaymentPage(props: PageProps<"/g/[id]/pay/[paymentId]">) {
  const { id, paymentId } = await props.params;
  const snapshot = await loadGroupSnapshot(id);
  const payment = snapshot?.payments.find((p) => p.id === paymentId);

  if (!snapshot || !payment) {
    notFound();
  }

  return <PaymentForm snapshot={snapshot} payment={payment} />;
}

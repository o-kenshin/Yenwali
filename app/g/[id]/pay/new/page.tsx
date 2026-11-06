import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PaymentForm } from "@/components/payment-form";
import { loadGroupSnapshot } from "@/lib/server/load-group";

export const metadata: Metadata = {
  title: "立て替えを記録",
  robots: { index: false, follow: false },
};

/** 立て替えの記録 */
export default async function NewPaymentPage(props: PageProps<"/g/[id]/pay/new">) {
  const { id } = await props.params;
  const snapshot = await loadGroupSnapshot(id);

  if (!snapshot) {
    notFound();
  }

  return <PaymentForm snapshot={snapshot} />;
}

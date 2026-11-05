import UnsubscribeForm from "./_UnsubscribeForm";

export const metadata = {
  title: "Email preferences | Valore Parfums",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <UnsubscribeForm token={typeof token === "string" ? token : ""} />;
}

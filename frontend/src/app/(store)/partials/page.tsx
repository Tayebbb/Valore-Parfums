import { redirect } from "next/navigation";

export default function PartialsPage() {
  redirect("/shop?deal=partials");
}

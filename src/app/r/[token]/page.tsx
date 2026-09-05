import { IndirectJourney } from "@/components/IndirectJourney";

type Props = { params: Promise<{ token: string }> };

export default async function PublicSharePage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="journey-page">
      <IndirectJourney token={token} />
    </div>
  );
}

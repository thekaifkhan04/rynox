/**
 * How a ticket type is named when the competition is not shown beside it:
 * "10K Run · Men". The competition name is left out when the type already
 * says it (a "10K Run" type inside the "10K Run" competition).
 */
export function ticketLabel(
  type: { name: string; competitionId: string | null },
  competitions: { id: string; name: string }[],
) {
  const competition = competitions.find((c) => c.id === type.competitionId);
  if (!competition) return type.name;
  return type.name.toLowerCase().includes(competition.name.toLowerCase())
    ? type.name
    : `${competition.name} · ${type.name}`;
}

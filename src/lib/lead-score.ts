/**
 * Compute a lead quality score (0-100) based on profile completeness and engagement signals.
 */
export function computeLeadScore(lead: {
  companySize: string;
  needTypes: string[];
  description?: string | null;
  painPoints?: string | null;
  expectedOutcome?: string | null;
  existingTools?: string | null;
  industry?: string | null;
  title?: string | null;
  preferredTimeslots?: string[] | null;
}): number {
  let score = 0;

  // Company size (max 25)
  const sizeScores: Record<string, number> = {
    '1-10 人': 5,
    '11-50 人': 10,
    '51-200 人': 18,
    '201-500 人': 22,
    '500 人以上': 25,
  };
  score += sizeScores[lead.companySize] || 5;

  // Need types count (max 20)
  score += Math.min(lead.needTypes.length * 5, 20);

  // Optional fields filled (max 35)
  if (lead.description && lead.description.length > 10) score += 7;
  if (lead.painPoints && lead.painPoints.length > 10) score += 8;
  if (lead.expectedOutcome && lead.expectedOutcome.length > 10) score += 8;
  if (lead.existingTools && lead.existingTools.length > 0) score += 5;
  if (lead.industry && lead.industry.length > 0) score += 4;
  if (lead.title && lead.title.length > 0) score += 3;

  // Preferred timeslots (max 10)
  if (lead.preferredTimeslots && lead.preferredTimeslots.length > 0) {
    score += Math.min(lead.preferredTimeslots.length * 5, 10);
  }

  // Cap at 100
  return Math.min(score, 100);
}

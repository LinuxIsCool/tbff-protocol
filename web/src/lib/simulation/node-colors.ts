/**
 * Perceptually distinct colors for dark backgrounds.
 * Each color is an HSL string with good luminance contrast on dark UI.
 */

const PALETTE = [
  "hsl(160, 70%, 55%)", // teal-green (Shawn)
  "hsl(220, 75%, 60%)", // blue (Jeff)
  "hsl(35, 85%, 55%)",  // amber (Darren)
  "hsl(280, 65%, 60%)", // purple (Simon)
  "hsl(340, 75%, 60%)", // rose (Christina)
  "hsl(180, 60%, 50%)", // cyan
  "hsl(60, 70%, 50%)",  // yellow
  "hsl(120, 50%, 50%)", // green
  "hsl(0, 70%, 60%)",   // red
  "hsl(200, 80%, 55%)", // sky blue
] as const;

/** Map of participant IDs to their assigned colors. */
const assigned = new Map<string, string>();

/** Get a stable color for a participant. Index used as fallback ordering. */
export function colorForParticipant(id: string, index: number): string {
  const existing = assigned.get(id);
  if (existing) return existing;

  const color = PALETTE[index % PALETTE.length];
  assigned.set(id, color);
  return color;
}

/** Reset color assignments (useful for tests). */
export function resetColorAssignments(): void {
  assigned.clear();
}

export { PALETTE as PARTICIPANT_COLORS };

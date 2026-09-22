import { config } from 'dotenv';
config({ path: '.env.local' });
import prisma from '../src/lib/prisma';

// One-time fix for existing seeded Badge rows: checkBadgeUnlocks()/seedBadges()
// only ever CREATE missing badges, never update existing ones, so the
// icon/category mismatch fix in gamification.ts's BADGE_DEFINITIONS never
// retroactively applies to rows already in the DB. This script re-applies
// the corrected icon/category to every badge id that already exists.
const CORRECTED = [
  { id: 'badge_first_steps', icon: 'footprints', category: 'achievement' },
  { id: 'badge_perfect_score', icon: 'target', category: 'achievement', description: 'Scored full marks on a test' },
  { id: 'badge_7-day_streak', icon: 'flame', category: 'milestone' },
  { id: 'badge_30-day_warrior', icon: 'sword', category: 'milestone' },
  { id: 'badge_batch_topper', icon: 'trophy', category: 'achievement' },
  { id: 'badge_bookworm', icon: 'book', category: 'milestone' },
  { id: 'badge_doubt_crusher', icon: 'message-circle', category: 'achievement' },
  { id: 'badge_century_club', icon: 'zap', category: 'special' },
  { id: 'badge_point_master', icon: 'crown', category: 'special' },
  { id: 'badge_legend', icon: 'star', category: 'special' },
];

async function main() {
  let updated = 0;
  for (const fix of CORRECTED) {
    const existing = await prisma.badge.findUnique({ where: { id: fix.id } });
    if (!existing) {
      console.log(`skip (not seeded yet): ${fix.id}`);
      continue;
    }
    const { id, ...data } = fix;
    await prisma.badge.update({ where: { id }, data });
    updated++;
    console.log(`updated: ${id}`);
  }
  console.log(`Done. ${updated} badge row(s) updated.`);
}

main().finally(() => prisma.$disconnect());

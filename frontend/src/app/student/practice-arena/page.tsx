import { redirect } from 'next/navigation';

// /student/practice-arena was a separate "Mass Quiz Generator" page that
// never saved results (no mastery/points/analytics) and duplicated
// /student/practice's real, DB-backed, mastery-tracking practice loop.
// The two have been merged into /student/practice, which now also offers
// topic/difficulty filtering and on-demand AI question generation. This
// route stays as a redirect so old links/bookmarks/nav entries don't 404.
export default function PracticeArenaRedirect() {
    redirect('/student/practice');
}

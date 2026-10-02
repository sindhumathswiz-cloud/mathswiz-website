// Admin Test Creator — mirrors the Teacher Test Creator Studio
// We simply re-export the same component to keep logic DRY. Imports the
// underlying client component directly (not teacher/tests/create/page),
// since that page now carries a TEACHER-role + premium guard that would
// incorrectly block admin users.
export { default } from '@/app/teacher/tests/create/TestsCreateClient';

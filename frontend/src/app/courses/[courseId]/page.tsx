import UnderDevelopment from '@/components/UnderDevelopment';

export default async function CoursesPage({ params }: { params: Promise<{ courseId: string }> }) {
    const { courseId } = await params;
    // We can format the ID nicely for the UI
    const formatCourseName = (id: string) => {
        return id.split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    };

    return <UnderDevelopment featureName={`${formatCourseName(courseId)} Course Modules`} />;
}

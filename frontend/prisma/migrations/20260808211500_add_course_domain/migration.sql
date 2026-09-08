CREATE TYPE "CourseEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DROPPED');

CREATE TABLE "Course" ("id" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "class" TEXT, "subject" TEXT, "isPublished" BOOLEAN NOT NULL DEFAULT false, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Course_pkey" PRIMARY KEY ("id"));
CREATE TABLE "CourseModule" ("id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "orderIndex" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id"));
CREATE TABLE "CourseLesson" ("id" TEXT NOT NULL, "moduleId" TEXT NOT NULL, "title" TEXT NOT NULL, "content" TEXT, "contentUrl" TEXT, "orderIndex" INTEGER NOT NULL DEFAULT 0, "estimatedMinutes" INTEGER, "isPublished" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CourseLesson_pkey" PRIMARY KEY ("id"));
CREATE TABLE "CourseEnrollment" ("id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "status" "CourseEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE', "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3), CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("id"));
CREATE TABLE "LessonProgress" ("id" TEXT NOT NULL, "enrollmentId" TEXT NOT NULL, "lessonId" TEXT NOT NULL, "completed" BOOLEAN NOT NULL DEFAULT false, "completedAt" TIMESTAMP(3), "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id"));

CREATE INDEX "Course_createdById_createdAt_idx" ON "Course"("createdById", "createdAt");
CREATE INDEX "Course_isPublished_class_idx" ON "Course"("isPublished", "class");
CREATE UNIQUE INDEX "CourseModule_courseId_orderIndex_key" ON "CourseModule"("courseId", "orderIndex");
CREATE UNIQUE INDEX "CourseLesson_moduleId_orderIndex_key" ON "CourseLesson"("moduleId", "orderIndex");
CREATE UNIQUE INDEX "CourseEnrollment_courseId_studentId_key" ON "CourseEnrollment"("courseId", "studentId");
CREATE INDEX "CourseEnrollment_studentId_status_idx" ON "CourseEnrollment"("studentId", "status");
CREATE UNIQUE INDEX "LessonProgress_enrollmentId_lessonId_key" ON "LessonProgress"("enrollmentId", "lessonId");
CREATE INDEX "LessonProgress_lessonId_completed_idx" ON "LessonProgress"("lessonId", "completed");

ALTER TABLE "Course" ADD CONSTRAINT "Course_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseLesson" ADD CONSTRAINT "CourseLesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "CourseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

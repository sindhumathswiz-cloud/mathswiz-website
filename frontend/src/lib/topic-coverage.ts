import prisma from "@/lib/prisma";

export interface TopicCoverage {
  topicId: string;
  topicName: string;
  subtopics: string[];
  approvedCount: number;
  targetCount: number;
  deficit: number;
}

export interface CoverageReport {
  board: string;
  classes: {
    className: string;
    topics: TopicCoverage[];
    totalApproved: number;
    totalTarget: number;
  }[];
  totalApproved: number;
  totalTarget: number;
}

/**
 * Queries approved questions tagged per TOPIC-level TagTaxonomy entries
 * for a given board. Returns a coverage report showing how many approved
 * questions exist per topic vs. the target count.
 */
export async function getTopicCoverage(
  board: string,
  targetPerTopic = 5,
): Promise<CoverageReport> {
  const classes = await prisma.tagTaxonomy.findMany({
    where: { type: "CLASS", boardType: board as any, isActive: true },
    orderBy: { order: "asc" },
  });

  console.log(`[COVERAGE] Board=${board}: found ${classes.length} classes`);
  for (const c of classes) console.log(`  CLASS: ${c.name} (id=${c.id}, boardType=${c.boardType})`);

  const result: CoverageReport = {
    board,
    classes: [],
    totalApproved: 0,
    totalTarget: 0,
  };

  for (const cls of classes) {
    const classTopics: TopicCoverage[] = [];
    let classTotal = 0;

    // Hierarchy: CLASS → SUBJECT → TOPIC
    const subjects = await prisma.tagTaxonomy.findMany({
      where: { type: "SUBJECT", parentId: cls.id, isActive: true },
      select: { id: true, name: true },
    });
    console.log(`[COVERAGE] Class ${cls.name}: ${subjects.length} subjects found`);
    if (subjects.length === 0) {
      result.classes.push({ className: cls.name, topics: [], totalApproved: 0, totalTarget: 0 });
      continue;
    }

    const topics = await prisma.tagTaxonomy.findMany({
      where: { type: "TOPIC", parentId: { in: subjects.map(s => s.id) }, isActive: true },
      orderBy: { order: "asc" },
      include: {
        _count: { select: { questionTags: true } },
        children: { where: { type: "SUBTOPIC" }, select: { name: true } },
      },
    });

    for (const topic of topics) {
      const approvedCount = await prisma.questionTag.count({
        where: {
          tagId: topic.id,
          question: { status: "APPROVED" },
        },
      });

      classTopics.push({
        topicId: topic.id,
        topicName: topic.name,
        subtopics: topic.children.map((c) => c.name),
        approvedCount,
        targetCount: targetPerTopic,
        deficit: Math.max(0, targetPerTopic - approvedCount),
      });
      classTotal += approvedCount;
    }

    result.classes.push({
      className: cls.name,
      topics: classTopics,
      totalApproved: classTotal,
      totalTarget: classTopics.length * targetPerTopic,
    });
    result.totalApproved += classTotal;
    result.totalTarget += classTopics.length * targetPerTopic;
  }

  return result;
}

/** Returns topics sorted by deficit (most under-covered first). */
export function getUnderCoveredTopics(
  report: CoverageReport,
  minDeficit = 1,
): (TopicCoverage & { className: string })[] {
  const out: (TopicCoverage & { className: string })[] = [];
  for (const cls of report.classes) {
    for (const topic of cls.topics) {
      if (topic.deficit >= minDeficit) {
        out.push({ ...topic, className: cls.className });
      }
    }
  }
  return out.sort((a, b) => b.deficit - a.deficit);
}

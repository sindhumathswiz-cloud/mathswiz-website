interface ParsedQuestion {
    content: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    type: string;
    difficulty: string;
    rawText: string;
}

const SectionType = {
    QUESTIONS: 'questions',
    SOLUTIONS: 'solutions',
    ANSWERS: 'answers',
    PRACTICE: 'practice',
    UNKNOWN: 'unknown'
} as const;

interface DocumentSection {
    type: typeof SectionType[keyof typeof SectionType];
    startLine: number;
    endLine: number;
    lines: string[];
}

function parseMathpixMarkdown(text: string): ParsedQuestion[] {
    const lines = text.split('\n');
    const questions: ParsedQuestion[] = [];
    const solutionMap = new Map<string, string>();
    const answerMap = new Map<string, string>();
    
    const sectionHeaders = [
        { regex: /^(?:Solutions?|Solution\s*Key)\s*$/i, type: SectionType.SOLUTIONS },
        { regex: /^(?:Answers?|Answer\s*Key)\s*$/i, type: SectionType.ANSWERS },
        { regex: /^(?:Practice\s*(?:Exercise|Problems?|Questions?))\s*$/i, type: SectionType.PRACTICE },
        { regex: /^(?:Exercise|Exercises)\s*\d*\s*$/i, type: SectionType.PRACTICE },
        { regex: /^(?:MCQs?|Multiple\s*Choice)\s*$/i, type: SectionType.QUESTIONS },
        { regex: /^(?:Long\s*Answer\s*(?:Type\s*)?Questions?)\s*$/i, type: SectionType.QUESTIONS },
        { regex: /^(?:Short\s*Answer\s*(?:Type\s*)?Questions?)\s*$/i, type: SectionType.QUESTIONS },
    ];
    
    const sections: DocumentSection[] = [];
    let currentSection: DocumentSection = {
        type: SectionType.QUESTIONS,
        startLine: 0,
        endLine: lines.length - 1,
        lines: []
    };
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        for (const header of sectionHeaders) {
            if (header.regex.test(line)) {
                currentSection.endLine = i - 1;
                currentSection.lines = lines.slice(currentSection.startLine, i);
                sections.push(currentSection);
                
                currentSection = {
                    type: header.type,
                    startLine: i + 1,
                    endLine: lines.length - 1,
                    lines: []
                };
                break;
            }
        }
    }
    
    if (currentSection.startLine < lines.length) {
        currentSection.lines = lines.slice(currentSection.startLine);
        sections.push(currentSection);
    }
    
    for (const section of sections) {
        if (section.type === SectionType.SOLUTIONS || section.type === SectionType.ANSWERS) {
            parseSolutionsSection(section.lines, solutionMap, answerMap);
            continue;
        }
        parseQuestionsSection(section.lines, questions, solutionMap, answerMap);
    }
    
    matchSolutionsToQuestions(questions, solutionMap, answerMap);
    
    return questions;
}

function parseSolutionsSection(
    lines: string[], 
    solutionMap: Map<string, string>, 
    answerMap: Map<string, string>
) {
    let currentNum: string | null = null;
    let currentText: string[] = [];
    
    const flushSolution = () => {
        if (currentNum && currentText.length > 0) {
            const text = currentText.join('\n').trim();
            const isAnswer = /^[A-D](\s*,\s*[A-D])*$/.test(text);
            if (isAnswer || text.length > 5) {
                if (isAnswer) {
                    answerMap.set(currentNum, text);
                } else {
                    solutionMap.set(currentNum, text);
                }
            }
        }
        currentNum = null;
        currentText = [];
    };
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        const solMatch = trimmed.match(/^(?:Sol(?:ution)?\.?|Ans(?:wer)?\.?|Q\.?)\s*(\d+)\s*[:\-]?\s*(.*)/i);
        if (solMatch) {
            flushSolution();
            currentNum = solMatch[1];
            if (solMatch[2]) {
                currentText.push(solMatch[2]);
            }
            continue;
        }
        
        const numMatch = trimmed.match(/^(\d+)[\.\)]\s*(.*)/);
        if (numMatch) {
            flushSolution();
            currentNum = numMatch[1];
            if (numMatch[2]) {
                currentText.push(numMatch[2]);
            }
            continue;
        }
        
        if (currentNum) {
            currentText.push(trimmed);
        }
    }
    
    flushSolution();
}

function parseQuestionsSection(
    lines: string[], 
    questions: ParsedQuestion[],
    solutionMap: Map<string, string>,
    answerMap: Map<string, string>
) {
    let currentQuestion: ParsedQuestion | null = null;
    let potentialOptions: string[] = [];
    let optionStartLine = -1;
    let inSolution = false;
    
    const flushQuestion = () => {
        if (currentQuestion && currentQuestion.content.trim().length > 5) {
            currentQuestion.content = currentQuestion.content.trim().replace(/\n\s*\n/g, '\n');
            currentQuestion.explanation = currentQuestion.explanation.trim().replace(/\n\s*\n/g, '\n');
            
            if (potentialOptions.length >= 2 && potentialOptions.length <= 4 && optionStartLine > 0) {
                currentQuestion.options = potentialOptions;
                currentQuestion.type = 'SINGLE_CHOICE';
            } else {
                currentQuestion.options = [];
                currentQuestion.type = 'INTEGER';
            }
            
            questions.push(currentQuestion);
        }
        currentQuestion = null;
        potentialOptions = [];
        optionStartLine = -1;
        inSolution = false;
    };
    
    const commitOptions = () => {
        if (potentialOptions.length >= 2 && potentialOptions.length <= 4 && currentQuestion) {
            currentQuestion.options = potentialOptions;
            currentQuestion.type = 'SINGLE_CHOICE';
        }
        potentialOptions = [];
        optionStartLine = -1;
    };
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const qMatch = line.match(/^(?:Q(?:uestion)?[\.:]?\s*)?(\d+)[\.:\)]\s+(.*)/i);
        if (qMatch) {
            flushQuestion();
            currentQuestion = {
                content: qMatch[2] || '',
                options: [],
                correctAnswer: '',
                explanation: '',
                type: 'INTEGER',
                difficulty: 'MEDIUM',
                rawText: line
            };
            inSolution = false;
            continue;
        }
        
        if (!currentQuestion) continue;
        
        const solMatch = line.match(/^(?:Sol(?:ution)?\.?|Explanation)\s*[:\-]?\s*(.*)/i);
        if (solMatch) {
            inSolution = true;
            commitOptions();
            if (solMatch[1]) {
                currentQuestion.explanation += (currentQuestion.explanation ? '\n' : '') + solMatch[1];
            }
            continue;
        }
        
        const ansMatch = line.match(/(?:^|\s)(?:Ans(?:wer)?\.?|Correct\s*(?:option|answer)?)\s*[:\-]?\s*([A-Da-d](?:\s*,\s*[A-Da-d])*)/i);
        if (ansMatch && !inSolution) {
            currentQuestion.correctAnswer = ansMatch[1].toUpperCase().replace(/\s/g, '');
            continue;
        }
        
        const optMatch = line.match(/^\s*\(?([A-Da-d])[\.\)]\s+(.*)/);
        if (optMatch && !inSolution) {
            const optLetter = optMatch[1].toUpperCase();
            const expectedLetters = ['A', 'B', 'C', 'D', 'E'];
            const expectedIndex = potentialOptions.length;
            
            if (expectedLetters[expectedIndex] === optLetter) {
                if (potentialOptions.length === 0) {
                    optionStartLine = i;
                }
                potentialOptions.push(optMatch[2]);
            } else {
                commitOptions();
                currentQuestion.content += '\n' + line;
            }
            continue;
        }
        
        if (potentialOptions.length > 0 && !optMatch) {
            commitOptions();
        }
        
        if (inSolution) {
            currentQuestion.explanation += (currentQuestion.explanation ? '\n' : '') + line;
            continue;
        }
        
        currentQuestion.content += (currentQuestion.content ? '\n' : '') + line;
    }
    
    flushQuestion();

    for (const q of questions) {
        if (q.options.length === 0) {
            q.type = 'INTEGER';
            q.options = [];
        } else if (q.options.length >= 2 && q.options.length <= 4) {
            q.type = 'SINGLE_CHOICE';
            if (q.correctAnswer.length > 1) {
                q.type = 'MULTIPLE_CHOICE';
            }
        } else {
            q.options = [];
            q.type = 'INTEGER';
        }
    }
    
    return questions;
}

function matchSolutionsToQuestions(
    questions: ParsedQuestion[],
    solutionMap: Map<string, string>,
    answerMap: Map<string, string>
) {
    for (const q of questions) {
        const numMatch = q.rawText.match(/(\d+)/);
        if (!numMatch) continue;
        
        const qNum = numMatch[1];
        
        if (!q.explanation && solutionMap.has(qNum)) {
            q.explanation = solutionMap.get(qNum)!;
        }
        
        if (!q.correctAnswer && answerMap.has(qNum)) {
            q.correctAnswer = answerMap.get(qNum)!;
        }
    }
}

// --- TESTS ---

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAILED: ${message}`);
        process.exit(1);
    } else {
        console.log(`✅ PASSED: ${message}`);
    }
}

console.log("Starting tests...");

// Test 1: Question numbering formats
(function testQuestionNumbering() {
    const md = `
Q1. What is 1+1?
A) 1
B) 2
C) 3
D) 4

1) What is 2+2?
A) 3
B) 4
C) 5
D) 6

Question 3: What is 3+3?
A) 5
B) 6
C) 7
D) 8

4. What is 4+4?
A) 7
B) 8
C) 9
D) 10
    `;
    const questions = parseMathpixMarkdown(md);
    console.log("Found questions:", questions.map(q => q.content.split('\n')[0]));
    assert(questions.length === 4, `Should find 4 questions, but found ${questions.length}`);
    assert(questions[0].content.includes('1+1'), "Question 1 content matches");
    assert(questions[1].content.includes('2+2'), "Question 2 content matches");
    assert(questions[2].content.includes('3+3'), "Question 3 content matches");
    assert(questions[3].content.includes('4+4'), "Question 4 content matches");
})();

// Test 2: Long LaTeX equations
(function testLongLatex() {
    const longLatex = '$\\int_{a}^{b} x^2 dx = \\frac{b^3 - a^3}{3}$';
    const md = `
Q1. Solve this: ${longLatex}
A) Option 1
B) Option 2
C) Option 3
D) Option 4
    `;
    const questions = parseMathpixMarkdown(md);
    assert(questions.length === 1, "Should find 1 question");
    assert(questions[0].content.includes(longLatex), "Long LaTeX content matches");
})();

// Test 3: MCQ options and type
(function testMCQ() {
    const md = `
Q1. Test MCQ
A. Option A
B. Option B
C. Option C
D. Option D
    `;
    const questions = parseMathpixMarkdown(md);
    assert(questions[0].type === 'SINGLE_CHOICE', "Should be SINGLE_CHOICE");
    assert(questions[0].options.length === 4, "Should have 4 options");
})();

// Test 4: Solutions matching
(function testSolutionsMatching() {
    const md = `
Q1. What is 1+1?
A) 1
B) 2
C) 3
D) 4

Solutions
1. The answer is 2.
2. The answer is 4.
    `;
    const questions = parseMathpixMarkdown(md);
    console.log("Found questions:", questions.map(q => q.content.split('\n')[0]));
    assert(questions.length === 1, "Should find 1 question");
    assert(questions[0].explanation.includes('The answer is 2'), "Solution matched correctly");
})();

// Test 5: Answer keys matching
(function testAnswerMatching() {
    const md = `
Q1. What is 1+1?
A) 1
B) 2
C) 3
D) 4

Answers
1. B
2. B
    `;
    const questions = parseMathpixMarkdown(md);
    console.log("Found questions:", questions.map(q => q.content.split('\n')[0]));
    assert(questions.length === 1, "Should find 1 question");
    console.log("Question 1 Correct Answer:", questions[0].correctAnswer);
    assert(questions[0].correctAnswer === 'B', "Answer key matched correctly");
})();

console.log("All tests passed!");

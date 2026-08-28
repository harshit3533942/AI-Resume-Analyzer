import { GoogleGenAI } from "@google/genai";
import { PDFParse } from "pdf-parse";
import Analysis from "../models/Analysis.js";

const analyzeResume = async (req, res) => {
  console.log("🔥 ANALYZER ROUTE HIT");

  try {
    const {
      resumeText,
      jobDescription,
      resumeLabel,
      jobLabel,
    } = req.body;

    let finalResumeText = resumeText?.trim() || "";

    const trimmedResumeLabel =
      resumeLabel?.trim() || "";

    const trimmedJobLabel =
      jobLabel?.trim() || "";

    const originalFileName =
      req.file?.originalname || "";

    const generatedResumeLabel =
      trimmedResumeLabel ||
      originalFileName ||
      finalResumeText
        ?.split("\n")
        .map((line) => line.trim())
        .find(Boolean) ||
      "Untitled Resume";

    const generatedJobLabel =
      trimmedJobLabel ||
      jobDescription
        ?.split("\n")
        .map((line) => line.trim())
        .find(Boolean) ||
      "No Job Label";

    const hasJobDescription =
      jobDescription &&
      jobDescription.trim() !== "";

    // ==========================================
    // PDF PARSING
    // ==========================================

    if (req.file) {
      try {
        console.log("📄 PDF file received:");
        console.log(req.file.originalname);

        const parser = new PDFParse({
          data: req.file.buffer,
        });

        const parsedPdf = await parser.getText();

        finalResumeText =
          parsedPdf.text?.trim() || "";

        if (typeof parser.destroy === "function") {
          await parser.destroy();
        }

        console.log(
          "📄 PDF parsed successfully"
        );

        console.log(
          "Resume text length:",
          finalResumeText.length
        );
      } catch (error) {
        console.error(
          "========== PDF PARSE ERROR =========="
        );

        console.error(error);
        console.error(
          "Message:",
          error?.message
        );

        console.error(
          "===================================="
        );

        return res.status(400).json({
          message:
            "Failed to parse uploaded PDF.",
        });
      }
    }

    // ==========================================
    // RESUME VALIDATION
    // ==========================================

    if (!finalResumeText) {
      return res.status(400).json({
        message:
          "Resume text or PDF file is required.",
      });
    }

    // ==========================================
    // GEMINI API KEY CHECK
    // ==========================================

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        message:
          "Gemini API key is missing in server environment variables.",
      });
    }

    console.log(
      "===================================="
    );

    console.log("🤖 Calling Gemini...");

    console.log(
      "Gemini API key exists:",
      !!process.env.GEMINI_API_KEY
    );

    console.log(
      "Resume length:",
      finalResumeText.length
    );

    console.log(
      "===================================="
    );

    // ==========================================
    // GEMINI CLIENT
    // ==========================================

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    // ==========================================
    // AI PROMPT
    // ==========================================

    const prompt = `
You are a senior ATS (Applicant Tracking System) optimization expert and professional resume reviewer.

Your task is to analyze a resume and compare it against a job description if one is provided.

Return ONLY valid JSON.

Do NOT use markdown.
Do NOT use code fences.
Do NOT add explanations outside JSON.

Return exactly this structure:

{
  "overallScore": number,
  "atsMatchScore": number | null,
  "summary": "2-3 sentence professional evaluation",
  "strengths": [
    "point 1",
    "point 2",
    "point 3"
  ],
  "weaknesses": [
    "point 1",
    "point 2",
    "point 3"
  ],
  "matchedKeywords": [
    "keyword 1",
    "keyword 2",
    "keyword 3"
  ],
  "missingKeywords": [
    "keyword 1",
    "keyword 2",
    "keyword 3"
  ],
  "atsSuggestions": [
    "ATS-specific improvement 1",
    "ATS-specific improvement 2"
  ],
  "suggestions": [
    "general improvement 1",
    "general improvement 2"
  ]
}

CRITICAL RULES:

1. overallScore:
- Score from 1 to 10.
- Evaluate resume structure, clarity, skills, projects, experience, impact, and professionalism.

2. atsMatchScore:
- Score from 1 to 10.
- Base it ONLY on how well the resume matches the job description.
- If no job description is provided, return null.

3. matchedKeywords:
- Extract important technical and role-related keywords FROM THE JOB DESCRIPTION.
- Include ONLY keywords that clearly appear in the resume.
- Do not invent keywords.
- Do not include unrelated keywords.

4. missingKeywords:
- Extract important keywords from the job description that are NOT present in the resume.
- Do not hallucinate keywords.
- Only include meaningful and relevant keywords.

5. atsSuggestions:
- Give specific ATS optimization suggestions.
- Focus on:
  - missing keywords
  - keyword placement
  - keyword density
  - formatting
  - alignment with job description

6. suggestions:
- Give general resume improvement suggestions.
- Focus on:
  - measurable achievements
  - metrics
  - stronger bullet points
  - clarity
  - structure
  - professional impact

7. STRICT NO JOB DESCRIPTION RULE:

If there is NO job description:

"atsMatchScore": null,
"matchedKeywords": [],
"missingKeywords": [],
"atsSuggestions": []

8. Do NOT mix ATS suggestions with general suggestions.

9. Do NOT return anything outside the JSON object.

RESUME:
${finalResumeText}

JOB DESCRIPTION:
${
  hasJobDescription
    ? jobDescription.trim()
    : "Not provided"
}
`;

    // ==========================================
    // CALL GEMINI
    // ==========================================

    const response =
      await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
      });

    console.log(
      "✅ Gemini response received."
    );

    // ==========================================
    // GET GEMINI RESPONSE
    // ==========================================

    const aiText =
      response?.text || "";

    console.log(
      "AI response length:",
      aiText.length
    );

    if (!aiText) {
      return res.status(500).json({
        message:
          "Gemini returned an empty response.",
      });
    }

    // ==========================================
    // PARSE JSON
    // ==========================================

    let parsed;

    try {
      const cleaned = aiText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error(
        "========== JSON PARSE ERROR =========="
      );

      console.error(parseError);

      console.error(
        "Gemini raw response:"
      );

      console.error(aiText);

      console.error(
        "======================================"
      );

      return res.status(500).json({
        message:
          "Failed to parse Gemini AI response.",
      });
    }

    // ==========================================
    // ENSURE ARRAYS
    // ==========================================

    parsed.strengths = Array.isArray(
      parsed.strengths
    )
      ? parsed.strengths
      : [];

    parsed.weaknesses = Array.isArray(
      parsed.weaknesses
    )
      ? parsed.weaknesses
      : [];

    parsed.matchedKeywords =
      Array.isArray(
        parsed.matchedKeywords
      )
        ? parsed.matchedKeywords
        : [];

    parsed.missingKeywords =
      Array.isArray(
        parsed.missingKeywords
      )
        ? parsed.missingKeywords
        : [];

    parsed.atsSuggestions =
      Array.isArray(
        parsed.atsSuggestions
      )
        ? parsed.atsSuggestions
        : [];

    parsed.suggestions =
      Array.isArray(
        parsed.suggestions
      )
        ? parsed.suggestions
        : [];

    // ==========================================
    // SCORE NORMALIZATION
    // ==========================================

    const normalizeScore = (
      value,
      allowNull = false
    ) => {
      if (
        allowNull &&
        (
          value === null ||
          value === undefined ||
          value === ""
        )
      ) {
        return null;
      }

      const num = Number(value);

      if (Number.isNaN(num)) {
        return allowNull ? null : 0;
      }

      // Convert 0-100 score to 0-10
      if (
        num > 10 &&
        num <= 100
      ) {
        return Math.round(
          num / 10
        );
      }

      return Math.max(
        0,
        Math.min(
          10,
          Math.round(num)
        )
      );
    };

    parsed.overallScore =
      normalizeScore(
        parsed.overallScore
      );

    parsed.atsMatchScore =
      normalizeScore(
        parsed.atsMatchScore,
        true
      );

    // ==========================================
    // FINAL SUCCESS RESPONSE
    // ==========================================

    console.log(
      "🎉 Resume analysis completed successfully."
    );

    return res.status(200).json({
      message:
        "Resume analyzed successfully.",

      analysis: parsed,

      resumeText:
        finalResumeText,

      jobDescription:
        jobDescription?.trim() || "",

      resumeLabel:
        generatedResumeLabel,

      jobLabel:
        generatedJobLabel,

      originalFileName,
    });
  } catch (error) {
    // ==========================================
    // MAIN ERROR
    // ==========================================

    console.error(
      "========== GEMINI AI ERROR =========="
    );

    console.error(error);

    console.error(
      "Message:",
      error?.message
    );

    console.error(
      "Status:",
      error?.status
    );

    console.error(
      "Code:",
      error?.code
    );

    console.error(
      "====================================="
    );

    return res.status(500).json({
      message:
        error?.message ||
        "Error analyzing resume with Gemini AI.",
    });
  }
};

// ======================================================
// GET USER ANALYSES
// ======================================================

const getUserAnalyses = async (
  req,
  res
) => {
  try {
    const analyses =
      await Analysis.find({
        user: req.user.userId,
      }).sort({
        createdAt: -1,
      });

    return res.status(200).json(
      analyses
    );
  } catch (error) {
    console.error(
      "Fetch Analyses Error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch analysis history.",
    });
  }
};

// ======================================================
// DELETE ANALYSIS
// ======================================================

const deleteAnalysis = async (
  req,
  res
) => {
  try {
    const analysis =
      await Analysis.findById(
        req.params.id
      );

    if (!analysis) {
      return res.status(404).json({
        message:
          "Analysis not found.",
      });
    }

    if (
      analysis.user.toString() !==
      req.user.userId
    ) {
      return res.status(403).json({
        message:
          "Not authorized to delete this analysis.",
      });
    }

    await analysis.deleteOne();

    return res.status(200).json({
      message:
        "Analysis deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Delete Analysis Error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to delete analysis.",
    });
  }
};

// ======================================================
// SAVE ANALYSIS
// ======================================================

const saveAnalysis = async (
  req,
  res
) => {
  try {
    const {
      resumeText,
      jobDescription,
      analysisResult,
      resumeLabel,
      jobLabel,
      originalFileName,
    } = req.body;

    if (
      !resumeText ||
      !analysisResult
    ) {
      return res.status(400).json({
        message:
          "Missing required data to save analysis.",
      });
    }

    const savedAnalysis =
      await Analysis.create({
        user: req.user.userId,

        resumeText,

        jobDescription:
          jobDescription || "",

        analysisResult,

        resumeLabel:
          resumeLabel ||
          "Untitled Resume",

        jobLabel:
          jobLabel ||
          "No Job Label",

        originalFileName:
          originalFileName || "",
      });

    return res.status(201).json({
      message:
        "Analysis saved successfully.",

      savedAnalysisId:
        savedAnalysis._id,
    });
  } catch (error) {
    console.error(
      "Save Analysis Error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to save analysis.",
    });
  }
};

// ======================================================
// EXPORT
// ======================================================

export {
  analyzeResume,
  getUserAnalyses,
  deleteAnalysis,
  saveAnalysis,
};
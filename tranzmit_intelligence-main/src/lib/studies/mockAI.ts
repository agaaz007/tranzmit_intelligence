import { Question, UIUpdate } from "./gemini";

export interface StudyState {
  objective: string;
  audience: string[];
  exclusions: string[];
  questions: Question[];
}

export interface MockAIResponse {
  chat_reply: string;
  ui_update: UIUpdate;
  next_stage: string;
}

export const simulateAIResponse = async (
  userText: string,
  currentStage: string,
  studyState: StudyState
): Promise<MockAIResponse> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  let nextStage = currentStage;
  let responseText = "";
  let updates: UIUpdate = {};

  switch (currentStage) {
    case 'objective':
      updates = { objective: userText };
      responseText = "Got it. Who is the target audience? Please specify demographics and exclusions.";
      nextStage = 'audience';
      break;

    case 'audience':
      // Simple parsing simulation
      updates = {
        audience_tags: ["Gen Z", "US Based", "Early Adopters"],
        exclusions: ["Industry Experts"]
      };
      responseText = "Understood. The audience is set. Shall I generate the discussion themes?";
      nextStage = 'questions';
      break;

    case 'questions':
      updates = {
        questions: [
          {
            id: 1,
            text: "Can you walk me through a recent experience where you encountered this problem?",
            followUps: [
              "What specifically made that experience frustrating or challenging?",
              "How did you end up solving it, if at all?",
              "How often does this situation come up for you?"
            ],
            rationale: "Understanding the current pain point and frequency helps prioritize feature development",
            type: "video_response"
          },
          {
            id: 2,
            text: "When you first see this concept, what's your initial reaction?",
            followUps: [
              "What stands out to you most, positively or negatively?",
              "How does this compare to what you expected?",
              "What questions come to mind as you look at this?"
            ],
            rationale: "First impressions reveal intuitive usability and value perception",
            type: "video_response"
          },
          {
            id: 3,
            text: "If this were available today, what might hold you back from trying it?",
            followUps: [
              "What would you need to see or know to feel more confident?",
              "Are there specific concerns about cost, time, or effort?",
              "How does trust factor into your decision?"
            ],
            rationale: "Identifying barriers to adoption helps address objections in messaging and product design",
            type: "video_response"
          },
          {
            id: 4,
            text: "How would this fit into your current workflow or daily routine?",
            followUps: [
              "What would need to change for you to use this regularly?",
              "Who else might be involved in the decision to adopt this?",
              "What would success look like for you with this solution?"
            ],
            rationale: "Understanding integration challenges and stakeholders informs go-to-market strategy",
            type: "video_response"
          }
        ]
      };
      responseText = "I've drafted 4 detailed discussion questions with probing follow-ups. Each question includes a rationale explaining why it matters for your research objective. You can expand each question to see the follow-ups, edit them directly, or use AI to regenerate any question. How do these look?";
      nextStage = 'refinement';
      break;

    case 'refinement':
      responseText = "I've noted that. Is there anything else you'd like to adjust?";
      // No updates for simplicity in this mock
      break;

    default:
      responseText = "I'm ready to help with your study design.";
      break;
  }

  return {
    chat_reply: responseText,
    ui_update: updates,
    next_stage: nextStage
  };
};

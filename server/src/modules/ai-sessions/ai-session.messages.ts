// Scripted, deterministic messages to avoid external LLM dependencies for the MVP

export const SCRIPTED_MESSAGES = {
  system: {
    started: "Support session started.",
    caregiverJoined: "Caregiver joined the support session.",
    resolved: "Support session was resolved.",
    backupSimulated: "Backup caregiver support can be suggested for this session.",
    emergencyAckLog: (action: "call_initiated" | "dismissed") => 
      action === "call_initiated" ? "Patient selected the emergency services call option." : "Patient dismissed the emergency suggestion."
  },
  ai: {
    greeting: "Hi, I'm here with you.",
    promptWhatHappened: "Can you tell me what happened?",
    promptHurt: "Are you hurt?",
    promptNotifyCaregiver: "Would you like me to notify your caregiver?",
    emergencySuggestion: "It may be best to contact emergency services now. Please tap Call Emergency Services if you want to continue."
  }
};

const HIGH_RISK_WORDS = [
  "hurt", "fall", "fell", "pain", "bleeding", "blood", "can't move", 
  "cannot move", "dizzy", "fainted", "passed out", "chest pain", "trouble breathing"
];

export function determineNextAiMessage(patientMessage: string, messageCount: number): { message: string, triggersEmergency: boolean } {
  const lowercaseMsg = patientMessage.toLowerCase();
  const containsHighRisk = HIGH_RISK_WORDS.some(word => lowercaseMsg.includes(word));

  if (containsHighRisk) {
    return { 
      message: SCRIPTED_MESSAGES.ai.emergencySuggestion, 
      triggersEmergency: true 
    };
  }

  // Very simple deterministic flow
  if (messageCount === 0 || messageCount === 1) {
    return { message: SCRIPTED_MESSAGES.ai.promptHurt, triggersEmergency: false };
  }
  
  return { message: SCRIPTED_MESSAGES.ai.promptNotifyCaregiver, triggersEmergency: false };
}

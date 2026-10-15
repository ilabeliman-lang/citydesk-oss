export function adaReply(text: string): { model: "mock"; text: string } {
  if (text.length > 200) {
    return {
      model: "mock",
      text: "I can help with the street. Ask a shorter question.",
    };
  }
  return { model: "mock", text: "Noted." };
}

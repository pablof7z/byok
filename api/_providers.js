const providers = [
  ["openrouter", "OpenRouter", "Model routing", "OR", "#141820", "#fff"],
  ["elevenlabs", "ElevenLabs", "Speech and transcription", "11", "#f0eee8", "#000"],
  ["openai", "OpenAI", "Models and speech", "AI", "#08745f", "#fff"],
  ["anthropic", "Anthropic", "Claude models", "A", "#dbccba", "#2e241d"],
  ["google", "Google AI", "Gemini API", "G", "#4285f4", "#fff"],
  ["xai", "xAI", "Grok models", "x", "#000", "#fff"],
  ["mistral", "Mistral AI", "Mistral models", "M", "#ffb22e", "#000"],
  ["groq", "Groq", "Fast inference", "GQ", "#ef4f22", "#fff"],
  ["deepseek", "DeepSeek", "Reasoning models", "DS", "#2456db", "#fff"],
  ["perplexity", "Perplexity", "Search-backed models", "P", "#129393", "#fff"],
  ["together", "Together AI", "Open model inference", "T", "#211b70", "#fff"],
  ["replicate", "Replicate", "Hosted model APIs", "R", "#000", "#fff"],
  ["huggingface", "Hugging Face", "Inference and datasets", "HF", "#ffcc2e", "#000"],
  ["supabase", "Supabase", "Database and auth", "S", "#2eb873", "#fff"],
  ["pinecone", "Pinecone", "Vector database", "P", "#0d785c", "#fff"],
  ["stripe", "Stripe", "Payments", "S", "#6258f6", "#fff"],
  ["resend", "Resend", "Email API", "R", "#000", "#fff"],
  ["vercel", "Vercel", "Deployments", "V", "#000", "#fff"],
  ["cloudflare", "Cloudflare", "Workers and DNS", "CF", "#f47820", "#fff"],
  ["github", "GitHub", "Developer platform", "GH", "#24292f", "#fff"]
].map(([service, name, subtitle, mark, bg, fg]) => ({ service, name, subtitle, mark, bg, fg }));

module.exports = { providers };

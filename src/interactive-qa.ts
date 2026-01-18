import * as readline from "readline";
import Anthropic from "@anthropic-ai/sdk";
import type { PRInfo } from "./github";
import { Spinner } from "./spinner";

interface QAOptions {
  anthropic: Anthropic;
  modelId: string;
  prInfo: PRInfo;
  reviewContext: string;
  conversationHistory: Anthropic.MessageParam[];
  minConfidence: number;
}

/**
 * Start interactive Q&A session after review
 */
export async function startInteractiveQA(options: QAOptions): Promise<void> {
  const { anthropic, modelId, conversationHistory } =
    options;

  console.log("\n" + "=".repeat(80));
  console.log("💬 INTERACTIVE Q&A MODE");
  console.log("=".repeat(80));
  console.log("\nAsk follow-up questions about the review!");
  console.log("Examples:");
  console.log('  - "Why did you flag line 42?"');
  console.log('  - "Can you suggest a fix for the SQL injection issue?"');
  console.log('  - "Are there similar patterns elsewhere I should check?"');
  console.log('  - "Is this really a critical issue?"');
  console.log('\nType "exit" or "quit" to end the session.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "❓ ",
  });

  // Clone conversation history so we don't mutate the original
  const messages = [...conversationHistory];

  rl.prompt();

  rl.on("line", async (input: string) => {
    const question = input.trim();

    // Check for exit commands
    if (
      !question ||
      question.toLowerCase() === "exit" ||
      question.toLowerCase() === "quit"
    ) {
      console.log("\n✨ Ending interactive session. Goodbye!\n");
      rl.close();
      return;
    }

    // Add user question to conversation
    messages.push({
      role: "user",
      content: question,
    });

    // Show spinner while Claude thinks
    const spinner = new Spinner("Claude is thinking");
    spinner.start();

    try {
      // Call Claude API with conversation history
      const response = await anthropic.messages.create({
        model: modelId,
        max_tokens: 8000,
        messages,
      });

      spinner.succeed("Got response");

      // Extract text response
      const textContent = response.content.find((block) => block.type === "text");
      const answerText =
        textContent && textContent.type === "text" ? textContent.text : "";

      if (answerText) {
        console.log(`\n💡 ${answerText}\n`);
      } else {
        console.log("\n⚠️  No response received from Claude.\n");
      }

      // Add assistant response to conversation
      messages.push({
        role: "assistant",
        content: response.content,
      });
    } catch (error) {
      spinner.fail("Failed to get response");
      console.error(
        `\n❌ Error: ${error instanceof Error ? error.message : "Unknown error"}\n`
      );
    }

    rl.prompt();
  });

  rl.on("close", () => {
    // Session ended
    process.exit(0);
  });
}

/**
 * Helper to build context string about the PR for Q&A
 */
export function buildQAContext(prInfo: PRInfo, reviewContext: string): string {
  const filesInfo = prInfo.files
    .map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
    .join("\n");

  return `
# PR Context (for reference when answering questions)

**Title:** ${prInfo.title}
**Repository:** ${prInfo.owner}/${prInfo.repo}
**PR Number:** #${prInfo.prNumber}

**Description:**
${prInfo.description || "No description provided"}

**Files Changed:**
${filesInfo}

${reviewContext ? `\n# Review Guidelines\n${reviewContext}\n` : ""}

**Note:** The user may ask follow-up questions about your review. Please refer to the PR diff and your previous review when answering.
`;
}

import * as vscode from "vscode";
import { boostPromptOutputChannel, readInstructionFile } from "./utils";

export interface BoostPromptResult {
  result: string;
  status: "success" | "failed" | "terminated";
}

/**
 * Main boost prompt function
 */
export async function boostPrompt(
  promptText: string,
  model: vscode.LanguageModelChat,
  context: vscode.ExtensionContext
): Promise<BoostPromptResult> {
  try {
    // Get instructions and create message
    const instructions = readInstructionFile(context);
    const messages = [vscode.LanguageModelChatMessage.User(`${instructions}\n\n<original_prompt>\n${promptText}\n</original_prompt>`)];

    boostPromptOutputChannel.appendLine(`Boosting (${promptText.length} chars)...`);

    // Send request
    let response: vscode.LanguageModelChatResponse;
    try {
      response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
    } catch (err) {
      boostPromptOutputChannel.appendLine(`Request failed: ${String(err)}`);
      return { result: promptText, status: "failed" };
    }

    if (!response) {
      boostPromptOutputChannel.appendLine("No response from model");
      return { result: promptText, status: "failed" };
    }

    // Stream response
    try {
      let enhanced = "";
      for await (const chunk of response.text) {
        enhanced += chunk;
      }

      if (!enhanced?.trim()) {
        boostPromptOutputChannel.appendLine("Empty response");
        return { result: promptText, status: "failed" };
      }

      boostPromptOutputChannel.appendLine(`Success: ${promptText.length} → ${enhanced.length} chars`);
      return { result: enhanced, status: "success" };
    } catch (err) {
      boostPromptOutputChannel.appendLine(`Stream failed: ${String(err)}`);
      return { result: promptText, status: "failed" };
    }
  } catch (err) {
    boostPromptOutputChannel.appendLine(`Unexpected error: ${String(err)}`);
    return { result: promptText, status: "failed" };
  }
}

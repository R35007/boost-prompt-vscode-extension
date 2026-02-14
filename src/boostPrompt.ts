import * as vscode from "vscode";
import {
  boostPromptOutputChannel,
  getEnabledPatternsMessage,
  getSelectedLanguageModel,
  isBoostEnabledForFile,
  readInstructionFile,
} from "./utils";

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

export async function boostPromptWithProgress(context: vscode.ExtensionContext, editor: vscode.TextEditor) {
  boostPromptOutputChannel.appendLine(`\n${"=".repeat(60)}\n✨ Boost Prompt invoked\nFile: ${editor.document.fileName}\n${"=".repeat(60)}`);

  if (!isBoostEnabledForFile(editor.document.fileName)) {
    vscode.window.showErrorMessage(`Not enabled for this file. To enable all: ["*"] or []. Patterns: ${getEnabledPatternsMessage()}`);
    return;
  }

  // Select model
  const model = await getSelectedLanguageModel();
  if (!model) return vscode.window.showWarningMessage("No model selected, boost cancelled.");

  // Rotating progress messages every 2 seconds (emoji-enhanced)
  const statusMessages = [
    `⚡ Working on your prompt...`,
    `🔎 Refining details and intent...`,
    `🧠 Adding context and insights...`,
    `✍️ Improving clarity and wording...`,
    `📚 Considering examples and edge-cases...`,
    `✨ Adjusting tone and specificity...`,
    `🔧 Polishing structure and constraints...`,
    `🚀 Optimizing with ${model.name}...`,
    `✅ Keeping progress steady...`,
  ];

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Boosting prompt :`, cancellable: true },
    async (progress, token) => {
      const text = editor.selection.isEmpty ? editor.document.getText() : editor.document.getText(editor.selection);

      const interval = setInterval(
        () => progress.report({ message: statusMessages[Math.floor(Math.random() * statusMessages.length)] }),
        1000
      );

      const cancelHandler = () => {
        clearInterval(interval as unknown as number);
        boostPromptOutputChannel.appendLine("Cancelled by user");
        vscode.window.showInformationMessage("Cancelled");
      };

      const cancelDisposable = token.onCancellationRequested(cancelHandler);

      try {
        if (token.isCancellationRequested) {
          cancelHandler();
          return;
        }

        const { result, status } = await boostPrompt(text, model, context);

        if (status === "terminated") {
          boostPromptOutputChannel.appendLine("Terminated - no model selected");
          vscode.window.showWarningMessage("Terminated: no model selected");
          return;
        }

        if (status === "failed") {
          boostPromptOutputChannel.appendLine("Failed");
          vscode.window.showErrorMessage("Failed to boost. Check output channel", "Open BoostPrompt Output").then((selection) => {
            if (selection === "Open BoostPrompt Output") {
              boostPromptOutputChannel.show(true);
            }
          });
          return;
        }

        if (token.isCancellationRequested) {
          cancelHandler();
          return;
        }

        if (status === "success") {
          await editor.edit((edit) => {
            if (editor.selection.isEmpty) {
              const start = new vscode.Position(0, 0);
              const end = new vscode.Position(
                editor.document.lineCount - 1,
                editor.document.lineAt(editor.document.lineCount - 1).text.length
              );
              edit.replace(new vscode.Range(start, end), result);
            } else {
              edit.replace(editor.selection, result);
            }
          });
          boostPromptOutputChannel.appendLine("Success");
          vscode.window.showInformationMessage("✅ Boost Prompted successfully!");
        }
      } catch {
        boostPromptOutputChannel.appendLine("An error occurred during boosting.");
        vscode.window
          .showErrorMessage("An error occurred during boosting. Check output channel", "Open BoostPrompt Output")
          .then((selection) => {
            if (selection === "Open BoostPrompt Output") {
              boostPromptOutputChannel.show(true);
            }
          });
      } finally {
        clearInterval(interval);
        try {
          cancelDisposable.dispose();
        } catch {
          // Ignore if already disposed
        }
      }
    }
  );
}
